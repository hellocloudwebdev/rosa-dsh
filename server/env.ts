import type { ApiErrorPayload, FailureCode } from "../shared/types.js";

/**
 * Environment the API layer reads. All values are optional so the same code
 * runs in dev (process.env), on Vercel (an injected env object) and on
 * Cloudflare Pages Functions (a Worker binding object).
 */
export interface ApiEnv {
  ROSA_SESSION_SECRET?: string;
  ROSA_ENCRYPTION_KEY?: string;
  ROSA_PUBLIC_APP_URL?: string;
  GITHUB_CLIENT_ID?: string;
  GITHUB_CLIENT_SECRET?: string;
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  /** "/api" on Vercel, "/" when the Worker owns everything. */
  ROSA_API_PREFIX?: string;
  /** "on" when localhost Base URLs should be accepted. */
  ROSA_ALLOW_LOCAL_HTTP?: string;
  NODE_ENV?: string;
  ROSA_DEV_MODE?: string;

  /* ---- Clerk Authentication (Security Priority) ---- */
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
  VITE_SUPABASE_URL?: string;
  VITE_SUPABASE_ANON_KEY?: string;

  /* ---- Storage: resolved by server/db/factory.ts ---- */
  /** libsql/Turso endpoint (https or libsql scheme). */
  DATABASE_URL?: string;
  /** Bearer token for the libsql endpoint, when required. */
  DATABASE_AUTH_TOKEN?: string;
  /** Cloudflare account id, for D1 over the HTTP API. */
  CLOUDFLARE_ACCOUNT_ID?: string;
  /** D1 database id, for D1 over the HTTP API. */
  CLOUDFLARE_D1_DATABASE_ID?: string;
  /** Cloudflare API token with D1 Edit permission. */
  CLOUDFLARE_API_TOKEN?: string;
  /** Override the Cloudflare API base (tests / enterprise gateways). */
  CLOUDFLARE_API_BASE_URL?: string;
  /** SQLite file for local Node hosting. */
  ROSA_DB_PATH?: string;
  /** Apply pending migrations automatically on cold start (default: on). */
  ROSA_AUTO_MIGRATE?: string;

  [key: string]: string | undefined;
}

let cachedProcessEnv: ApiEnv | null | undefined;

function readProcessEnv(): ApiEnv | null {
  if (cachedProcessEnv !== undefined) return cachedProcessEnv;
  try {
    const p = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process;
    cachedProcessEnv = p?.env ? (p.env as ApiEnv) : null;
  } catch {
    cachedProcessEnv = null;
  }
  return cachedProcessEnv;
}

/**
 * Resolve configuration from an explicit env object (Workers/Vercel) falling
 * back to process.env (Node dev server).
 */
export function getEnv(provided?: ApiEnv): ApiEnv {
  if (provided) return provided;
  return readProcessEnv() ?? {};
}

export function getSessionSecret(env: ApiEnv): string {
  const secret = env.ROSA_SESSION_SECRET;
  if (secret && secret.length >= 32) return secret;
  // In development we generate an ephemeral secret so the app still runs, and
  // warn loudly that sessions will not survive a restart.
  if (env.ROSA_DEV_MODE === "1" || env.NODE_ENV !== "production") {
    return "dev-only-insecure-session-secret-change-me";
  }
  throw new Error(
    "ROSA_SESSION_SECRET is not set. Generate one with `rosa-server keys` and add it to your deployment environment.",
  );
}

export function isProduction(env: ApiEnv): boolean {
  return env.NODE_ENV === "production" || env.ROSA_DEV_MODE === "0";
}

export function allowLocalHttp(env: ApiEnv): boolean {
  return env.ROSA_ALLOW_LOCAL_HTTP === "1";
}

export const SESSION_COOKIE = "rosa_session";
export const OAUTH_STATE_COOKIE = "rosa_oauth_state";
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

/* ------------------------------------------------------------------ */
/* HTTP helpers                                                        */
/* ------------------------------------------------------------------ */

/**
 * Standard security headers applied to every API response.
 *
 * This is the single source of truth: `securityHeaderObject()` in `api.ts` reads
 * from it too, so an SSE stream or an OAuth redirect cannot silently receive a
 * weaker set than a JSON response. A divergence like that is invisible until
 * someone audits header-by-header, which is exactly how the previous split was
 * found.
 */
