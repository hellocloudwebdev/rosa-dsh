import type { ApiErrorPayload, ProviderPreset, ProviderKind } from "./types.js";

/**
 * Presets for the providers we ship adapters for.
 *
 * Notes on honesty: `supportsListing` is only true when the provider is
 * documented to expose a model-listing endpoint. Where we cannot verify a
 * field we leave it null in the model record instead of guessing.
 */
export const PROVIDER_PRESETS: Record<ProviderKind, ProviderPreset> = {
  openai: {
    kind: "openai",
    label: "OpenAI",
    defaultBaseUrl: "https://api.openai.com/v1",
    modelsPath: "/models",
    chatPath: "/chat/completions",
    authScheme: "bearer",
    authHeader: "authorization",
    supportsListing: true,
    supportsStreaming: true,
    reportsUsage: true,
    docsUrl: "https://platform.openai.com/docs/api-reference",
  },
  "openai-compatible": {
    kind: "openai-compatible",
    label: "Custom OpenAI-compatible",
    defaultBaseUrl: "",
    modelsPath: "/models",
    chatPath: "/chat/completions",
    authScheme: "bearer",
    authHeader: "authorization",
    supportsListing: true,
    supportsStreaming: true,
    reportsUsage: true,
    notes:
      "Any gateway that implements /chat/completions (vLLM, Ollama, LM Studio, LiteLLM, Together, Fireworks, DeepSeek, xAI, OpenRouter…).",
  },
  anthropic: {
    kind: "anthropic",
    label: "Anthropic",
    defaultBaseUrl: "https://api.anthropic.com/v1",
    modelsPath: "/models",
    chatPath: "/messages",
    authScheme: "x-api-key",
    authHeader: "x-api-key",
    fixedHeaders: { "anthropic-version": "2023-06-01" },
    supportsListing: true,
    supportsStreaming: true,
    reportsUsage: true,
    notes:
      "Anthropic's Messages API has a different request/response and SSE shape from OpenAI chat-completions, so it uses a dedicated adapter.",
    docsUrl: "https://docs.anthropic.com/en/api/messages",
  },
  google: {
    kind: "google",
    label: "Google Gemini",
    defaultBaseUrl: "https://generativelanguage.googleapis.com/v1beta",
    modelsPath: "/models",
    chatPath: "/models",
    authScheme: "api-key",
    authHeader: "x-goog-api-key",
    supportsListing: true,
    supportsStreaming: true,
    reportsUsage: true,
    notes:
      "Gemini's generateContent and streamGenerateContent differ from chat-completions, so it uses a dedicated adapter.",
    docsUrl: "https://ai.google.dev/api",
  },
  "azure-openai": {
    kind: "azure-openai",
    label: "Azure OpenAI",
    defaultBaseUrl: "https://{resource}.openai.azure.com/openai/deployments/{deployment}",
    modelsPath: "",
    chatPath: "/chat/completions",
    authScheme: "api-key",
    authHeader: "api-key",
    fixedHeaders: { "content-type": "application/json" },
    supportsListing: false,
    supportsStreaming: true,
    reportsUsage: true,
    notes:
      "Azure scopes deployment URLs per resource and does not expose a generic model-listing endpoint, so discovery is unavailable and you enter the deployment name manually.",
  },
  groq: {
    kind: "groq",
    label: "Groq",
    defaultBaseUrl: "https://api.groq.com/openai/v1",
    modelsPath: "/models",
    chatPath: "/chat/completions",
    authScheme: "bearer",
    authHeader: "authorization",
    supportsListing: true,
    supportsStreaming: true,
    reportsUsage: true,
  },
  mistral: {
    kind: "mistral",
    label: "Mistral",
    defaultBaseUrl: "https://api.mistral.ai/v1",
    modelsPath: "/models",
    chatPath: "/chat/completions",
    authScheme: "bearer",
    authHeader: "authorization",
    supportsListing: true,
    supportsStreaming: true,
    reportsUsage: true,
  },
  cohere: {
    kind: "cohere",
    label: "Cohere",
    defaultBaseUrl: "https://api.cohere.ai/compatibility",
    modelsPath: "/models",
    chatPath: "/chat/completions",
    authScheme: "bearer",
    authHeader: "authorization",
    supportsListing: true,
    supportsStreaming: true,
    reportsUsage: true,
    notes: "Uses Cohere's OpenAI-compatibility layer.",
  },
  openrouter: {
    kind: "openrouter",
    label: "OpenRouter",
    defaultBaseUrl: "https://openrouter.ai/api/v1",
    modelsPath: "/models",
    chatPath: "/chat/completions",
    authScheme: "bearer",
    authHeader: "authorization",
    supportsListing: true,
    supportsStreaming: true,
    reportsUsage: true,
    notes:
      "OpenRouter exposes rich per-model metadata (context length, pricing, modality). Only provider-reported fields are surfaced.",
  },
};

