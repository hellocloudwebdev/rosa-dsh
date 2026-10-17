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

const NON_API_HOSTNAMES = new Set(["cloudflare.com", "cloudflareinsights.com"]);

/**
 * Wildcard-DNS services where the subscriber chooses the resolved address.
 *
 * These break hostname-only filtering by design: `127.0.0.1.nip.io` is a valid
 * public DNS name that resolves to loopback, so no amount of suffix matching on
 * the *name* can distinguish it from a legitimate API host. Blocking the
 * services themselves is worthwhile defence in depth, but the authoritative
 * check is `isPrivateAddress` applied after DNS resolution.
 */
const WILDCARD_DNS_SUFFIXES = [
  ".nip.io",
  ".sslip.io",
  ".xip.io",
  ".vcap.me",
  ".lvh.me",
  ".localtest.me",
  ".traefik.me",
  ".lacolhost.com",
  ".local.gd",
  ".127-0-0-1.org.uk",
];

/**
 * Strip the forms of a hostname that DNS ignores but string comparison does not.
 *
 * `localhost.` and `localhost` are the same host to a resolver but different
 * strings, which made every exact-match blocklist trivially bypassable by
 * appending a dot. This is the single normalisation all hostname decisions must
 * go through.
 */
export function canonicalHostname(host: string): string {
  let h = host.trim().toLowerCase();
  // A single trailing dot is legal, meaningful and equivalent to no dot.
  // Repeated dots ("localhost..") are not resolvable and are left intact so
  // they fail the checks below rather than being normalised into something safe.
  if (h.endsWith(".") && !h.endsWith("..")) h = h.slice(0, -1);
  return h;
}

/** True for a single-label name (`intranet`, `metadata`), which is never public. */
export function isSingleLabel(host: string): boolean {
  const h = canonicalHostname(host);
  if (h.startsWith("[")) return false; // IPv6 literal
  return !h.includes(".");
}

/**
 * The authoritative private/reserved-address test.
 *
 * Called with a hostname from `validateProviderBaseUrl` AND with every address a
 * DNS lookup returned, so a name that resolves into the internal network is
 * rejected even though the name itself looks public.
 */
