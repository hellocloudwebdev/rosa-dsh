/**
 * SSRF guard for user-supplied provider Base URLs.
 *
 * Custom Base URLs are the single most dangerous input in this application:
 * the server performs the request, so a user could otherwise aim it at
 * internal services. Every rule here exists to make that impossible.
 */

export type UrlVerdict =
  | { ok: true; url: URL; normalized: string }
  | { ok: false; code: string; message: string };

/** Schemes a provider endpoint may use. */
const ALLOWED_SCHEMES = new Set(["https:", "http:"]);

/**
 * Hosts that must never be reached. Server-side provider calls happen inside
 * our trust boundary, so we hard-block the obvious internal targets.
 */
const BLOCKED_HOSTNAMES = new Set([
  "localhost",
  "localhost.localdomain",
  "ip6-localhost",
  "ip6-loopback",
  "metadata",
  "metadata.google.internal",
  "metadata.goog",
  "instance-data",
  "169.254.169.254", // AWS/GCP/Azure IMDS
  "100.100.100.200", // Alibaba
]);

const BLOCKED_SUFFIXES = [
  ".localhost",
  ".local",
  ".internal",
  ".intranet",
  ".corp",
  ".home",
  ".lan",
  ".home.arpa",
  ".in-addr.arpa",
];

/** Hosts that are never model API endpoints. */
const NON_API_HOSTNAMES = new Set(["cloudflare.com", "cloudflareinsights.com"]);

function isIPv4(host: string): boolean {
  const parts = host.split(".");
  if (parts.length !== 4) return false;
  return parts.every((p) => /^\d{1,3}$/.test(p) && Number(p) <= 255);
}

function partsToInt(parts: number[]): number {
  return (((parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3]) >>> 0);
}

function isBlockedIPv4(host: string): boolean {
  if (!isIPv4(host)) return false;
  const n = partsToInt(host.split(".").map(Number));

  const inRange = (from: number[], to: number[]) =>
    n >= partsToInt(from) && n <= partsToInt(to);

  return (
    inRange([0, 0, 0, 0], [0, 255, 255, 255]) || // "this" network
    inRange([10, 0, 0, 0], [10, 255, 255, 255]) || // RFC1918
    inRange([100, 64, 0, 0], [100, 127, 255, 255]) || // CGNAT
    inRange([127, 0, 0, 0], [127, 255, 255, 255]) || // loopback
    inRange([169, 254, 0, 0], [169, 254, 255, 255]) || // link-local / IMDS
    inRange([172, 16, 0, 0], [172, 31, 255, 255]) || // RFC1918
    inRange([192, 0, 0, 0], [192, 0, 0, 255]) || // IETF protocol assignments
    inRange([192, 0, 2, 0], [192, 0, 2, 255]) || // TEST-NET-1
    inRange([192, 88, 99, 0], [192, 88, 99, 255]) || // 6to4 relay anycast
    inRange([192, 168, 0, 0], [192, 168, 255, 255]) || // RFC1918
    inRange([198, 18, 0, 0], [198, 19, 255, 255]) || // benchmarking
    inRange([198, 51, 100, 0], [198, 51, 100, 255]) || // TEST-NET-2
    inRange([203, 0, 113, 0], [203, 0, 113, 255]) || // TEST-NET-3
    inRange([224, 0, 0, 0], [239, 255, 255, 255]) || // multicast
    inRange([240, 0, 0, 0], [255, 255, 255, 254]) // reserved / broadcast
  );
}

function isBlockedIPv6(host: string): boolean {
  const h = host.replace(/^\[/, "").replace(/\]$/, "").toLowerCase();
  if (!h.includes(":")) return false;

  // Expand to eight 16-bit words. The hostname may be a dotted-quad tail
  // ("::ffff:127.0.0.1") or a hex tail ("::ffff:7f00:1") depending on how the
  // URL parser normalised it, so both shapes are handled here.
  const words = expandIPv6(h);
  if (!words) return false;
  const [w0, w1, w2, w3, w4, w5, w6, w7] = words;

  if (w0 === 0 && w1 === 0 && w2 === 0 && w3 === 0 && w4 === 0 && w5 === 0 && w6 === 0 && w7 === 0) {
    return true; // ::  unspecified
  }
  if (w0 === 0 && w1 === 0 && w2 === 0 && w3 === 0 && w4 === 0 && w5 === 0 && w6 === 0 && w7 === 1) {
    return true; // ::1  loopback
  }
  // fc00::/7  unique local
  if ((w0 & 0xfe00) === 0xfc00) return true;
  // fe80::/10  link-local
  if ((w0 & 0xffc0) === 0xfe80) return true;
  // ff00::/8  multicast
  if ((w0 & 0xff00) === 0xff00) return true;
  // 64:ff9b::/96  NAT64 well-known prefix
  if (w0 === 0x0064 && w1 === 0xff9b && w2 === 0 && w3 === 0 && w4 === 0 && w5 === 0) {
    return true;
  }
  // ::ffff:0:0/96  IPv4-mapped — check the embedded IPv4.
  if (w0 === 0 && w1 === 0 && w2 === 0 && w3 === 0 && w4 === 0 && w5 === 0xffff) {
    const v4 = [w6 >> 8, w6 & 0xff, w7 >> 8, w7 & 0xff];
    return isBlockedIPv4(v4.join("."));
  }
  // ::/96  IPv4-compatible (deprecated) — same treatment.
  if (w0 === 0 && w1 === 0 && w2 === 0 && w3 === 0 && w4 === 0 && w5 === 0 && (w6 !== 0 || w7 !== 0)) {
    const v4 = [w6 >> 8, w6 & 0xff, w7 >> 8, w7 & 0xff];
    return isBlockedIPv4(v4.join("."));
  }
  return false;
}

