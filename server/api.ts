import type {
  ChatRequestBody,
  ModelRecord,
  ModelWithProvider,
  ProviderConfig,
  ProviderKind,
  StreamEvent,
  UserProfile,
} from "../shared/types.js";
import { normaliseModel } from "../shared/models.js";
import { AppDatabase } from "./db/repository.js";
import { getAdapter, type ProviderAdapter } from "./adapters/index.js";
import type { AdapterContext, ChatOptions } from "./adapters/base.js";
import { providerFetch, readCappedText } from "./http.js";
import { presetFor, redactSecrets } from "../shared/providers.js";
import { validateProviderBaseUrl, type Lookup } from "../shared/urlGuard.js";
import { ChatRun } from "./chatRun.js";
import {
  apiError,
  clientIp,
  corsHeaders,
  errorFromCode,
  json,
  rateLimitSubject,
  type ApiEnv,
} from "./env.js";
import {
  authenticate,
  buildAuthorizeUrl,
  createPkcePair,
  createSessionToken,
  oauthDescriptors,
  getOAuthProvider,
  SESSION_TTL_MS,
  base64url,
} from "./auth.js";
import {
  OAUTH_STATE_COOKIE,
  SECURITY_HEADERS,
  SESSION_COOKIE,
  clearCookieHeader,
  cookieHeader,
  sessionCookieOptions,
} from "./env.js";

/** Maximum chat payload we accept from a client (prompts included). */
const MAX_BODY_BYTES = 512 * 1024;
/** Maximum messages accepted in one replay. */
const MAX_MESSAGES = 200;
/** Default upstream timeout for a chat request. */
const DEFAULT_TIMEOUT_MS = 120_000;

export interface ApiDeps {
  app: AppDatabase;
  env: ApiEnv;
  /**
   * DNS resolver used to reject provider hosts that resolve to private
   * addresses.
   *
   * Injected rather than imported so this module never pulls `node:dns` into the
   * Cloudflare Worker bundle. Node entry points pass `nodeLookup`; the Worker
   * leaves it undefined and relies on the platform, which blocks private-IP
   * subrequests at the network layer.
   */
  lookup?: Lookup;
  /**
   * Allow provider requests to loopback. Set only by the local dev server so it
   * can talk to Ollama / LM Studio / vLLM. Must stay unset in any deployment.
   */
  allowLocalhost?: boolean;
}

interface ActiveRun {
  run: ChatRun;
  providerLabel: string;
  /**
   * Owner of the run. Cancellation must be scoped to it: `activeRuns` is
   * module-global and the request id arrives from the client, so without this
   * check any caller who learned another user's id could abort their stream.
   */
  userId: string;
}

/**
 * Build the adapter context every provider call goes through.
 *
 * Centralised so the SSRF controls (`lookup`, `allowLocalhost`) cannot be
 * omitted from one call site by accident — leaving them off silently downgrades
 * that path to literal-IP-only checking.
 */
function adapterContext(
  deps: ApiDeps,
  row: { base_url: string; organization_id: string | null; display_name: string },
  apiKey: string,
): AdapterContext {
  return {
    baseUrl: row.base_url,
    apiKey,
    organizationId: row.organization_id,
    providerLabel: row.display_name,
    lookup: deps.lookup,
    allowLocalhost: deps.allowLocalhost === true,
  };
}

/**
 * In-flight runs keyed by requestId, so a client can cancel one specific
 * generation without touching any other concurrent run.
 */
const activeRuns = new Map<string, ActiveRun>();

/* ------------------------------------------------------------------ */
/* Router                                                              */
/* ------------------------------------------------------------------ */

export async function handleApiRequest(req: Request, deps: ApiDeps): Promise<Response> {
  const url = new URL(req.url);
  const prefix = deps.env.ROSA_API_PREFIX ?? "/api";
  let path = url.pathname;

  // Support both a prefix-stripped router and a raw-path router.
  if (path.startsWith(prefix)) path = path.slice(prefix.length) || "/";
  if (path.startsWith("/rosa-api")) path = path.slice("/rosa-api".length) || "/";

  // --- CORS preflight -------------------------------------------------
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders(deps.env, req) });
  }

  // Dispatch explicitly: an explicit chain is far easier to audit for
  // authorisation gaps than a generic route table with middleware.
  return dispatch(req, deps, path, url);
}

