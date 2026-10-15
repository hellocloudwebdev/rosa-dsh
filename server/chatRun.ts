import type { ApiErrorPayload, StreamEvent, TurnMetrics } from "../shared/types.js";
import type { ProviderAdapter } from "./adapters/index.js";
import type { AdapterContext, ChatOptions } from "./adapters/base.js";
import { providerFetch, isCancellation, toApiError, decodeTextStream } from "./http.js";
import { SSEParser } from "../shared/sse.js";
import { presetFor } from "../shared/providers.js";

export interface RunArgs {
  adapter: ProviderAdapter;
  ctx: AdapterContext;
  opts: Omit<ChatOptions, "signal">;
  emit: (e: StreamEvent) => void;
}

/**
 * A live streaming run.
 *
 * One instance per (requestId, pane). Cancellation is scoped to this
 * instance's AbortController, so cancelling pane 1 can never touch pane 2 —
 * that is the isolation the comparison workspace depends on.
 */
export class ChatRun {
  private readonly controller = new AbortController();
  private readonly startWall = Date.now();
  // performance.now() is monotonic and immune to clock changes, which is
  // exactly what the spec requires for elapsed-time measurement.
  private readonly startMono = performance.now();

  private firstTokenMono: number | null = null;
  private firstResponseMono: number | null = null;
  private endMono: number | null = null;

  private inputTokens: number | null = null;
  private outputTokens: number | null = null;
  private tokensEstimated = false;
  private fullText = "";
  private contextWindow: number | null = null;
  private sawAnyDelta = false;
  private errored: ApiErrorPayload | null = null;
  private cancelled = false;

  constructor(
    readonly requestId: string,
    private readonly providerLabel: string,
  ) {}

  get signal(): AbortSignal {
    return this.controller.signal;
  }

  get text(): string {
    return this.fullText;
  }

  /** Cancel this run only. Idempotent. */
  cancel(): void {
    if (this.controller.signal.aborted) return;
    this.cancelled = true;
    this.controller.abort(new Error("__CANCELLED_BY_CLIENT__"));
  }

  get isCancelled(): boolean {
    return this.cancelled;
  }

  private markFirstContent(text: string): void {
    if (!text) return;
    if (this.firstTokenMono === null) this.firstTokenMono = performance.now();
    if (this.firstResponseMono === null && text.trim().length > 0) {
      this.firstResponseMono = performance.now();
    }
  }

  /** Execute the run, invoking `emit` for every stream event. */
  async run(args: RunArgs): Promise<void> {
    const { adapter, ctx, opts, emit } = args;

    emit({
      type: "start",
      requestId: this.requestId,
      model: opts.modelId,
      providerId: ctx.baseUrl,
      at: this.startWall,
    });

    const options: ChatOptions = { ...opts, signal: this.signal };

    if (!opts.stream || !presetFor(adapter.kind).supportsStreaming) {
      await this.runNonStreaming(args, options);
      if (this.errored) emit({ type: "error", error: this.errored });
      else if (!this.cancelled) {
        emit({ type: "done", finishReason: "stop", metrics: this.metrics() });
      }
      return;
    }

    const call = adapterCall(adapter);

    let body: ReadableStream<Uint8Array> | null = null;
    try {
      const res = await providerFetch({
        url: call.chatUrl(ctx, opts.modelId),
        method: "POST",
        headers: {
          "content-type": "application/json",
          accept: "text/event-stream",
          ...call.chatHeaders(ctx, opts.modelId),
        },
        body: JSON.stringify(call.buildBody(ctx, options)),
        timeoutMs: opts.timeoutMs,
        signal: this.signal,
      });
      body = res.body;
    } catch (err) {
      if (isCancellation(err) || this.cancelled) {
        this.emitCancelled(emit);
        return;
      }
      this.errored = toApiError(err, this.providerLabel);
      emit({ type: "error", error: this.errored });
      return;
    }

    if (!body) {
      this.errored = {
        code: "unsupported",
        message: `${this.providerLabel} returned an empty response body.`,
        retryable: false,
      };
      emit({ type: "error", error: this.errored });
      return;
    }

    // The adapter translates provider-specific SSE payloads into the neutral
    // StreamEvent vocabulary; our trampoline records measurements on the way.
    const emitTrampoline = (e: StreamEvent) => this.applyEvent(e, emit);
    const parser = new SSEParser({
      onEvent: (evt) => call.handleSSE(evt.data, emitTrampoline),
    });

    try {
      for await (const chunk of decodeTextStream(body)) {
        if (this.cancelled) break;
        parser.push(chunk);
      }
      parser.flush();
    } catch (err) {
      if (isCancellation(err) || this.cancelled) {
        this.emitCancelled(emit);
        return;
      }
      this.errored = toApiError(err, this.providerLabel);
      emit({ type: "error", error: this.errored });
      return;
    }

    if (this.cancelled) {
      this.emitCancelled(emit);
      return;
    }

    if (!this.sawAnyDelta) {
      this.errored = {
        code: "unsupported",
        message: `${this.providerLabel} closed the stream without sending any content. It may not support streaming for this model.`,
        retryable: false,
      };
      emit({ type: "error", error: this.errored });
      return;
    }

    this.finish();
    emit({ type: "done", finishReason: "stop", metrics: this.metrics() });
  }

