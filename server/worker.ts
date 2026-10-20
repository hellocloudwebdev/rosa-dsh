import { handleApiRequest, type ApiDeps } from "./api.js";
import { AppDatabase } from "./db/repository.js";
import { D1Driver, type D1Like } from "./db/d1.js";
import { applyMigrations } from "./db/factory.js";
import type { SqlDriver } from "./db/driver.js";
import type { ApiEnv } from "./env.js";

/**
 * Cloudflare Worker entry point.
 *
 * Deployed with `wrangler deploy` (see wrangler.jsonc): the Worker serves both
 * `/api/*` from Rosa's unified router and the built SPA from the `ASSETS`
 * binding, so a single free-tier Worker is the whole application.
 *
 * Supports Cloudflare D1 and Supabase PostgreSQL with Clerk authentication.
 */

export interface WorkerEnv {
  rosa_db?: D1Like;
  ASSETS?: { fetch: (request: Request) => Promise<Response> };
  ROSA_SESSION_SECRET?: string;
  ROSA_ENCRYPTION_KEY?: string;
  ROSA_PUBLIC_APP_URL?: string;
  GITHUB_CLIENT_ID?: string;
  GITHUB_CLIENT_SECRET?: string;
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  ROSA_API_PREFIX?: string;
  ROSA_ALLOW_LOCAL_HTTP?: string;
  NODE_ENV?: string;
  ROSA_DEV_MODE?: string;
  ROSA_AUTO_MIGRATE?: string;

  /* ---- Clerk Authentication ---- */
  CLERK_PUBLISHABLE_KEY?: string;
  CLERK_SECRET_KEY?: string;
  CLERK_JWKS_URL?: string;
  CLERK_DOMAIN?: string;
  CLERK_ISSUER?: string;

  /* ---- Supabase Storage ---- */
  SUPABASE_URL?: string;
  SUPABASE_ANON_KEY?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
  SUPABASE_DB_URL?: string;
  DATABASE_URL?: string;

  [key: string]: unknown;
}

/** Per-isolate migration guard. Reset whenever the isolate is recycled. */
let migrationsReady: Promise<void> | null = null;

function ensureSchema(driver: D1Driver, env: WorkerEnv): Promise<void> {
  if (env.ROSA_AUTO_MIGRATE === "0") return Promise.resolve();
  if (!migrationsReady) {
    migrationsReady = applyMigrations(driver).then(
      () => undefined,
      (err) => {
        // Let the next request retry rather than caching a broken schema.
        migrationsReady = null;
        throw err;
      },
    );
  }
  return migrationsReady;
}

function jsonError(status: number, message: string, detail?: string): Response {
  return new Response(
    JSON.stringify({
      error: { code: "server-error", message, detail, retryable: false },
    }),
    {
      status,
      headers: {
        "content-type": "application/json; charset=utf-8",
        "x-content-type-options": "nosniff",
      },
    },
  );
}

function withSecurityHeaders(response: Response): Response {
  const headers = new Headers(response.headers);
  headers.set("x-content-type-options", "nosniff");
  headers.set("x-frame-options", "DENY");
  headers.set("referrer-policy", "strict-origin-when-cross-origin");
  headers.set("strict-transport-security", "max-age=31536000; includeSubDomains; preload");
  headers.set("permissions-policy", "camera=(), microphone=(), geolocation=()");

  if (!headers.has("content-security-policy")) {
    headers.set(
      "content-security-policy",
      "default-src 'self'; script-src 'self' 'unsafe-inline' https://*.clerk.com https://*.clerk.accounts.dev; connect-src 'self' https://*.clerk.com https://*.clerk.accounts.dev https://*.neon.tech https://*.aws.neon.tech https://*.supabase.co https://*.pooler.supabase.com https://api.openai.com https://api.anthropic.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com data:; img-src 'self' data: https://*.clerk.com https://img.clerk.com https://*.githubusercontent.com https://*.googleusercontent.com; frame-src 'self' https://*.clerk.com https://*.clerk.accounts.dev;",
    );
  }

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export default {
  async fetch(request: Request, env: WorkerEnv): Promise<Response> {
    const url = new URL(request.url);

    // Route /api/* to Rosa's unified API router.
    if (url.pathname.startsWith("/api")) {
      let driver: SqlDriver;

      // 1. Neon / Lakebase Postgres / Supabase over HTTP
      if (
        env.DATABASE_URL ||
        env.SUPABASE_DB_URL
      ) {
        const { NeonDriver } = await import("./db/neon.js");
        driver = new NeonDriver({
          connectionString: (env.DATABASE_URL || env.SUPABASE_DB_URL) as string,
        });
      } else if (env.rosa_db) {
        // 2. Cloudflare D1
        const d1Driver = new D1Driver(env.rosa_db);
        try {
          await ensureSchema(d1Driver, env);
        } catch (err) {
          return withSecurityHeaders(
            jsonError(
              503,
              "The Rosa database schema could not be initialised.",
              err instanceof Error ? err.message : String(err),
            ),
          );
        }
        driver = d1Driver;
      } else {
        return withSecurityHeaders(
          jsonError(
            503,
            "The Rosa API is not bound to a database.",
            "Add a D1 binding named `rosa_db` in wrangler.jsonc or set SUPABASE_DB_URL / DATABASE_URL, then redeploy.",
          ),
        );
      }

      const app = new AppDatabase(driver, env.ROSA_ENCRYPTION_KEY ?? null);
      const apiEnv: ApiEnv = {
        ...(env as unknown as ApiEnv),
        ROSA_API_PREFIX: "/api",
      };
      const deps: ApiDeps = {
        app,
        env: apiEnv,
      };
      const response = await handleApiRequest(request, deps);
      return withSecurityHeaders(response);
    }

    // Serve static frontend assets from the Vite build.
    if (env.ASSETS) {
      const asset = await env.ASSETS.fetch(request);
      // SPA fallback: unknown non-API paths render the app shell so deep
      // links work on refresh, instead of returning a bare 404.
      if (asset.status === 404 && (request.method === "GET" || request.method === "HEAD")) {
        if (!url.pathname.includes(".")) {
          const fallback = await env.ASSETS.fetch(new Request(new URL("/index.html", url), request));
          return withSecurityHeaders(fallback);
        }
      }
      return withSecurityHeaders(asset);
    }

    return withSecurityHeaders(new Response("Not found", { status: 404 }));
  },
};

/** Exported for tests. */
export const __test = { ensureSchema };