async function dispatch(
  req: Request,
  deps: ApiDeps,
  path: string,
  url: URL,
): Promise<Response> {
  const m = (re: RegExp) => re.exec(path);

  // -------- public --------
  if (req.method === "GET" && m(/^\/health$/)) {
    const providers = oauthDescriptors(deps.env);
    /**
     * Unauthenticated, so it reports only what the sign-in screen needs.
     *
     * The provider ids have to stay: the login screen renders one button per
     * configured provider, and this is the only endpoint it can reach before
     * signing in. They are not secrets — an OAuth client id is public and the
     * ids are the two documented options.
     *
     * What was removed is the gratuitous part: the application version, the
     * database driver kind and process uptime. Nothing consumed them, and
     * together they fingerprint the deployment and its patch level.
     */
    const authList = providers.map((p) => p.id);
    if (deps.allowLocalhost) {
      authList.push("local");
    }
    return json({
      ok: true,
      /** Only providers with credentials configured appear here. */
      auth: authList,
      oauthConfigured: authList.length > 0,
      /**
       * Whether the server can actually persist provider keys.
       * "session-only" means no ROSA_ENCRYPTION_KEY was supplied, in which case
       * a provider key can be used for the current session but not stored.
       */
      keyStorage: deps.app.canStoreKeys ? "encrypted-server-side" : "session-only",
    });
  }

  const authStart = m(/^\/auth\/([a-z0-9_-]+)\/start$/);
  if (
    authStart &&
    (req.method === "POST" || (req.method === "GET" && deps.allowLocalhost && authStart[1] === "local"))
  ) {
    return handleOAuthStart(req, deps, authStart[1], url);
  }

  const authCallback = m(/^\/auth\/([a-z0-9_-]+)\/callback$/);
  if (req.method === "GET" && authCallback) {
    return handleOAuthCallback(req, deps, authCallback[1], url);
  }

  if (req.method === "POST" && m(/^\/auth\/logout$/)) {
    return handleLogout(req, deps);
  }

  if (req.method === "GET" && m(/^\/session$/)) {
    const auth = await authenticate(req, deps.app, deps.env);
    if (!auth) return json({ user: null });
    const user = await deps.app.getUserById(auth.userId);
    return json({ user });
  }

  // -------- authenticated --------
  const auth = await authenticate(req, deps.app, deps.env);
  if (!auth) {
    return errorFromCode("unauthorized", "Sign in to continue.", 401);
  }

  const subject = rateLimitSubject(req, auth.userId);

  // A per-user chat rate limit. BYOK means requests cost us nothing, but it
  // still bounds per-account concurrency so one account cannot monopolise a
  // shared free-tier deployment.
  if (req.method === "POST" && m(/^\/chat$/)) {
    const allowed = await deps.app.rateLimit("chat", subject, 20, 60_000);
    if (!allowed) {
      return errorFromCode(
        "rate-limited",
        "Too many chat requests. Wait a minute and try again.",
        429,
      );
    }
  }

  // -------- providers --------
  if (req.method === "GET" && m(/^\/providers$/)) {
    const providers = await deps.app.listProviders(auth.userId);
    return json({ providers });
  }

  if (req.method === "POST" && m(/^\/providers$/)) {
    return handleCreateProvider(req, deps, auth.userId);
  }

  const providerMatch = m(/^\/providers\/([^/]+)$/);
  if (providerMatch) {
    const id = decodeURIComponent(providerMatch[1]);
    if (req.method === "GET") {
      const provider = await deps.app.getProvider(auth.userId, id);
      if (!provider) return notFound("Provider");
      return json({ provider });
    }
    if (req.method === "PATCH") {
      return handleUpdateProvider(req, deps, auth.userId, id);
    }
    if (req.method === "DELETE") {
      try {
        await deps.app.deleteProvider(auth.userId, id);
        return json({ ok: true });
      } catch {
        return notFound("Provider");
      }
    }
  }

  const testMatch = m(/^\/providers\/([^/]+)\/test$/);
  if (req.method === "POST" && testMatch) {
    // These endpoints make an outbound request to a user-supplied host, so they
    // are the SSRF surface. Unlimited, they are also a free way to port-scan
    // from the deployment's IP, so they get a tighter budget than chat.
    if (!(await deps.app.rateLimit("provider-probe", subject, 30, 60_000))) {
      return errorFromCode(
        "rate-limited",
        "Too many connection tests. Wait a minute and try again.",
        429,
      );
    }
    return handleTestProvider(req, deps, auth.userId, decodeURIComponent(testMatch[1]));
  }

  const discoverMatch = m(/^\/providers\/([^/]+)\/models$/);
  if (req.method === "POST" && discoverMatch) {
    if (!(await deps.app.rateLimit("provider-probe", subject, 30, 60_000))) {
      return errorFromCode(
        "rate-limited",
        "Too many model-discovery requests. Wait a minute and try again.",
        429,
      );
    }
    return handleDiscoverModels(req, deps, auth.userId, decodeURIComponent(discoverMatch[1]));
  }

  // -------- models --------
  if (req.method === "GET" && m(/^\/models$/)) {
    const models = await deps.app.listModels(auth.userId);
    return json({ models });
  }

  const favMatch = m(/^\/models\/([^/]+)\/([^/]+)\/favourite$/);
  if (req.method === "POST" && favMatch) {
    const on = await readJson<{ on: boolean }>(req);
    if (typeof on?.on !== "boolean") {
      return errorFromCode("bad-request", "Body must be { on: boolean }.", 400);
    }
    const ref = `${decodeURIComponent(favMatch[1])}:${decodeURIComponent(favMatch[2])}`;
    await deps.app.setFavourite(auth.userId, ref, on.on);
    await deps.app.pruneFavourites(auth.userId);
    return json({ ok: true, favourite: on.on });
  }

  const pinMatch = m(/^\/models\/([^/]+)\/([^/]+)\/pin$/);
  if (req.method === "POST" && pinMatch) {
    const on = await readJson<{ on: boolean }>(req);
    if (typeof on?.on !== "boolean") {
      return errorFromCode("bad-request", "Body must be { on: boolean }.", 400);
    }
    const ref = `${decodeURIComponent(pinMatch[1])}:${decodeURIComponent(pinMatch[2])}`;
    await deps.app.setPinned(auth.userId, ref, on.on);
    return json({ ok: true, pinned: on.on });
  }

  // -------- chat --------
  if (req.method === "POST" && m(/^\/chat$/)) {
    return handleChat(req, deps, auth.userId);
  }

  if (req.method === "POST" && m(/^\/chat\/cancel$/)) {
    const body = await readJson<{ requestId?: string }>(req);
    const id = body?.requestId;
    if (!id) return errorFromCode("bad-request", "requestId is required.", 400);
    const active = activeRuns.get(id);
    if (!active) return json({ ok: true, cancelled: false });
    // `activeRuns` is shared across users on this instance and the id comes from
    // the client, so ownership must be checked before cancelling. Report it as
    // "not found" rather than "forbidden" so this cannot be used to probe which
    // request ids exist.
    if (active.userId !== auth.userId) {
      return json({ ok: true, cancelled: false });
    }
    active.run.cancel();
    return json({ ok: true, cancelled: true });
  }

  // -------- conversations --------
  if (req.method === "GET" && m(/^\/conversations$/)) {
    const limit = clampInt(url.searchParams.get("limit"), 50, 1, 100);
    const offset = clampInt(url.searchParams.get("offset"), 0, 0, 100_000);
    const query = url.searchParams.get("q") ?? undefined;
    const folderParam = url.searchParams.get("folder");
    const folderId =
      folderParam === null ? undefined : folderParam === "none" ? null : folderParam;
    const res = await deps.app.listConversations({
      userId: auth.userId,
      limit,
      offset,
      query,
      folderId,
    });
    // Frontend contract: { conversations, total, hasMore }. Attach per-
    // conversation message counts and the last activity timestamp so the
    // sidebar can show them without a second round trip.
    const items = res.items ?? [];
    const counts = await deps.app.countMessagesByConversation(
      items.map((c) => c.id),
    );
    const conversations = items.map((c) => ({
      ...c,
      messageCount: counts.get(c.id) ?? 0,
      lastMessageAt: null,
    }));
    const hasMore = offset + items.length < res.total;
    return json({ conversations, total: res.total, hasMore });
  }

  if (req.method === "POST" && m(/^\/conversations$/)) {
    const body = await readJson<{
      title?: string;
      paneCount?: 1 | 2 | 3 | 4;
      paneModels?: Array<{ providerId: string; modelId: string } | null>;
      folderId?: string | null;
    }>(req);
    const conv = await deps.app.createConversation({
      userId: auth.userId,
      title: body?.title,
      paneCount: body?.paneCount,
      paneModels: body?.paneModels,
      folderId: body?.folderId,
    });
    return json({ conversation: conv }, { status: 201 });
  }

  const convMatch = m(/^\/conversations\/([^/]+)$/);
  if (convMatch) {
    const id = decodeURIComponent(convMatch[1]);
    if (req.method === "GET") {
      const conv = await deps.app.getConversation(auth.userId, id);
      if (!conv) return notFound("Conversation");
      const messages = await deps.app.listMessages(id);
      return json({ conversation: conv, messages: messages.map(decorateMessage) });
    }
    if (req.method === "PATCH") {
      const body = await readJson<{
        title?: string;
        pinned?: boolean;
        favourite?: boolean;
        folderId?: string | null;
        paneCount?: 1 | 2 | 3 | 4;
        paneModels?: Array<{ providerId: string; modelId: string } | null>;
      }>(req);
      const conv = await deps.app.getConversation(auth.userId, id);
      if (!conv) return notFound("Conversation");
      await deps.app.updateConversation(auth.userId, id, body ?? {});
      const updated = await deps.app.getConversation(auth.userId, id);
      return json({ conversation: updated });
    }
    if (req.method === "DELETE") {
      await deps.app.deleteConversation(auth.userId, id);
      return json({ ok: true });
    }
  }

  // -------- folders --------
  if (req.method === "GET" && m(/^\/folders$/)) {
    return json({ folders: await deps.app.listFolders(auth.userId) });
  }
  if (req.method === "POST" && m(/^\/folders$/)) {
    const body = await readJson<{ name?: string; parentId?: string | null }>(req);
    if (!body?.name?.trim()) {
      return errorFromCode("bad-request", "A folder name is required.", 400);
    }
    const folder = await deps.app.createFolder(auth.userId, body.name, body.parentId ?? null);
    return json({ folder }, { status: 201 });
  }
  const folderMatch = m(/^\/folders\/([^/]+)$/);
  if (folderMatch) {
    const id = decodeURIComponent(folderMatch[1]);
    if (req.method === "PATCH") {
      const body = await readJson<{ name?: string }>(req);
      await deps.app.renameFolder(auth.userId, id, body?.name ?? "");
      return json({ ok: true });
    }
    if (req.method === "DELETE") {
      await deps.app.deleteFolder(auth.userId, id);
      return json({ ok: true });
    }
  }

  // -------- preferences --------
  if (req.method === "GET" && m(/^\/prefs$/)) {
    return json({ prefs: await deps.app.getPrefs(auth.userId) });
  }
  if (req.method === "PATCH" && m(/^\/prefs$/)) {
    const body = await readJson<{
      theme?: string;
      sidebarWidth?: number | null;
      directBrowser?: boolean;
      preferences?: Record<string, unknown>;
    }>(req);
    await deps.app.savePrefs(auth.userId, body ?? {});
    return json({ prefs: await deps.app.getPrefs(auth.userId) });
  }

  // -------- account --------
  if (req.method === "DELETE" && m(/^\/account$/)) {
    await deps.app.deleteUserAndData(auth.userId);
    await deps.app.deleteSession(auth.sessionTokenHash);
    return clearSessionResponse(json({ ok: true }));
  }

  return errorFromCode("not-found", `No API route for ${req.method} ${path}.`, 404);
}

