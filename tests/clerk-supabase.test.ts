import { describe, expect, it } from "vitest";
import { toPostgresSql } from "../server/db/supabase.js";
import {
  decodeJwtSection,
  verifyClerkToken,
  authenticate,
} from "../server/auth.js";
import type { AppDatabase } from "../server/db/repository.js";
import type { ApiEnv } from "../server/env.js";

describe("Supabase SQL translation", () => {
  it("converts positional ? to $1, $2, $3", () => {
    const input = "SELECT * FROM users WHERE email = ? AND provider = ?";
    const output = toPostgresSql(input);
    expect(output).toBe("SELECT * FROM users WHERE email = $1 AND provider = $2");
  });

  it("does not replace ? inside single quotes", () => {
    const input = "SELECT * FROM users WHERE note = 'who?' AND id = ?";
    const output = toPostgresSql(input);
    expect(output).toBe("SELECT * FROM users WHERE note = 'who?' AND id = $1");
  });

  it("converts INSERT OR IGNORE to ON CONFLICT DO NOTHING", () => {
    const input = "INSERT OR IGNORE INTO model_favourites (user_id, model_ref) VALUES (?, ?)";
    const output = toPostgresSql(input);
    expect(output).toContain("ON CONFLICT DO NOTHING");
    expect(output).not.toContain("INSERT OR IGNORE");
  });

  it("converts INSERT OR REPLACE to ON CONFLICT DO UPDATE", () => {
    const input = "INSERT OR REPLACE INTO rate_limits (bucket, subject, window_start, count) VALUES (?, ?, ?, ?)";
    const output = toPostgresSql(input);
    expect(output).toContain("ON CONFLICT (bucket, subject) DO UPDATE");
    expect(output).not.toContain("INSERT OR REPLACE");
  });
});

describe("Clerk JWT verification (Security Priority)", () => {
  it("base64url decodes accurately", () => {
    const jsonStr = JSON.stringify({ sub: "user_123", exp: 9999999999 });
    const encoded = btoa(jsonStr).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    const decoded = decodeJwtSection<{ sub: string; exp: number }>(encoded);
    expect(decoded?.sub).toBe("user_123");
    expect(decoded?.exp).toBe(9999999999);
  });

  it("rejects tokens that do not have 3 parts", async () => {
    const dummyApp = {} as unknown as AppDatabase;
    const dummyEnv: ApiEnv = {};
    const result = await verifyClerkToken("invalid-token", dummyEnv, dummyApp);
    expect(result).toBeNull();
  });

  it("rejects tokens with non-RS256 algorithm (algorithm confusion defense)", async () => {
    const dummyApp = {} as unknown as AppDatabase;
    const dummyEnv: ApiEnv = {};

    // Header with alg: "HS256" (must be rejected)
    const header = btoa(JSON.stringify({ alg: "HS256", typ: "JWT" })).replace(/=/g, "");
    const payload = btoa(JSON.stringify({ sub: "user_test", exp: Math.floor(Date.now() / 1000) + 3600 })).replace(/=/g, "");
    const sig = "fake_sig";
    const token = `${header}.${payload}.${sig}`;

    const result = await verifyClerkToken(token, dummyEnv, dummyApp);
    expect(result).toBeNull();
  });

  it("rejects expired tokens", async () => {
    const dummyApp = {} as unknown as AppDatabase;
    const dummyEnv: ApiEnv = {};

    const header = btoa(JSON.stringify({ alg: "RS256", kid: "test_key", typ: "JWT" })).replace(/=/g, "");
    // Expired 10 minutes ago
    const payload = btoa(JSON.stringify({ sub: "user_test", exp: Math.floor(Date.now() / 1000) - 600 })).replace(/=/g, "");
    const sig = "fake_sig";
    const token = `${header}.${payload}.${sig}`;

    const result = await verifyClerkToken(token, dummyEnv, dummyApp);
    expect(result).toBeNull();
  });

  it("authenticate rejects forged Bearer tokens", async () => {
    const dummyApp = {} as unknown as AppDatabase;
    const dummyEnv: ApiEnv = {};

    const req = new Request("http://localhost/api/chat", {
      headers: {
        Authorization: "Bearer forged.token.here",
      },
    });

    const auth = await authenticate(req, dummyApp, dummyEnv);
    expect(auth).toBeNull();
  });
});
