import { describe, expect, it } from "vitest";
import {
  decryptSecret,
  encryptSecret,
  generateMasterKey,
  keyHint,
  looksLikeApiKey,
} from "../server/db/crypto.js";

const MASTER = generateMasterKey();

describe("envelope encryption", () => {
  it("round-trips a key", async () => {
    const secret = "sk-test-0123456789abcdef";
    const env = await encryptSecret(secret, MASTER);
    expect(await decryptSecret(env, MASTER)).toBe(secret);
  });

  it("produces a distinct ciphertext each time (random nonce)", async () => {
    const a = await encryptSecret("same-key", MASTER);
    const b = await encryptSecret("same-key", MASTER);
    expect(a).not.toBe(b);
    expect(await decryptSecret(a, MASTER)).toBe("same-key");
    expect(await decryptSecret(b, MASTER)).toBe("same-key");
  });

  it("never stores the plaintext in the envelope", async () => {
    const secret = "sk-super-secret-value";
    const env = await encryptSecret(secret, MASTER);
    expect(env).not.toContain("sk-super-secret");
    expect(env).not.toContain(secret);
  });

  it("fails loudly when the master key changes", async () => {
    const env = await encryptSecret("sk-abc123456", MASTER);
    const other = generateMasterKey();
    await expect(decryptSecret(env, other)).rejects.toThrow(/ROSA_ENCRYPTION_KEY/i);
  });

  it("rejects tampered ciphertext (GCM auth)", async () => {
    const env = JSON.parse(await encryptSecret("sk-abc123456", MASTER)) as {
      nonce: string;
      ciphertext: string;
    };
    // Flip a character in the ciphertext.
    const raw = atob(env.ciphertext);
    let flipped = "";
    for (let i = 0; i < raw.length; i++) {
      const c = raw.charCodeAt(i);
      flipped += String.fromCharCode(i === 0 ? (c === 65 ? 66 : 65) : c);
    }
    env.ciphertext = btoa(flipped);
    await expect(
      decryptSecret(JSON.stringify(env), MASTER),
    ).rejects.toThrow();
  });

  it("rejects a malformed envelope", async () => {
    await expect(decryptSecret("not json", MASTER)).rejects.toThrow(/malformed/i);
    await expect(decryptSecret("{}", MASTER)).rejects.toThrow(/Unsupported/i);
  });

  it("refuses to encrypt an empty secret", async () => {
    await expect(encryptSecret("", MASTER)).rejects.toThrow(/empty/i);
  });

  it("handles unicode secrets", async () => {
    const secret = "clé-api-🔐-ünïcödé";
    expect(await decryptSecret(await encryptSecret(secret, MASTER), MASTER)).toBe(secret);
  });

  it("generates a high-entropy master key", () => {
    const a = generateMasterKey();
    const b = generateMasterKey();
    expect(a).not.toBe(b);
    expect(a.length).toBeGreaterThanOrEqual(40);
    expect(a).not.toMatch(/[+/=]/); // base64url only
  });
});

describe("keyHint", () => {
  it("exposes only the last 4 characters", () => {
    // "sk-1234567890abcd" — last four characters are "abcd".
    expect(keyHint("sk-1234567890abcd")).toBe("abcd");
    expect(keyHint("abcdefgh")).toBe("efgh");
  });

  it("masks very short keys entirely", () => {
    expect(keyHint("abc")).toBe("****");
  });
});

describe("looksLikeApiKey", () => {
  it("accepts plausible keys", () => {
    expect(looksLikeApiKey("sk-ant-api03-abc123")).toBe(true);
    expect(looksLikeApiKey("AIzaSyA1234567890")).toBe(true);
  });

  it("rejects junk", () => {
    expect(looksLikeApiKey("")).toBe(false);
    expect(looksLikeApiKey("short")).toBe(false);
    expect(looksLikeApiKey("has spaces here")).toBe(false);
    expect(looksLikeApiKey("  ")).toBe(false);
  });
});

describe("secret redaction", () => {
  it("redacts openai-style keys from a message", async () => {
    const { redactSecrets } = await import("../shared/providers.js");
    expect(
      redactSecrets("Request failed for sk-abcdefghijklmnopqrstuvwxyz012345"),
    ).not.toContain("sk-abcdefghij");
    expect(redactSecrets("Request failed for sk-abcdefghijklmnopqrstuvwxyz012345")).toContain(
      "[redacted]",
    );
  });

  it("redacts bearer tokens and long opaque tokens", async () => {
    const { redactSecrets } = await import("../shared/providers.js");
    expect(redactSecrets("Authorization: Bearer abcdef123456")).not.toContain("abcdef123456");
    expect(redactSecrets("token aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa")).not.toContain(
      "aaaaaaaaaaaaaaaa",
    );
  });
});