/* ------------------------------------------------------------------ */
/* Route handlers                                                      */
/* ------------------------------------------------------------------ */

function notFound(what: string): Response {
  return errorFromCode("not-found", `${what} not found.`, 404);
}

/**
 * A minimal reachability probe for providers with no model-listing endpoint
 * (Azure). A 404 or 401 from the chat path still demonstrates that DNS, TLS
 * and the API key header are all accepted.
 */
async function probeChatEndpoint(adapter: ProviderAdapter, ctx: AdapterContext): Promise<void> {
  const a = adapter as unknown as {
    chatUrl: (c: AdapterContext, m: string) => string;
    chatHeaders: (c: AdapterContext, m: string) => Record<string, string>;
    buildBody: (c: AdapterContext, o: ChatOptions) => Record<string, unknown>;
  };
  await providerFetch({
    url: a.chatUrl(ctx, "__probe__"),
    method: "POST",
    headers: { "content-type": "application/json", ...a.chatHeaders(ctx, "__probe__") },
    body: JSON.stringify({ messages: [{ role: "user", content: " " }] }),
    timeoutMs: 20_000,
    lookup: ctx.lookup,
    allowLocalhost: ctx.allowLocalhost,
  });
}

async function handleCreateProvider(
  req: Request,
  deps: ApiDeps,
  userId: string,
): Promise<Response> {
  const body = await readJson<{
    kind?: string;
    displayName?: string;
    baseUrl?: string;
    apiKey?: string;
    organizationId?: string | null;
  }>(req);
  if (!body) return errorFromCode("bad-request", "A JSON body is required.", 400);

  if (!body.kind || !isKnownKind(body.kind)) {
    return errorFromCode("bad-request", `Unknown provider type "${body.kind}".`, 400);
  }
  if (!body.baseUrl?.trim()) {
    return errorFromCode("bad-request", "A Base URL is required.", 400);
  }

  const kind = body.kind as ProviderKind;
  const preset = presetFor(kind);
  const verdict = validateProviderBaseUrl(body.baseUrl, {
    allowHttpLocalDev: Boolean(deps.allowLocalhost || allowLocal(deps.env)),
  });
  if (!verdict.ok) {
    return errorFromCode("bad-request", verdict.message, 400, {
      detail: `code=${verdict.code}`,
    });
  }

  try {
    const provider = await deps.app.createProvider(
      userId,
      {
        kind,
        displayName: body.displayName?.trim() || preset.label,
        baseUrl: verdict.normalized,
        apiKey: body.apiKey,
        organizationId: body.organizationId ?? null,
      },
      { allowHttpLocalDev: Boolean(deps.allowLocalhost || allowLocal(deps.env)) },
    );
    return json({ provider, discoveryAvailable: preset.supportsListing }, { status: 201 });
  } catch (err) {
    return errorFromCode("bad-request", messageOf(err), 400);
  }
}

