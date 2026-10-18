/**
 * Shared contract types used by both the browser client and the API layer.
 * Everything in here must be JSON-serialisable and must never contain secrets.
 */

/* ------------------------------------------------------------------ */
/* Providers                                                           */
/* ------------------------------------------------------------------ */

export type ProviderKind =
  | "openai-compatible"
  | "openai"
  | "anthropic"
  | "google"
  | "azure-openai"
  | "groq"
  | "mistral"
  | "cohere"
  | "openrouter";

export interface ProviderPreset {
  kind: ProviderKind;
  label: string;
  /** Default Base URL pre-filled in the add-provider form. */
  defaultBaseUrl: string;
  /** Model-listing endpoint path, appended to the base URL. */
  modelsPath: string;
  /** Chat-completions endpoint path, appended to the base URL. */
  chatPath: string;
  /** Auth scheme used for the API key header. */
  authScheme: "bearer" | "x-api-key" | "api-key";
  authHeader: string;
  /** Extra headers the adapter always sends. */
  fixedHeaders?: Record<string, string>;
  /** Whether this provider exposes a usable /models listing endpoint. */
  supportsListing: boolean;
  /** Whether the provider streams responses over SSE. */
  supportsStreaming: boolean;
  /** Whether the provider reports token usage. */
  reportsUsage: boolean;
  /** Short note surfaced in the UI. */
  notes?: string;
  docsUrl?: string;
}

/** A user-configured provider. `apiKey` is never returned to the client. */
export interface ProviderConfig {
  id: string;
  userId: string;
  kind: ProviderKind;
  displayName: string;
  baseUrl: string;
  /** Set by the user. Server-side only. */
  hasApiKey: boolean;
  /** Last 4 characters of the key, for a non-sensitive confirmation chip. */
  apiKeyHint: string | null;
  organizationId: string | null;
  /** 0 = disabled, 1 = active */
  status: number;
  connectionStatus: "unknown" | "ok" | "error";
  connectionError: string | null;
  lastConnectedAt: number | null;
  lastModelDiscoveryAt: number | null;
  modelCount: number | null;
  /** Raw provider error code when the last attempt failed, e.g. "unauthorized". */
  lastErrorCode: string | null;
  createdAt: number;
  updatedAt: number;
}

/** Body accepted by `POST /api/providers`. */
export interface CreateProviderInput {
  kind: ProviderKind;
  displayName: string;
  baseUrl: string;
  apiKey?: string;
  organizationId?: string | null;
}

/** Body accepted by `PATCH /api/providers/:id`. */
export interface UpdateProviderInput {
  displayName?: string;
  baseUrl?: string;
  apiKey?: string;
  organizationId?: string | null;
  status?: number;
}

/* ------------------------------------------------------------------ */
/* Models                                                              */
/* ------------------------------------------------------------------ */

export type Modality = "text" | "image" | "audio" | "video" | "file";

/**
 * Provenance of a model's metadata. The UI is required to distinguish
 * provider-reported facts from our own inference or a manual override.
 */
export type MetadataSource = "provider" | "inferred" | "manual" | "unavailable";

export interface ModelCapabilities {
  vision: MetadataSource;
  tools: MetadataSource;
  structuredOutput: MetadataSource;
  streaming: MetadataSource;
  inputModalities: Modality[];
  outputModalities: Modality[];
}

/** A model known to the system, as stored and returned to the client. */
export interface ModelRecord {
  id: string;
  providerId: string;
  modelId: string;
  displayName: string;
  description: string | null;
  /** null when the provider does not report it. */
  contextWindow: number | null;
  maxOutputTokens: number | null;
  capabilities: ModelCapabilities;
  /** Where the non-null fields above came from. */
  sources: {
    contextWindow: MetadataSource;
    maxOutputTokens: MetadataSource;
    description: MetadataSource;
    capabilities: MetadataSource;
  };
  /** Unix ms of the discovery that produced this row. */
  discoveredAt: number;
  /** True when the provider explicitly declares the value. */
  verified: boolean;
  createdAt: number;
  updatedAt: number;
}

/** Row shape returned by `GET /api/models`. */
export interface ModelWithProvider extends ModelRecord {
  provider: Pick<ProviderConfig, "id" | "displayName" | "kind" | "baseUrl" | "connectionStatus">;
  favourite: boolean;
  pinned: boolean;
}

/* ------------------------------------------------------------------ */
/* Conversations                                                       */
/* ------------------------------------------------------------------ */

export type MessageRole = "system" | "user" | "assistant";

export type RequestStatus =
  | "connecting"
  | "waiting"
  | "streaming"
  | "completed"
  | "cancelled"
  | "rate-limited"
  | "timed-out"
  | "failed";

/**
 * Performance metrics for a single assistant turn.
 *
 * Rules enforced by the spec:
 *  - `null` means "unknown", never "zero" and never a fabricated guess.
 *  - `estimated*` flags mark the values we computed ourselves rather than
 *    values the provider reported.
 */
