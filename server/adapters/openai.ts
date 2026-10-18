import type { StreamEvent } from "../../shared/types.js";
import type { RawModel } from "../../shared/models.js";
import { BaseAdapter, type AdapterContext, type ChatOptions } from "./base.js";

/**
 * OpenAI-compatible adapter: /chat/completions + /models + SSE deltas.
 *
 * This is also the adapter used for every third-party gateway that speaks the
 * OpenAI dialect (OpenRouter, Groq, vLLM, Ollama, LiteLLM, Together, xAI…).
 */
export class OpenAICompatibleAdapter extends BaseAdapter {
  readonly kind = "openai-compatible" as const;

  protected listPath = "/models";

  protected chatUrl(ctx: AdapterContext): string {
    return `${ctx.baseUrl.replace(/\/+$/, "")}/chat/completions`;
  }

  protected chatHeaders(ctx: AdapterContext): Record<string, string> {
    const headers: Record<string, string> = {
      authorization: `Bearer ${ctx.apiKey}`,
    };
    if (ctx.organizationId) headers["openai-organization"] = ctx.organizationId;
    return headers;
  }

  protected buildBody(ctx: AdapterContext, opts: ChatOptions): Record<string, unknown> {
    const body: Record<string, unknown> = {
      model: opts.modelId,
      messages: opts.messages.map((m) => ({ role: m.role, content: m.content })),
      stream: opts.stream,
    };
    if (opts.stream) body.stream_options = { include_usage: true };
    if (typeof opts.temperature === "number") body.temperature = opts.temperature;
    if (typeof opts.maxTokens === "number" && opts.maxTokens > 0) {
      body.max_tokens = opts.maxTokens;
    }
    if (ctx.settings?.model_suffix) {
      body.model = `${opts.modelId}${ctx.settings.model_suffix}`;
    }
    return body;
  }

  listModelsHeaders(ctx: AdapterContext): Record<string, string> {
    const headers: Record<string, string> = {
      authorization: `Bearer ${ctx.apiKey}`,
      accept: "application/json",
    };
    if (ctx.organizationId) headers["openai-organization"] = ctx.organizationId;
    return headers;
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

      const topProvider = m.top_provider as Record<string, unknown> | undefined;
      const arch = m.architecture as Record<string, unknown> | undefined;
      const supported = Array.isArray(m.supported_parameters)
        ? (m.supported_parameters as unknown[]).filter(
            (x): x is string => typeof x === "string",
          )
        : [];

      const ctxWindow =
        (typeof m.context_length === "number" ? m.context_length : null) ??
        (typeof topProvider?.context_length === "number" ? topProvider.context_length : null);

      const maxOut =
        (typeof topProvider?.max_completion_tokens === "number"
          ? topProvider.max_completion_tokens
          : null) ??
        (typeof m.max_output_tokens === "number" ? m.max_output_tokens : null);

      const modalities = Array.isArray(arch?.input_modalities)
        ? (arch.input_modalities as unknown[]).filter(
            (x): x is "text" | "image" | "audio" => typeof x === "string",
          )
        : null;

      models.push({
        id,
        displayName: typeof m.name === "string" && m.name.length > 0 ? m.name : id,
        description:
          typeof m.description === "string" && m.description.length > 0
            ? m.description
            : null,
        contextWindow: ctxWindow ?? null,
        maxOutputTokens: maxOut ?? null,
        ownedBy: typeof m.owned_by === "string" ? m.owned_by : null,
        inputModalities: modalities,
        vision: modalities ? modalities.includes("image") : null,
        tools: supported.length > 0 ? supported.includes("tools") : null,
        streaming: supported.length > 0 ? supported.includes("stream") : null,
        structuredOutput:
          supported.length > 0
            ? supported.includes("structured_outputs") || supported.includes("response_format")
            : null,
      });
    }
    return { models, fromListing: true };
  }

  protected handleSSE(
    data: string,
    emit: (e: StreamEvent) => void,
  ): { finishReason?: string | null } | void {
    if (data === "[DONE]" || data === "DONE") return { finishReason: "stop" };
    let json: {
      choices?: Array<{
        delta?: { content?: string | null; reasoning?: string | null };
        finish_reason?: string | null;
      }>;
      usage?: {
        prompt_tokens?: number | null;
        completion_tokens?: number | null;
        total_tokens?: number | null;
      } | null;
      model?: string;
      id?: string;
    };
    try {
      json = JSON.parse(data);
    } catch {
      return; // partial keep-alive line
    }

    const choice = json.choices?.[0];
    const text = choice?.delta?.content;
    if (typeof text === "string" && text.length > 0) {
      emit({ type: "delta", text });
    }

    if (json.usage && typeof json.usage === "object") {
      const inputTokens =
        typeof json.usage.prompt_tokens === "number" ? json.usage.prompt_tokens : null;
      const outputTokens =
        typeof json.usage.completion_tokens === "number" ? json.usage.completion_tokens : null;
      if (inputTokens !== null || outputTokens !== null) {
        emit({
          type: "usage",
          inputTokens,
          outputTokens,
          estimated: false,
        });
      }
    }

    if (choice?.finish_reason) {
      emit({ type: "context", contextWindow: null, source: "unavailable" });
      return { finishReason: choice.finish_reason };
    }
  }

  protected parseCompletion(json: Record<string, unknown>): {
    text: string;
    usage?: { inputTokens: number | null; outputTokens: number | null };
  } {
    const choices = json.choices as
      | Array<{ message?: { content?: string } }>
      | undefined;
    const content = choices?.[0]?.message?.content;
    const usage = json.usage as
      | { prompt_tokens?: number; completion_tokens?: number }
      | undefined;
    return {
      text: typeof content === "string" ? content : "",
      usage: usage
        ? {
            inputTokens: typeof usage.prompt_tokens === "number" ? usage.prompt_tokens : null,
            outputTokens:
              typeof usage.completion_tokens === "number" ? usage.completion_tokens : null,
          }
        : undefined,
    };
  }
}

/**
 * OpenAI proper.
 *
 * The wire format is identical to the generic OpenAI-compatible adapter, so we
 * subclass it rather than duplicating the SSE handling. The `kind` differs only
 * so the adapter registry and the preset table can distinguish it (OpenAI
 * genuinely does send `openai-organization`, and it is the one endpoint whose
 * /models listing is officially documented).
 */
export class OpenAIAdapter extends OpenAICompatibleAdapter {
  readonly kind = "openai-compatible" as const;
  protected listPath = "/models";
}