async function handleUpdateProvider(
  req: Request,
  deps: ApiDeps,
  userId: string,
  providerId: string,
): Promise<Response> {
  const body = await readJson<{
    displayName?: string;
    baseUrl?: string;
    apiKey?: string;
    organizationId?: string | null;
    status?: number;
  }>(req);
  if (body?.baseUrl) {
    const verdict = validateProviderBaseUrl(body.baseUrl, {
      allowHttpLocalDev: Boolean(deps.allowLocalhost || allowLocal(deps.env)),
    });
    if (!verdict.ok) {
      return errorFromCode("bad-request", verdict.message, 400, {
        detail: `code=${verdict.code}`,
      });
    }
    body.baseUrl = verdict.normalized;
  }
  try {
    await deps.app.updateProvider(
      userId,
      providerId,
      body ?? {},
      { allowHttpLocalDev: Boolean(deps.allowLocalhost || allowLocal(deps.env)) },
    );
    const provider = await deps.app.getProvider(userId, providerId);
    if (!provider) return notFound("Provider");
    return json({ provider });
  } catch (err) {
    return notFound("Provider");
  }
}

async function handleTestProvider(
  req: Request,
  deps: ApiDeps,
  userId: string,
  providerId: string,
): Promise<Response> {
  void req;
  const row = await deps.app.getProviderRow(userId, providerId);
  if (!row) return notFound("Provider");
  if (row.status === 0) {
    return errorFromCode("bad-request", "This provider is disabled. Enable it first.", 400);
  }

  const apiKey = await deps.app.getProviderApiKey(userId, providerId);
  if (!apiKey) {
    // Session-only mode: the key was never persisted server-side.
    return errorFromCode(
      "bad-request",
      "No API key is stored for this provider. Add the key to enable server-mediated requests.",
      400,
    );
  }

  const preset = presetFor(row.kind as never);
  const ctx = adapterContext(deps, row, apiKey);

  const adapter = getAdapter(row.kind as ProviderKind);

  try {
    if (preset.supportsListing) {
      const res = await providerFetch({
        url: adapter.listModelsUrl(ctx),
        method: "GET",
        headers: adapter.listModelsHeaders(ctx),
        timeoutMs: 20_000,
        lookup: ctx.lookup,
        allowLocalhost: ctx.allowLocalhost,
      });
      // `res.text()` enforces a byte cap internally; see server/http.ts.
      const raw = await res.text();
      let parsed: { data?: unknown[]; models?: unknown[] };
      try {
        parsed = JSON.parse(raw);
      } catch {
        throw new Error("The endpoint did not return valid JSON.");
      }
      const count = Array.isArray(parsed?.data)
        ? parsed.data.length
        : Array.isArray(parsed?.models)
          ? parsed.models.length
          : 0;
      if (count === 0) {
        throw new Error(
          "The endpoint responded but returned no models. Check the Base URL points at the API root (for example /v1).",
        );
      }
      await deps.app.setProviderConnection(userId, providerId, {
        connectionStatus: "ok",
        connectionError: null,
        lastErrorCode: null,
      });
      return json({ ok: true, modelCount: count, message: `Connected — ${count} models available.` });
    }

    // No listing endpoint: reaching the chat endpoint at all — even with an
    // error — proves the base URL and key are accepted.
    try {
      await probeChatEndpoint(adapter, ctx);
    } catch (probeErr) {
      const { toApiError } = await import("./http.js");
      const payload = toApiError(probeErr, row.display_name, [apiKey]);
      // A 404/401 from the chat path still means the host is reachable.
      if (
        payload.code !== "model-not-found" &&
        payload.code !== "invalid-api-key" &&
        payload.code !== "unauthorized"
      ) {
        throw probeErr;
      }
    }
    await deps.app.setProviderConnection(userId, providerId, {
      connectionStatus: "ok",
      connectionError: null,
      lastErrorCode: null,
    });
    return json({
      ok: true,
      message: "Connected. This provider has no model-listing endpoint; add models by id.",
    });
  } catch (err) {
    const { toApiError } = await import("./http.js");
    const payload = toApiError(err, row.display_name, [apiKey]);
    await deps.app.setProviderConnection(userId, providerId, {
      connectionStatus: "error",
      connectionError: payload.message,
      lastErrorCode: payload.code,
    });
    return apiError(statusForCode(payload.code), payload);
  }
}

