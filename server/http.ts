import { validateProviderBaseUrl } from "../shared/urlGuard.js";
import { redactSecrets, transportError, upstreamError } from "../shared/providers.js";
import type { ApiErrorPayload } from "../shared/types.js";

/**
 * Hard cap on how long a single provider request may take, regardless of what
 * the client asked for. Keeps a stuck upstream from pinning a function slot.
 */
export const MAX_UPSTREAM_TIMEOUT_MS = 300_000; // 5 minutes
export const MIN_UPSTREAM_TIMEOUT_MS = 5_000;
/** Cap on a model-listing response body. */
export const MAX_LISTING_BYTES = 2_000_000;

export interface ProviderRequest {
  /** Absolute URL already validated by the caller. */
  url: string;
  method: "GET" | "POST";
  headers: Record<string, string>;
  body?: string;
  /** Total timeout including connection. */
  timeoutMs: number;
  signal?: AbortSignal;
}

export interface ProviderResponse {
  status: number;
  headers: Headers;
  /** Resolves to a reader over the decoded body. */
  body: ReadableStream<Uint8Array> | null;
  text: () => Promise<string>;
  json: <T = unknown>() => Promise<T>;
}

const DECODER = new TextDecoder();

export class ProviderHttpError extends Error {
  constructor(
    readonly status: number,
    readonly bodyText: string,
    readonly headers: Headers,
  ) {
    super(`Upstream returned HTTP ${status}`);
    this.name = "ProviderHttpError";
  }
}

/**
 * Why this shape:
 *
 * - `redirect: "manual"` means we honour the Location header ourselves and can
 *   refuse to follow a redirect to a private address. A provider that 301s to
 *   169.254.169.254 is an SSRF vector.
 * - The timeout uses AbortSignal.timeout so connection establishment, headers
 *   and the whole body are all bounded.
 * - `duplex: "half"` is required by Node's fetch when a body is streamed.
 */
export async function providerFetch(req: ProviderRequest): Promise<ProviderResponse> {
  if (!req.url.startsWith("https://") && !req.url.startsWith("http://127.0.0.1") && !req.url.startsWith("http://localhost")) {
    throw new Error("Refusing to make a provider request to a non-https URL");
  }

  const timeout = Math.min(
    MAX_UPSTREAM_TIMEOUT_MS,
    Math.max(MIN_UPSTREAM_TIMEOUT_MS, req.timeoutMs),
  );

  const controller = new AbortController();
  const onAbort = () => controller.abort(req.signal?.reason);
  if (req.signal) {
    if (req.signal.aborted) controller.abort(req.signal.reason);
    else req.signal.addEventListener("abort", onAbort, { once: true });
  }
  const timer = AbortSignal.timeout(timeout);
  timer.addEventListener("abort", () => controller.abort(new Error("timed out")), {
    once: true,
  });

  let res: Response;
  const requestInit: RequestInit & { duplex?: "half" } = {
    method: req.method,
    headers: req.headers,
    body: req.body,
    redirect: "manual",
    signal: controller.signal,
    // `duplex` is required by undici when a request body is supplied; the
    // DOM/Node type definitions do not yet agree on it.
    duplex: "half",
  };

  try {
    res = await fetch(req.url, requestInit);
  } catch (err) {
    if (req.signal) req.signal.removeEventListener("abort", onAbort);
    const aborted = controller.signal.aborted;
    const upstreamTimedOut = timer.aborted;
    if (aborted && !upstreamTimedOut) {
      // Client-driven cancellation: rethrow as a cancellation marker.
      const e = new Error("__CANCELLED__");
      (e as Error & { cause?: unknown }).cause = err;
      throw e;
    }
    throw err;
  } finally {
    if (req.signal) req.signal.removeEventListener("abort", onAbort);
  }

  // Refuse redirects outright. Following them would re-validate nothing.
  if (res.status >= 300 && res.status < 400 && res.headers.has("location")) {
    const location = res.headers.get("location") ?? "";
    const resolved = new URL(location, req.url);
    const verdict = validateProviderBaseUrl(resolved.toString(), {
      allowHttpLocalDev: resolved.hostname === "127.0.0.1",
    });
    if (!verdict.ok) {
      await res.body?.cancel().catch(() => {});
      throw new ProviderHttpError(
        502,
        `Refused to follow redirect to ${resolved.host}: ${verdict.message}`,
        res.headers,
      );
    }
    // Even to a public host we do not follow, so keys never leak to a
    // third-party endpoint the user did not configure.
    await res.body?.cancel().catch(() => {});
    throw new ProviderHttpError(
      502,
      `The provider attempted a redirect to ${resolved.host}. Redirects are not followed; set the Base URL to the final endpoint.`,
      res.headers,
    );
  }

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    await res.body?.cancel().catch(() => {});
    throw new ProviderHttpError(res.status, text, res.headers);
  }

  const body = res.body;
  return {
    status: res.status,
    headers: res.headers,
    body,
    text: () => res.text(),
    json: async <T,>() => (await res.json()) as T,
  };
}

/** Decode a stream of bytes as UTF-8 text chunks, honouring multi-byte chars. */
export async function* decodeTextStream(
  stream: ReadableStream<Uint8Array>,
): AsyncGenerator<string> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) yield decoder.decode(value, { stream: true });
    }
    const tail = decoder.decode();
    if (tail) yield tail;
  } finally {
    reader.releaseLock();
  }
}

/** Read a whole body as text, capped, so a runaway listing cannot exhaust memory. */
export async function readCappedText(
  stream: ReadableStream<Uint8Array>,
  cap = MAX_LISTING_BYTES,
): Promise<string> {
  const reader = stream.getReader();
  let total = 0;
  const chunks: Uint8Array[] = [];
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    total += value.byteLength;
    if (total > cap) {
      await reader.cancel().catch(() => {});
      throw new Error(`Response exceeded ${cap} bytes`);
    }
    chunks.push(value);
  }
  const merged = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    merged.set(c, offset);
    offset += c.byteLength;
  }
  return DECODER.decode(merged);
}

/** True when the error means the user cancelled. */
export function isCancellation(err: unknown): boolean {
  return err instanceof Error && err.message === "__CANCELLED__";
}

/**
 * Classify any thrown error into an ApiErrorPayload, redacting secrets.
 * Never throws.
 */
export function toApiError(err: unknown, providerLabel: string): ApiErrorPayload {
  if (err instanceof ProviderHttpError) {
    return upstreamError({
      status: err.status,
      providerLabel,
      bodyText: err.bodyText,
    });
  }
  if (err instanceof Error && err.name === "TimeoutError") {
    return {
      code: "upstream-timeout",
      message: `${providerLabel} did not respond in time.`,
      retryable: true,
    };
  }
  const payload = transportError(err, providerLabel);
  payload.detail = payload.detail ? redactSecrets(payload.detail) : undefined;
  return payload;
}
