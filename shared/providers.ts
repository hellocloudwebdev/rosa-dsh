import type { ApiErrorPayload, FailureCode, ProviderPreset, ProviderKind } from "./types.js";

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
  "neon-ai-gateway": {
    kind: "neon-ai-gateway",
    label: "Neon AI Gateway",
    defaultBaseUrl: "https://br-autumn-heart-aoorilq7-api.ai.c-2.ap-southeast-1.aws.neon.tech/v1",
    modelsPath: "/models",
    chatPath: "/chat/completions",
    authScheme: "bearer",
    authHeader: "authorization",
    supportsListing: true,
    supportsStreaming: true,
    reportsUsage: true,
    notes: "One API for frontier and open-source models powered by Databricks on Neon.",
    docsUrl: "https://neon.com/docs/ai-gateway/overview",
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

/**
 * Classify an HTTP status from an upstream provider into the normalized failure taxonomy.
 */
export function classifyHttpStatus(
  status: number,
  retryAfterHeader?: string | null,
): {
  code: FailureCode;
  message: string;
  retryable: boolean;
  retryAfterSeconds?: number;
} {
  const retryAfter = retryAfterHeader ? Number(retryAfterHeader) : undefined;

  switch (status) {
    case 401:
      return {
        code: "invalid-api-key",
        message: "The provider rejected the API key (401). Check the key, its permissions and its expiry.",
        retryable: false,
      };
    case 403:
      return {
        code: "forbidden",
        message:
          "The provider refused the request (403). The key may lack access to this model, or your account may be restricted.",
        retryable: false,
      };
    case 404:
      return {
        code: "model-not-found",
        message: "The provider has no resource at that URL (404). Check the Base URL and the selected model id.",
        retryable: false,
      };
    case 408:
      return {
        code: "timeout",
        message: "The provider timed out before responding (408).",
        retryable: true,
      };
    case 413:
      return {
        code: "too-large",
        message: "The provider rejected the request as too large (413). Shorten the conversation or reduce max tokens.",
        retryable: false,
      };
    case 422:
      return {
        code: "bad-response",
        message: "The provider rejected the request body (422). The model may not support a parameter that was sent.",
        retryable: false,
      };
    case 429: {
      const seconds = Number.isFinite(retryAfter) && (retryAfter as number) > 0 ? Number(retryAfter) : undefined;
      const wait = seconds ? ` Try again in ${seconds}s.` : "";
      return {
        code: "rate-limited",
        message: `The provider is rate limiting this key (429).${wait}`,
        retryable: true,
        retryAfterSeconds: seconds,
      };
    }
    case 402:
      return {
        code: "quota-exhausted",
        message: "The provider reports exhausted credit or billing problems (402).",
        retryable: false,
      };
    default:
      if (status >= 500) {
        return {
          code: status === 502 || status === 503 || status === 504 ? "bad-gateway" : "server-error",
          message: `The provider returned a server error (${status}). This is usually temporary.`,
          retryable: true,
        };
      }
      return {
        code: "unknown",
        message: `The provider returned an unexpected status (${status}).`,
        retryable: false,
      };
  }
}

/** Build a normalised ApiErrorPayload from an upstream HTTP failure. */
export function upstreamError(args: {
  status: number;
  providerLabel: string;
  bodyText: string;
  modelId?: string;
  retryAfterHeader?: string | null;
}): ApiErrorPayload {
  const { status, providerLabel, bodyText, modelId, retryAfterHeader } = args;
  const clipped = redactSecrets(bodyText).slice(0, 600);
  const where = modelId ? `${providerLabel} · ${modelId}` : providerLabel;

  const failure = classifyHttpStatus(status, retryAfterHeader);

  return {
    code: failure.code,
    message: `${where}: ${failure.message}`,
    detail: clipped || undefined,
    upstreamStatus: status,
    retryable: failure.retryable,
    retryAfterSeconds: failure.retryAfterSeconds,
  };
}

/** Map a transport-level failure (DNS, TLS, reset, abort) to a payload. */
export function transportError(err: unknown, providerLabel: string): ApiErrorPayload {
  const msg = err instanceof Error ? err.message : String(err);
  const timedOut = /timed?\s?out|deadline/i.test(msg);
  const isAborted = /abort/i.test(msg);
  let code: FailureCode = "network-error";
  if (timedOut) code = "timeout";
  else if (isAborted) code = "aborted";

  return {
    code,
    message: timedOut
      ? `${providerLabel} did not respond before the timeout.`
      : isAborted
        ? `${providerLabel} request was aborted.`
        : `Could not reach ${providerLabel}.`,
    detail: redactSecrets(msg).slice(0, 600) || undefined,
    retryable: true,
  };
}