async function handleDiscoverModels(
  req: Request,
  deps: ApiDeps,
  userId: string,
  providerId: string,
): Promise<Response> {
  void req;
  const row = await deps.app.getProviderRow(userId, providerId);
  if (!row) return notFound("Provider");

  const preset = presetFor(row.kind as never);
  if (!preset.supportsListing) {
    return errorFromCode(
      "unsupported",
      `${preset.label} does not expose a model-listing endpoint, so discovery is unavailable. Enter model ids manually.`,
      501,
    );
  }

  const apiKey = await deps.app.getProviderApiKey(userId, providerId);
  if (!apiKey) {
    return errorFromCode(
      "bad-request",
      "No API key is stored for this provider. Add the key before refreshing the model list.",
      400,
    );
  }

  const ctx = adapterContext(deps, row, apiKey);
  const adapter = getAdapter(row.kind as ProviderKind);

  try {
    const { providerFetch } = await import("./http.js");
    const res = await providerFetch({
      url: adapter.listModelsUrl(ctx),
      method: "GET",
      headers: adapter.listModelsHeaders(ctx),
      timeoutMs: 30_000,
      lookup: ctx.lookup,
      allowLocalhost: ctx.allowLocalhost,
    });
    // `res.text()` enforces a byte cap internally; see server/http.ts.
    const raw = await res.text();
    let payload: unknown;
    try {
      payload = JSON.parse(raw);
    } catch {
      throw new Error("The model-listing endpoint did not return valid JSON.");
    }

    const parsed = adapter.parseModelList(payload, ctx);
    const records = parsed.models
      .map((rawModel) => normaliseRecord(rawModel, row.id, row.kind))
      .filter((r): r is ModelRecord => r !== null);

    if (records.length === 0) {
      throw new Error(
        "No models were found at that endpoint. Verify the Base URL points at the API root.",
      );
    }

    await deps.app.replaceModels(providerId, records);
    await deps.app.setModelDiscovery(userId, providerId, records.length);
    await deps.app.setProviderConnection(userId, providerId, {
      connectionStatus: "ok",
      connectionError: null,
      lastErrorCode: null,
    });

    const models = await deps.app.listModels(userId);
    const forProvider = models.filter((mm) => mm.providerId === providerId);
    return json({
      ok: true,
      count: forProvider.length,
      models: forProvider,
      fromListing: parsed.fromListing,
    });
  } catch (err) {
    const { toApiError } = await import("./http.js");
    const payload = toApiError(err, row.display_name, [apiKey]);
    await deps.app.setProviderConnection(userId, providerId, {
      connectionStatus: "error",
      connectionError: payload.message,
      lastErrorCode: payload.code,
    });
    return apiError(statusForCode(payload.code), payload);
  }
}

function normaliseRecord(
  rawModel: unknown,
  providerId: string,
  kind: string,
): ModelRecord | null {
  const record = normaliseModel(rawModel as never, providerId, kind as never, Date.now());
  return record;
}

/* ------------------------------------------------------------------ */
/* Chat                                                               */
/* ------------------------------------------------------------------ */

