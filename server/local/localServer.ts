import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

import { AppDatabase } from "../db/repository.js";
import { SqliteDriver } from "../db/sqlite.js";
import { handleApiRequest, type ApiDeps } from "../api.js";
import { getEnv } from "../env.js";
import { encryptSecret } from "../db/crypto.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".map": "application/json; charset=utf-8",
};

async function main(): Promise<void> {
  const env = getEnv();
  const port = Number.parseInt(env.ROSA_API_PORT ?? "8787", 10);
  const dbPath = env.ROSA_DB_PATH ?? join(__dirname, "..", "..", ".data", "rosa.db");
  const distDir = join(__dirname, "..", "..", "dist");
  const startedAt = Date.now();

  const driver = new SqliteDriver(dbPath);
  await driver.migrate();
  const canStoreKeys = Boolean(env.ROSA_ENCRYPTION_KEY);
  if (canStoreKeys) {
    // Validate the key eagerly: a malformed key must fail at boot, not in the
    // middle of the first provider write.
    await encryptSecret("boot-check", env.ROSA_ENCRYPTION_KEY!);
  }
  const app = new AppDatabase(driver, env.ROSA_ENCRYPTION_KEY ?? null);

  const deps: ApiDeps = {
    app,
    env: {
      ...env,
      ROSA_PUBLIC_APP_URL: env.ROSA_PUBLIC_APP_URL ?? `http://localhost:5173`,
      ROSA_API_PREFIX: "/api",
    },
    startedAt,
  };

  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", `http://localhost:${port}`);

    if (url.pathname.startsWith("/api")) {
      await toWebResponse(req, res, handleApiRequest(toWebRequest(req, url), deps));
      return;
    }

    // ---- static build output (production mode) ----
    let rel = url.pathname === "/" ? "index.html" : url.pathname.slice(1);
    rel = normalize(rel).replace(/^(\.\.[/\\])+/, "");

    if (rel.startsWith("api/") || rel === "api") {
      res.writeHead(404, { "content-type": "application/json" });
      res.end('{"error":{"code":"not-found","message":"No API route.","retryable":false}}');
      return;
    }

    const filePath = join(distDir, rel);
    if (existsSync(filePath) && existsSync(distDir)) {
      try {
        const body = readFileSync(filePath);
        res.writeHead(200, {
          "content-type": MIME[extname(filePath)] ?? "application/octet-stream",
          "cache-control": "no-cache",
        });
        res.end(body);
        return;
      } catch {
        /* fall through to 404 */
      }
    }

    res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    res.end("Not found. In development run the Vite dev server; in production run `npm run build` first.");
  });

  await new Promise<void>((resolve) => server.listen(port, resolve));

  const mode = process.env.NODE_ENV === "production" ? "production" : "development";
  process.stdout.write(
    `\n  ROSA API listening on http://127.0.0.1:${port}  (${mode})\n` +
      `  database: ${dbPath}\n` +
      `  key storage: ${canStoreKeys ? "AES-256-GCM (server-side)" : "session-only (no ROSA_ENCRYPTION_KEY)"}\n\n`,
  );

  const shutdown = () => {
    process.stdout.write("\n  shutting down…\n");
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 2000).unref();
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

function toWebRequest(req: IncomingMessage, url: URL): Request {
  const headers = new Headers();
  for (let i = 0; i < req.rawHeaders.length; i += 2) {
    headers.append(req.rawHeaders[i], req.rawHeaders[i + 1]);
  }
  const method = req.method ?? "GET";
  const init: RequestInit & { duplex?: "half" } = {
    method,
    headers,
  };
  if (method !== "GET" && method !== "HEAD") {
    init.body = req as unknown as ReadableStream<Uint8Array>;
    init.duplex = "half";
  }
  return new Request(url, init);
}

async function toWebResponse(
  _req: IncomingMessage,
  res: ServerResponse,
  webRes: Promise<Response>,
): Promise<void> {
  let response: Response;
  try {
    response = await webRes;
  } catch (err) {
    res.writeHead(500, { "content-type": "application/json; charset=utf-8" });
    res.end(
      JSON.stringify({
        error: {
          code: "internal",
          message: `Internal server error: ${err instanceof Error ? err.message : String(err)}`,
          retryable: true,
        },
      }),
    );
    return;
  }

  // Collect Set-Cookie separately: node's writeHead flattens Headers but
  // drops duplicate set-cookie entries, which OAuth needs.
  const setCookies =
    typeof (response.headers as unknown as { getSetCookie?: () => string[] }).getSetCookie ===
    "function"
      ? (response.headers as unknown as { getSetCookie: () => string[] }).getSetCookie()
      : [];

  const headers: Record<string, string> = {};
  response.headers.forEach((value, key) => {
    if (key.toLowerCase() === "set-cookie") return;
    headers[key] = value;
  });

  res.writeHead(response.status, headers);
  if (setCookies.length > 0) res.setHeader("set-cookie", setCookies);

  if (response.status === 204 || response.status === 205) {
    res.end();
    return;
  }

  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.includes("text/event-stream") && response.body) {
    const reader = (response.body as ReadableStream<Uint8Array>).getReader();
    const pump = async () => {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        res.write(value);
      }
      res.end();
    };
    void pump().catch(() => res.destroy());
    return;
  }

  if (!response.body) {
    res.end();
    return;
  }

  const buf = Buffer.from(await response.arrayBuffer());
  res.end(buf);
}

main().catch((err) => {
  process.stderr.write(`Failed to start: ${err instanceof Error ? err.stack : String(err)}\n`);
  process.exit(1);
});
