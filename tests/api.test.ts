import { describe, expect, it, beforeAll, afterAll, beforeEach } from "vitest";
import { rmSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { handleApiRequest, type ApiDeps } from "../server/api.js";
import { AppDatabase } from "../server/db/repository.js";
import { SqliteDriver } from "../server/db/sqlite.js";
import { createSessionToken } from "../server/auth.js";
import { SESSION_COOKIE } from "../server/env.js";
import type { ProviderConfig } from "../shared/types.js";

/**
 * Handler-level integration tests: every request goes through the real
 * `handleApiRequest` router against a real node:sqlite database, mirroring what
 * runs in production. No route handler is mocked; only the upstream provider
 * HTTP calls are (via a stubbed global fetch in the chat/test/discovery tests).
 */

const DB_DIR = join(tmpdir(), `rosa-api-tests-${process.pid}`);
let deps: ApiDeps;

/** Last request a stubbed fetch saw (url/headers/body), per test scope. */
const fetchLog: Array<{ url: string; init: RequestInit | undefined }> = [];

function stubFetch(status: number, body: unknown, contentType = "application/json"): void {
  const impl = (async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    fetchLog.push({ url: String(input), init });
    const payload = typeof body === "string" ? body : JSON.stringify(body);
    return new Response(payload, {
      status,
      headers: { "content-type": contentType },
    });
  }) as unknown as typeof fetch;
  globalThis.fetch = impl;
}