async function handleChat(
  req: Request,
  deps: ApiDeps,
  userId: string,
): Promise<Response> {
  const body = await readJson<ChatRequestBody>(req, MAX_BODY_BYTES);
  if (!body) {
    return errorFromCode("bad-request", "A JSON body is required.", 400);
  }
  if (!body.providerId || !body.modelId) {
    return errorFromCode("bad-request", "providerId and modelId are required.", 400);
  }
  if (!Array.isArray(body.messages) || body.messages.length === 0) {
    return errorFromCode("bad-request", "messages must be a non-empty array.", 400);
  }
  if (body.messages.length > MAX_MESSAGES) {
    return errorFromCode("bad-request", `Too many messages (max ${MAX_MESSAGES}).`, 400);
  }
  for (const msg of body.messages) {
    if (msg.role !== "system" && msg.role !== "user" && msg.role !== "assistant") {
      return errorFromCode("bad-request", `Invalid message role "${msg.role}".`, 400);
    }
    if (typeof msg.content !== "string") {
      return errorFromCode("bad-request", "Every message needs string content.", 400);
    }
  }

  const row = await deps.app.getProviderRow(userId, body.providerId);
  if (!row) return notFound("Provider");
  if (row.status === 0) {
    return errorFromCode("bad-request", `Provider "${row.display_name}" is disabled.`, 400);
  }

  const apiKey = await deps.app.getProviderApiKey(userId, body.providerId);
  if (!apiKey) {
    return errorFromCode(
      "bad-request",
      "No API key is stored for this provider, so the server cannot make the request. Use direct-browser mode, or add a key to this provider.",
      400,
    );
  }

  const model = await deps.app.getModel(userId, body.providerId, body.modelId);
  const requestId = body.requestId || crypto.randomUUID();

  const timeoutMs = Math.min(
    clampInt(body.timeoutMs ?? DEFAULT_TIMEOUT_MS, DEFAULT_TIMEOUT_MS, 5_000, 300_000),
    DEFAULT_TIMEOUT_MS,
  );

  const run = new ChatRun(requestId, row.display_name);
  activeRuns.set(requestId, { run, providerLabel: row.display_name, userId });
  const cleanup = () => activeRuns.delete(requestId);

  const adapter = getAdapter(row.kind as ProviderKind);
  const ctx = adapterContext(deps, row, apiKey);

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: StreamEvent) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
        } catch {
          /* controller already closed */
        }
      };

      let assistantContent = "";
      let metrics: StreamEvent extends never ? never : unknown = null;

      // Persist the user's final message and reserve an assistant row.
      const conversationId = body.conversationId ?? null;
      let assistantMessageId: string | null = null;

      try {
        if (conversationId) {
          const conv = await deps.app.getConversation(userId, conversationId);
          if (conv) {
            const last = body.messages.at(-1);
            if (last?.role === "user") {
              await deps.app.appendMessage({
                id: crypto.randomUUID(),
                conversationId,
                role: "user",
                content: last.content,
              });
            }
            assistantMessageId = crypto.randomUUID();
            await deps.app.appendMessage({
              id: assistantMessageId,
              conversationId,
              role: "assistant",
              content: "",
              providerId: body.providerId,
              modelId: body.modelId,
              modelLabel: body.modelLabel ?? body.modelId,
              status: "streaming",
              paneIndex: null,
            });
          }
        }

        await run.run({
          adapter,
          ctx,
          opts: {
            modelId: body.modelId,
            messages: body.messages,
            temperature: body.temperature,
            maxTokens: body.maxTokens ?? model?.maxOutputTokens ?? null,
            stream: true,
            timeoutMs,
            requestId,
          },
          emit: (e) => {
            if (e.type === "delta") assistantContent += e.text;
            if (e.type === "done") metrics = e.metrics;
            send(e);
          },
        });

        if (run.error) {
          if (assistantMessageId) {
            await deps.app.updateMessage(assistantMessageId, {
              content: assistantContent,
              status: "failed",
              error: run.error,
            });
          }
        } else if (assistantMessageId) {
          await deps.app.updateMessage(assistantMessageId, {
            content: assistantContent,
            status: "completed",
            metrics,
          });
        }

        // Attach the model's documented context window when we know it, so the
        // client can show it without a second request.
        if (model?.contextWindow) {
          send({
            type: "context",
            contextWindow: model.contextWindow,
            source: "provider",
          });
        }
      } catch (err) {
        const { toApiError } = await import("./http.js");
        const payload = toApiError(err, row.display_name, [apiKey]);
        send({ type: "error", error: payload });
        if (assistantMessageId) {
          await deps.app.updateMessage(assistantMessageId, {
            content: assistantContent,
            status: "failed",
            error: payload,
          });
        }
      } finally {
        cleanup();
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      }
    },
    cancel() {
      run.cancel();
      cleanup();
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
      "x-accel-buffering": "no",
      ...securityHeaderObject(),
    },
  });
}

/**
 * Security headers for responses not built by `json()`.
 *
 * Reads the same table `json()`/`apiError()` use, so SSE streams and OAuth
 * redirects cannot drift to a weaker policy than ordinary JSON responses.
 */
function securityHeaderObject(): Record<string, string> {
  return { ...SECURITY_HEADERS };
}

/* ------------------------------------------------------------------ */
/* Auth handlers                                                       */
/* ------------------------------------------------------------------ */

async function handleOAuthStart(
  req: Request,
  deps: ApiDeps,
  providerId: string,
  url: URL,
): Promise<Response> {
  if (providerId === "local") {
    if (!deps.allowLocalhost) {
      return errorFromCode("forbidden", "Local sign-in is disabled in production.", 403);
    }
    const user = await deps.app.upsertOAuthUser({
      provider: "local",
      providerAccountId: "local-user",
      email: "local@localhost",
      name: "Local User",
      avatarUrl: null,
    });
    const { token, tokenHash } = await createSessionToken();
    await deps.app.createSession({
      tokenHash,
      userId: user.id,
      ttlMs: SESSION_TTL_MS,
      userAgent: req.headers.get("user-agent") ?? "local-browser",
      ip: "127.0.0.1",
    });
    const cookie = cookieHeader(
      SESSION_COOKIE,
      encodeURIComponent(token),
      sessionCookieOptions(deps.env, SESSION_TTL_MS),
    );

    // If client requested JSON or used POST, return JSON directly
    if (req.method === "POST" || req.headers.get("accept")?.includes("application/json")) {
      const headers = new Headers({
        "set-cookie": cookie,
        "content-type": "application/json",
      });
      for (const [k, v] of Object.entries(securityHeaderObject())) headers.set(k, v);
      return new Response(JSON.stringify({ ok: true, token, user }), { status: 200, headers });
    }

    const appUrl = deps.allowLocalhost ? url.origin : (deps.env.ROSA_PUBLIC_APP_URL ?? url.origin);
    const headers = new Headers({
      location: `${appUrl}/`,
      "set-cookie": cookie,
    });
    for (const [k, v] of Object.entries(securityHeaderObject())) headers.set(k, v);
    return new Response(null, { status: 302, headers });
  }

  const provider = getOAuthProvider(deps.env, providerId);
  if (!provider) {
    return errorFromCode("bad-request", `OAuth provider "${providerId}" is not configured.`, 400);
  }

  // Keyed via rateLimitSubject so an unauthenticated caller cannot bypass the
  // limit by rotating a spoofed forwarded-for header.
  const allowed = await deps.app.rateLimit("oauth-start", rateLimitSubject(req), 20, 300_000);
  if (!allowed) {
    return errorFromCode("rate-limited", "Too many sign-in attempts. Wait a minute.", 429);
  }

  const state = await randomToken(24);
  // PKCE: the challenge travels to the provider, the verifier stays in our
  // database until the callback. See createPkcePair for why S256 rather than
  // "plain".
  const pkce = await createPkcePair();
  await deps.app.saveOAuthState({
    state,
    provider: providerId,
    codeVerifier: pkce.verifier,
    redirectTo: null,
    ttlMs: 10 * 60 * 1000,
  });

  const appUrl = deps.env.ROSA_PUBLIC_APP_URL ?? url.origin;
  const prefix = deps.env.ROSA_API_PREFIX ?? "/api";
  const redirectUri = `${appUrl}${prefix}/auth/${providerId}/callback`;

  const authorizeUrl = buildAuthorizeUrl(provider, {
    redirectUri,
    state,
    codeChallenge: pkce.challenge,
  });

  const headers = new Headers({ location: authorizeUrl });
  headers.set(
    "set-cookie",
    cookieHeader(OAUTH_STATE_COOKIE, state, {
      httpOnly: true,
      secure: isSecure(deps.env),
      sameSite: "lax",
      path: "/",
      maxAge: 600_000,
    }),
  );
  for (const [k, v] of Object.entries(securityHeaderObject())) headers.set(k, v);
  return new Response(null, { status: 302, headers });
}