export const SECURITY_HEADERS: Record<string, string> = {
  "x-content-type-options": "nosniff",
  "x-frame-options": "DENY",
  "referrer-policy": "strict-origin-when-cross-origin",
  "cross-origin-opener-policy": "same-origin",
  "permissions-policy": "camera=(), microphone=(), geolocation=()",
  // Two years, subdomains included. Vercel terminates TLS for the app, so this
  // is the header that keeps a first request from being downgraded.
  "strict-transport-security": "max-age=63072000; includeSubDomains",
  /**
   * The API only ever returns JSON or SSE, never HTML, so the strictest policy
   * is also the correct one: deny everything, including framing and form
   * submission. `frame-ancestors 'none'` is the modern `x-frame-options`.
   */
  "content-security-policy":
    "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
};

/**
 * Content-Security-Policy for the HTML document and its assets.
 *
 * Deliberately separate from `SECURITY_HEADERS`, because the API serves JSON and
 * SSE while this serves a real page, and one policy cannot be correct for both.
 *
 * `style-src` must allow `'unsafe-inline'` for style *attributes*: React sets
 * them directly in three places (the sidebar width custom property, the
 * login-screen gradient and the message animation delay). Those cannot be
 * nonce-protected — a nonce covers `<style>` elements, not `style=""`. Everything
 * else is locked to our own origin, and there is no `unsafe-eval`, so an injected
 * script has no way to execute.
 */
export const HTML_CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self'",
  // The browser talks only to this origin: the API and its SSE streams.
  "connect-src 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join("; ");

/** Security headers for HTML/static asset responses. */
export const HTML_SECURITY_HEADERS: Record<string, string> = {
  "x-content-type-options": "nosniff",
  "x-frame-options": "DENY",
  "referrer-policy": "strict-origin-when-cross-origin",
  "strict-transport-security": "max-age=63072000; includeSubDomains",
  "content-security-policy": HTML_CSP,
  "permissions-policy": "camera=(), microphone=(), geolocation=()",
};

export function json(body: unknown, init: ResponseInit = {}): Response {
  const headers = new Headers(init.headers);
  if (!headers.has("content-type")) headers.set("content-type", "application/json; charset=utf-8");
  for (const [k, v] of Object.entries(SECURITY_HEADERS)) headers.set(k, v);
  return new Response(JSON.stringify(body), { ...init, headers });
}

export function apiError(
  status: number,
  payload: { code: FailureCode | string; message: string } & Partial<ApiErrorPayload>,
  extraHeaders: Record<string, string> = {},
): Response {
  const headers: Record<string, string> = { ...SECURITY_HEADERS, ...extraHeaders };
  if (payload.code === "rate-limited") {
    headers["retry-after"] = extraHeaders["retry-after"] ?? "60";
  }
  return json({ error: payload }, { status, headers });
}

export function errorFromCode(
  code: FailureCode | string,
  message: string,
  status: number,
  extra?: Partial<ApiErrorPayload>,
): Response {
  return apiError(status, { code: code as FailureCode, message, ...extra });
}

/* ------------------------------------------------------------------ */
/* Cookies                                                             */
/* ------------------------------------------------------------------ */

export interface CookieOptions {
  httpOnly: boolean;
  secure: boolean;
  sameSite: "strict" | "lax" | "none";
  path: string;
  maxAge?: number;
  domain?: string;
}

export function cookieHeader(name: string, value: string, opts: CookieOptions): string {
  const parts = [`${name}=${value}`];
  if (opts.maxAge !== undefined) parts.push(`Max-Age=${Math.floor(opts.maxAge / 1000)}`);
  parts.push(`Path=${opts.path}`);
  if (opts.domain) parts.push(`Domain=${opts.domain}`);
  if (opts.httpOnly) parts.push("HttpOnly");
  if (opts.secure) parts.push("Secure");
  parts.push(`SameSite=${opts.sameSite === "none" ? "None" : capitalize(opts.sameSite)}`);
  return parts.join("; ");
}

