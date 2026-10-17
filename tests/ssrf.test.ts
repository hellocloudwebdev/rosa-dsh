import { describe, expect, it } from "vitest";
import {
  assertPublicHost,
  canonicalHostname,
  isPrivateAddress,
  isSingleLabel,
  validateProviderBaseUrl,
  type Lookup,
} from "../shared/urlGuard.js";
import { assertFetchableProviderUrl } from "../server/http.js";

/**
 * SSRF regression tests.
 *
 * Every hostname in the "closes the reported bypasses" block below was verified
 * ACCEPTED by `validateProviderBaseUrl` before this change. They all share one
 * root cause: the hostname was compared as a raw string, so DNS-equivalent forms
 * (`localhost.`) and public names that resolve to private addresses
 * (`10.0.0.1.nip.io`) slipped through every rule.
 *
 * The authoritative fix is `assertPublicHost`, which resolves the name and
 * rejects private results. Name-based rules are defence in depth, not the
 * control, so both layers are tested separately.
 */

/** A resolver standing in for a hostile or cooperative DNS server. */
const resolvesTo =
  (addresses: string[]): Lookup =>
  async () =>
    addresses;

const failingLookup: Lookup = async () => {
  throw new Error("ENOTFOUND");
};

describe("canonicalHostname", () => {
  it("strips a single trailing dot", () => {
    // `localhost.` and `localhost` are the same host to a resolver but were
    // different strings to every blocklist.
    expect(canonicalHostname("localhost.")).toBe("localhost");
    expect(canonicalHostname("METADATA.GOOGLE.INTERNAL.")).toBe("metadata.google.internal");
  });

  it("leaves repeated trailing dots alone so they fail later checks", () => {
    // "localhost.." is not resolvable. Normalising it to "localhost" would turn
    // an invalid name into a blocked one and hide the fact that it was invalid.
    expect(canonicalHostname("localhost..")).toBe("localhost..");
  });

  it("lowercases and trims", () => {
    expect(canonicalHostname("  API.OpenAI.COM  ")).toBe("api.openai.com");
  });
});

describe("isSingleLabel", () => {
  it("flags single-label names, which are never public", () => {
    expect(isSingleLabel("metadata")).toBe(true);
    expect(isSingleLabel("intranet")).toBe(true);
  });

  it("accepts qualified names and IP literals", () => {
    expect(isSingleLabel("api.openai.com")).toBe(false);
    expect(isSingleLabel("127.0.0.1")).toBe(false);
    expect(isSingleLabel("[::1]")).toBe(false);
  });
});

describe("isPrivateAddress", () => {
  it("classifies IPv4 ranges", () => {
    for (const host of [
      "127.0.0.1",
      "10.1.2.3",
      "172.16.0.1",
      "192.168.1.1",
      "169.254.169.254",
      "100.64.0.1",
      "0.0.0.0",
      "224.0.0.1",
      "255.255.255.255",
    ]) {
      expect(isPrivateAddress(host), `${host} must be private`).toBe(true);
    }
  });

  it("classifies IPv6 ranges", () => {
    for (const host of ["::1", "::", "fc00::1", "fe80::1", "ff02::1", "::ffff:127.0.0.1"]) {
      expect(isPrivateAddress(host), `${host} must be private`).toBe(true);
    }
  });

  it("accepts genuinely public addresses", () => {
    for (const host of ["1.1.1.1", "8.8.8.8", "104.18.0.1", "2606:4700::1111"]) {
      expect(isPrivateAddress(host), `${host} must be public`).toBe(false);
    }
  });

  it("fails closed on an empty host", () => {
    expect(isPrivateAddress("")).toBe(true);
  });
});

describe("validateProviderBaseUrl closes the reported bypasses", () => {
  /**
   * The exact list the security audit verified as ACCEPTED before the fix.
   * Every one of these must now be rejected.
   */
  const previouslyAccepted = [
    "https://localhost./v1",
    "https://metadata.google.internal./v1",
    "https://localtest.me/v1",
    "https://169.254.169.254.nip.io/",
    "https://10.0.0.1.nip.io/v1",
    "https://192.168.0.1.sslip.io/v1",
    "https://a.127.0.0.1.nip.io/v1",
    "https://0.0.0.0.nip.io/v1",
  ];

  for (const url of previouslyAccepted) {
    it(`rejects ${url}`, () => {
      expect(validateProviderBaseUrl(url).ok).toBe(false);
    });
  }

  it("still rejects the forms that were already blocked", () => {
    // Guard against the new normalisation accidentally weakening existing rules.
    for (const url of [
      "https://127.1/v1",
      "https://2130706433/v1",
      "https://0x7f000001/v1",
      "https://0177.0.0.1/v1",
      "https://[::1]/v1",
      "https://[::ffff:127.0.0.1]/v1",
      "https://169.254.169.254./",
      "https://user:pass@api.openai.com/v1",
    ]) {
      expect(validateProviderBaseUrl(url).ok, `${url} must be rejected`).toBe(false);
    }
  });

  it("still accepts real provider endpoints", () => {
    for (const url of [
      "https://api.openai.com/v1",
      "https://api.anthropic.com/v1",
      "https://generativelanguage.googleapis.com/v1beta",
      "https://my-resource.openai.azure.com/openai",
      "https://openrouter.ai/api/v1",
    ]) {
      expect(validateProviderBaseUrl(url).ok, `${url} must be accepted`).toBe(true);
    }
  });
});

