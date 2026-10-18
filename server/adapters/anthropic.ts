import type { ModelRecord, StreamEvent } from "../../shared/types.js";
import type { RawModel } from "../../shared/models.js";
import { BaseAdapter, type AdapterContext, type ChatOptions } from "./base.js";

/**
 * Anthropic Messages API adapter.
 *
 * Differences from OpenAI that require dedicated handling:
 *  - auth header is `x-api-key` plus a mandatory `anthropic-version`
 *  - request uses `system` at the top level, not as a message
 *  - `max_tokens` is required, not optional
 *  - SSE event names are typed (`content_block_delta`, `message_delta`…)
 *  - token usage arrives in `message_start` / `message_delta`, not per chunk
 */
export class AnthropicAdapter extends BaseAdapter {
  readonly kind = "anthropic" as const;
  protected listPath = "/models";

  protected chatUrl(ctx: AdapterContext): string {
    return `${ctx.baseUrl.replace(/\/+$/, "")}/messages`;
  }

  protected chatHeaders(ctx: AdapterContext): Record<string, string> {
    const headers: Record<string, string> = {
      "x-api-key": ctx.apiKey,
      "anthropic-version": "2023-06-01",
    };
    if (ctx.organizationId) headers["anthropic-organization"] = ctx.organizationId;
    return headers;
  }

  protected buildBody(_ctx: AdapterContext, opts: ChatOptions): Record<string, unknown> {
    const system = opts.messages
      .filter((m) => m.role === "system")
      .map((m) => m.content)
      .join("\n\n");    const turns = opts.messages
      .filter((m) => m.role !== "system")
      .map((m) => ({ role: m.role, content: m.content }));

    // Anthropic requires a non-empty turn list and a max_tokens value.
    return {
      model: opts.modelId,
      system: system.length > 0 ? system : undefined,
      messages: turns.length > 0 ? turns : [{ role: "user", content: " " }],
      stream: opts.stream,
      max_tokens:
        typeof opts.maxTokens === "number" && opts.maxTokens > 0
          ? Math.floor(opts.maxTokens)
          : 4096,
      ...(typeof opts.temperature === "number" ? { temperature: opts.temperature } : {}),
    };
  }

  listModelsHeaders(ctx: AdapterContext): Record<string, string> {
    return {
      "x-api-key": ctx.apiKey,
      "anthropic-version": "2023-06-01",
      accept: "application/json",
    };
  }

  parseModelList(payload: unknown): { models: RawModel[]; fromListing: boolean } {
    const data = (payload as { data?: unknown[] })?.data;
    if (!Array.isArray(data)) return { models: [], fromListing: true };

    const models: RawModel[] = [];
    for (const entry of data) {
      if (!entry || typeof entry !== "object") continue;
      const m = entry as Record<string, unknown>;
      const id = typeof m.id === "string" ? m.id : null;
      if (!id) continue;
      models.push({
        id,
        displayName: typeof m.display_name === "string" && m.display_name.length > 0 ? m.display_name : id,
        description: null,
        contextWindow: null, // Anthropic does not report a context window in /models
        maxOutputTokens: null,
        vision: null,
        tools: null,
        streaming: true,
      });
    }
    return { models, fromListing: true };
  }

  protected handleSSE(
    data: string,
    emit: (e: StreamEvent) => void,
  ): { finishReason?: string | null } | void {
    // We are handed the concatenated data lines. The `event:` name is not
    // forwarded by the base parser, so we dispatch on the payload's `type`.
    let json: {
      type?: string;
      delta?: { type?: string; text?: string; partial_json?: string; stop_reason?: string };
      message?: {
        usage?: { input_tokens?: number; output_tokens?: number };
        model?: string;
        stop_reason?: string;
      };
      usage?: { output_tokens?: number; input_tokens?: number };
      error?: { type?: string; message?: string };
      context_window?: number;
    };
    try {
      json = JSON.parse(data);
    } catch {
      return;
    }

    if (json.type === "error" || json.error) {
      emit({
        type: "error",
        error: {
          code: "bad-response",
          message: json.error?.message ?? "Anthropic reported a streaming error.",
          detail: json.error?.type,
          retryable: json.error?.type === "overloaded_error",
        },
      });
      return;
    }

    if (json.type === "content_block_delta") {
      const text = json.delta?.text;
      if (typeof text === "string" && text.length > 0) emit({ type: "delta", text });
      return;
    }

    if (json.type === "message_start") {
      const usage = json.message?.usage;
      emit({
        type: "usage",
        inputTokens: typeof usage?.input_tokens === "number" ? usage.input_tokens : null,
        outputTokens: typeof usage?.output_tokens === "number" ? usage.output_tokens : null,
        estimated: false,
      });
      return;
    }

    if (json.type === "message_delta") {
      const out = json.usage?.output_tokens;
      if (typeof out === "number") {
        emit({ type: "usage", inputTokens: null, outputTokens: out, estimated: false });
      }
      if (json.delta?.stop_reason) {
        return { finishReason: json.delta.stop_reason };
      }
      return;
    }

    if (json.type === "message_stop") {
      return { finishReason: "stop" };
    }

    // context management / model metadata, when present.
    if (typeof json.context_window === "number") {
      emit({ type: "context", contextWindow: json.context_window, source: "provider" });
    }
  }

  protected parseCompletion(json: Record<string, unknown>): {
    text: string;
    usage?: { inputTokens: number | null; outputTokens: number | null };
  } {
    const content = json.content as Array<{ type?: string; text?: string }> | undefined;
    const text = (content ?? [])
      .filter((b) => b?.type === "text" && typeof b.text === "string")
      .map((b) => b.text as string)
      .join("");
    const usage = json.usage as
      | { input_tokens?: number; output_tokens?: number }
      | undefined;
    return {
      text,
      usage: usage
        ? {
            inputTokens: typeof usage.input_tokens === "number" ? usage.input_tokens : null,
            outputTokens:
              typeof usage.output_tokens === "number" ? usage.output_tokens : null,
          }
        : undefined,
    };
  }
}

/** Records are normalised identically; exposed for symmetry. */
export function anthropicRecords(records: ModelRecord[]): ModelRecord[] {
  return records;
}