/** Expand an IPv6 literal into eight 16-bit words, or null if unparseable. */
export function expandIPv6(host: string): number[] | null {
  const h = host.replace(/^\[/, "").replace(/\]$/, "").toLowerCase();
  if (!h.includes(":")) return null;

  // Split off a trailing dotted-quad, if present, and turn it into two words.
  let tail = "";
  let body = h;
  const lastColon = h.lastIndexOf(":");
  const maybeV4 = h.slice(lastColon + 1);
  if (maybeV4.includes(".")) {
    const octets = maybeV4.split(".");
    if (octets.length !== 4 || !octets.every((o) => /^\d{1,3}$/.test(o))) return null;
    const nums = octets.map(Number);
    if (nums.some((n) => n > 255)) return null;
    tail = `${nums[0] * 256 + nums[1]}:${nums[2] * 256 + nums[3]}`;
    body = h.slice(0, lastColon + 1);
  }

  const [leftRaw, rightRaw] = body.split("::");
  if (rightRaw !== undefined && body.split("::").length > 2) return null;

  const parseGroups = (s: string): number[] | null => {
    if (s === "" || s === ":") return [];
    const parts = s.replace(/^:+/, "").replace(/:+$/, "").split(":");
    if (parts.some((p) => p === "")) return null;
    const out: number[] = [];
    for (const p of parts) {
      if (!/^[0-9a-f]{1,4}$/.test(p)) return null;
      out.push(Number.parseInt(p, 16));
    }
    return out;
  };

  const left = parseGroups(leftRaw);
  if (!left) return null;
  const right = rightRaw === undefined ? null : parseGroups(rightRaw);

  let words: number[];
  if (right === null) {
    words = [...left];
  } else {
    const rightWords = [...right];
    if (tail) rightWords.push(0);
    words = [...left, ...rightWords];
  }
  if (tail) {
    const [a, b] = tail.split(":").map((x) => Number.parseInt(x, 16));
    words.push(a, b);
  }

  if (right !== null) {
    // Insert the :: zero-run so the result is exactly 8 words.
    const missing = 8 - words.length;
    if (missing < 0) return null;
    words = [...left, ...new Array(missing).fill(0), ...[...right, ...(tail ? tail.split(":").map((x) => Number.parseInt(x, 16)) : [])]];
  }

  if (words.length !== 8 || words.some((w) => !Number.isFinite(w))) return null;
  return words;
}

/** Control characters or non-ASCII homoglyph / punycode trickery. */
function hasSuspiciousCharacters(host: string): boolean {
  for (let i = 0; i < host.length; i++) {
    const code = host.charCodeAt(i);
    if (code <= 0x20 || code === 0x7f) return true;
  }
  return /[^\x21-\x7e]/.test(host);
}

/**
 * Validate a user-supplied Base URL.
 *
 * @param opts.allowHttpLocalDev permit http:// for 127.0.0.1 in local dev only
 */