async function handleOAuthCallback(
  req: Request,
  deps: ApiDeps,
  providerId: string,
  url: URL,
): Promise<Response> {
  const provider = getOAuthProvider(deps.env, providerId);
  if (!provider) {
    return redirectToLogin(deps, "Provider not configured.");
  }

  const error = url.searchParams.get("error");
  if (error) {
    return redirectToLogin(deps, `Sign-in was cancelled (${error}).`);
  }

  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  if (!code || !state) {
    return redirectToLogin(deps, "Invalid sign-in response.");
  }

  // The state must be one we issued, must be unused, and must match the cookie.
  const cookies = parseCookieHeader(req.headers.get("cookie"));
  const cookieState = cookies[OAUTH_STATE_COOKIE];
  if (!cookieState || cookieState !== state) {
    return redirectToLogin(deps, "Sign-in state did not match. Try again.");
  }

  const consumed = await deps.app.consumeOAuthState(state);
  if (!consumed) {
    return redirectToLogin(deps, "Sign-in link expired. Try again.");
  }

  const appUrl = deps.env.ROSA_PUBLIC_APP_URL ?? url.origin;
  const prefix = deps.env.ROSA_API_PREFIX ?? "/api";
  const redirectUri = `${appUrl}${prefix}/auth/${providerId}/callback`;

  // Exchange the code for an access token.
  let accessToken: string;
  try {
    const tokenBody = new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
      client_id: provider.clientId,
      client_secret: provider.clientSecret,
    });
    // Only sent when we issued one, so a state record created before PKCE was
    // wired up still completes rather than failing the exchange.
    if (consumed.codeVerifier) {
      tokenBody.set("code_verifier", consumed.codeVerifier);
    }

    const tokenRes = await fetch(provider.tokenUrl, {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        accept: "application/json",
      },
      body: tokenBody,
    });
    const tokenJson = (await tokenRes.json()) as {
      access_token?: string;
      error?: string;
      error_description?: string;
    };
    if (!tokenRes.ok || !tokenJson.access_token) {
      const detail = tokenJson.error_description ?? tokenJson.error ?? `HTTP ${tokenRes.status}`;
      return redirectToLogin(deps, `Token exchange failed: ${sanitize(detail)}`);
    }
    accessToken = tokenJson.access_token;
  } catch (err) {
    return redirectToLogin(deps, `Could not reach the provider: ${sanitize(messageOf(err))}`);
  }

  // Fetch the profile.
  let profile;
  try {
    const profileRes = await fetch(provider.userUrl, {
      headers: {
        authorization: `Bearer ${accessToken}`,
        accept: "application/json",
        "user-agent": "rosa-ai-workspace",
      },
    });
    if (!profileRes.ok) {
      return redirectToLogin(deps, `Could not load your profile (HTTP ${profileRes.status}).`);
    }
    profile = provider.parseProfile(await profileRes.json());
    if (!profile.id) {
      return redirectToLogin(deps, "The provider returned an unusable profile.");
    }
  } catch (err) {
    return redirectToLogin(deps, `Profile request failed: ${sanitize(messageOf(err))}`);
  }

  const user = await deps.app.upsertOAuthUser({
    provider: providerId,
    providerAccountId: profile.id,
    email: profile.email,
    name: profile.name,
    avatarUrl: profile.avatarUrl,
  });

  const { token, tokenHash } = await createSessionToken();
  await deps.app.createSession({
    tokenHash,
    userId: user.id,
    ttlMs: SESSION_TTL_MS,
    userAgent: req.headers.get("user-agent"),
    ip: clientIp(req),
  });

  const appUrlResolved = deps.env.ROSA_PUBLIC_APP_URL ?? url.origin;
  const headers = new Headers({ location: `${appUrlResolved}/app` });
  headers.set(
    "set-cookie",
    cookieHeader(SESSION_COOKIE, encodeURIComponent(token), sessionCookieOptions(deps.env, SESSION_TTL_MS)),
  );
  // Drop the single-use state cookie now that it is spent.
  headers.append(
    "set-cookie",
    clearCookieHeader(OAUTH_STATE_COOKIE, { secure: isSecure(deps.env), sameSite: "lax" }),
  );
  for (const [k, v] of Object.entries(securityHeaderObject())) headers.set(k, v);
  return new Response(null, { status: 302, headers });
}

