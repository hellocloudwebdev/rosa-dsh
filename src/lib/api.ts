import type {
  ApiErrorPayload,
  ChatRequestBody,
  Conversation,
  Folder,
  ModelWithProvider,
  ProviderConfig,
  StreamEvent,
  UserProfile,
} from "../../shared/types.js";

const BASE = "/api";

export class ApiClientError extends Error {
  constructor(
    readonly status: number,
    readonly payload: ApiErrorPayload,
  ) {
    super(payload.message);
    this.name = "ApiClientError";
  }

  get code(): ApiErrorPayload["code"] {
    return this.payload.code;
  }
}

interface RequestOptions {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  body?: unknown;
  signal?: AbortSignal;
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = {};
  if (options.body !== undefined) headers["content-type"] = "application/json";

  const res = await fetch(`${BASE}${path}`, {
    method: options.method ?? "GET",
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    credentials: "same-origin",
    signal: options.signal,
  });

  const text = await res.text();
  let parsed: unknown = null;
  if (text) {
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = null;
    }
  }

  if (!res.ok) {
    const payload =
      (parsed as { error?: ApiErrorPayload })?.error ??
      ({
        code: "internal",
        message: `Request failed with status ${res.status}.`,
        retryable: res.status >= 500,
      } satisfies ApiErrorPayload);
    throw new ApiClientError(res.status, payload);
  }

  return parsed as T;
}

/* ------------------------------------------------------------------ */
/* Session                                                             */
/* ------------------------------------------------------------------ */

export interface HealthInfo {
  ok: boolean;
  version: string;
  auth: string[];
  oauthConfigured: boolean;
  keyStorage: "encrypted-server-side" | "session-only";
}

export function getHealth(signal?: AbortSignal) {
  return request<HealthInfo>("/health", { signal });
}

export function getSession(signal?: AbortSignal) {
  return request<{ user: UserProfile | null }>("/session", { signal });
}

export function logout() {
  return request<{ ok: true }>("/auth/logout", { method: "POST" });
}

/* ------------------------------------------------------------------ */
/* Providers                                                           */
/* ------------------------------------------------------------------ */

export interface CreateProviderBody {
  kind: string;
  displayName: string;
  baseUrl: string;
  apiKey?: string;
  organizationId?: string | null;
}

export function listProviders(signal?: AbortSignal) {
  return request<{ providers: ProviderConfig[] }>("/providers", { signal });
}

export function createProvider(body: CreateProviderBody) {
  return request<{ provider: ProviderConfig; discoveryAvailable: boolean }>("/providers", {
    method: "POST",
    body,
  });
}

export function updateProvider(
  id: string,
  body: Partial<CreateProviderBody> & { status?: number },
) {
  return request<{ provider: ProviderConfig }>(`/providers/${id}`, { method: "PATCH", body });
}

export function deleteProvider(id: string) {
  return request<{ ok: true }>(`/providers/${id}`, { method: "DELETE" });
}

export interface TestProviderResult {
  ok: boolean;
  message: string;
  modelCount?: number;
}

export function testProvider(id: string) {
  return request<TestProviderResult>(`/providers/${id}/test`, { method: "POST" });
}

export interface DiscoverModelsResult {
  ok: boolean;
  count: number;
  models: ModelWithProvider[];
  fromListing: boolean;
}

export function discoverModels(id: string) {
  return request<DiscoverModelsResult>(`/providers/${id}/models`, { method: "POST" });
}

/* ------------------------------------------------------------------ */
/* Models                                                              */
/* ------------------------------------------------------------------ */

export function listModels(signal?: AbortSignal) {
  return request<{ models: ModelWithProvider[] }>("/models", { signal });
}

export function setFavourite(providerId: string, modelId: string, on: boolean) {
  return request<{ ok: true; favourite: boolean }>(
    `/models/${encodeURIComponent(providerId)}/${encodeURIComponent(modelId)}/favourite`,
    { method: "POST", body: { on } },
  );
}

export function setPinned(providerId: string, modelId: string, on: boolean) {
  return request<{ ok: true; pinned: boolean }>(
    `/models/${encodeURIComponent(providerId)}/${encodeURIComponent(modelId)}/pin`,
    { method: "POST", body: { on } },
  );
}

/* ------------------------------------------------------------------ */
/* Chat                                                                */
/* ------------------------------------------------------------------ */

/**
 * Open a streaming chat request.
 *
 * Returns the raw Response so the caller owns reading the SSE body; the body
 * must be cancelled explicitly to abort the upstream run server-side.
 */
export function openChatStream(body: ChatRequestBody, signal: AbortSignal): Promise<Response> {
  return fetch(`${BASE}/chat`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ...body, stream: true }),
    credentials: "same-origin",
    signal,
  });
}

export function cancelRun(requestId: string) {
  return request<{ ok: true; cancelled: boolean }>("/chat/cancel", {
    method: "POST",
    body: { requestId },
  });
}

/* ------------------------------------------------------------------ */
/* Conversations                                                        */
/* ------------------------------------------------------------------ */