export function validateProviderBaseUrl(
  raw: string,
  opts: { allowHttpLocalDev?: boolean } = {},
): UrlVerdict {
  const input = typeof raw === "string" ? raw.trim() : "";
  if (!input) {
    return { ok: false, code: "empty", message: "Enter a Base URL." };
  }
  if (input.length > 2048) {
    return {
      ok: false,
      code: "too-long",
      message: "Base URL is too long (max 2048 characters).",
    };
  }

  let url: URL;
  try {
    url = new URL(input);
  } catch {
    return {
      ok: false,
      code: "invalid",
      message: "That is not a valid absolute URL. Example: https://api.openai.com/v1",
    };
  }

  if (!ALLOWED_SCHEMES.has(url.protocol)) {
    return {
      ok: false,
      code: "scheme",
      message: `Unsupported URL scheme "${url.protocol}". Use https:// (or http:// for a local server).`,
    };
  }

  if (url.username || url.password) {
    return {
      ok: false,
      code: "credentials-in-url",
      message: "Remove the username/password from the URL. Use the API key field instead.",
    };
  }

  if (url.port && Number(url.port) === 22) {
    return { ok: false, code: "port", message: "Port 22 (SSH) is not allowed." };
  }

  // The hostname as typed, before the URL parser normalised it. Encoded IP
  // forms (decimal, hex, octal) and zero-width homoglyphs are rewritten or
  // stripped by `new URL`, so we must inspect the original text to reject them.
  const rawHost = extractRawHost(input);

  if (rawHost !== null && hasSuspiciousCharacters(rawHost)) {
    return {
      ok: false,
      code: "suspicious-host",
      message: "The hostname contains unsupported characters.",
    };
  }

  const host = url.hostname.toLowerCase();
  if (!host) {
    return { ok: false, code: "no-host", message: "The URL has no hostname." };
  }

  const isLoopback = host === "127.0.0.1" || host === "0.0.0.0" || host === "[::1]";

  // Explicitly allow loopback http in local development so users can point at
  // Ollama / LM Studio / vLLM running on their own machine. This must precede
  // the private-address rules below, which would otherwise reject it.
  if (opts.allowHttpLocalDev && url.protocol === "http:" && isLoopback) {
    return { ok: true, url, normalized: url.toString().replace(/\/$/, "") };
  }

  if (rawHost !== null && looksLikeRebindingTrick(rawHost)) {
    return {
      ok: false,
      code: "ip-notation",
      message:
        "Use a normal dotted IPv4 address or a hostname. Encoded IP forms are blocked.",
    };
  }

  if (BLOCKED_HOSTNAMES.has(host)) {
    return {
      ok: false,
      code: "blocked-host",
      message: "That host is blocked for security reasons.",
    };
  }

  if (NON_API_HOSTNAMES.has(host)) {
    return {
      ok: false,
      code: "blocked-host",
      message: "That host is not a model API endpoint.",
    };
  }

  for (const suffix of BLOCKED_SUFFIXES) {
    if (host.endsWith(suffix)) {
      return {
        ok: false,
        code: "blocked-suffix",
        message: "Internal-looking hostnames are not allowed.",
      };
    }
  }

  if (isBlockedIPv4(host) || isBlockedIPv6(host)) {
    return {
      ok: false,
      code: "private-ip",
      message: "Private, loopback and link-local addresses are not allowed.",
    };
  }

  if (url.protocol === "http:") {
    if (isLoopback) {
      return {
        ok: false,
        code: "loopback",
        message:
          "Localhost Base URLs are only reachable when the request is made from your browser. Enable direct-browser requests to test against a local server.",
      };
    }
    return {
      ok: false,
      code: "insecure",
      message:
        "Plain http:// is only allowed for a local server (127.0.0.1). Use https:// so your API key is not sent in the clear.",
    };
  }

  return { ok: true, url, normalized: url.toString().replace(/\/+$/, "") };
}

/** Pull the hostname out of the raw input string, bypassing URL normalisation. */
function extractRawHost(input: string): string | null {
  const m = input.match(/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\/([^/?#]+)/);
  if (!m) return null;
  const authority = m[1];
  const at = authority.lastIndexOf("@");
  const hostPart = at === -1 ? authority : authority.slice(at + 1);
  const colon = hostPart.indexOf(":");
  const host = colon === -1 ? hostPart : hostPart.slice(0, colon);
  return host.length > 0 ? host.toLowerCase() : null;
}

/** Join a base URL and an endpoint path without losing or duplicating slashes. */
export function joinUrl(base: string, path: string): string {
  const b = base.replace(/\/+$/, "");
  const p = path.startsWith("/") ? path : `/${path}`;
  return `${b}${p}`;
}

/**
 * Detect URL forms that could be used for DNS rebinding or filter bypass:
 * decimal, octal and hex IP notation instead of dotted-quad.
 *
 * A bare integer, a hex literal, or any dotted form with a non-decimal octet
 * is rejected — `new URL` would otherwise silently resolve it to 127.0.0.1.
 */
export function looksLikeRebindingTrick(host: string): boolean {
  if (!host) return false;
  if (/^0x[0-9a-f]+$/i.test(host)) return true;
  if (/^\d+$/.test(host)) return true; // bare decimal IP
  if (/^0[0-7]+$/.test(host)) return true; // octal
  const octets = host.split(".");
  if (octets.length === 2 || octets.length === 3 || octets.length === 4) {
    // Any non-pure-decimal octet (leading zero, hex prefix) is a bypass form.
    if (octets.some((o) => /^0[xX]/.test(o) || /^0[0-9]+$/.test(o))) return true;
  }
  return false;
}