export function isPrivateAddress(host: string): boolean {
  const h = canonicalHostname(host);
  if (!h) return true; // fail closed on an empty host
  return isBlockedIPv4(h) || isBlockedIPv6(h);
}

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
    inRange([240, 0, 0, 0], [255, 255, 255, 255]) // reserved / broadcast (inclusive of 255.255.255.255)
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
  let h = host.replace(/^\[/, "").replace(/\]$/, "").toLowerCase().trim();
  if (!h.includes(":")) return null;

  // Drop a zone index ("fe80::1%eth0"); it is not part of the address.
  const zone = h.indexOf("%");
  if (zone !== -1) h = h.slice(0, zone);

  // Normalise a trailing dotted quad ("::ffff:127.0.0.1") into hex words, so the
  // rest of the routine only ever deals with colon-separated hex groups. Doing
  // this first is what makes the IPv4-mapped check below reachable at all.
  const lastColon = h.lastIndexOf(":");
  const tailPart = h.slice(lastColon + 1);
  if (tailPart.includes(".")) {
    const octets = tailPart.split(".");
    if (octets.length !== 4) return null;
    if (!octets.every((o) => /^\d{1,3}$/.test(o))) return null;
    const nums = octets.map(Number);
    if (nums.some((n) => n > 255)) return null;
    const hi = ((nums[0] << 8) | nums[1]).toString(16);
    const lo = ((nums[2] << 8) | nums[3]).toString(16);
    h = `${h.slice(0, lastColon + 1)}${hi}:${lo}`;
  }

  if (h === "") return null;

  const halves = h.split("::");
  if (halves.length > 2) return null;

  const toWords = (s: string): number[] | null => {
    if (s === "") return [];
    const out: number[] = [];
    for (const p of s.split(":")) {
      if (!/^[0-9a-f]{1,4}$/.test(p)) return null;
      out.push(Number.parseInt(p, 16));
    }
    return out;
  };

  const head = toWords(halves[0]);
  if (!head) return null;

  if (halves.length === 1) {
    return head.length === 8 ? head : null;
  }

  const tail = toWords(halves[1]);
  if (!tail) return null;

  // "::" must stand for at least one zero group; otherwise the form is invalid
  // rather than merely unusual.
  const missing = 8 - head.length - tail.length;
  if (missing < 1) return null;

  return [...head, ...new Array<number>(missing).fill(0), ...tail];
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

  // Canonicalise once, then never compare a raw hostname again. Without this,
  // `localhost.` and `metadata.google.internal.` slipped past every exact-match
  // and suffix rule below while still resolving to the internal host.
  const host = canonicalHostname(url.hostname);
  if (!host) {
    return { ok: false, code: "no-host", message: "The URL has no hostname." };
  }

  const isLoopback = host === "127.0.0.1" || host === "0.0.0.0" || host === "[::1]" || host === "::1";

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

  // A single-label name resolves only through local search domains, so it can
  // never be a public API host. An IP literal is exempt because `isIPv4` /
  // `isBlockedIPv6` classify it directly.
  if (isSingleLabel(host) && !isIPv4(host) && !host.includes(":")) {
    return {
      ok: false,
      code: "blocked-host",
      message:
        "Enter a fully-qualified hostname such as api.openai.com, or an IP address.",
    };
  }

  // Wildcard-DNS services let the caller pick the address behind a public name.
  // Blocked by name here; the post-resolution check in `assertPublicHost` is
  // what actually makes this safe.
  for (const suffix of WILDCARD_DNS_SUFFIXES) {
    if (host === suffix.slice(1) || host.endsWith(suffix)) {
      return {
        ok: false,
        code: "wildcard-dns",
        message:
          "Hostnames from wildcard-DNS services are not allowed, because they can point at internal addresses.",
      };
    }
  }

  if (isPrivateAddress(host)) {
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
 * A DNS resolver, injected so this module stays usable on every runtime and so
 * tests can simulate a hostile resolver.
 *
 * Cloudflare Workers has no `node:dns`, and importing it at module scope would
 * break the Worker bundle — so resolution is passed in and may be absent, in
 * which case `assertPublicHost` falls back to literal-only checks.
 */
export type Lookup = (hostname: string) => Promise<string[]>;

export interface PublicHostVerdict {
  ok: boolean;
  /** The addresses the host resolved to, when a lookup ran. */
  addresses?: string[];
  code?: string;
  message?: string;
}

/**
 * The check that actually closes DNS-name SSRF.
 *
 * Validating the *name* is not sufficient: any public name can resolve to
 * 127.0.0.1. This resolves the host immediately before the request and rejects
 * the call if ANY returned address is private, reserved or loopback.
 *
 * Two honest limitations, both documented rather than papered over:
 *
 * 1. `fetch` performs its own lookup, so this is still validate-then-connect and
 *    a resolver that returns a public address here and a private one to `fetch`
 *    can win the race. The window is small (a single TTL-controlled cache
 *    entry) and fully closing it requires pinning the connection to the
 *    validated IP, which the fetch API does not expose. Callers in Node keep
 *    `redirect: "manual"` and refuse every 3xx, so the common rebound-via-
 *    redirect variant is already blocked outright.
 * 2. If no resolver is available the literal checks still apply, so an IP
 *    literal can never reach a private address.
 */
export async function assertPublicHost(
  hostname: string,
  lookup?: Lookup,
): Promise<PublicHostVerdict> {
  const host = canonicalHostname(hostname);
  if (!host) return { ok: false, code: "no-host", message: "The URL has no hostname." };

  // An IP literal needs no resolution and is decided here.
  const bare = host.replace(/^\[/, "").replace(/\]$/, "");
  if (isIPv4(bare) || bare.includes(":")) {
    return isPrivateAddress(bare)
      ? {
          ok: false,
          code: "private-ip",
          message: "Private, loopback and link-local addresses are not allowed.",
        }
      : { ok: true, addresses: [bare] };
  }

  if (!lookup) {
    // No resolver on this runtime: the name-based rules already ran, and
    // returning ok here is not a regression because nothing new is permitted.
    return { ok: true };
  }

  let addresses: string[];
  try {
    addresses = await lookup(host);
  } catch {
    return {
      ok: false,
      code: "dns-failure",
      message: `Could not resolve ${host}. Check the hostname.`,
    };
  }

  if (addresses.length === 0) {
    return {
      ok: false,
      code: "dns-failure",
      message: `Could not resolve ${host}. Check the hostname.`,
    };
  }

  for (const address of addresses) {
    if (isPrivateAddress(address)) {
      return {
        ok: false,
        addresses,
        code: "private-ip",
        message:
          `${host} resolves to ${address}, which is a private or reserved address. ` +
          "Provider requests may only reach public endpoints.",
      };
    }
  }

  return { ok: true, addresses };
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