async function handleLogout(req: Request, deps: ApiDeps): Promise<Response> {
  const auth = await authenticate(req, deps.app, deps.env);
  if (auth) await deps.app.deleteSession(auth.sessionTokenHash);
  return clearSessionResponse(json({ ok: true }));
}

function clearSessionResponse(res: Response): Response {
  const headers = new Headers(res.headers);
  headers.append("set-cookie", clearCookieHeader(SESSION_COOKIE));
  return new Response(res.body, { status: res.status, headers });
}

function redirectToLogin(deps: ApiDeps, reason: string): Response {
  const appUrl = deps.env.ROSA_PUBLIC_APP_URL ?? "/";
  const headers = new Headers({ location: `${appUrl}/login?error=${encodeURIComponent(reason)}` });
  headers.append(
    "set-cookie",
    clearCookieHeader(OAUTH_STATE_COOKIE, { secure: isSecure(deps.env), sameSite: "lax" }),
  );
  for (const [k, v] of Object.entries(securityHeaderObject())) headers.set(k, v);
  return new Response(null, { status: 302, headers });
}

/* ------------------------------------------------------------------ */
/* Utilities                                                           */
/* ------------------------------------------------------------------ */

function isSecure(env: ApiEnv): boolean {
  const appUrl = env.ROSA_PUBLIC_APP_URL;
  if (appUrl?.startsWith("https://")) return true;
  return env.NODE_ENV === "production";
}

function allowLocal(env: ApiEnv): boolean {
  return env.ROSA_ALLOW_LOCAL_HTTP === "1";
}

function isKnownKind(kind: string): boolean {
  return presetFor(kind as never) !== undefined;
}

async function randomToken(bytes: number): Promise<string> {
  const arr = new Uint8Array(bytes);
  crypto.getRandomValues(arr);
  return base64url(arr);
}

function parseCookieHeader(header: string | null): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(";")) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    const name = part.slice(0, eq).trim();
    let value = part.slice(eq + 1).trim();
    try {
      value = decodeURIComponent(value);
    } catch {
      /* keep raw */
    }
    out[name] = value;
  }
  return out;
}

function clampInt(
  value: string | null | number,
  fallback: number,
  min: number,
  max: number,
): number {
  const n = typeof value === "number" ? value : Number.parseInt(value ?? "", 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function statusForCode(code: string): number {
  switch (code) {
    case "invalid-api-key":
    case "unauthorized":
      return 401;
    case "quota-exhausted":
      return 402;
    case "forbidden":
      return 403;
    case "model-not-found":
    case "not-found":
      return 404;
    case "bad-request":
    case "bad-response":
      return 400;
    case "rate-limited":
      return 429;
    case "too-large":
    case "payload-too-large":
      return 413;
    case "timeout":
    case "upstream-timeout":
      return 504;
    case "bad-gateway":
    case "upstream-unavailable":
      return 502;
    case "unsupported":
      return 501;
    default:
      return 500;
  }
}

/**
 * Make arbitrary text safe to place in a redirect URL.
 *
 * Applied to the `error=` query parameter the login screen renders, so this is a
 * reflected-text path. React escapes it on render, but encoding here means the
 * value also survives any other consumer (a log line, a proxy) without injecting
 * separators, and credential-shaped text never reaches the address bar or
 * browser history.
 */
function sanitize(text: string): string {
  return redactSecrets(text).replace(/[\r\n\t]+/g, " ").slice(0, 200);
}

function messageOf(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/**
 * Parse a JSON body, refusing anything over `maxBytes`.
 *
 * The cap is enforced while reading, not after: `await req.text()` would buffer
 * the entire body first, so a "cap" applied to the result is not a cap at all.
 * The size is measured in bytes rather than UTF-16 code units, so a body of
 * multi-byte characters cannot pass by counting fewer characters than the bytes
 * it actually occupies.
 */
async function readJson<T>(req: Request, maxBytes = 64 * 1024): Promise<T | null> {
  const contentType = req.headers.get("content-type") ?? "";
  if (!contentType.includes("json")) return null;

  // A declared length is honoured when present, as a cheap early rejection.
  const declared = Number(req.headers.get("content-length") ?? Number.NaN);
  if (Number.isFinite(declared) && declared > maxBytes) return null;

  if (!req.body) return null;
  let text: string;
  try {
    text = await readCappedText(req.body, maxBytes);
  } catch {
    return null;
  }

  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

function decorateMessage(row: {
  id: string;
  conversation_id: string;
  role: "system" | "user" | "assistant";
  content: string;
  provider_id: string | null;
  model_id: string | null;
  model_label: string | null;
  status: string | null;
  metrics: string | null;
  error: string | null;
  parent_message_id: string | null;
  pane_index: number | null;
  created_at: number;
}) {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    role: row.role,
    content: row.content,
    providerId: row.provider_id,
    modelId: row.model_id,
    modelLabel: row.model_label,
    status: row.status,
    metrics: safeParse(row.metrics),
    error: safeParse(row.error),
    parentMessageId: row.parent_message_id,
    paneIndex: row.pane_index,
    createdAt: row.created_at,
  };
}

function safeParse(value: string | null): unknown {
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

export type { ModelWithProvider, ProviderConfig, UserProfile };
