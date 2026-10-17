import { SESSION_COOKIE, SESSION_TTL_MS, type ApiEnv } from "./env.js";
import type { AppDatabase } from "./db/repository.js";

/* ------------------------------------------------------------------ */
/* Session tokens                                                       */
/* ------------------------------------------------------------------ */

/**
 * Session tokens are 256 bits of randomness. Only their SHA-256 hash is
 * stored, so a database leak cannot be replayed as a live session.
 */
export async function createSessionToken(): Promise<{ token: string; tokenHash: string }> {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  const token = base64url(bytes);
  return { token, tokenHash: await sha256Hex(token) };
}

export async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Base64url-encode without padding (no `+`, `/` or `=`). */
export function base64url(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Constant-time comparison so a hash mismatch cannot be probed by timing. */
export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export interface AuthContext {
  userId: string;
  sessionTokenHash: string;
  expiresAt: number;
}

/** Base64url-decode to bytes. */
export function base64urlToBytes(base64url: string): Uint8Array {
  let base64 = base64url.replace(/-/g, "+").replace(/_/g, "/");
  while (base64.length % 4 !== 0) {
    base64 += "=";
  }
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/** Decode a JWT segment (header or payload) into a parsed JSON object. */
export function decodeJwtSection<T = Record<string, unknown>>(section: string): T | null {
  try {
    const bytes = base64urlToBytes(section);
    return JSON.parse(new TextDecoder().decode(bytes)) as T;
  } catch {
    return null;
  }
}

interface JwkRecord {
  kid: string;
  alg: string;
  kty: string;
  use?: string;
  n?: string;
  e?: string;
  [key: string]: unknown;
}

interface ClerkJwksCache {
  keys: JwkRecord[];
  fetchedAt: number;
}

let cachedJwks: ClerkJwksCache | null = null;
const JWKS_CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

/** Fetch Clerk JWKS public keys with in-memory caching and rotation support. */
export async function fetchClerkJwks(jwksUrl: string, secretKey?: string): Promise<JwkRecord[]> {
  const now = Date.now();
  if (cachedJwks && now - cachedJwks.fetchedAt < JWKS_CACHE_TTL_MS) {
    return cachedJwks.keys;
  }

  try {
    const headers: Record<string, string> = { Accept: "application/json" };
    if (secretKey) {
      headers.Authorization = `Bearer ${secretKey}`;
    }
    const res = await fetch(jwksUrl, { headers });
    if (!res.ok) return cachedJwks?.keys ?? [];
    const data = (await res.json()) as { keys?: JwkRecord[] };
    if (Array.isArray(data.keys)) {
      cachedJwks = { keys: data.keys, fetchedAt: now };
      return data.keys;
    }
  } catch {
    /* Network or fetch failure: fallback to stale cache */
  }
  return cachedJwks?.keys ?? [];
}

/**
 * Verify a Clerk session JWT with strict security:
 *  - Algorithm pinning: RS256 only (rejects 'none' and symmetric keys).
 *  - Cryptographic Web Crypto RSASSA-PKCS1-v1_5 verification against Clerk JWKS.
 *  - Expiration and clock-skew validation (60s tolerance).
 *  - Automatic user provisioning in AppDatabase (scoped to verified sub).
 */
export async function verifyClerkToken(
  token: string,
  env: ApiEnv,
  app: AppDatabase,
): Promise<AuthContext | null> {
  const parts = token.split(".");
  if (parts.length !== 3) return null;

  const [headerB64, payloadB64, sigB64] = parts;
  const header = decodeJwtSection<{ alg: string; kid?: string }>(headerB64);
  const payload = decodeJwtSection<{
    sub: string;
    exp: number;
    nbf?: number;
    iss?: string;
    email?: string;
    email_address?: string;
    name?: string;
    first_name?: string;
    last_name?: string;
    picture?: string;
    avatar_url?: string;
    [key: string]: unknown;
  }>(payloadB64);

  if (!header || !payload || typeof payload.sub !== "string" || !payload.sub) {
    return null;
  }

  // Algorithm MUST be RS256 with a known key id
  if (header.alg !== "RS256" || !header.kid) {
    return null;
  }

  // Clock validation with 60s skew allowance
  const nowSec = Math.floor(Date.now() / 1000);
  const SKEW_SEC = 60;
  if (typeof payload.exp !== "number" || payload.exp <= nowSec - SKEW_SEC) {
    return null;
  }
  if (typeof payload.nbf === "number" && payload.nbf > nowSec + SKEW_SEC) {
    return null;
  }

  // Issuer check if configured
  if (env.CLERK_ISSUER && payload.iss && !payload.iss.startsWith(env.CLERK_ISSUER)) {
    return null;
  }

  // Signature verification via Clerk JWKS
  const domain = env.CLERK_DOMAIN || "neutral-snipe-8646.clerk.accounts.dev";
  const jwksUrl =
    env.CLERK_JWKS_URL ||
    (domain ? `https://${domain}/.well-known/jwks.json` : "https://api.clerk.com/v1/jwks");

  let keys = await fetchClerkJwks(jwksUrl, env.CLERK_SECRET_KEY);
  let jwk = keys.find((k) => k.kid === header.kid);

  // If kid is not found in cache, force fresh fetch to handle key rotation
  if (!jwk) {
    cachedJwks = null;
    keys = await fetchClerkJwks(jwksUrl, env.CLERK_SECRET_KEY);
    jwk = keys.find((k) => k.kid === header.kid);
  }

  if (jwk) {
    try {
      const cryptoKey = await crypto.subtle.importKey(
        "jwk",
        jwk,
        { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
        false,
        ["verify"],
      );
      const data = new TextEncoder().encode(`${headerB64}.${payloadB64}`);
      const sigBytes = base64urlToBytes(sigB64);
      const valid = await crypto.subtle.verify(
        "RSASSA-PKCS1-v1_5",
        cryptoKey,
        sigBytes,
        data,
      );
      if (!valid) return null;
    } catch {
      return null;
    }
  } else if (env.CLERK_SECRET_KEY) {
    // Backend API verification fallback
    try {
      const verifyRes = await fetch("https://api.clerk.com/v1/tokens/verify", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${env.CLERK_SECRET_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ token }),
      });
      if (!verifyRes.ok) return null;
    } catch {
      return null;
    }
  } else {
    return null;
  }

  // Provision or sync user record into database
  const email =
    payload.email ??
    (typeof payload.email_address === "string" ? payload.email_address : null);
  const name =
    payload.name ??
    (typeof payload.first_name === "string"
      ? `${payload.first_name} ${payload.last_name ?? ""}`.trim()
      : null);
  const avatarUrl = payload.picture ?? payload.avatar_url ?? null;

  const user = await app.upsertOAuthUser({
    provider: "clerk",
    providerAccountId: payload.sub,
    email,
    name,
    avatarUrl,
  });

  return {
    userId: user.id,
    sessionTokenHash: await sha256Hex(token),
    expiresAt: payload.exp * 1000,
  };
}

function getCookieValue(cookieHeader: string, cookieName: string): string | null {
  for (const part of cookieHeader.split(";")) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    const name = part.slice(0, eq).trim();
    if (name !== cookieName) continue;
    let value = part.slice(eq + 1).trim();
    try {
      value = decodeURIComponent(value);
    } catch {
      /* keep raw */
    }
    return value;
  }
  return null;
}

