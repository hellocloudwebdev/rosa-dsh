import { describe, expect, it } from "vitest";
import {
  extractContextWindow,
  extractModalities,
  normaliseModel,
  type RawModel,
} from "../shared/models.js";

const PROVIDER = "prov-1";
const KIND = "openai-compatible";

function norm(raw: RawModel) {
  return normaliseModel(raw, PROVIDER, KIND, 1_700_000_000_000);
}

describe("normaliseModel — honest metadata", () => {
  it("keeps a provider-reported context window", () => {
    const m = norm({ id: "gpt-4o", contextWindow: 128000 });
    expect(m?.contextWindow).toBe(128000);
    expect(m?.sources.contextWindow).toBe("provider");
    expect(m?.verified).toBe(true);
  });

  it("marks an unknown context window as unavailable, never as a guess", () => {
    const m = norm({ id: "mystery-model" });
    expect(m?.contextWindow).toBeNull();
    expect(m?.sources.contextWindow).toBe("unavailable");
    expect(m?.verified).toBe(false);
  });

  it("does not invent a context window from a description", () => {
    const m = norm({
      id: "mystery-model",
      description: "A fast model with a 32k window",
    });
    expect(m?.contextWindow).toBeNull();
  });

  it("rejects zero and negative context windows", () => {
    expect(norm({ id: "a", contextWindow: 0 })?.contextWindow).toBeNull();
    expect(norm({ id: "b", contextWindow: -5 })?.contextWindow).toBeNull();
    expect(norm({ id: "c", contextWindow: Number.NaN })?.contextWindow).toBeNull();
  });

  it("accepts a numeric-string context window", () => {
    expect(norm({ id: "a", contextWindow: "200000" as unknown as number })?.contextWindow).toBe(200000);
  });

  it("drops a model with no id", () => {
    expect(norm({ id: "" })).toBeNull();
    expect(norm({ id: "   " })).toBeNull();
  });

  it("uses the display name when the provider gives one", () => {
    expect(norm({ id: "gpt-4o", displayName: "GPT-4o" })?.displayName).toBe("GPT-4o");
    expect(norm({ id: "gpt-4o" })?.displayName).toBe("gpt-4o");
  });

  it("discards meaningless descriptions", () => {
    for (const d of ["", "  ", "-", "N/A", "none", "unknown"]) {
      expect(norm({ id: "a", description: d })?.description).toBeNull();
    }
    expect(norm({ id: "a", description: "A helpful model." })?.description).toBe(
      "A helpful model.",
    );
  });

  it("reads capability flags as provider-reported only when boolean", () => {
    const m = norm({ id: "a", tools: true, vision: false });
    expect(m?.capabilities.tools).toBe("provider");
    expect(m?.capabilities.vision).toBe("provider");
  });

  it("leaves capabilities unavailable when the provider says nothing", () => {
    const m = norm({ id: "a" });
    expect(m?.capabilities.tools).toBe("unavailable");
    expect(m?.capabilities.structuredOutput).toBe("unavailable");
  });

  it("marks streaming as inferred, not provider-reported, for openai-compatible", () => {
    const m = norm({ id: "a" });
    expect(m?.capabilities.streaming).toBe("inferred");
    expect(m?.sources.capabilities).toBe("unavailable");
  });

  it("treats multimodal input as a provider declaration of vision", () => {
    const m = norm({
      id: "a",
      inputModalities: ["text", "image"],
    });
    // Input modalities are flattened onto the raw payload by the adapter, so
    // the vision flag is provider-reported rather than inferred.
    expect(m?.capabilities.vision).toBe("provider");
    expect(m?.capabilities.inputModalities).toEqual(["text", "image"]);
  });

  it("reads architectures nested under `architecture`", () => {
    const m = norm({
      id: "a",
      architecture: { input_modalities: ["text", "image"], output_modalities: ["text"] },
    } as unknown as RawModel);
    expect(m?.capabilities.vision).toBe("provider");
    expect(m?.capabilities.inputModalities).toEqual(["text", "image"]);
  });

  it("defaults every chat model to text input and text output", () => {
    const m = norm({ id: "a" });
    expect(m?.capabilities.inputModalities).toEqual(["text"]);
    expect(m?.capabilities.outputModalities).toEqual(["text"]);
  });
});

describe("extractContextWindow", () => {
  it("reads the flat field", () => {
    expect(extractContextWindow({ context_window: 8192 })).toBe(8192);
  });

  it("reads the OpenRouter nested object", () => {
    expect(extractContextWindow({ context_window: { max_input_tokens: 128000 } })).toBe(128000);
  });

  it("prefers total over input in the nested object", () => {
    expect(
      extractContextWindow({ context_window: { max_input_tokens: 1000, max_tokens: 4096 } }),
    ).toBe(4096);
  });

  it("returns null when nothing usable is present", () => {
    expect(extractContextWindow({})).toBeNull();
    expect(extractContextWindow({ context_window: "big" })).toBeNull();
    expect(extractContextWindow({ context_window: null })).toBeNull();
  });
});

describe("extractModalities", () => {
  it("reads OpenRouter's architecture object", () => {
    const { input, output } = extractModalities({
      architecture: { input_modalities: ["text", "image"], output_modalities: ["text"] },
    });
    expect(input).toEqual(["text", "image"]);
    expect(output).toEqual(["text"]);
  });

  it("filters unknown modality names", () => {
    const { input } = extractModalities({
      architecture: { input_modalities: ["text", "smell", "image"] },
    });
    expect(input).toEqual(["text", "image"]);
  });

  it("infers image input from a vision flag", () => {
    const { input } = extractModalities({ vision: true });
    expect(input).toEqual(["text", "image"]);
  });

  it("always returns at least text", () => {
    expect(extractModalities({})).toEqual({ input: ["text"], output: ["text"] });
  });
});
