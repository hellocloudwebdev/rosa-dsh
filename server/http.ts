import {
  assertPublicHost,
  validateProviderBaseUrl,
  type Lookup,
} from "../shared/urlGuard.js";
import {
  redactSecrets,
  transportError,
  upstreamError,
} from "../shared/providers.js";
import type { ApiErrorPayload } from "../shared/types.js";

export { classifyHttpStatus } from "../shared/providers.js";

/**
 * Hard cap on how long a single provider request may take, regardless of what
 * the client asked for. Keeps a stuck upstream from pinning a function slot.
 * Outer safety net raised to 15 minutes; streaming paths re-arm inactivity timers.
 */
export const MAX_UPSTREAM_TIMEOUT_MS = 900_000; // 15 minutes
export const MIN_UPSTREAM_TIMEOUT_MS = 5_000;
/** Cap on a model-listing response body. */
export const MAX_LISTING_BYTES = 2_000_000;

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

export interface ProviderRequest {
  /** Absolute URL already validated by the caller. */
  url: string;
  method: "GET" | "POST";
  headers: Record<string, string>;
  body?: string;
  /** Total timeout including connection. */
  timeoutMs: number;
  signal?: AbortSignal;
  /**
   * DNS resolver used to confirm the host is public. Injected by the caller so
   * `shared/` stays runtime-agnostic (Workers has no `node:dns`).
   */
  lookup?: Lookup;
  /**
   * Permit loopback, for local dev against Ollama / LM Studio / vLLM only.
   * Defaults to false; the local server opts in explicitly.
   */
  allowLocalhost?: boolean;
}

/**
 * Parse a URL string and confirm it is an https provider endpoint whose host is
 * public.
 *
 * This replaces a raw `startsWith("https://")` gate, which accepted anything
 * with the right prefix — including `https://evil.example` and, worse, told us
 * nothing about where the host actually resolved. The scheme is now derived from
 * the parsed URL and the host is validated structurally *and* by resolution.
 */
export async function assertFetchableProviderUrl(
  raw: string,
  opts: { lookup?: Lookup; allowLocalhost?: boolean } = {},
): Promise<{ ok: true } | { ok: false; message: string }> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return { ok: false, message: "Refusing to request a malformed URL." };
  }

  const loopbackOk = opts.allowLocalhost === true;

  /**
   * True for the hosts a local dev server is allowed to reach: the machine it is
   * running on. `localhost` is included here even though it is not an IP literal,
   * because resolving it is guaranteed to yield a loopback address.
   */
  const isLoopbackHost =
    url.hostname === "127.0.0.1" ||
    url.hostname === "localhost" ||
    url.hostname === "::1" ||
    url.hostname === "[::1]";

  // Loopback is permitted only when the caller explicitly opted in, which only
  // the local dev server does. Both the structural and the resolution check must
  // skip it, or the second one would immediately reject what the first allowed.
  if (loopbackOk && isLoopbackHost) {
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return { ok: false, message: "Provider requests must use http:// or https://." };
    }
    return { ok: true };
  }

  const verdict = validateProviderBaseUrl(url.toString(), {
    allowHttpLocalDev: loopbackOk,
  });

  if (verdict.ok) {
    // Structural checks passed; confirm where the name actually points.
    const resolved = await assertPublicHost(url.hostname, opts.lookup);
    if (!resolved.ok) {
      return { ok: false, message: resolved.message ?? "Host is not reachable." };
    }
    return { ok: true };
  }

  // Being explicit about https avoids echoing an attacker-supplied string back.
  if (url.protocol !== "https:") {
    return { ok: false, message: "Provider requests must use https://." };
  }
  return { ok: false, message: verdict.message };
}

/**
 * Why this shape:
 *
 * - Every request is validated *and* its host is resolved immediately before the
 *   connection, so a public-looking name that points into the private network is
 *   refused. The old prefix check did neither.
 * - `redirect: "manual"` means we honour the Location header ourselves and can
 *   refuse to follow a redirect to a private address. A provider that 301s to
 *   169.254.169.254 is an SSRF vector.
 * - The timeout uses AbortSignal.timeout so connection establishment, headers
 *   and the whole body are all bounded.
 * - `duplex: "half"` is required by Node's fetch when a body is streamed.
 */
export async function providerFetch(req: ProviderRequest): Promise<ProviderResponse> {
  const allowed = await assertFetchableProviderUrl(req.url, {
    lookup: req.lookup,
    allowLocalhost: req.allowLocalhost,
  });
  if (!allowed.ok) {
    throw new ProviderHttpError(400, allowed.message, new Headers());
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
    const reason = controller.signal.reason ?? req.signal?.reason;
    const isTimeout =
      upstreamTimedOut ||
      (reason instanceof Error && reason.name === "TimeoutError") ||
      (reason instanceof DOMException && reason.name === "TimeoutError") ||
      (typeof reason === "string" && reason.toLowerCase().includes("timeout"));

    if (aborted && !isTimeout) {
      // Client-driven cancellation: rethrow as a cancellation marker.
      const e = new Error("__CANCELLED__");
      (e as Error & { cause?: unknown }).cause = err;
      throw e;
    }
    if (isTimeout && !(err instanceof Error && err.name === "TimeoutError")) {
      const timeoutErr = new DOMException("timeout", "TimeoutError");
      (timeoutErr as unknown as { cause?: unknown }).cause = err;
      throw timeoutErr;
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
    // Capped: a failing endpoint is still attacker-controlled, and this text is
    // parsed and partially surfaced to the user.
    const text = res.body
      ? await readCappedText(res.body).catch(() => "")
      : await res.text().catch(() => "");
    await res.body?.cancel().catch(() => {});
    throw new ProviderHttpError(res.status, text, res.headers);
  }

  const body = res.body;
  return {
    status: res.status,
    headers: res.headers,
    body,
    // Capped by default. Every caller here is talking to a Base URL the user
    // supplied, so an unbounded read is a memory-exhaustion primitive; the cap is
    // far above any legitimate listing or completion payload.
    text: async () => {
      if (!body) return "";
      return readCappedText(body);
    },
    json: async <T,>() => {
      if (!body) throw new Error("Upstream returned an empty response body.");
      return JSON.parse(await readCappedText(body)) as T;
    },
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
export function toApiError(
  err: unknown,
  providerLabel: string,
  knownSecrets: readonly string[] = [],
): ApiErrorPayload {
  if (err instanceof ProviderHttpError) {
    const payload = upstreamError({
      status: err.status,
      providerLabel,
      bodyText: err.bodyText,
      retryAfterHeader: err.headers.get("retry-after"),
    });
    // The provider may have echoed the key back in its error body; redact the
    // exact value we sent before this reaches the client or the database.
    if (payload.detail) payload.detail = redactSecrets(payload.detail, knownSecrets);
    return payload;
  }
  if (
    (err instanceof Error && err.name === "TimeoutError") ||
    (err instanceof DOMException && err.name === "TimeoutError") ||
    (err instanceof Error && (err.message === "timed out" || err.message === "timeout")) ||
    (err instanceof Error &&
      (err as { cause?: Error | DOMException }).cause?.name === "TimeoutError")
  ) {
    return {
      code: "timeout",
      message: `${providerLabel} did not respond in time.`,
      retryable: true,
    };
  }
  const payload = transportError(err, providerLabel);
  payload.detail = payload.detail ? redactSecrets(payload.detail, knownSecrets) : undefined;
  return payload;
}
