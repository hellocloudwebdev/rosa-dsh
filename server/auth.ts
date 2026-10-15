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

/** Resolve the authenticated user for a request, or null. */
export async function authenticate(
  req: Request,
  app: AppDatabase,
  _env: ApiEnv,
): Promise<AuthContext | null> {
  const cookieHeader = req.headers.get("cookie");
  if (!cookieHeader) return null;

  let token: string | null = null;
  for (const part of cookieHeader.split(";")) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    const name = part.slice(0, eq).trim();
    if (name !== SESSION_COOKIE) continue;
    let value = part.slice(eq + 1).trim();
    try {
      value = decodeURIComponent(value);
    } catch {
      /* keep raw */
    }
    token = value;
    break;
  }

  if (!token || token.length < 20) return null;

  const tokenHash = await sha256Hex(token);
  const resolved = await app.resolveSession(tokenHash);
  if (!resolved) return null;

  return { userId: resolved.userId, sessionTokenHash: tokenHash, expiresAt: resolved.expiresAt };
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

/** Build the provider's authorisation URL with a single-use state. */
export function buildAuthorizeUrl(
  provider: OAuthProviderConfig,
  args: { redirectUri: string; state: string; codeVerifier?: string },
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
  if (args.codeVerifier) {
    // PKCE is implemented for providers that support it.
    url.searchParams.set("code_challenge", args.codeVerifier);
    url.searchParams.set("code_challenge_method", "plain");
  }
  return url.toString();
}

export { SESSION_TTL_MS };
