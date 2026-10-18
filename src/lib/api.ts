import type {
  ChatRequestBody,
  Conversation,
  CreateProviderInput,
  Folder,
  ModelWithProvider,
  ProviderConfig,
  StreamEvent,
  UpdateProviderInput,
  UserProfile,
  ChatMessage,
  TurnMetrics,
} from "@shared/types.js";
import { SSEParser } from "@shared/sse.js";

const TOKEN_KEY = "rosa_auth_token";

let customTokenGetter: (() => Promise<string | null>) | null = null;

export function setTokenGetter(getter: (() => Promise<string | null>) | null) {
  customTokenGetter = getter;
}

export function getStoredToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setStoredToken(token: string | null) {
  try {
    if (token) {
      localStorage.setItem(TOKEN_KEY, token);
    } else {
      localStorage.removeItem(TOKEN_KEY);
    }
  } catch {
    /* ignore */
  }
}

async function resolveToken(): Promise<string | null> {
  if (customTokenGetter) {
    try {
      const token = await customTokenGetter();
      if (token) return token;
    } catch {
      /* fallback */
    }
  }
  return getStoredToken();
}

/** Standard authenticated fetch for Rosa API */
export async function apiFetch(
  endpoint: string,
  init: RequestInit = {},
  retryAuth = true,
): Promise<Response> {
  const token = await resolveToken();
  const headers = new Headers(init.headers);

  if (token && !headers.has("Authorization")) {
    headers.set("Authorization", `Bearer ${token}`);
  }
  if (!headers.has("Accept")) {
    headers.set("Accept", "application/json");
  }

  const url = endpoint.startsWith("/") ? endpoint : `/${endpoint}`;
  const res = await fetch(url, {
    ...init,
    headers,
    credentials: "include",
  });

  // Auto-login locally if unauthorized in development
  if (res.status === 401 && retryAuth) {
    try {
      const loginRes = await fetch("/api/auth/local/start", {
        method: "POST",
        headers: { Accept: "application/json" },
        credentials: "include",
      });
      if (loginRes.ok) {
        const data = await loginRes.json();
        if (data.token) {
          setStoredToken(data.token);
          return apiFetch(endpoint, init, false);
        }
      }
    } catch {
      /* ignore */
    }
  }

  return res;
}

/* ------------------------------------------------------------------ */
/* Auth & Session                                                      */
/* ------------------------------------------------------------------ */

