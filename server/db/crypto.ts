/**
 * API key encryption at rest.
 *
 * Threat model, stated plainly:
 *   - Without a key, a dumped database file reveals ciphertext only.
 *   - With the key, the ciphertext is decryptable by anyone who can read both
 *     the database and the environment. That is the documented, honest limit
 *     of envelope encryption with a single service-side key.
 *   - We do NOT claim this protects keys from an attacker who can execute code
 *     inside our own server process.
 *
 * Design: AES-256-GCM with a per-provider random IV, and a key derived from
 * ROSA_ENCRYPTION_KEY via HKDF-SHA256 so the same secret also yields separate
 * encryption and MAC contexts. Uses WebCrypto so the exact same code runs in
 * Node, Vercel Functions and Cloudflare Workers.
 */

/**
 * Opaque key handle. We never inspect it, only pass it back to WebCrypto, so
 * an opaque branded type is sufficient and avoids depending on the DOM lib.
 */
declare const CRYPTO_KEY_BRAND: unique symbol;
export type CryptoKeyLike = { readonly [CRYPTO_KEY_BRAND]: true };

interface SubtleCryptoLike {
  importKey(
    format: "raw",
    keyData: Uint8Array,
    algorithm: string | object,
    extractable: boolean,
    keyUsages: string[],
  ): Promise<CryptoKeyLike>;
  deriveKey(
    algorithm: object,
    baseKey: CryptoKeyLike,
    derivedKeyAlgorithm: object,
    extractable: boolean,
    keyUsages: string[],
  ): Promise<CryptoKeyLike>;
  encrypt(algorithm: object, key: CryptoKeyLike, data: Uint8Array): Promise<ArrayBuffer>;
  decrypt(algorithm: object, key: CryptoKeyLike, data: Uint8Array): Promise<ArrayBuffer>;
}

const ENC_INFO = "rosa/provider-api-key/v1";
const IV_BYTES = 12; // GCM standard nonce length
const VERSION_PREFIX = "v1";

function subtle(): SubtleCryptoLike {
  const c = globalThis.crypto as unknown as { subtle?: SubtleCryptoLike } | undefined;
  if (!c?.subtle) throw new Error("WebCrypto is unavailable in this runtime.");
  return c.subtle;
}

function toBase64(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

function fromBase64(value: string): Uint8Array {
  const s = atob(value);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

/**
 * Derive a 256-bit key from the master secret.
 * Accepts a passphrase of any length so deployments can paste any string.
 */
async function deriveKey(masterSecret: string): Promise<CryptoKeyLike> {
  const enc = new TextEncoder();
  const hkdf = await subtle().importKey("raw", enc.encode(masterSecret), "HKDF", false, [
    "deriveKey",
  ]);
  return subtle().deriveKey(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: enc.encode("rosa-envelope-v1"),
      info: enc.encode(ENC_INFO),
    },
    hkdf,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

/**
 * Generate a random master key. Printed by `rosa-server keys:generate`.
 * 32 random bytes, base64url, which is what HKDF expects to be high-entropy.
 */
export function generateMasterKey(): string {
  const bytes = new Uint8Array(32);
  globalThis.crypto.getRandomValues(bytes);
  return toBase64(bytes).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export interface Envelope {
  version: string;
  nonce: string;
  ciphertext: string;
}

/** Encrypt a plaintext API key into a self-describing envelope. */
export async function encryptSecret(plaintext: string, masterKey: string): Promise<string> {
  if (!plaintext) throw new Error("Refusing to encrypt an empty secret");
  const key = await deriveKey(masterKey);
  const nonce = new Uint8Array(IV_BYTES);
  globalThis.crypto.getRandomValues(nonce);
  const enc = new TextEncoder();
  const cipher = await subtle().encrypt(
    { name: "AES-GCM", iv: nonce, tagLength: 128 },
    key,
    enc.encode(plaintext),
  );
  return JSON.stringify({
    version: VERSION_PREFIX,
    nonce: toBase64(nonce),
    ciphertext: toBase64(new Uint8Array(cipher)),
  } satisfies Envelope);
}

/** Decrypt an envelope produced by `encryptSecret`. */
export async function decryptSecret(envelopeJson: string, masterKey: string): Promise<string> {
  let env: Envelope;
  try {
    env = JSON.parse(envelopeJson) as Envelope;
  } catch {
    throw new Error("Stored credential is malformed.");
  }
  if (!env?.nonce || !env?.ciphertext || env.version !== VERSION_PREFIX) {
    throw new Error("Unsupported credential envelope version.");
  }
  const key = await deriveKey(masterKey);
  try {
    const plain = await subtle().decrypt(
      { name: "AES-GCM", iv: fromBase64(env.nonce), tagLength: 128 },
      key,
      fromBase64(env.ciphertext),
    );
    return new TextDecoder().decode(plain);
  } catch {
    // GCM authentication failure = wrong master key or tampered ciphertext.
    throw new Error(
      "Could not decrypt the stored API key. ROSA_ENCRYPTION_KEY has probably changed since this provider was saved.",
    );
  }
}

/** Non-sensitive confirmation: which key ends this? */
export function keyHint(plaintext: string): string {
  if (plaintext.length <= 4) return "****";
  return plaintext.slice(-4);
}

/** Shape check so we reject obviously-wrong input before storing it. */
export function looksLikeApiKey(value: string): boolean {
  const v = value.trim();
  if (v.length < 8) return false;
  if (/\s/.test(v)) return false;
  return true;
}
