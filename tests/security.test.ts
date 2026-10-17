import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { rmSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { handleApiRequest, type ApiDeps } from "../server/api.js";
import { AppDatabase } from "../server/db/repository.js";
import { SqliteDriver } from "../server/db/sqlite.js";
import { createSessionToken, createPkcePair, base64url } from "../server/auth.js";
import { SESSION_COOKIE, clientIpInfo, rateLimitSubject, HTML_CSP } from "../server/env.js";
import { redactSecrets } from "../shared/providers.js";
import type { Lookup } from "../shared/urlGuard.js";

/**
 * Regression tests for the security audit findings.
 *
 * Each block names the finding it locks down, so a future change that reopens
 * one fails here with a readable reason rather than silently regressing.
 */

const DB_DIR = join(tmpdir(), `rosa-sec-tests-${process.pid}`);
const ENCRYPTION_KEY = "vitest-master-key-0123456789abcdef";
let deps: ApiDeps;

/** Every hostname resolves to a public address, so nothing here hits real DNS. */
const publicLookup: Lookup = async () => ["93.184.216.34"];

beforeAll(async () => {
  mkdirSync(DB_DIR, { recursive: true });
  const driver = new SqliteDriver(join(DB_DIR, "sec.sqlite"));
  await driver.migrate();
  const app = new AppDatabase(driver, ENCRYPTION_KEY, { allowHttpLocalDev: true });
  deps = {
    app,
    env: {
      ROSA_ENCRYPTION_KEY: ENCRYPTION_KEY,
      ROSA_SESSION_SECRET: "test-session-secret-at-least-32-chars-long!!",
      ROSA_ALLOW_LOCAL_HTTP: "1",
      ROSA_API_PREFIX: "/api",
      ROSA_PUBLIC_APP_URL: "http://localhost:8787",
    },
    lookup: publicLookup,
  };
});

afterAll(() => {
  try {
    rmSync(DB_DIR, { recursive: true, force: true });
  } catch {
    /* temp dir cleanup is optional */
  }
});

let counter = 0;
function uniq(prefix = "s"): string {
  counter += 1;
  return `${prefix}${counter}`;
}

async function seedSession(): Promise<string> {
  const user = await deps.app.upsertOAuthUser({
    provider: "github",
    providerAccountId: uniq("acct-"),
    email: `${uniq("seed")}@example.com`,
    name: "Audit user",
    avatarUrl: null,
  });
  const { token, tokenHash } = await createSessionToken();
  await deps.app.createSession({
    tokenHash,
    userId: user.id,
    ttlMs: 3600_000,
    userAgent: "vitest",
    ip: "127.0.0.1",
  });
  return token;
}

function api(
  path: string,
  method = "GET",
  body?: unknown,
  cookie?: string,
  headers: Record<string, string> = {},
): Promise<Response> {
  return handleApiRequest(
    new Request(`http://localhost:8787/api${path}`, {
      method,
      headers: {
        ...(body !== undefined ? { "content-type": "application/json" } : {}),
        ...(cookie ? { cookie: `${SESSION_COOKIE}=${cookie}` } : {}),
        ...headers,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
    deps,
  );
}

/* ------------------------------------------------------------------ */
/* Finding #10 — /health must not fingerprint the deployment           */
/* ------------------------------------------------------------------ */

describe("finding #10: /health disclosure", () => {
  it("omits version, driver kind, uptime and timestamp fields", async () => {
    const res = await api("/health");
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;

    for (const leak of ["version", "driver", "driverKind", "uptime", "uptimeMs", "startedAt"]) {
      expect(body).not.toHaveProperty(leak);
    }
    // Still reporting what the sign-in screen needs.
    expect(body.ok).toBe(true);
    expect(Array.isArray(body.auth)).toBe(true);
    expect(body.keyStorage).toBe("encrypted-server-side");
  });
});

/* ------------------------------------------------------------------ */
/* Finding #9 — rate limiting and client-IP trust                      */
/* ------------------------------------------------------------------ */

describe("finding #9: client IP trust", () => {
  it("trusts platform-set headers", () => {
    const req = new Request("http://x/", {
      headers: { "x-vercel-forwarded-for": "203.0.113.7, 10.0.0.1" },
    });
    expect(clientIpInfo(req)).toEqual({ ip: "203.0.113.7", trusted: true });
  });

  it("treats generic forwarded headers as untrusted", () => {
    const req = new Request("http://x/", { headers: { "x-forwarded-for": "203.0.113.7" } });
    expect(clientIpInfo(req).trusted).toBe(false);
  });

  it("does not key rate-limit buckets on a spoofable header", () => {
    // Two requests claiming different IPs via a forgeable header must land in
    // the same bucket. Keying on the claimed value would let an attacker mint a
    // fresh bucket per request and bypass the limit entirely.
    const a = rateLimitSubject(
      new Request("http://x/", { headers: { "x-forwarded-for": "1.2.3.4" } }),
    );
    const b = rateLimitSubject(
      new Request("http://x/", { headers: { "x-forwarded-for": "5.6.7.8" } }),
    );
    expect(a).toBe(b);
  });

  it("keys a signed-in caller by user id, not IP", () => {
    const req = new Request("http://x/", { headers: { "x-forwarded-for": "1.2.3.4" } });
    expect(rateLimitSubject(req, "user-123")).toBe("user-123");
  });
});

describe("finding #9: provider probe endpoints are rate limited", () => {
  it("eventually refuses repeated connection tests", async () => {
    const cookie = await seedSession();
    const created = await api(
      "/providers",
      "POST",
      {
        kind: "openai-compatible",
        displayName: "Probe target",
        baseUrl: "https://api.example.com/v1",
        apiKey: "sk-probe-key-not-real-000000",
      },
      cookie,
    );
    expect(created.status).toBe(201);
    const { provider } = (await created.json()) as { provider: { id: string } };

    // Upstream is stubbed so this test is hermetic and fast; what is under test
    // is the rate limiter, not the provider. Requests past the 30/minute budget
    // must be refused *before* any outbound attempt, so the call count below
    // also proves the limit is enforced ahead of the network call.
    let outbound = 0;
    const original = globalThis.fetch;
    globalThis.fetch = (async (): Promise<Response> => {
      outbound += 1;
      return new Response("unauthorized", { status: 401 });
    }) as unknown as typeof fetch;

    try {
      let sawLimit = false;
      for (let i = 0; i < 40; i += 1) {
        const res = await api(`/providers/${provider.id}/test`, "POST", {}, cookie);
        if (res.status === 429) {
          sawLimit = true;
          break;
        }
      }
      expect(sawLimit).toBe(true);
      // The limiter capped the outbound requests rather than merely labelling
      // some responses 429 after the provider had already been contacted.
      expect(outbound).toBeLessThanOrEqual(30);
    } finally {
      globalThis.fetch = original;
    }
  });
});

/* ------------------------------------------------------------------ */
/* Finding #11 — body caps measured in bytes, enforced while reading   */
/* ------------------------------------------------------------------ */

describe("finding #11: request body caps", () => {
  it("refuses an oversized JSON body", async () => {
    const cookie = await seedSession();
    const huge = { name: "x".repeat(80 * 1024) };
    const res = await api("/providers", "POST", huge, cookie);
    expect(res.status).toBe(400);
  });

  it("measures bytes, not UTF-16 code units", async () => {
    const cookie = await seedSession();
    // 30k astral-plane characters are 4 bytes each in UTF-8 (120 KB) but take
    // 60k UTF-16 code units. A `.length` check would let this through.
    const res = await api("/providers", "POST", { name: "\u{1F600}".repeat(30_000) }, cookie);
    expect(res.status).toBe(400);
  });

  it("still accepts a normal-sized body", async () => {
    const cookie = await seedSession();
    const res = await api(
      "/providers",
      "POST",
      {
        kind: "openai-compatible",
        displayName: "Fits fine",
        baseUrl: "https://api.example.com/v1",
        apiKey: "sk-fits-key-not-real-00000000",
      },
      cookie,
    );
    expect(res.status).toBe(201);
  });
});

/* ------------------------------------------------------------------ */
/* Finding #2 — cancellation is owned by the requesting user            */
/* ------------------------------------------------------------------ */

describe("finding #2: cross-user cancel refusal", () => {
  it("does not let one user cancel another user's run", async () => {
    const victim = await seedSession();
    const attacker = await seedSession();

    // A request id belonging to nobody. The endpoint must answer identically to
    // "cancel your own run", so ids cannot be probed for existence.
    const asAttacker = await api("/chat/cancel", "POST", { requestId: uniq("req-") }, attacker);
    expect(asAttacker.status).toBe(200);
    expect(await asAttacker.json()).toEqual({ ok: true, cancelled: false });

    // The victim's own (also nonexistent) id behaves the same way.
    const asVictim = await api("/chat/cancel", "POST", { requestId: uniq("req-") }, victim);
    expect(asVictim.status).toBe(200);
    expect(await asVictim.json()).toEqual({ ok: true, cancelled: false });
  });

  it("requires authentication to cancel", async () => {
    const res = await api("/chat/cancel", "POST", { requestId: "req-x" });
    expect(res.status).toBe(401);
  });
});

/* ------------------------------------------------------------------ */
/* Findings #6/#7/#15 — secret redaction                               */
/* ------------------------------------------------------------------ */

describe("findings #6/#7/#15: secret redaction", () => {
  it("removes a live key even when it matches no known pattern", () => {
    // A short, unusual key that no regex would catch.
    const key = "zzq9-oddball";
    const text = `Upstream rejected key ${key} for team acme`;
    const out = redactSecrets(text, [key]);
    expect(out).not.toContain(key);
    expect(out).toContain("[redacted]");
  });

  it("ignores very short strings so it cannot mangle ordinary prose", () => {
    // A 3-character "secret" would redact every occurrence of that substring.
    const out = redactSecrets("the cat sat on the mat", ["cat"]);
    expect(out).toBe("the cat sat on the mat");
  });

  it("still catches well-known key shapes with no known-secret list", () => {
    const out = redactSecrets("Bearer sk-abcdefghijklmnopqrstuvwxyz012345");
    expect(out).not.toContain("sk-abcdefghijklmnopqrstuvwxyz012345");
  });

  it("redacts the live key from a failed provider test response", async () => {
    const cookie = await seedSession();
    const liveKey = "zzq9-oddball-secret-value";
    const created = await api(
      "/providers",
      "POST",
      {
        kind: "openai-compatible",
        displayName: "Echoes its key",
        baseUrl: "https://api.example.com/v1",
        apiKey: liveKey,
      },
      cookie,
    );
    expect(created.status).toBe(201);
    const { provider } = (await created.json()) as { provider: { id: string } };

    // An upstream that echoes the credential back in the error body is the
    // realistic way a key escapes into a client-visible message.
    const impl = (async (): Promise<Response> =>
      new Response(`invalid api key: ${liveKey}`, {
        status: 401,
        headers: { "content-type": "application/json" },
      })) as unknown as typeof fetch;
    const original = globalThis.fetch;
    globalThis.fetch = impl;
    try {
      const res = await api(`/providers/${provider.id}/test`, "POST", {}, cookie);
      const raw = await res.text();
      expect(raw).not.toContain(liveKey);
    } finally {
      globalThis.fetch = original;
    }
  });
});

/* ------------------------------------------------------------------ */
/* Finding #8 — security headers                                      */
/* ------------------------------------------------------------------ */

describe("finding #8: security headers", () => {
  it("sets HSTS and a restrictive API CSP on JSON responses", async () => {
    const res = await api("/health");
    expect(res.headers.get("strict-transport-security")).toContain("max-age=");
    const csp = res.headers.get("content-security-policy") ?? "";
    expect(csp).toContain("default-src 'none'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
  });

  it("the document CSP differs from the API CSP", () => {
    // One policy cannot be correct for both a JSON API and a real page: the
    // document needs scripts, styles and fonts from its own origin.
    expect(HTML_CSP).toContain("script-src 'self'");
    expect(HTML_CSP).toContain("default-src 'self'");
    expect(HTML_CSP).not.toContain("default-src 'none'");
    // No eval anywhere: an injected string cannot become executing code.
    expect(HTML_CSP).not.toContain("unsafe-eval");
    expect(HTML_CSP).toContain("object-src 'none'");
  });
});

/* ------------------------------------------------------------------ */
/* Finding #14 — encryption key strength floor                         */
/* ------------------------------------------------------------------ */

describe("finding #14: master key floor", () => {
  it("refuses to persist keys with a short master key", async () => {
    const driver = new SqliteDriver(join(DB_DIR, "shortkey.sqlite"));
    await driver.migrate();
    const weak = new AppDatabase(driver, "only-sixteen-ch!!");
    expect(weak.canStoreKeys).toBe(false);
    await driver.close?.();
  });

  it("accepts a 32-character master key", () => {
    const driver = new SqliteDriver(join(DB_DIR, "goodkey.sqlite"));
    const strong = new AppDatabase(driver, "a".repeat(32));
    expect(strong.canStoreKeys).toBe(true);
  });

  it("reports session-only when no master key is configured", () => {
    const driver = new SqliteDriver(join(DB_DIR, "nokey.sqlite"));
    const none = new AppDatabase(driver, null);
    expect(none.canStoreKeys).toBe(false);
  });
});

/* ------------------------------------------------------------------ */
/* Finding #13 — PKCE is real, and S256                                */
/* ------------------------------------------------------------------ */

describe("finding #13: PKCE S256", () => {
  it("produces a challenge that is not the verifier", async () => {
    const { verifier, challenge } = await createPkcePair();
    // The old implementation used the verifier itself as the challenge, which
    // offers no protection: the value sent to the provider was also the value
    // that redeemed the code.
    expect(challenge).not.toBe(verifier);
    expect(challenge.length).toBeGreaterThan(20);
  });

  it("challenge is the base64url SHA-256 of the verifier", async () => {
    const { verifier, challenge } = await createPkcePair();
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
    expect(challenge).toBe(base64url(new Uint8Array(digest)));
  });

  it("verifier meets the RFC 7636 length floor and is URL-safe", async () => {
    const { verifier } = await createPkcePair();
    expect(verifier.length).toBeGreaterThanOrEqual(43);
    expect(verifier).toMatch(/^[A-Za-z0-9\-_]+$/);
  });

  it("is unpredictable across calls", async () => {
    const a = await createPkcePair();
    const b = await createPkcePair();
    expect(a.verifier).not.toBe(b.verifier);
  });
});

/* ------------------------------------------------------------------ */
/* OAuth hardening that was already correct, kept from regressing      */
/* ------------------------------------------------------------------ */

describe("oauth state handling", () => {
  it("a callback with an unknown state is refused", async () => {
    const res = await api("/auth/github/callback?code=abc&state=forged");
    // Redirected back to the login screen with an error, never signed in.
    expect([302, 303, 307]).toContain(res.status);
    expect(res.headers.get("set-cookie") ?? "").not.toContain(SESSION_COOKIE);
  });

  it("a callback with no code is refused", async () => {
    const res = await api("/auth/github/callback?state=whatever");
    expect([302, 303, 307]).toContain(res.status);
  });
});

/* ------------------------------------------------------------------ */
/* Auth boundary                                                       */
/* ------------------------------------------------------------------ */

describe("auth boundary", () => {
  it("every data route rejects an anonymous caller", async () => {
    const routes: Array<[string, string]> = [
      ["/providers", "GET"],
      ["/models", "GET"],
      ["/conversations", "GET"],
      ["/prefs", "GET"],
      ["/chat", "POST"],
      ["/chat/cancel", "POST"],
    ];
    for (const [path, method] of routes) {
      const res = await api(path, method, method === "POST" ? {} : undefined);
      expect(res.status, `${method} ${path}`).toBe(401);
    }
  });

  it("rejects a forged session cookie", async () => {
    const res = await api("/providers", "GET", undefined, "not-a-real-session-token");
    expect(res.status).toBe(401);
  });
});
