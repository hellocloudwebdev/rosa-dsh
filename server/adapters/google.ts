import type { StreamEvent } from "../../shared/types.js";
import type { RawModel } from "../../shared/models.js";
import { BaseAdapter, type AdapterContext, type ChatOptions } from "./base.js";

/**
 * Google Gemini adapter.
 *
 * Differences that require dedicated handling:
 *  - auth is `x-goog-api-key`
 *  - the chat endpoint is per-model: /models/{model}:streamGenerateContent
 *  - request wraps turns in `contents[].parts[]` with a `role` of
 *    "user"/"model" (Anthropic also uses "model"; Gemini does not accept
 *    "assistant")
 *  - SSE payloads are a flat object per chunk with `candidates[]`, and a
 *    synthetic `[DONE]`-like terminator is not used — the stream simply ends
 *  - usage arrives as `usageMetadata` on any chunk
 */
export class GoogleAdapter extends BaseAdapter {
  readonly kind = "google" as const;
  protected listPath = "/models";

  protected chatUrl(ctx: AdapterContext, modelId: string): string {
    const base = ctx.baseUrl.replace(/\/+$/, "");
    return `${base}/models/${encodeURIComponent(modelId)}:streamGenerateContent?alt=sse`;
  }

  protected chatHeaders(ctx: AdapterContext): Record<string, string> {
    return { "x-goog-api-key": ctx.apiKey };
  }

  protected buildBody(_ctx: AdapterContext, opts: ChatOptions): Record<string, unknown> {
    const systemText = opts.messages
      .filter((m) => m.role === "system")
      .map((m) => m.content)
      .join("\n\n");

    const contents = opts.messages
      .filter((m) => m.role !== "system")
      .map((m) => ({
        role: m.role === "assistant" ? "model" : "user",
        parts: [{ text: m.content }],
      }));

    const body: Record<string, unknown> = {
      contents: contents.length > 0 ? contents : [{ role: "user", parts: [{ text: " " }] }],
      generationConfig: {},
    };
    if (systemText) {
      body.systemInstruction = { parts: [{ text: systemText }] };
    }
    const gen = body.generationConfig as Record<string, unknown>;
    if (typeof opts.temperature === "number") gen.temperature = opts.temperature;
    if (typeof opts.maxTokens === "number" && opts.maxTokens > 0) {
      gen.maxOutputTokens = Math.floor(opts.maxTokens);
    }
    return body;
  }

  parseModelList(payload: unknown): { models: RawModel[]; fromListing: boolean } {
    const data = (payload as { models?: unknown[] })?.models;
    if (!Array.isArray(data)) return { models: [], fromListing: true };

    const models: RawModel[] = [];
    for (const entry of data) {
      if (!entry || typeof entry !== "object") continue;
      const m = entry as Record<string, unknown>;
      // Gemini returns names like "models/gemini-1.5-pro".
      let id: string | null = null;
      if (typeof m.name === "string") id = m.name.replace(/^models\//, "");
      else if (typeof m.id === "string") id = m.id;
      if (!id) continue;

      const supported = Array.isArray(m.supportedGenerationMethods)
        ? (m.supportedGenerationMethods as unknown[]).filter(
            (x): x is string => typeof x === "string",
          )
        : [];

      const ctxWindow =
        typeof m.inputTokenLimit === "number"
          ? m.inputTokenLimit
          : typeof m.contextWindow === "number"
            ? m.contextWindow
            : null;

      const maxOut =
        typeof m.outputTokenLimit === "number" ? m.outputTokenLimit : null;

      models.push({
        id,
        displayName: typeof m.displayName === "string" && m.displayName.length > 0 ? m.displayName : id,
        description: typeof m.description === "string" ? m.description : null,
        contextWindow: ctxWindow,
        maxOutputTokens: maxOut,
        streaming: supported.some((s) => s.includes("streamGenerateContent")),
        vision: null,
        tools: null,
      });
    }
    return { models, fromListing: true };
  }

  protected handleSSE(data: string, emit: (e: StreamEvent) => void): void {
    let json: {
      candidates?: Array<{
        content?: { parts?: Array<{ text?: string; functionCall?: unknown }> };
        finishReason?: string;
      }>;
      usageMetadata?: {
        promptTokenCount?: number;
        candidatesTokenCount?: number;
        totalTokenCount?: number;
      };
      error?: { code?: number; message?: string; status?: string };
    };
    try {
      json = JSON.parse(data);
    } catch {
      return;
    }

    if (json.error) {
      emit({
        type: "error",
        error: {
          code: "upstream-error",
          message: json.error.message ?? "Gemini reported an error.",
          detail: json.error.status,
          upstreamStatus: json.error.code ?? null,
          retryable: json.error.code === 429 || (json.error.code ?? 0) >= 500,
        },
      });
      return;
    }

    const parts = json.candidates?.[0]?.content?.parts ?? [];
    for (const part of parts) {
      if (typeof part?.text === "string" && part.text.length > 0) {
        emit({ type: "delta", text: part.text });
      }
    }

    if (json.usageMetadata) {
      const input = json.usageMetadata.promptTokenCount;
      const output = json.usageMetadata.candidatesTokenCount;
      if (typeof input === "number" || typeof output === "number") {
        emit({
          type: "usage",
          inputTokens: typeof input === "number" ? input : null,
          outputTokens: typeof output === "number" ? output : null,
          estimated: false,
        });
      }
    }
  }

  protected parseCompletion(json: Record<string, unknown>): {
    text: string;
    usage?: { inputTokens: number | null; outputTokens: number | null };
  } {
    const candidates = json.candidates as
      | Array<{ content?: { parts?: Array<{ text?: string }> } }>
      | undefined;
    const text = (candidates?.[0]?.content?.parts ?? [])
      .filter((p) => typeof p?.text === "string")
      .map((p) => p.text as string)
      .join("");
    const usage = json.usageMetadata as
      | { promptTokenCount?: number; candidatesTokenCount?: number }
      | undefined;
    return {
      text,
      usage: usage
        ? {
            inputTokens:
              typeof usage.promptTokenCount === "number" ? usage.promptTokenCount : null,
            outputTokens:
              typeof usage.candidatesTokenCount === "number"
                ? usage.candidatesTokenCount
                : null,
          }
        : undefined,
    };
  }
}
