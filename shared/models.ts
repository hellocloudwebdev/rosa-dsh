import type {
  MetadataSource,
  ModelCapabilities,
  ModelRecord,
  Modality,
  ProviderKind,
} from "./types.js";

const UNAVAILABLE: MetadataSource = "unavailable";

/**
 * Normalise a provider-specific model-listing payload into ModelRecords.
 *
 * Every adapter produces raw candidates; this module decides what we may
 * claim. The rule is: nothing is asserted unless the provider said it.
 */
export interface RawModel {
  /** Provider's own id string. */
  id: string;
  /** Human label if the provider gives one distinct from the id. */
  displayName?: string | null;
  description?: string | null;
  contextWindow?: number | null;
  maxOutputTokens?: number | null;
  ownedBy?: string | null;
  /** Provider-declared modality / capability flags. */
  modalities?: Modality[] | null;
  inputModalities?: Modality[] | null;
  outputModalities?: Modality[] | null;
  vision?: boolean | null;
  tools?: boolean | null;
  structuredOutput?: boolean | null;
  streaming?: boolean | null;
}

function toPositiveInt(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return Math.floor(value);
  }
  if (typeof value === "string" && /^\d+$/.test(value.trim())) {
    const n = Number.parseInt(value.trim(), 10);
    return n > 0 ? n : null;
  }
  return null;
}

/** Known-vague labels that are not really descriptions. */
const MEANINGLESS = new Set([
  "",
  "-",
  "n/a",
  "na",
  "none",
  "null",
  "undefined",
  "unknown",
  "a language model",
  "openai language model",
]);

function cleanText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const t = value.trim();
  if (t.length === 0 || MEANINGLESS.has(t.toLowerCase())) return null;
  return t.slice(0, 500);
}

/**
 * Some OpenAI-compatible gateways report a single `context_length` while
 * others report an object. We only accept the documented shapes.
 */
export function extractContextWindow(raw: Record<string, unknown>): number | null {
  const direct = toPositiveInt(raw.context_window ?? raw.context_length);
  if (direct) return direct;

  const nested = raw.context_window ?? raw.context_length;
  if (nested && typeof nested === "object" && !Array.isArray(nested)) {
    const obj = nested as Record<string, unknown>;
    const maxIn = toPositiveInt(obj.max_input_tokens ?? obj.max_input);
    const maxTotal = toPositiveInt(obj.max_tokens ?? obj.total_tokens);
    return maxTotal ?? maxIn ?? null;
  }
  return null;
}

export function extractModalities(raw: Record<string, unknown>): {
  input: Modality[] | null;
  output: Modality[] | null;
} {
  const arch = raw.architecture;
  let input: Modality[] | null = null;
  let output: Modality[] | null = null;
  if (arch && typeof arch === "object" && !Array.isArray(arch)) {
    const a = arch as Record<string, unknown>;
    const norm = (v: unknown): Modality[] | null => {
      if (!Array.isArray(v)) return null;
      const valid: Modality[] = ["text", "image", "audio", "video", "file"];
      const out = v.filter(
        (x): x is Modality => typeof x === "string" && (valid as string[]).includes(x),
      );
      return out.length > 0 ? out : null;
    };
    input = norm(a.input_modalities);
    output = norm(a.output_modalities);
  }

  if (!input && Array.isArray(raw.input_modalities)) {
    const valid: Modality[] = ["text", "image", "audio", "video", "file"];
    const out = (raw.input_modalities as unknown[]).filter(
      (x): x is Modality => typeof x === "string" && (valid as string[]).includes(x),
    );
    input = out.length > 0 ? out : null;
  }

  if (!input && raw.vision === true) input = ["text", "image"];
  if (!input) input = ["text"]; // every chat model we list accepts text
  if (!output) output = ["text"];
  return { input, output };
}

function boolToSource(value: unknown): MetadataSource {
  if (typeof value === "boolean") return "provider";
  return UNAVAILABLE;
}

export function normaliseModel(
  raw: RawModel,
  providerId: string,
  providerKind: ProviderKind,
  now: number,
): ModelRecord | null {
  const modelId = typeof raw.id === "string" ? raw.id.trim() : "";
  if (!modelId) return null;

  const flattened = raw as unknown as Record<string, unknown>;
  const contextWindow =
    toPositiveInt(raw.contextWindow) ?? extractContextWindow(flattened);
  const maxOutput = toPositiveInt(raw.maxOutputTokens);
  const description = cleanText(raw.description);

  // Adapters may express modalities either as camelCase fields on RawModel or
  // as raw provider keys (`architecture.input_modalities`, `input_modalities`).
  // Feed both shapes to the extractor so normalisation is consistent.
  const modalityInput: Record<string, unknown> = { ...flattened };
  if (raw.inputModalities && !modalityInput.input_modalities) {
    modalityInput.input_modalities = raw.inputModalities;
  }
  if (raw.outputModalities && !modalityInput.output_modalities) {
    modalityInput.output_modalities = raw.outputModalities;
  }
  const { input, output } = extractModalities(modalityInput);
  // extractModalities guarantees at least ["text"].
  const inputModalities: Modality[] = input ?? ["text"];
  const outputModalities: Modality[] = output ?? ["text"];

  const capabilities: ModelCapabilities = {
    vision:
      raw.vision !== undefined && raw.vision !== null
        ? boolToSource(raw.vision)
        : inputModalities.includes("image")
          ? "provider"
          : UNAVAILABLE,
    tools: boolToSource(raw.tools),
    structuredOutput: boolToSource(raw.structuredOutput),
    streaming:
      raw.streaming !== undefined && raw.streaming !== null
        ? boolToSource(raw.streaming)
        : providerKind === "openai-compatible" || providerKind === "openai"
          ? "inferred"
          : UNAVAILABLE,
    inputModalities,
    outputModalities,
  };

  const anyCapabilityDeclared =
    capabilities.vision !== UNAVAILABLE ||
    capabilities.tools !== UNAVAILABLE ||
    capabilities.structuredOutput !== UNAVAILABLE;

  return {
    id: `${providerId}:${modelId}`,
    providerId,
    modelId,
    displayName: cleanText(raw.displayName) ?? modelId,
    description: description ?? null,
    contextWindow,
    maxOutputTokens: maxOutput,
    capabilities,
    sources: {
      contextWindow: contextWindow !== null ? "provider" : UNAVAILABLE,
      maxOutputTokens: maxOutput !== null ? "provider" : UNAVAILABLE,
      description: description !== null ? "provider" : UNAVAILABLE,
      capabilities: anyCapabilityDeclared || inputModalities.length > 1 ? "provider" : UNAVAILABLE,
    },
    discoveredAt: now,
    verified: contextWindow !== null,
    createdAt: now,
    updatedAt: now,
  };
}

/** Infer a model label for the UI without claiming any facts. */
export function modelLabel(model: Pick<ModelRecord, "displayName" | "modelId">): string {
  return model.displayName || model.modelId;
}