describe("assertPublicHost — the post-resolution control", () => {
  it("rejects a public name that resolves to loopback", () => {
    // This is the attack the name-based rules cannot catch: `evil.example` is a
    // perfectly ordinary public hostname.
    return assertPublicHost("evil.example", resolvesTo(["127.0.0.1"])).then((verdict) => {
      expect(verdict.ok).toBe(false);
      expect(verdict.code).toBe("private-ip");
    });
  });

  it("rejects a public name that resolves to cloud metadata", async () => {
    const verdict = await assertPublicHost("rebind.example", resolvesTo(["169.254.169.254"]));
    expect(verdict.ok).toBe(false);
    expect(verdict.code).toBe("private-ip");
  });

  it("rejects when only one of several addresses is private", async () => {
    // A hostile resolver returns a plausible public address alongside a private
    // one and hopes the client picks the private one. Any private result must
    // fail the whole call.
    const verdict = await assertPublicHost("mixed.example", resolvesTo(["93.184.216.34", "10.0.0.5"]));
    expect(verdict.ok).toBe(false);
    expect(verdict.code).toBe("private-ip");
  });

  it("rejects an IPv6 private result", async () => {
    const verdict = await assertPublicHost("v6.example", resolvesTo(["fd00::1"]));
    expect(verdict.ok).toBe(false);
  });

  it("accepts a name that resolves only to public addresses", async () => {
    const verdict = await assertPublicHost("api.openai.com", resolvesTo(["104.18.6.192"]));
    expect(verdict.ok).toBe(true);
    expect(verdict.addresses).toEqual(["104.18.6.192"]);
  });

  it("rejects an unresolvable name rather than assuming it is safe", async () => {
    const verdict = await assertPublicHost("nope.example", failingLookup);
    expect(verdict.ok).toBe(false);
    expect(verdict.code).toBe("dns-failure");
  });

  it("rejects a name that resolves to nothing", async () => {
    const verdict = await assertPublicHost("empty.example", resolvesTo([]));
    expect(verdict.ok).toBe(false);
    expect(verdict.code).toBe("dns-failure");
  });

  it("decides IP literals without needing a resolver", async () => {
    // An IP literal must never be trusted just because no resolver was supplied.
    const privateLiteral = await assertPublicHost("127.0.0.1");
    expect(privateLiteral.ok).toBe(false);

    const publicLiteral = await assertPublicHost("1.1.1.1");
    expect(publicLiteral.ok).toBe(true);
  });

  it("does not leak the resolved address in a way that enables probing", async () => {
    const verdict = await assertPublicHost("probe.example", resolvesTo(["192.168.5.5"]));
    // The address is reported for logging/diagnostics, but the message must not
    // imply the port or service behind it is reachable.
    expect(verdict.message).toContain("private or reserved");
  });
});

describe("assertFetchableProviderUrl — the request-path gate", () => {
  it("rejects a non-https scheme", async () => {
    const verdict = await assertFetchableProviderUrl("http://api.openai.com/v1");
    expect(verdict.ok).toBe(false);
  });

  it("rejects a malformed URL", async () => {
    const verdict = await assertFetchableProviderUrl("not a url");
    expect(verdict.ok).toBe(false);
  });

  it("rejects a name resolving to a private address", async () => {
    const verdict = await assertFetchableProviderUrl("https://sneaky.example/v1", {
      lookup: resolvesTo(["10.1.1.1"]),
    });
    expect(verdict.ok).toBe(false);
  });

  it("accepts a public https endpoint", async () => {
    const verdict = await assertFetchableProviderUrl("https://api.openai.com/v1", {
      lookup: resolvesTo(["104.18.6.192"]),
    });
    expect(verdict.ok).toBe(true);
  });

  it("refuses loopback unless the caller explicitly opts in", async () => {
    const refused = await assertFetchableProviderUrl("http://127.0.0.1:11434/v1");
    expect(refused.ok).toBe(false);

    // The local dev server opts in so it can reach the user's own Ollama.
    const allowed = await assertFetchableProviderUrl("http://127.0.0.1:11434/v1", {
      allowLocalhost: true,
    });
    expect(allowed.ok).toBe(true);
  });

  it("does not let the local-dev allowance open up the private network", async () => {
    // The opt-in must cover loopback only. A LAN address is still refused, so a
    // misconfigured dev flag cannot be used to reach the internal network.
    const verdict = await assertFetchableProviderUrl("http://192.168.1.50:11434/v1", {
      allowLocalhost: true,
    });
    expect(verdict.ok).toBe(false);
  });

  it("still resolves the host when the local-dev allowance is on", async () => {
    // A public name resolving to a private address must stay blocked even with
    // the dev flag set; only literal loopback is exempt.
    const verdict = await assertFetchableProviderUrl("https://sneaky.example/v1", {
      allowLocalhost: true,
      lookup: resolvesTo(["127.0.0.1"]),
    });
    expect(verdict.ok).toBe(false);
  });
});