export async function getHealth(): Promise<{
  ok: boolean;
  auth: string[];
  oauthConfigured: boolean;
  keyStorage: string;
} | null> {
  try {
    const res = await fetch("/api/health", { headers: { Accept: "application/json" } });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export async function getSession(): Promise<{ user: UserProfile | null }> {
  try {
    const res = await apiFetch("/api/session");
    if (!res.ok) return { user: null };
    return await res.json();
  } catch {
    return { user: null };
  }
}

export async function loginLocal(): Promise<{ ok: boolean; token?: string; user?: UserProfile }> {
  const res = await fetch("/api/auth/local/start", {
    method: "POST",
    headers: { Accept: "application/json" },
    credentials: "include",
  });
  if (!res.ok) {
    throw new Error(`Local login failed: ${res.statusText}`);
  }
  const data = await res.json();
  if (data.token) {
    setStoredToken(data.token);
  }
  return data;
}

export async function logout(): Promise<void> {
  setStoredToken(null);
  try {
    await apiFetch("/api/auth/logout", { method: "POST" });
  } catch {
    /* ignore */
  }
}

/* ------------------------------------------------------------------ */
/* Providers                                                           */
/* ------------------------------------------------------------------ */

export async function listProviders(): Promise<ProviderConfig[]> {
  const res = await apiFetch("/api/providers");
  if (!res.ok) throw new Error(await extractErrorMessage(res, "Failed to list providers"));
  const data = await res.json();
  return data.providers ?? [];
}

export async function getProvider(id: string): Promise<ProviderConfig> {
  const res = await apiFetch(`/api/providers/${encodeURIComponent(id)}`);
  if (!res.ok) throw new Error(await extractErrorMessage(res, "Failed to get provider"));
  const data = await res.json();
  return data.provider;
}

export async function createProvider(input: CreateProviderInput): Promise<ProviderConfig> {
  const res = await apiFetch("/api/providers", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error(await extractErrorMessage(res, "Failed to create provider"));
  const data = await res.json();
  return data.provider;
}

export async function updateProvider(
  id: string,
  input: UpdateProviderInput,
): Promise<ProviderConfig> {
  const res = await apiFetch(`/api/providers/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error(await extractErrorMessage(res, "Failed to update provider"));
  const data = await res.json();
  return data.provider;
}

export async function deleteProvider(id: string): Promise<void> {
  const res = await apiFetch(`/api/providers/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
  if (!res.ok) throw new Error(await extractErrorMessage(res, "Failed to delete provider"));
}

export async function testProvider(
  id: string,
): Promise<{ ok: boolean; latencyMs?: number; error?: string }> {
  const res = await apiFetch(`/api/providers/${encodeURIComponent(id)}/test`, {
    method: "POST",
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    return {
      ok: false,
      error:
        (data?.error ? formatErrorMessage(data.error) : undefined) ||
        data?.error?.message ||
        `Test failed with status ${res.status}`,
    };
  }
  return { ok: true, latencyMs: data?.latencyMs };
}

export async function discoverModels(
  id: string,
): Promise<{ ok: boolean; discovered: number; added: number; updated: number }> {
  const res = await apiFetch(`/api/providers/${encodeURIComponent(id)}/models`, {
    method: "POST",
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data?.error?.message || "Model discovery failed");
  }
  return data;
}

/* ------------------------------------------------------------------ */
/* Models                                                              */
/* ------------------------------------------------------------------ */

export async function listModels(): Promise<ModelWithProvider[]> {
  const res = await apiFetch("/api/models");
  if (!res.ok) throw new Error(await extractErrorMessage(res, "Failed to list models"));
  const data = await res.json();
  return data.models ?? [];
}

export async function setFavouriteModel(
  providerId: string,
  modelId: string,
  on: boolean,
): Promise<boolean> {
  const res = await apiFetch(
    `/api/models/${encodeURIComponent(providerId)}/${encodeURIComponent(modelId)}/favourite`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ on }),
    },
  );
  if (!res.ok) throw new Error("Failed to set favourite");
  const data = await res.json();
  return data.favourite;
}

export async function setPinnedModel(
  providerId: string,
  modelId: string,
  on: boolean,
): Promise<boolean> {
  const res = await apiFetch(
    `/api/models/${encodeURIComponent(providerId)}/${encodeURIComponent(modelId)}/pin`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ on }),
    },
  );
  if (!res.ok) throw new Error("Failed to set pinned");
  const data = await res.json();
  return data.pinned;
}

/* ------------------------------------------------------------------ */
/* Conversations & Messages                                            */
/* ------------------------------------------------------------------ */

export interface ConversationListResponse {
  conversations: Array<
    Conversation & {
      messageCount: number;
      lastMessageAt: number | null;
    }
  >;
  total: number;
  hasMore: boolean;
}

export async function listConversations(params?: {
  q?: string;
  folder?: string;
  limit?: number;
  offset?: number;
}): Promise<ConversationListResponse> {
  const sp = new URLSearchParams();
  if (params?.q) sp.set("q", params.q);
  if (params?.folder) sp.set("folder", params.folder);
  if (params?.limit) sp.set("limit", String(params.limit));
  if (params?.offset) sp.set("offset", String(params.offset));

  const url = `/api/conversations${sp.toString() ? `?${sp.toString()}` : ""}`;
  const res = await apiFetch(url);
  if (!res.ok) throw new Error(await extractErrorMessage(res, "Failed to list conversations"));
  return await res.json();
}

