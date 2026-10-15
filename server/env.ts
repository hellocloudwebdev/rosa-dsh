import type { ApiErrorPayload } from "../shared/types.js";

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

/** Standard security headers applied to every API response. */
export const SECURITY_HEADERS: Record<string, string> = {
  "x-content-type-options": "nosniff",
  "x-frame-options": "DENY",
  "referrer-policy": "strict-origin-when-cross-origin",
  "cross-origin-opener-policy": "same-origin",
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
  payload: ApiErrorPayload,
  extraHeaders: Record<string, string> = {},
): Response {
  const headers: Record<string, string> = { ...SECURITY_HEADERS, ...extraHeaders };
  if (payload.code === "rate-limited") {
    headers["retry-after"] = extraHeaders["retry-after"] ?? "60";
  }
  return json({ error: payload }, { status, headers });
}

export function errorFromCode(
  code: ApiErrorPayload["code"],
  message: string,
  status: number,
  extra?: Partial<ApiErrorPayload>,
): Response {
  return apiError(status, { code, message, ...extra });
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

export function clientIp(req: Request): string {
  const headers = req.headers;
  // Vercel
  const vercel = headers.get("x-vercel-forwarded-for");
  if (vercel) return vercel.split(",")[0].trim();
  // Cloudflare
  const cf = headers.get("cf-connecting-ip");
  if (cf) return cf.trim();
  const generic = headers.get("x-forwarded-for");
  if (generic) return generic.split(",")[0].trim();
  const real = headers.get("x-real-ip");
  if (real) return real.trim();
  return "unknown";
}

/** Best-effort identification of the caller for rate limiting. */
export function rateLimitSubject(req: Request, userId?: string): string {
  return userId ?? clientIp(req);
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