export const PRESET_LIST: ProviderPreset[] = Object.values(PROVIDER_PRESETS);

export function presetFor(kind: ProviderKind): ProviderPreset {
  return PROVIDER_PRESETS[kind];
}

/** Sensitive substrings that must never be echoed back to a client. */
const SECRET_PATTERNS: RegExp[] = [
  /\b(sk|pk|rk)-[A-Za-z0-9_-]{8,}\b/g,
  /\bBearer\s+[A-Za-z0-9._-]+/gi,
  /\bgh[pousr]_[A-Za-z0-9]{16,}\b/g,
  /\bAIza[0-9A-Za-z_-]{20,}\b/g,
  /\bxox[baprs]-[0-9A-Za-z-]{10,}\b/g,
  /\bAKIA[0-9A-Z]{16}\b/g,
  /\b[a-zA-Z0-9]{40,}\b/g,
];

/**
 * Redact anything that looks like a credential from arbitrary text so an error
 * message can be safely returned to the browser or written to a log.
 *
 * `knownSecrets` should carry the exact credential values in play for this
 * request. Pattern matching alone is a heuristic — a provider that echoes back a
 * short key, or one in an unusual format, would slip past `SECRET_PATTERNS`. A
 * literal replacement has no such gap, so both are applied.
 */
export function redactSecrets(input: string, knownSecrets: readonly string[] = []): string {
  let out = input;
  for (const secret of knownSecrets) {
    // Short values would match ordinary prose; a real credential is never this
    // small, so the guard avoids mangling a legitimate error message.
    if (secret.length < 6) continue;
    out = out.split(secret).join("[redacted]");
  }
  for (const re of SECRET_PATTERNS) out = out.replace(re, "[redacted]");
  return out;
}

/** Build a normalised ApiErrorPayload from an upstream HTTP failure. */
export function upstreamError(args: {
  status: number;
  providerLabel: string;
  bodyText: string;
  modelId?: string;
}): ApiErrorPayload {
  const { status, providerLabel, bodyText, modelId } = args;
  const clipped = redactSecrets(bodyText).slice(0, 600);
  const where = modelId ? `${providerLabel} · ${modelId}` : providerLabel;

  let code: ApiErrorPayload["code"] = "upstream-error";
  if (status === 401 || status === 403) code = "unauthorized";
  else if (status === 404) code = "not-found";
  else if (status === 429) code = "rate-limited";
  else if (status === 408) code = "upstream-timeout";
  else if (status === 413) code = "payload-too-large";
  else if (status >= 500) code = "upstream-unavailable";

  const hint =
    status === 401 || status === 403
      ? "Check the API key and that it has access to this model."
      : status === 404
        ? "The path or model id was not found. Verify the Base URL and model id."
        : status === 429
          ? "The provider rate-limited this request. Wait and retry."
          : status >= 500
            ? "The provider is having trouble. Retry, or try another model."
            : undefined;

  return {
    code,
    message: `${where} returned HTTP ${status}.${hint ? ` ${hint}` : ""}`,
    detail: clipped || undefined,
    upstreamStatus: status,
    retryable: status === 408 || status === 429 || status >= 500,
  };
}

/** Map a transport-level failure (DNS, TLS, reset, abort) to a payload. */
export function transportError(err: unknown, providerLabel: string): ApiErrorPayload {
  const msg = err instanceof Error ? err.message : String(err);
  const timedOut = /timed?\s?out|aborted|deadline/i.test(msg);
  return {
    code: timedOut ? "upstream-timeout" : "upstream-unavailable",
    message: timedOut
      ? `${providerLabel} did not respond before the timeout.`
      : `Could not reach ${providerLabel}.`,
    detail: redactSecrets(msg).slice(0, 600) || undefined,
    retryable: true,
  };
}