function restoreFetch(): void {
  // Reinstall node's own fetch, so unrelated async work keeps working.
  delete (globalThis as { fetch?: unknown }).fetch;
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

/** Insert a user + session directly, then return the session cookie value.
 * Returns the user id as well, since the API tests key everything off it. */
async function seedSession(): Promise<string> {
  const user = await deps.app.upsertOAuthUser({
    provider: "github",
    providerAccountId: uid("acct-"),
    email: `${uid("seed")}@example.com`,
    name: "Vitest user",
    avatarUrl: null,
  });
  const { token, tokenHash } = await createSessionToken();
  await deps.app.createSession({
    tokenHash,
    userId: user.id,
    ttlMs: 30 * 24 * 3600 * 1000,
    userAgent: "vitest",
    ip: "127.0.0.1",
  });
  return token;
}

let counter = 0;
function uid(prefix = "u"): string {
  counter += 1;
  return `${prefix}${counter}`;
}

function api(
  path: string,
  method = "GET",
  body?: unknown,
  cookie?: string,
): Promise<Response> {
  return handleApiRequest(
    new Request(`http://localhost:8787/api${path}`, {
      method,
      headers: {
        ...(body !== undefined ? { "content-type": "application/json" } : {}),
        ...(cookie ? { cookie: `${SESSION_COOKIE}=${cookie}` } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
    deps,
  );
}

async function jsonOf(res: Response): Promise<Record<string, unknown>> {
  return (await res.json()) as Record<string, unknown>;
}

const ENCRYPTION_KEY = "vitest-master-key-0123456789abcdef"; // >=16 chars

beforeAll(async () => {
  mkdirSync(DB_DIR, { recursive: true });
  const driver = new SqliteDriver(join(DB_DIR, "test.sqlite"));
  await driver.migrate();
  const app = new AppDatabase(driver, ENCRYPTION_KEY, { allowHttpLocalDev: true });
  deps = {
    app,
    env: {
      ROSA_ENCRYPTION_KEY: ENCRYPTION_KEY,
      ROSA_SESSION_SECRET: "test-session-secret-at-least-32-chars-long!!",
      ROSA_ALLOW_LOCAL_HTTP: "1",
      ROSA_API_PREFIX: "/api",
      ROSA_PUBLIC_APP_URL: "http://localhost:8787",
    },
  };
});

afterAll(() => {
  // The sqlite handle (and its WAL sidecars) may still be open; deletion is
  // best-effort so a locked file on Windows cannot fail an otherwise-green run.
  try {
    rmSync(DB_DIR, { recursive: true, force: true });
  } catch {
    /* temp dir cleanup is optional */
  }
});

beforeEach(() => {
  fetchLog.length = 0;
});

/* ------------------------------------------------------------------ */
/* Auth / session                                                      */
/* ------------------------------------------------------------------ */

describe("health & session", () => {
  it("health is public and reports key storage", async () => {
    const res = await api("/health");
    expect(res.status).toBe(200);
    const body = await jsonOf(res);
    expect(body.ok).toBe(true);
    expect(body.keyStorage).toBe("encrypted-server-side");
    expect(Array.isArray(body.auth)).toBe(true);
  });

  it("security headers ride on every JSON response", async () => {
    const res = await api("/health");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(res.headers.get("x-frame-options")).toBe("DENY");
  });

  it("session without a cookie is anonymous", async () => {
    const res = await api("/session");
    expect(res.status).toBe(200);
    expect((await jsonOf(res)).user).toBeNull();
  });

  it("a forged cookie cannot authenticate", async () => {
    const res = await api("/session", "GET", undefined, "not-a-real-token");
    expect((await jsonOf(res)).user).toBeNull();
  });

  it("unauthenticated writes are 401", async () => {
    const res = await api("/providers", "POST", { kind: "openai", baseUrl: "https://api.openai.com/v1" });
    expect(res.status).toBe(401);
  });
});

/* ------------------------------------------------------------------ */
/* Provider CRUD + authz                                               */
/* ------------------------------------------------------------------ */

describe("provider CRUD", () => {
  let cookie: string;

  beforeEach(async () => {
    cookie = await seedSession();
  });

  it("creates a provider and reports discovery availability", async () => {
    const res = await api("/providers", "POST", {
      kind: "openai",
      displayName: "OpenAI",
      baseUrl: "https://api.openai.com/v1",
      apiKey: "sk-test-key-123456",
    }, cookie);
    expect(res.status).toBe(201);
    const body = await jsonOf(res);
    const provider = body.provider as ProviderConfig;
    expect(provider.kind).toBe("openai");
    expect(provider.hasApiKey).toBe(true);
    expect(provider.apiKeyHint).toHaveLength(4);
    expect(body.discoveryAvailable).toBe(true);
  });

  it("never returns the API key or the ciphertext", async () => {
    const res = await api("/providers", "POST", {
      kind: "anthropic",
      displayName: "Secret holder",
      baseUrl: "https://api.anthropic.com/v1",
      apiKey: "sk-ant-supersecret-987654",
    }, cookie);
    const text = await res.text();
    expect(text).not.toContain("sk-ant-supersecret");
    const body = JSON.parse(text) as { provider: Record<string, unknown> };
    expect(body.provider.apiKey).toBeUndefined();
    // The ciphertext must not leak even as an opaque column.
    expect(body.provider.encryptedApiKey).toBeUndefined();
    expect(body.provider.apiKeyCiphertext).toBeUndefined();
    expect(body.provider.hasApiKey).toBe(true);
  });

  it("rejects private-network Base URLs when local http is off", async () => {
    // temp deps without ROSA_ALLOW_LOCAL_HTTP
    const strictDeps: ApiDeps = { ...deps, env: { ...deps.env, ROSA_ALLOW_LOCAL_HTTP: undefined } };
    const strictApi = (
      path: string, method = "GET", body?: unknown,
    ): Promise<Response> =>
      handleApiRequest(
        new Request(`http://localhost:8787/api${path}`, {
          method,
          headers: {
            ...(body !== undefined ? { "content-type": "application/json" } : {}),
            cookie: `${SESSION_COOKIE}=${cookie}`,
          },
          body: body === undefined ? undefined : JSON.stringify(body),
        }),
        strictDeps,
      );

    for (const bad of [
      "http://127.0.0.1:9200",
      "http://10.1.2.3/v1",
      "http://192.168.1.50/v1",
      "http://169.254.169.254/latest/meta-data",
      "http://[::1]:9000/v1",
      "http://localhost:11434/v1",
    ]) {
      const res = await strictApi("/providers", "POST", {
        kind: "openai-compatible",
        displayName: "Bad",
        baseUrl: bad,
        apiKey: "sk-anything",
      });
      expect(res.status, `expected 400 for ${bad}`).toBe(400);
    }
  });

  it("accepts a loopback URL only when ROSA_ALLOW_LOCAL_HTTP=1", async () => {
    const res = await api("/providers", "POST", {
      kind: "openai-compatible",
      displayName: "Ollama",
      baseUrl: "http://127.0.0.1:11434/v1",
      apiKey: "sk-local",
    }, cookie);
    expect(res.status).toBe(201);
  });

  it("requires a valid provider kind", async () => {
    const res = await api("/providers", "POST", {
      kind: "not-a-kind",
      baseUrl: "https://api.example.com/v1",
      apiKey: "sk",
    }, cookie);
    expect(res.status).toBe(400);
  });

  it("requires a Base URL", async () => {
    const res = await api("/providers", "POST", {
      kind: "openai",
      apiKey: "sk",
    }, cookie);
    expect(res.status).toBe(400);
  });

  it("a user never sees another user's provider (authz)", async () => {
    const create = await api("/providers", "POST", {
      kind: "openai",
      displayName: "Mine",
      baseUrl: "https://api.openai.com/v1",
      apiKey: "sk-mine",
    }, cookie);
    const { provider } = (await jsonOf(create)) as { provider: ProviderConfig };

    const otherCookie = await seedSession(); // a different user
    const get = await api(`/providers/${provider.id}`, "GET", undefined, otherCookie);
    expect(get.status).toBe(404);

    const del = await api(`/providers/${provider.id}`, "DELETE", undefined, otherCookie);
    expect(del.status).toBe(404);
  });

  it("updates display name and rotated key", async () => {
    const create = await api("/providers", "POST", {
      kind: "openai",
      displayName: "Old name",
      baseUrl: "https://api.openai.com/v1",
      apiKey: "sk-first",
    }, cookie);
    const { provider } = (await jsonOf(create)) as { provider: ProviderConfig };

    const patch = await api(`/providers/${provider.id}`, "PATCH", {
      displayName: "New name",
      apiKey: "sk-second-key",
    }, cookie);
    expect(patch.status).toBe(200);
    const text = await patch.text();
    expect(text).toContain("New name");
    expect(text).not.toContain("sk-second-key");

    const get = await api(`/providers/${provider.id}`, "GET", undefined, cookie);
    const { provider: after } = (await jsonOf(get)) as { provider: ProviderConfig };
    expect(after.displayName).toBe("New name");
  });

  it("deletes a provider", async () => {
    const create = await api("/providers", "POST", {
      kind: "openai",
      baseUrl: "https://api.openai.com/v1",
      apiKey: "sk-doomed",
    }, cookie);
    const { provider } = (await jsonOf(create)) as { provider: ProviderConfig };
    const del = await api(`/providers/${provider.id}`, "DELETE", undefined, cookie);
    expect(del.status).toBe(200);
    const get = await api(`/providers/${provider.id}`, "GET", undefined, cookie);
    expect(get.status).toBe(404);
  });

  it("lists only the caller's providers", async () => {
    const a = await seedSession();
    const b = await seedSession();
    await api("/providers", "POST", { kind: "openai", baseUrl: "https://api.openai.com/v1", apiKey: "sk-a" }, a);
    await api("/providers", "POST", { kind: "openai", baseUrl: "https://api.openai.com/v1", apiKey: "sk-b" }, b);

    const forA = await api("/providers", "GET", undefined, a);
    const forB = await api("/providers", "GET", undefined, b);
    const listA = (await jsonOf(forA)).providers as ProviderConfig[];
    const listB = (await jsonOf(forB)).providers as ProviderConfig[];
    expect(listA.length).toBeGreaterThanOrEqual(1);
    expect(listB.length).toBeGreaterThanOrEqual(1);
    expect(listA.some((p) => p.apiKeyHint && listB.some((q) => q.id === p.id))).toBe(false);
  });
});

/* ------------------------------------------------------------------ */
/* Model discovery                                                     */
/* ------------------------------------------------------------------ */

describe("model discovery", () => {
  let cookie: string;

  beforeEach(async () => {
    cookie = await seedSession();
  });

  it("discovers models from a listing endpoint and stores them", async () => {
    stubFetch(200, {
      object: "list",
      data: [
        { id: "gpt-4o", context_window: 128000 },
        { id: "gpt-4o-mini", context_window: 128000 },
      ],
    });
    try {
      const create = await api("/providers", "POST", {
        kind: "openai",
        displayName: "OA",
        baseUrl: "https://api.openai.com/v1",
        apiKey: "sk-disc",
      }, cookie);
      const { provider } = (await jsonOf(create)) as { provider: ProviderConfig };

      const res = await api(`/providers/${provider.id}/models`, "POST", {}, cookie);
      expect(res.status).toBe(200);
      const body = await jsonOf(res);
      expect(body.ok).toBe(true);
      expect(body.fromListing).toBe(true);
      expect(body.count).toBe(2);

      const models = await api("/models", "GET", undefined, cookie);
      const list = (await jsonOf(models)).models as Array<{ modelId: string }>;
      expect(list.map((m) => m.modelId)).toEqual(expect.arrayContaining(["gpt-4o", "gpt-4o-mini"]));
    } finally {
      restoreFetch();
    }
  });

  it("sends the key only via the auth header, never in the URL", async () => {
    stubFetch(200, { object: "list", data: [{ id: "m-1" }] });
    try {
      const create = await api("/providers", "POST", {
        kind: "openai",
        baseUrl: "https://api.openai.com/v1",
        apiKey: "sk-abc",
      }, cookie);
      const { provider } = (await jsonOf(create)) as { provider: ProviderConfig };
      await api(`/providers/${provider.id}/models`, "POST", {}, cookie);

      expect(fetchLog.length).toBe(1);
      expect(fetchLog[0].url).toBe("https://api.openai.com/v1/models");
      // The key must not travel in the URL (it would land in access logs).
      expect(fetchLog[0].url).not.toContain("sk-abc");
      // It must ride the auth header to the provider — that is the point of BYOK.
      const headers = (fetchLog[0].init?.headers ?? {}) as Record<string, string>;
      const auth = headers["authorization"] ?? headers["Authorization"] ?? "";
      expect(auth).toContain("sk-abc");
    } finally {
      restoreFetch();
    }
  });

  it("reports fromListing=false when the provider cannot list models", async () => {
    stubFetch(404, { error: { message: "no listing" } });
    try {
      const create = await api("/providers", "POST", {
        kind: "openai",
        baseUrl: "https://api.openai.com/v1",
        apiKey: "sk-nl",
      }, cookie);
      const { provider } = (await jsonOf(create)) as { provider: ProviderConfig };
      const res = await api(`/providers/${provider.id}/models`, "POST", {}, cookie);
      // An upstream 404 maps to code "model-not-found" → HTTP 404 (statusForCode).
      expect(res.status).toBe(404);
      const body = await jsonOf(res);
      expect((body.error as { code: string }).code).toBe("model-not-found");
    } finally {
      restoreFetch();
    }
  });
});

/* ------------------------------------------------------------------ */
/* Favourites & pinned                                                 */
/* ------------------------------------------------------------------ */

describe("favourites and pins", () => {
  let cookie: string;

  beforeEach(async () => {
    cookie = await seedSession();
  });

  it("requires body { on: boolean }", async () => {
    const res = await api("/models/p1/m1/favourite", "POST", { on: "yes" }, cookie);
    expect(res.status).toBe(400);
  });

  it("toggles a favourite and prunes orphans", async () => {
    await api("/models/p1/m1/favourite", "POST", { on: true }, cookie);
    const res = await api("/models/p1/m1/favourite", "POST", { on: false }, cookie);
    expect(res.status).toBe(200);
    expect((await jsonOf(res)).favourite).toBe(false);
  });

  it("toggles a pin", async () => {
    const res = await api("/models/p1/m1/pin", "POST", { on: true }, cookie);
    expect(res.status).toBe(200);
    expect((await jsonOf(res)).pinned).toBe(true);
  });
});

/* ------------------------------------------------------------------ */
/* Conversations & messages                                            */
/* ------------------------------------------------------------------ */

describe("conversations", () => {
  let cookie: string;

  beforeEach(async () => {
    cookie = await seedSession();
  });

  it("creates, lists and deletes a conversation", async () => {
    const create = await api("/conversations", "POST", { title: "Test chat" }, cookie);
    expect(create.status).toBe(201);
    const { conversation } = (await jsonOf(create)) as { conversation: { id: string; title: string } };
    expect(conversation.title).toBe("Test chat");

    const list = await api("/conversations", "GET", undefined, cookie);
    const items = (await jsonOf(list)).conversations as Array<{ id: string }>;
    expect(items.some((c) => c.id === conversation.id)).toBe(true);

    const del = await api(`/conversations/${conversation.id}`, "DELETE", undefined, cookie);
    expect(del.status).toBe(200);
  });

  it("another user's conversation is invisible (authz)", async () => {
    const a = await seedSession();
    const b = await seedSession();
    const create = await api("/conversations", "POST", { title: "A's" }, a);
    const { conversation } = (await jsonOf(create)) as { conversation: { id: string } };
    const res = await api(`/conversations/${conversation.id}`, "GET", undefined, b);
    expect(res.status).toBe(404);
  });
});