export interface TurnMetrics {
  /** ms from request start to first content token. Monotonic, client-side. */
  ttftMs: number | null;
  /** ms from request start to first non-empty content. */
  firstResponseMs: number | null;
  /** ms from first token to completion/cancellation. */
  generationMs: number | null;
  /** ms from request start to completion/cancellation (end-to-end). */
  totalMs: number | null;
  /** Output tokens, provider-reported when available. */
  outputTokens: number | null;
  /** Input tokens, provider-reported when available. */
  inputTokens: number | null;
  /** True when `outputTokens` came from a local tokenizer estimate. */
  outputTokensEstimated: boolean;
  inputTokensEstimated: boolean;
  /** outputTokens / (generationMs / 1000). Null unless both are known. */
  tokensPerSecond: number | null;
  tokensPerSecondEstimated: boolean;
  /** Documented context window for the model, when known. */
  contextWindow: number | null;
  /** Wall-clock timestamps (Date.now()) for debugging. */
  startedAt: number;
  endedAt: number | null;
}

export interface AttachmentMeta {
  id: string;
  name: string;
  size: number;
  type: string;
}

export interface ChatMessage {
  id: string;
  conversationId: string;
  role: MessageRole;
  content: string;
  /** Present on assistant messages. */
  providerId: string | null;
  modelId: string | null;
  modelLabel: string | null;
  status: RequestStatus | null;
  metrics: TurnMetrics | null;
  error: ApiErrorPayload | null;
  /** Set when the user edited and re-ran a prompt; links to the original. */
  parentMessageId: string | null;
  createdAt: number;
  /** Comparator used when several panes answer the same prompt. */
  paneIndex: number | null;
}

export interface Conversation {
  id: string;
  userId: string;
  title: string;
  folderId: string | null;
  pinned: boolean;
  favourite: boolean;
  /** Comparison mode: 1 normal chat, 2-4 panes. */
  paneCount: 1 | 2 | 3 | 4;
  /** Per-pane provider/model selection. */
  paneModels: Array<{ providerId: string; modelId: string } | null>;
  createdAt: number;
  updatedAt: number;
}

export interface Folder {
  id: string;
  userId: string;
  name: string;
  parentId: string | null;
  createdAt: number;
}

/* ------------------------------------------------------------------ */
/* API errors                                                          */
/* ------------------------------------------------------------------ */

export type FailureCode =
  | "invalid-api-key"
  | "unauthorized"
  | "forbidden"
  | "model-not-found"
  | "rate-limited"
  | "quota-exhausted"
  | "timeout"
  | "aborted"
  | "network-error"
  | "bad-gateway"
  | "server-error"
  | "bad-response"
  | "redirect-blocked"
  | "too-large"
  | "truncated-stream"
  | "unknown";

export type ApiErrorCode =
  | FailureCode
  | "not-found"
  | "bad-request"
  | "conflict"
  | "payload-too-large"
  | "internal";

export interface ApiErrorPayload {
  code: FailureCode;
  message: string;
  /**
   * Provider-visible detail, already redacted. Never contains an API key,
   * an Authorization header or a full response body.
   */
  detail?: string;
  /** HTTP status the upstream provider returned, when relevant. */
  upstreamStatus?: number | null;
  retryable?: boolean;
  retryAfterSeconds?: number;
}

/* ------------------------------------------------------------------ */
/* Streaming protocol                                                  */
/* ------------------------------------------------------------------ */

export type StreamEvent =
  | { type: "start"; requestId: string; model: string; providerId: string; at: number }
  | { type: "delta"; text: string }
  | {
      type: "usage";
      inputTokens: number | null;
      outputTokens: number | null;
      estimated: boolean;
    }
  | { type: "context"; contextWindow: number | null; source: MetadataSource }
  | {
      type: "done";
      finishReason: string | null;
      metrics: Omit<TurnMetrics, "startedAt" | "endedAt">;
    }
  | { type: "error"; error: ApiErrorPayload };

/**
 * Metrics the client holds for one pane.
 *
 * This is the shape the server reports minus the server-only wall-clock
 * timestamps, so the two sides share a single definition rather than two that
 * can drift apart.
 */
export type PaneMetrics = Omit<TurnMetrics, "startedAt" | "endedAt">;

/** `POST /api/chat` request body. */
export interface ChatRequestBody {
  providerId: string;
  modelId: string;
  messages: Array<{ role: MessageRole; content: string }>;
  /** Client-generated id used for cancellation and dedupe. */
  requestId: string;
  temperature?: number;
  maxTokens?: number | null;
  stream?: boolean;
  /** Abort this run after this many ms. Server enforces its own cap too. */
  timeoutMs?: number;
  /** When true the response is persisted as an assistant turn. */
  conversationId?: string | null;
  /** Human label shown in the UI. */
  modelLabel?: string;
}

/* ------------------------------------------------------------------ */
/* User & auth                                                         */
/* ------------------------------------------------------------------ */

export interface UserProfile {
  id: string;
  email: string | null;
  name: string | null;
  avatarUrl: string | null;
  createdAt: number;
}
