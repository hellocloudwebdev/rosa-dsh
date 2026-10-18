import { BaseAdapter, type AdapterContext, type ChatOptions } from "./base.js";
import type { StreamEvent } from "../../shared/types.js";

/**
 * Azure OpenAI adapter.
 *
 * Azure is *almost* OpenAI-compatible but has three real differences:
 *  1. the deployment id is part of the URL path, not the body's `model`
 *  2. the API key goes in an `api-key` header, not `Authorization: Bearer`
 *  3. the query parameter `api-version` is mandatory
 *
 * It also has no model-listing endpoint, so `supportsListing` is false and the
 * add-provider UI hides discovery for it.
 */
export class AzureOpenAIAdapter extends BaseAdapter {
  readonly kind = "azure-openai" as const;

  /** Azure requires api-version; "2024-10-21" is the GA chat-completions version. */
  static readonly API_VERSION = "2024-10-21";
  protected listPath = "";

  protected chatUrl(ctx: AdapterContext, modelId: string): string {
    const base = ctx.baseUrl.replace(/\/+$/, "");
    // If the user supplied the full deployment path we respect it; otherwise
    // treat modelId as the deployment name.
    const hasDeployment = /\/deployments\/[^/]+/.test(base);
    const url = hasDeployment
      ? base
      : `${base}/deployments/${encodeURIComponent(modelId)}`;
    return `${url}/chat/completions?api-version=${AzureOpenAIAdapter.API_VERSION}`;
  }

  protected chatHeaders(ctx: AdapterContext): Record<string, string> {
    return { "api-key": ctx.apiKey };
  }

  protected buildBody(_ctx: AdapterContext, opts: ChatOptions): Record<string, unknown> {
    // Azure ignores `model` in the body; the deployment path decides it.
    const body: Record<string, unknown> = {
      messages: opts.messages.map((m) => ({ role: m.role, content: m.content })),
      stream: opts.stream,
    };
    if (opts.stream) body.stream_options = { include_usage: true };
    if (typeof opts.temperature === "number") body.temperature = opts.temperature;
    if (typeof opts.maxTokens === "number" && opts.maxTokens > 0) {
      body.max_tokens = opts.maxTokens;
    }
    return body;
  }

  listModelsUrl(): string {
    // Azure exposes no generic model listing; throw so the caller surfaces a
    // clear "discovery unavailable" message instead of a 404.
    throw new Error(
      "Azure OpenAI does not expose a model-listing endpoint on a deployment URL. Enter the deployment name and model manually.",
    );
  }

  listModelsHeaders(): Record<string, string> {
    throw new Error("Azure OpenAI model discovery is not supported.");
  }

  protected handleSSE(
    data: string,
    emit: (e: StreamEvent) => void,
  ): { finishReason?: string | null } | void {
    if (data === "[DONE]" || data === "DONE") return { finishReason: "stop" };
    try {
      const json = JSON.parse(data) as {
        choices?: Array<{ delta?: { content?: string | null }; finish_reason?: string | null }>;
        usage?: { prompt_tokens?: number; completion_tokens?: number } | null;
      };
      const choice = json.choices?.[0];
      const text = choice?.delta?.content;
      if (typeof text === "string" && text.length > 0) emit({ type: "delta", text });
      if (json.usage) {
        const inputTokens =
          typeof json.usage.prompt_tokens === "number" ? json.usage.prompt_tokens : null;
        const outputTokens =
          typeof json.usage.completion_tokens === "number"
            ? json.usage.completion_tokens
            : null;
        if (inputTokens !== null || outputTokens !== null) {
          emit({ type: "usage", inputTokens, outputTokens, estimated: false });
        }
      }
      if (choice?.finish_reason) {
        return { finishReason: choice.finish_reason };
      }
    } catch {
      /* ignore partial */
    }
  }
}