export function listConversations(params?: {
  limit?: number;
  offset?: number;
  q?: string;
  folderId?: string;
}) {
  const qs = new URLSearchParams();
  if (params?.limit) qs.set("limit", String(params.limit));
  if (params?.offset) qs.set("offset", String(params.offset));
  if (params?.q) qs.set("q", params.q);
  if (params?.folderId !== undefined) qs.set("folder", params.folderId);
  const suffix = qs.toString() ? `?${qs}` : "";
  return request<{
    conversations: Array<Conversation & { messageCount: number; lastMessageAt: number | null }>;
    total: number;
    hasMore: boolean;
  }>(`/conversations${suffix}`);
}

export function getConversation(id: string) {
  return request<{
    conversation: Conversation;
    messages: Array<{
      id: string;
      conversationId: string;
      role: "system" | "user" | "assistant";
      content: string;
      providerId: string | null;
      modelId: string | null;
      modelLabel: string | null;
      status: string | null;
      metrics: unknown;
      error: unknown;
      parentMessageId: string | null;
      paneIndex: number | null;
      createdAt: number;
    }>;
  }>(`/conversations/${encodeURIComponent(id)}`);
}

export function createConversation(body?: {
  title?: string;
  paneCount?: 1 | 2 | 3 | 4;
  paneModels?: Array<{ providerId: string; modelId: string } | null>;
  folderId?: string | null;
}) {
  return request<{ conversation: Conversation }>("/conversations", { method: "POST", body: body ?? {} });
}

export function updateConversation(
  id: string,
  body: {
    title?: string;
    pinned?: boolean;
    favourite?: boolean;
    folderId?: string | null;
    paneCount?: 1 | 2 | 3 | 4;
    paneModels?: Array<{ providerId: string; modelId: string } | null>;
  },
) {
  return request<{ conversation: Conversation }>(`/conversations/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body,
  });
}

export function deleteConversation(id: string) {
  return request<{ ok: true }>(`/conversations/${encodeURIComponent(id)}`, { method: "DELETE" });
}

/* ------------------------------------------------------------------ */
/* Folders                                                             */
/* ------------------------------------------------------------------ */

export function listFolders() {
  return request<{ folders: Folder[] }>("/folders");
}

export function createFolder(name: string, parentId?: string | null) {
  return request<{ folder: Folder }>("/folders", { method: "POST", body: { name, parentId } });
}

export function renameFolder(id: string, name: string) {
  return request<{ ok: true }>(`/folders/${encodeURIComponent(id)}`, { method: "PATCH", body: { name } });
}

export function deleteFolder(id: string) {
  return request<{ ok: true }>(`/folders/${encodeURIComponent(id)}`, { method: "DELETE" });
}

/* ------------------------------------------------------------------ */
/* Preferences & account                                               */
/* ------------------------------------------------------------------ */

export interface UserPrefs {
  theme: "light" | "dark";
  sidebarWidth: number | null;
  directBrowser: boolean;
  preferences: Record<string, unknown>;
}

export function getPrefs() {
  return request<{ prefs: UserPrefs }>("/prefs");
}

export function updatePrefs(body: Partial<UserPrefs>) {
  return request<{ prefs: UserPrefs }>("/prefs", { method: "PATCH", body });
}

export function deleteAccount() {
  return request<{ ok: true }>("/account", { method: "DELETE" });
}

/* ------------------------------------------------------------------ */
/* SSE decoding                                                        */
/* ------------------------------------------------------------------ */

export interface SSEHandlers {
  onEvent: (event: StreamEvent) => void;
  onNetworkError?: (error: ApiErrorPayload) => void;
}

/**
 * Read a streaming chat Response into StreamEvents.
 * Resolves when the server closes the stream.
 */
export async function readChatStream(res: Response, handlers: SSEHandlers): Promise<void> {
  if (!res.body) {
    handlers.onEvent({
      type: "error",
      error: { code: "unsupported", message: "The server did not return a stream.", retryable: false },
    });
    return;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  const dispatch = (chunk: string) => {
    buffer += chunk;
    // Frames are separated by a blank line. Find the earliest of the three
    // blank-line spellings so no variant is silently swallowed.
    for (;;) {
      const lf = buffer.indexOf("\n\n");
      const crlf = buffer.indexOf("\r\n\r\n");
      const cr = buffer.indexOf("\r\r");
      const ends = [lf, crlf, cr].filter((i) => i !== -1);
      if (ends.length === 0) return;

      const start = Math.min(...ends);
      // How many bytes the chosen terminator occupies.
      const termLen = start === crlf ? 4 : 2;
      const frame = buffer.slice(0, start);
      buffer = buffer.slice(start + termLen);
      if (!frame.trim()) continue;

      for (const line of frame.split(/\r\n|\r|\n/)) {
        if (!line.startsWith("data:")) continue;
        const data = line.slice(5).trim();
        if (!data || data === "[DONE]") continue;
        try {
          handlers.onEvent(JSON.parse(data) as StreamEvent);
        } catch {
          /* skip a malformed frame rather than killing the stream */
        }
      }
    }
  };

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      dispatch(decoder.decode(value, { stream: true }));
    }
    dispatch(decoder.decode());
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") return;
    handlers.onNetworkError?.({
      code: "transport",
      message: `Connection lost: ${err instanceof Error ? err.message : String(err)}`,
      retryable: true,
    });
  }
}