export async function createConversation(body?: {
  title?: string;
  paneCount?: 1 | 2 | 3 | 4;
  paneModels?: Array<{ providerId: string; modelId: string } | null>;
  folderId?: string | null;
}): Promise<Conversation> {
  const res = await apiFetch("/api/conversations", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });
  if (!res.ok) throw new Error(await extractErrorMessage(res, "Failed to create conversation"));
  const data = await res.json();
  return data.conversation;
}

export async function getConversation(
  id: string,
): Promise<{ conversation: Conversation; messages: ChatMessage[] }> {
  const res = await apiFetch(`/api/conversations/${encodeURIComponent(id)}`);
  if (!res.ok) throw new Error(await extractErrorMessage(res, "Failed to get conversation"));
  return await res.json();
}

export async function updateConversation(
  id: string,
  body: {
    title?: string;
    pinned?: boolean;
    favourite?: boolean;
    folderId?: string | null;
    paneCount?: 1 | 2 | 3 | 4;
    paneModels?: Array<{ providerId: string; modelId: string } | null>;
  },
): Promise<Conversation> {
  const res = await apiFetch(`/api/conversations/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await extractErrorMessage(res, "Failed to update conversation"));
  const data = await res.json();
  return data.conversation;
}

export async function deleteConversation(id: string): Promise<void> {
  const res = await apiFetch(`/api/conversations/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
  if (!res.ok) throw new Error(await extractErrorMessage(res, "Failed to delete conversation"));
}

/* ------------------------------------------------------------------ */
/* Folders                                                             */
/* ------------------------------------------------------------------ */

export async function listFolders(): Promise<Folder[]> {
  const res = await apiFetch("/api/folders");
  if (!res.ok) throw new Error(await extractErrorMessage(res, "Failed to list folders"));
  const data = await res.json();
  return data.folders ?? [];
}

export async function createFolder(name: string, parentId?: string | null): Promise<Folder> {
  const res = await apiFetch("/api/folders", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, parentId }),
  });
  if (!res.ok) throw new Error(await extractErrorMessage(res, "Failed to create folder"));
  const data = await res.json();
  return data.folder;
}

export async function renameFolder(id: string, name: string): Promise<void> {
  const res = await apiFetch(`/api/folders/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
  if (!res.ok) throw new Error(await extractErrorMessage(res, "Failed to rename folder"));
}

export async function deleteFolder(id: string): Promise<void> {
  const res = await apiFetch(`/api/folders/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
  if (!res.ok) throw new Error(await extractErrorMessage(res, "Failed to delete folder"));
}

/* ------------------------------------------------------------------ */
/* Preferences                                                         */
/* ------------------------------------------------------------------ */

export async function getPrefs(): Promise<Record<string, unknown>> {
  const res = await apiFetch("/api/prefs");
  if (!res.ok) return {};
  const data = await res.json();
  return data.prefs ?? {};
}

export async function savePrefs(prefs: {
  theme?: string;
  sidebarWidth?: number | null;
  preferences?: Record<string, unknown>;
}): Promise<Record<string, unknown>> {
  const res = await apiFetch("/api/prefs", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(prefs),
  });
  if (!res.ok) return {};
  const data = await res.json();
  return data.prefs ?? {};
}

/* ------------------------------------------------------------------ */
/* Chat Streaming & Cancellation                                       */
/* ------------------------------------------------------------------ */

export interface StreamChatHandlers {
  onStart?: (event: Extract<StreamEvent, { type: "start" }>) => void;
  onDelta?: (deltaText: string) => void;
  onUsage?: (usage: Extract<StreamEvent, { type: "usage" }>) => void;
  onContext?: (context: Extract<StreamEvent, { type: "context" }>) => void;
  onDone?: (done: { finishReason: string | null; metrics: Omit<TurnMetrics, "startedAt" | "endedAt"> }) => void;
  onError?: (error: { message: string; code?: string; detail?: string }) => void;
}