/** Resolve the authenticated user for a request, or null. */
export async function authenticate(
  req: Request,
  app: AppDatabase,
  env: ApiEnv,
): Promise<AuthContext | null> {
  // 1. Primary: Clerk Bearer Token (Authorization: Bearer <clerk_token>)
  const authHeader = req.headers.get("authorization");
  if (authHeader && authHeader.toLowerCase().startsWith("bearer ")) {
    const token = authHeader.slice(7).trim();
    if (token) {
      const clerkAuth = await verifyClerkToken(token, env, app);
      if (clerkAuth) return clerkAuth;
    }
  }

  const cookieHeader = req.headers.get("cookie");
  if (cookieHeader) {
    // 2. Clerk default session cookie (__session)
    const clerkCookie = getCookieValue(cookieHeader, "__session");
    if (clerkCookie && clerkCookie.length > 20) {
      const clerkAuth = await verifyClerkToken(clerkCookie, env, app);
      if (clerkAuth) return clerkAuth;
    }

    // 3. Fallback to standard Rosa session cookie
    const token = getCookieValue(cookieHeader, SESSION_COOKIE);
    if (token && token.length >= 20) {
      const tokenHash = await sha256Hex(token);
      const resolved = await app.resolveSession(tokenHash);
      if (resolved) {
        return { userId: resolved.userId, sessionTokenHash: tokenHash, expiresAt: resolved.expiresAt };
      }
    }
  }

  return null;
}

/* ------------------------------------------------------------------ */
/* OAuth providers                                                      */
/* ------------------------------------------------------------------ */

export interface OAuthProfile {
  id: string;
  email: string | null;
  name: string | null;
  avatarUrl: string | null;
}

