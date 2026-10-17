import type {
  ModelRecord,
  ProviderKind,
  StreamEvent,
} from "../../shared/types.js";
import type { RawModel } from "../../shared/models.js";
import { normaliseModel } from "../../shared/models.js";
import { SSEParser } from "../../shared/sse.js";
import type { Lookup } from "../../shared/urlGuard.js";

export interface AdapterContext {
  /** Absolute base URL, already validated. */
  baseUrl: string;
  /** Plaintext API key. Never logged, never returned to the client. */
  apiKey: string;
  organizationId: string | null;
  providerLabel: string;
  /** Extra request settings the user configured for this provider. */
  settings?: Record<string, string>;
  /**
   * DNS resolver used to confirm the provider host is public.
   *
   * Injected rather than imported so `shared/` and the adapters stay usable on
   * Cloudflare Workers, which has no `node:dns`. When absent, only literal-IP
   * addresses are checked and a hostname is trusted on its name — which is why
   * every Node-side caller supplies one.
   */
  lookup?: Lookup;
  /**
   * Permit requests to loopback. Local development only, for Ollama / LM Studio
   * / vLLM. Never set this in a deployed environment.
   */
  allowLocalhost?: boolean;
}

export interface ChatTurn {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ChatOptions {
  modelId: string;
  messages: ChatTurn[];
  temperature?: number;
  maxTokens?: number | null;
  stream: boolean;
  timeoutMs: number;
  signal?: AbortSignal;
  /** Client request id, echoed on the start event. */
  requestId: string;
}

export interface ModelListResult {
  models: RawModel[];
  /** True when the provider exposed a real listing endpoint. */
  fromListing: boolean;
}

export interface CompletionResult {
  text: string;
  usage?: { inputTokens: number | null; outputTokens: number | null };
}

/** Emits normalised StreamEvents the client already understands. */
export interface ProviderAdapter {
  readonly kind: ProviderKind;
  /** Build headers for a model-listing request. */
  listModelsHeaders(ctx: AdapterContext): Record<string, string>;
  listModelsUrl(ctx: AdapterContext): string;
  parseModelList(payload: unknown, ctx: AdapterContext): ModelListResult;
  /** Perform a streaming chat request, invoking `emit` per event. */
  streamChat(ctx: AdapterContext, opts: ChatOptions, emit: (e: StreamEvent) => void): Promise<void>;
  /** Perform a one-shot (non-streaming) chat request. */
  complete(ctx: AdapterContext, opts: ChatOptions): Promise<CompletionResult>;
}

export abstract class BaseAdapter implements ProviderAdapter {
  abstract readonly kind: ProviderKind;

  protected abstract chatUrl(ctx: AdapterContext, modelId: string): string;
  protected abstract chatHeaders(ctx: AdapterContext, modelId: string): Record<string, string>;
  protected abstract buildBody(
    ctx: AdapterContext,
    opts: ChatOptions,
  ): Record<string, unknown>;

  /** Default model-listing path; adapters may override. */
  protected listPath = "/models";

  listModelsHeaders(ctx: AdapterContext): Record<string, string> {
    return {
      authorization: `Bearer ${ctx.apiKey}`,
      accept: "application/json",
    };
  }

  listModelsUrl(ctx: AdapterContext): string {
    return `${ctx.baseUrl.replace(/\/+$/, "")}${this.listPath}`;
  }

  parseModelList(_payload: unknown): ModelListResult {
    return { models: [], fromListing: true };
  }

  async streamChat(
    ctx: AdapterContext,
    opts: ChatOptions,
    emit: (e: StreamEvent) => void,
  ): Promise<void> {
    const { providerFetch, decodeTextStream } = await import("../http.js");
    const { transportError } = await import("../../shared/providers.js");

    const res = await providerFetch({
      url: this.chatUrl(ctx, opts.modelId),
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "text/event-stream",
        ...this.chatHeaders(ctx, opts.modelId),
      },
      body: JSON.stringify(this.buildBody(ctx, { ...opts, stream: true })),
      timeoutMs: opts.timeoutMs,
      signal: opts.signal,
      lookup: ctx.lookup,
      allowLocalhost: ctx.allowLocalhost,
    });

    if (!res.body) {
      emit({
        type: "error",
        error: {
          code: "unsupported",
          message: `${ctx.providerLabel} returned an empty response body.`,
          retryable: false,
        },
      });
      return;
    }

    const parser = new SSEParser({
      onEvent: (evt) => this.handleSSE(evt.data, emit),
    });

    let sawAnyData = false;
    for await (const chunk of decodeTextStream(res.body)) {
      sawAnyData = true;
      parser.push(chunk);
    }
    parser.flush();

    if (!sawAnyData) {
      emit({
        type: "error",
        error: {
          code: "unsupported",
          message: `${ctx.providerLabel} closed the stream without sending any data. It may not support streaming for this model.`,
          retryable: false,
        },
      });
    }
    void transportError;
  }

  /** Override to translate provider-specific SSE payloads into deltas. */
  protected handleSSE(data: string, _emit: (e: StreamEvent) => void): void {
    void data;
  }

  /** Non-streaming fallback for providers without SSE. */
  async complete(
    ctx: AdapterContext,
    opts: ChatOptions,
  ): Promise<{ text: string; usage?: { inputTokens: number | null; outputTokens: number | null } }> {
    const { providerFetch } = await import("../http.js");
    const res = await providerFetch({
      url: this.chatUrl(ctx, opts.modelId),
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...this.chatHeaders(ctx, opts.modelId),
      },
      body: JSON.stringify(this.buildBody(ctx, { ...opts, stream: false })),
      timeoutMs: opts.timeoutMs,
      signal: opts.signal,
      lookup: ctx.lookup,
      allowLocalhost: ctx.allowLocalhost,
    });
    const payload = await res.json<Record<string, unknown>>();
    const { text, usage } = this.parseCompletion(payload);
    return { text, usage };
  }

  protected parseCompletion(_payload: Record<string, unknown>): {
    text: string;
    usage?: { inputTokens: number | null; outputTokens: number | null };
  } {
    return { text: "" };
  }

  /** Shared normalisation helper for adapters. */
  protected toRecords(
    raws: RawModel[],
    providerId: string,
    kind: ProviderKind,
  ): ModelRecord[] {
    const now = Date.now();
    const out: ModelRecord[] = [];
    for (const r of raws) {
      const rec = normaliseModel(r, providerId, kind, now);
      if (rec) out.push(rec);
    }
    return out;
  }
}