export function clearCookieHeader(name: string, opts: Partial<CookieOptions> = {}): string {
  return cookieHeader(name, "", {
    httpOnly: opts.httpOnly ?? true,
    secure: opts.secure ?? true,
    sameSite: opts.sameSite ?? "lax",
    path: opts.path ?? "/",
    maxAge: 0,
  });
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Parse the Cookie header into a plain object. */
export function parseCookies(header: string | null): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(";")) {
    const idx = part.indexOf("=");
    if (idx === -1) continue;
    const name = part.slice(0, idx).trim();
    const value = part.slice(idx + 1).trim();
    if (!name) continue;
    try {
      out[name] = decodeURIComponent(value);
    } catch {
      out[name] = value;
    }
  }
  return out;
}

/** Options for the session cookie, honouring the production flag. */
export function sessionCookieOptions(env: ApiEnv, maxAgeMs: number): CookieOptions {
  const prod = isProduction(env);
  return {
    httpOnly: true,
    // Secure everywhere except plain-http localhost development.
    secure: prod || env.ROSA_PUBLIC_APP_URL?.startsWith("https://") === true,
    sameSite: "lax", // "lax" survives the OAuth redirect; "strict" would not.
    path: "/",
    maxAge: maxAgeMs,
  };
}

/* ------------------------------------------------------------------ */
/* Client IP                                                           */
/* ------------------------------------------------------------------ */

/**
 * Trustworthy client IP, if the platform gives us one.
 *
 * `x-vercel-forwarded-for` and `cf-connecting-ip` are set by the platform itself
 * and a client cannot forge them, because the edge overwrites the header before
 * the function runs. They are preferred for that reason.
 *
 * The generic `x-forwarded-for` / `x-real-ip` fallbacks are *client-supplied* on
 * any deployment that is not sitting behind a proxy that rewrites them. They are
 * still read, because the local dev server and self-hosted reverse proxies rely
 * on them, but the result is marked untrusted so callers do not use a
 * forgeable value as a security boundary.
 */
export interface ClientIp {
  ip: string;
  /** False when the value came from a header a client can set freely. */
  trusted: boolean;
}

export function clientIpInfo(req: Request): ClientIp {
  const headers = req.headers;
  const vercel = headers.get("x-vercel-forwarded-for");
  if (vercel) return { ip: vercel.split(",")[0].trim(), trusted: true };
  const cf = headers.get("cf-connecting-ip");
  if (cf) return { ip: cf.trim(), trusted: true };
  const generic = headers.get("x-forwarded-for");
  if (generic) return { ip: generic.split(",")[0].trim(), trusted: false };
  const real = headers.get("x-real-ip");
  if (real) return { ip: real.trim(), trusted: false };
  return { ip: "unknown", trusted: false };
}

export function clientIp(req: Request): string {
  return clientIpInfo(req).ip;
}

/**
 * Best-effort identification of the caller for rate limiting.
 *
 * A signed-in user is keyed by id, which cannot be forged. Requests with no
 * session fall back to the IP, and when that IP is untrusted the caller is
 * bucketed by the *untrusted* marker rather than by the claimed address — one
 * shared bucket is a weaker control, but keying on a client-controlled string
 * would let an attacker mint a fresh bucket per request and bypass the limit
 * entirely.
 */
export function rateLimitSubject(req: Request, userId?: string): string {
  if (userId) return userId;
  const { ip, trusted } = clientIpInfo(req);
  return trusted ? ip : "untrusted";
}

/** CORS headers. Same-origin by default; opt into specific origins via env. */
export function corsHeaders(env: ApiEnv, req: Request): Record<string, string> {
  const allowed = (env.ROSA_CORS_ORIGINS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  const origin = req.headers.get("origin");
  if (allowed.length === 0) {
    // No configured origins: same-origin only, which needs no CORS headers.
    return origin ? { vary: "Origin" } : {};
  }
  if (origin && allowed.includes(origin)) {
    return {
      "access-control-allow-origin": origin,
      "access-control-allow-credentials": "true",
      "access-control-allow-methods": "GET,POST,PATCH,DELETE,OPTIONS",
      "access-control-allow-headers": "content-type,authorization",
      "access-control-max-age": "600",
      vary: "Origin",
    };
  }
  return {};
}