export interface OAuthProviderConfig {
  id: string;
  label: string;
  authorizeUrl: string;
  tokenUrl: string;
  userUrl: string;
  clientId: string;
  clientSecret: string;
  scopes: string[];
  extraAuthParams: Record<string, string>;
  parseProfile: (json: unknown) => OAuthProfile;
}

export interface OAuthDescriptor {
  id: string;
  label: string;
  configured: boolean;
}

/**
 * Describe the OAuth providers this deployment actually supports.
 * Unconfigured providers are simply absent, so the login screen never renders
 * a button that cannot succeed.
 */
export function oauthDescriptors(env: ApiEnv): OAuthDescriptor[] {
  const out: OAuthDescriptor[] = [];
  if (env.GITHUB_CLIENT_ID && env.GITHUB_CLIENT_SECRET) {
    out.push({ id: "github", label: "GitHub", configured: true });
  }
  if (env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET) {
    out.push({ id: "google", label: "Google", configured: true });
  }
  return out;
}

export function getOAuthProvider(env: ApiEnv, id: string): OAuthProviderConfig | null {
  if (id === "github" && env.GITHUB_CLIENT_ID && env.GITHUB_CLIENT_SECRET) {
    return {
      id: "github",
      label: "GitHub",
      authorizeUrl: "https://github.com/login/oauth/authorize",
      tokenUrl: "https://github.com/login/oauth/access_token",
      userUrl: "https://api.github.com/user",
      clientId: env.GITHUB_CLIENT_ID,
      clientSecret: env.GITHUB_CLIENT_SECRET,
      scopes: ["read:user", "user:email"],
      extraAuthParams: {},
      parseProfile: (json) => {
        const j = json as {
          id?: number | string;
          login?: string;
          name?: string | null;
          email?: string | null;
          avatar_url?: string | null;
        };
        return {
          id: String(j.id ?? j.login ?? ""),
          email: j.email ?? null,
          name: j.name ?? j.login ?? null,
          avatarUrl: j.avatar_url ?? null,
        };
      },
    };
  }

  if (id === "google" && env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET) {
    return {
      id: "google",
      label: "Google",
      authorizeUrl: "https://accounts.google.com/o/oauth2/v2/auth",
      tokenUrl: "https://oauth2.googleapis.com/token",
      userUrl: "https://openidconnect.googleapis.com/v1/userinfo",
      clientId: env.GOOGLE_CLIENT_ID,
      clientSecret: env.GOOGLE_CLIENT_SECRET,
      scopes: ["openid", "email", "profile"],
      extraAuthParams: { access_type: "online", prompt: "select_account" },
      parseProfile: (json) => {
        const j = json as {
          sub?: string;
          email?: string | null;
          name?: string | null;
          picture?: string | null;
        };
        return {
          id: String(j.sub ?? ""),
          email: j.email ?? null,
          name: j.name ?? null,
          avatarUrl: j.picture ?? null,
        };
      },
    };
  }

  return null;
}

/**
 * A PKCE verifier and its S256 challenge.
 *
 * GitHub's OAuth apps do not support PKCE, but Google's do, and sending S256
 * costs nothing for providers that ignore it. The previous implementation used
 * `code_challenge_method=plain` with the verifier itself as the challenge, which
 * provides no protection at all: the value in the authorisation URL *is* the
 * value used to redeem the code, so anyone who can read one can replay it.
 *
 * S256 stores only the SHA-256 of the verifier with the authorization server, so
 * an intercepted challenge cannot be turned back into the verifier that redeems
 * the authorization code.
 */
export async function createPkcePair(): Promise<{ verifier: string; challenge: string }> {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  const verifier = base64url(bytes);
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return { verifier, challenge: base64url(new Uint8Array(digest)) };
}

/** Build the provider's authorisation URL with a single-use state. */
export function buildAuthorizeUrl(
  provider: OAuthProviderConfig,
  args: { redirectUri: string; state: string; codeChallenge?: string },
): string {
  const url = new URL(provider.authorizeUrl);
  url.searchParams.set("client_id", provider.clientId);
  url.searchParams.set("redirect_uri", args.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", provider.scopes.join(" "));
  url.searchParams.set("state", args.state);
  for (const [k, v] of Object.entries(provider.extraAuthParams)) {
    url.searchParams.set(k, v);
  }
  if (args.codeChallenge) {
    url.searchParams.set("code_challenge", args.codeChallenge);
    url.searchParams.set("code_challenge_method", "S256");
  }
  return url.toString();
}

export { SESSION_TTL_MS };
