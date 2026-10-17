import type { VercelRequest, VercelResponse } from "@vercel/node";
import { handleApiRequest, type ApiDeps } from "../server/api.js";
import { AppDatabase } from "../server/db/repository.js";
import { getEnv, type ApiEnv } from "../server/env.js";
import { resolveNodeDriver, applyMigrations } from "../server/db/factory.js";
import { nodeLookup } from "../server/dns.js";
import { redactSecrets } from "../shared/providers.js";

/**
 * Vercel Function entry point — the PRIMARY deployment target.
 *
 * `vercel.json` rewrites every `/api/*` request to this function, which
 * converts the Node-style req/res pair into the Web-standard Request that the
 * storage-agnostic API router already speaks. The identical router also powers
 * the Cloudflare Worker (`server/worker.ts`) and the local dev server
 * (`server/local/localServer.ts`), so behaviour cannot drift between targets.
 *
 * Serverless invocations are isolated, so the database handle and the
 * migration check are memoised per warm instance rather than per request.
 * There is no always-on server and no background job in this path.
 */

export const config = {
  // Streaming must stay open long enough for a slow model to finish. Vercel's
  // Hobby plan caps this; exceeding the cap surfaces as an upstream timeout
  // rather than a silent truncation.
  maxDuration: 300,
};

/* ------------------------------------------------------------------ */
/* Per-instance memoised database                                      */
/* ------------------------------------------------------------------ */

interface Cached {
  app: AppDatabase;
  driverKind: string;
  error: Error | null;
}

let cached: Cached | null = null;
let inflight: Promise<Cached> | null = null;

async function getDatabase(env: ApiEnv): Promise<Cached> {
  if (cached) return cached;
  if (inflight) return inflight;

  inflight = (async (): Promise<Cached> => {
    try {
      const resolved = await resolveNodeDriver(env);
      // Cold starts on a fresh database need the schema; `schema_migrations`
      // makes this a single cheap read on every later boot.
      if (resolved.needsMigrate && env.ROSA_AUTO_MIGRATE !== "0") {
        await applyMigrations(resolved.driver);
      }
      const app = new AppDatabase(
        resolved.driver,
        env.ROSA_ENCRYPTION_KEY ?? null,
      );
      const value: Cached = { app, driverKind: resolved.kind, error: null };
      cached = value;
      return value;
    } catch (err) {
      // Cache the failure so we do not retry a misconfigured database on every
      // request within the same warm instance.
      const error = err instanceof Error ? err : new Error(String(err));
      const value: Cached = {
        app: null as unknown as AppDatabase,
        driverKind: "unconfigured",
        error,
      };
      cached = value;
      return value;
    } finally {
      inflight = null;
    }
  })();

  return inflight;
}

/* ------------------------------------------------------------------ */
/* Handler                                                             */
/* ------------------------------------------------------------------ */

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const env = getEnv();
  const origin = `https://${req.headers.host ?? "localhost"}`;
  const url = new URL(req.url ?? "/api/health", origin);

  const db = await getDatabase(env);

  // A misconfigured database must produce a clear 503 that names the missing
  // variables, not a 500 stack trace. `/api/health` stays meaningful so the
  // front end can explain what is wrong instead of showing "cannot connect".
  if (db.error) {
    const healthOnly = url.pathname.endsWith("/health");
    // Driver errors can embed a connection string, which may carry credentials.
    // The message stays useful for diagnosis after redaction; the raw detail is
    // not returned at all, because there is no consumer that needs it.
    const safeMessage = redactSecrets(db.error.message);
    res.statusCode = 503;
    res.setHeader("content-type", "application/json; charset=utf-8");
    res.end(
      JSON.stringify({
        ok: false,
        error: {
          code: "upstream-unavailable",
          message: healthOnly
            ? safeMessage
            : "The Rosa API has no database configured, so it cannot serve requests.",
          detail: healthOnly ? safeMessage : undefined,
          retryable: false,
        },
      }),
    );
    return;
  }

  const deps: ApiDeps = {
    app: db.app,
    env: { ...env, ROSA_API_PREFIX: env.ROSA_API_PREFIX ?? "/api" },
    // Resolve provider hostnames so a public-looking name pointing at a private
    // address is refused. Vercel Functions run on Node, so the real resolver is
    // available here.
    lookup: nodeLookup,
  };

  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (typeof value === "string") headers.set(key, value);
    else if (Array.isArray(value)) for (const v of value) headers.append(key, v);
  }

  const method = req.method ?? "GET";
  const init: RequestInit & { duplex?: "half" } = { method, headers };
  if (method !== "GET" && method !== "HEAD") {
    // Vercel buffers the (already complete) body before invoking the function.
    const chunk = await readRawBody(req);
    if (chunk.length > 0) {
      init.body = new Uint8Array(chunk);
      headers.set("content-length", String(chunk.byteLength));
    }
    init.duplex = "half";
  }

  const webRes = await handleApiRequest(new Request(url, init), deps);

  res.statusCode = webRes.status;
  const setCookies =
    typeof (webRes.headers as unknown as { getSetCookie?: () => string[] }).getSetCookie ===
    "function"
      ? (webRes.headers as unknown as { getSetCookie: () => string[] }).getSetCookie()
      : [];
  webRes.headers.forEach((value, key) => {
    if (key.toLowerCase() === "set-cookie") return;
    if (key.toLowerCase() === "content-length") return; // streaming may differ
    res.setHeader(key, value);
  });
  if (setCookies.length > 0) res.setHeader("set-cookie", setCookies);

  const contentType = webRes.headers.get("content-type") ?? "";
  if (contentType.includes("text/event-stream") && webRes.body) {
    // Stream SSE straight through: flushing each chunk is what makes the
    // comparison workspace show tokens as they arrive instead of at the end.
    res.setHeader("content-type", "text/event-stream; charset=utf-8");
    res.setHeader("cache-control", "no-cache, no-transform");
    res.setHeader("connection", "keep-alive");
    // Disable proxy buffering where the header is honoured.
    res.setHeader("x-accel-buffering", "no");
    const reader = (webRes.body as ReadableStream<Uint8Array>).getReader();
    const pump = async () => {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        res.write(value);
        // Force the chunk out of Node's buffer so TTFT is measured honestly.
        const flushable = res as unknown as { flush?: () => void };
        if (typeof flushable.flush === "function") flushable.flush();
      }
      res.end();
    };
    void pump().catch(() => res.end());
    return;
  }

  if (!webRes.body) {
    res.end();
    return;
  }
  res.end(Buffer.from(await webRes.arrayBuffer()));
}

/** Largest request body this function will accept, matching the router's cap. */
const MAX_BODY_BYTES = 512 * 1024;

/**
 * Buffer the request body, aborting once it exceeds `MAX_BODY_BYTES`.
 *
 * Without the cap, a body larger than the platform's own limit would be buffered
 * in full before `readJson` ever saw it — the router's check happens after this
 * point, so it cannot protect the memory this function allocates.
 */
function readRawBody(req: VercelRequest): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let total = 0;
    req.on("data", (c: Buffer) => {
      total += c.length;
      if (total > MAX_BODY_BYTES) {
        req.destroy();
        reject(new Error(`Request body exceeded ${MAX_BODY_BYTES} bytes`));
        return;
      }
      chunks.push(c);
    });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

/** Exported for tests. */
export const __test = { getDatabase };