  /** Terminate a cancelled run with honest partial metrics. */
  private emitCancelled(emit: (e: StreamEvent) => void): void {
    this.endMono = performance.now();
    emit({ type: "done", finishReason: "cancelled", metrics: this.metrics() });
  }

  private async runNonStreaming(args: RunArgs, options: ChatOptions): Promise<void> {
    const { adapter, ctx, opts } = args;
    try {
      const result = await adapter.complete(ctx, options);
      if (this.cancelled) return;
      this.fullText = result.text;
      this.markFirstContent(result.text);
      this.sawAnyDelta = result.text.length > 0;
      if (result.usage) {
        this.inputTokens = result.usage.inputTokens;
        this.outputTokens = result.usage.outputTokens;
      }
      this.endMono = performance.now();
      if (this.sawAnyDelta) this.applyMetricsToEmit(opts);
    } catch (err) {
      if (isCancellation(err) || this.cancelled) return;
      this.errored = toApiError(err, this.providerLabel);
    }
  }

  private applyMetricsToEmit(_opts: Omit<ChatOptions, "signal">): void {
    void _opts;
  }

  private applyEvent(e: StreamEvent, emit: (e: StreamEvent) => void): void {
    switch (e.type) {
      case "delta":
        this.fullText += e.text;
        this.markFirstContent(e.text);
        this.sawAnyDelta = true;
        break;
      case "usage":
        if (e.inputTokens !== null) this.inputTokens = e.inputTokens;
        if (e.outputTokens !== null) this.outputTokens = e.outputTokens;
        if (e.estimated) this.tokensEstimated = true;
        break;
      case "context":
        this.contextWindow = e.contextWindow;
        break;
      default:
        break;
    }
    emit(e);
  }

  private finish(): void {
    this.endMono = performance.now();
  }

  /**
   * Snapshot of the metrics.
   *
   * The rule is absolute: `null` means "unknown". We never substitute zero,
   * and we never divide by a guard interval we did not actually measure.
   */
  metrics(): Omit<TurnMetrics, "startedAt" | "endedAt"> {
    const end = this.endMono ?? performance.now();
    const ttftMs =
      this.firstTokenMono === null ? null : Math.round(this.firstTokenMono - this.startMono);
    const firstResponseMs =
      this.firstResponseMono === null
        ? null
        : Math.round(this.firstResponseMono - this.startMono);
    const generationMs =
      this.firstTokenMono === null ? null : Math.round(end - this.firstTokenMono);
    const totalMs = Math.round(end - this.startMono);

    // Token speed is only computed when we have a real output-token count.
    let tokensPerSecond: number | null = null;
    if (
      this.outputTokens !== null &&
      this.outputTokens > 0 &&
      generationMs !== null &&
      generationMs > 0
    ) {
      tokensPerSecond = round2(this.outputTokens / (generationMs / 1000));
    }

    return {
      ttftMs,
      firstResponseMs,
      generationMs,
      totalMs,
      outputTokens: this.outputTokens,
      inputTokens: this.inputTokens,
      outputTokensEstimated: this.tokensEstimated,
      inputTokensEstimated: this.tokensEstimated,
      tokensPerSecond,
      tokensPerSecondEstimated: this.tokensEstimated,
      contextWindow: this.contextWindow,
    };
  }

  get error(): ApiErrorPayload | null {
    return this.errored;
  }

  get finalText(): string {
    return this.fullText;
  }
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/* ------------------------------------------------------------------ */
/* Adapter access bridge                                               */
/* ------------------------------------------------------------------ */

/**
 * `ProviderAdapter` intentionally hides URL/header/body construction, because
 * subclasses own provider specifics. For precise per-run measurement we need
 * those three pieces, so we read them through a structural view. A future
 * refactor should move them onto the interface directly.
 */
interface AdapterCall {
  chatUrl: (ctx: AdapterContext, modelId: string) => string;
  chatHeaders: (ctx: AdapterContext, modelId: string) => Record<string, string>;
  buildBody: (ctx: AdapterContext, opts: ChatOptions) => Record<string, unknown>;
  handleSSE: (data: string, emit: (e: StreamEvent) => void) => void;
}

function adapterCall(adapter: ProviderAdapter): AdapterCall {
  const a = adapter as unknown as Partial<AdapterCall>;
  return {
    chatUrl: (ctx, modelId) =>
      a.chatUrl
        ? a.chatUrl(ctx, modelId)
        : fallback.chatUrl(ctx, modelId),
    chatHeaders: (ctx, modelId) =>
      a.chatHeaders ? a.chatHeaders(ctx, modelId) : fallback.chatHeaders(ctx, modelId),
    buildBody: (ctx, opts) => (a.buildBody ? a.buildBody(ctx, opts) : fallback.buildBody(ctx, opts)),
    handleSSE: (data, emit) => (a.handleSSE ? a.handleSSE(data, emit) : undefined),
  };
}

const fallback: AdapterCall = {
  chatUrl: (ctx, modelId) =>
    `${ctx.baseUrl.replace(/\/+$/, "")}/chat/completions?model=${encodeURIComponent(modelId)}`,
  chatHeaders: (ctx) => ({ authorization: `Bearer ${ctx.apiKey}` }),
  buildBody: (_ctx, opts) => ({ model: opts.modelId, messages: opts.messages }),
  handleSSE: (_data, _emit) => undefined,
};