export async function streamChat(
  body: ChatRequestBody,
  handlers: StreamChatHandlers,
  signal?: AbortSignal,
): Promise<void> {
  const res = await apiFetch("/api/chat", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "text/event-stream",
    },
    body: JSON.stringify({
      ...body,
      stream: true,
    }),
    signal,
  });

  if (!res.ok) {
    const errorMsg = await extractErrorMessage(res, "Chat request failed");
    handlers.onError?.({ message: errorMsg, code: String(res.status) });
    return;
  }

  const reader = res.body?.getReader();
  if (!reader) {
    handlers.onError?.({ message: "No readable response body received from server" });
    return;
  }

  const decoder = new TextDecoder();
  const parser = new SSEParser({
    onEvent: (event) => {
      try {
        const payload: StreamEvent = JSON.parse(event.data);
        switch (payload.type) {
          case "start":
            handlers.onStart?.(payload);
            break;
          case "delta":
            handlers.onDelta?.(payload.text);
            break;
          case "usage":
            handlers.onUsage?.(payload);
            break;
          case "context":
            handlers.onContext?.(payload);
            break;
          case "done":
            handlers.onDone?.({
              finishReason: payload.finishReason,
              metrics: payload.metrics,
            });
            break;
          case "error":
            handlers.onError?.(payload.error);
            break;
        }
      } catch {
        /* ignore invalid SSE line or comments */
      }
    },
  });

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const text = decoder.decode(value, { stream: true });
      parser.push(text);
    }
    parser.flush();
  } catch (err: unknown) {
    if ((err as Error)?.name === "AbortError") {
      // Intentionally aborted by user
      return;
    }
    handlers.onError?.({ message: (err as Error)?.message || "Stream interrupted" });
  } finally {
    reader.releaseLock();
  }
}

export async function cancelChat(requestId: string): Promise<boolean> {
  try {
    const res = await apiFetch("/api/chat/cancel", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ requestId }),
    });
    if (!res.ok) return false;
    const data = await res.json();
    return Boolean(data.cancelled);
  } catch {
    return false;
  }
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

/** Map a FailureCode / ApiErrorPayload to clear, user-facing error copy. */
export function formatErrorMessage(
  err?: { code?: string; message?: string; retryAfterSeconds?: number } | null,
): string {
  if (!err) return "An unknown error occurred.";
  if (err.code === "invalid-api-key") {
    return "Invalid API key. Check your provider credentials, permissions, and expiry.";
  }
  if (err.code === "rate-limited") {
    const wait = err.retryAfterSeconds ? ` Try again in ${err.retryAfterSeconds}s.` : "";
    return `Rate limit exceeded.${wait} Wait a moment before sending another prompt.`;
  }
  if (err.code === "quota-exhausted") {
    return "Provider quota or credit exhausted. Check your billing account balance.";
  }
  if (err.code === "model-not-found") {
    return "Model not found. Verify the model ID and your account's access to it.";
  }
  if (err.code === "forbidden") {
    return "Access forbidden. Your API key lacks permission for this model or feature.";
  }
  if (err.code === "timeout") {
    return "Request timed out waiting for upstream provider response.";
  }
  if (err.code === "too-large") {
    return "Request payload too large. Try reducing message history or max tokens.";
  }
  if (err.code === "truncated-stream") {
    return "Stream was truncated unexpectedly by provider before completion.";
  }
  if (err.code === "network-error") {
    return "Network error connecting to provider. Check your network or provider status.";
  }
  if (err.code === "bad-gateway") {
    return "Provider gateway error (502/503/504). This is usually temporary.";
  }
  if (err.code === "server-error") {
    return "Provider internal server error (5xx). Please try again shortly.";
  }
  if (err.code === "redirect-blocked") {
    return "Provider attempted an unsafe redirect, which was blocked for security.";
  }
  if (err.code === "bad-response") {
    return err.message || "Provider returned an invalid or unparseable response.";
  }
  return err.message || "Provider error occurred.";
}

async function extractErrorMessage(res: Response, fallback: string): Promise<string> {
  try {
    const text = await res.text();
    const parsed = JSON.parse(text);
    if (parsed?.error) {
      return formatErrorMessage(parsed.error);
    }
    return parsed?.message || text || fallback;
  } catch {
    return `${fallback} (${res.status} ${res.statusText})`;
  }
}
