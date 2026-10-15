import { describe, expect, it } from "vitest";
import {
  joinUrl,
  looksLikeRebindingTrick,
  validateProviderBaseUrl,
} from "../shared/urlGuard.js";

const ok = (url: string) => {
  const v = validateProviderBaseUrl(url);
  return v.ok === true ? v : v;
};

const bad = (url: string) => {
  const v = validateProviderBaseUrl(url);
  if (v.ok) throw new Error(`expected ${url} to be rejected`);
  return v;
};

describe("validateProviderBaseUrl — accepts legitimate endpoints", () => {
  it("accepts https provider endpoints", () => {
    expect(ok("https://api.openai.com/v1").ok).toBe(true);
    expect(ok("https://openrouter.ai/api/v1").ok).toBe(true);
    expect(ok("https://generativelanguage.googleapis.com/v1beta").ok).toBe(true);
    expect(ok("https://api.anthropic.com/v1").ok).toBe(true);
    expect(ok("https://gateway.example.com/llm/v1").ok).toBe(true);
  });

  it("normalises trailing slashes", () => {
    const v = ok("https://api.openai.com/v1/");
    expect(v.ok && v.normalized).toBe("https://api.openai.com/v1");
  });

  it("accepts an http local server only in local-dev mode", () => {
    expect(ok("http://127.0.0.1:11434/v1").ok).toBe(false);
    const v = validateProviderBaseUrl("http://127.0.0.1:11434/v1", {
      allowHttpLocalDev: true,
    });
    expect(v.ok).toBe(true);
  });
});

describe("validateProviderBaseUrl — schemes", () => {
  it("rejects non-http schemes", () => {
    for (const url of [
      "file:///etc/passwd",
      "ftp://example.com",
      "gopher://example.com",
      "javascript:alert(1)",
      "data:text/plain,hi",
      "ws://example.com",
      "chrome://settings",
    ]) {
      expect(bad(url).code).toBe("scheme");
    }
  });

  it("rejects embedded credentials", () => {
    expect(bad("https://user:pass@example.com/v1").code).toBe("credentials-in-url");
  });
});

describe("validateProviderBaseUrl — private, loopback and link-local", () => {
  const blocked = [
    "http://localhost:8000/v1",
    "http://127.0.0.1:8000/v1",
    "http://0.0.0.0/v1",
    "http://[::1]/v1",
    "http://10.0.0.1/v1",
    "http://10.255.255.254/v1",
    "http://172.16.0.1/v1",
    "http://172.31.255.255/v1",
    "http://192.168.1.1/v1",
    "http://169.254.169.254/latest/meta-data/",
    "http://100.100.100.200/latest/meta-data/",
    "http://192.0.2.1/v1",
    "http://203.0.113.5/v1",
    "http://198.51.100.5/v1",
    "http://224.0.0.1/v1",
    "http://240.0.0.1/v1",
    "http://255.255.255.254/v1",
    "http://metadata.google.internal/computeMetadata/v1/",
    "http://169.254.0.1/v1",
  ];

  it("blocks every internal target", () => {
    for (const url of blocked) {
      const v = bad(url);
      expect(
        ["private-ip", "loopback", "blocked-host", "insecure", "blocked-suffix", "ip-notation"],
        `${url} was not blocked (${v.code})`,
      ).toContain(v.code);
    }
  });

  it("blocks IPv6 unique-local and link-local", () => {
    expect(bad("http://[fc00::1]/v1").code).toBe("private-ip");
    expect(bad("http://[fd12:3456:789a::1]/v1").code).toBe("private-ip");
    expect(bad("http://[fe80::1]/v1").code).toBe("private-ip");
  });

  it("blocks IPv4-mapped IPv6 forms", () => {
    expect(bad("http://[::ffff:127.0.0.1]/v1").code).toBe("private-ip");
    expect(bad("http://[::ffff:169.254.169.254]/v1").code).toBe("private-ip");
  });

  it("blocks internal-looking hostname suffixes", () => {
    expect(bad("https://db.internal/v1").code).toBe("blocked-suffix");
    expect(bad("https://printer.local/v1").code).toBe("blocked-suffix");
    expect(bad("https://wiki.corp/v1").code).toBe("blocked-suffix");
    expect(bad("https://nas.lan/v1").code).toBe("blocked-suffix");
  });
});

describe("validateProviderBaseUrl — filter bypass attempts", () => {
  it("blocks encoded IP forms", () => {
    expect(looksLikeRebindingTrick("2130706433")).toBe(true);
    expect(looksLikeRebindingTrick("0x7f000001")).toBe(true);
    expect(looksLikeRebindingTrick("0177.0.0.1")).toBe(true);
    expect(bad("http://2130706433/v1").code).toBe("ip-notation");
    expect(bad("http://0x7f000001/v1").code).toBe("ip-notation");
  });

  it("blocks the cloud metadata hostnames explicitly", () => {
    expect(bad("https://metadata.google.internal/v1").code).toBe("blocked-host");
    expect(bad("https://metadata.goog/v1").code).toBe("blocked-host");
    // Blocked as an explicit IMDS host and, independently, as link-local.
    expect(["blocked-host", "private-ip"]).toContain(bad("https://169.254.169.254/v1").code);
    expect(["blocked-host", "private-ip"]).toContain(
      bad("https://169.254.170.2/v1/aws-credentials").code,
    );
  });

  it("rejects non-ASCII homoglyphs in the host", () => {
    // A zero-width space is stripped by `new URL`, so we must catch it from
    // the raw input rather than the normalised hostname.
    expect(bad("https://exa\u200bample.com/v1").code).toBe("suspicious-host");
  });

  it("rejects empty or oversized input", () => {
    expect(bad("").code).toBe("empty");
    expect(bad("   ").code).toBe("empty");
    expect(bad("x".repeat(3000)).code).toBe("too-long");
  });

  it("rejects a relative or malformed URL", () => {
    expect(bad("api.openai.com/v1").code).toBe("invalid");
    expect(bad("not a url").code).toBe("invalid");
  });
});

describe("joinUrl", () => {
  it("joins without duplicating slashes", () => {
    expect(joinUrl("https://api.openai.com/v1/", "/models")).toBe(
      "https://api.openai.com/v1/models",
    );
    expect(joinUrl("https://api.openai.com/v1", "models")).toBe(
      "https://api.openai.com/v1/models",
    );
    expect(joinUrl("https://api.openai.com/v1///", "/chat/completions")).toBe(
      "https://api.openai.com/v1/chat/completions",
    );
  });
});
