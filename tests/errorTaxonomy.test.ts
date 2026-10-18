import { describe, expect, it } from "vitest";
import { classifyHttpStatus, toApiError, ProviderHttpError } from "../server/http.js";
import { upstreamError } from "../shared/providers.js";
import { formatErrorMessage } from "../src/lib/api.js";

describe("Error Taxonomy and HTTP Status Classification", () => {
  it("classifies 401 as invalid-api-key", () => {
    const result = classifyHttpStatus(401);
    expect(result.code).toBe("invalid-api-key");
    expect(result.retryable).toBe(false);
    expect(result.message).toContain("401");
  });

  it("classifies 402 as quota-exhausted", () => {
    const result = classifyHttpStatus(402);
    expect(result.code).toBe("quota-exhausted");
    expect(result.retryable).toBe(false);
    expect(result.message).toContain("402");
  });

  it("classifies 403 as forbidden", () => {
    const result = classifyHttpStatus(403);
    expect(result.code).toBe("forbidden");
    expect(result.retryable).toBe(false);
    expect(result.message).toContain("403");
  });

  it("classifies 404 as model-not-found", () => {
    const result = classifyHttpStatus(404);
    expect(result.code).toBe("model-not-found");
    expect(result.retryable).toBe(false);
    expect(result.message).toContain("404");
  });

  it("classifies 408 as timeout", () => {
    const result = classifyHttpStatus(408);
    expect(result.code).toBe("timeout");
    expect(result.retryable).toBe(true);
    expect(result.message).toContain("408");
  });

  it("classifies 413 as too-large", () => {
    const result = classifyHttpStatus(413);
    expect(result.code).toBe("too-large");
    expect(result.retryable).toBe(false);
    expect(result.message).toContain("413");
  });

  it("classifies 422 as bad-response", () => {
    const result = classifyHttpStatus(422);
    expect(result.code).toBe("bad-response");
    expect(result.retryable).toBe(false);
    expect(result.message).toContain("422");
  });

  it("classifies 429 as rate-limited with Retry-After seconds", () => {
    const result = classifyHttpStatus(429, "45");
    expect(result.code).toBe("rate-limited");
    expect(result.retryable).toBe(true);
    expect(result.retryAfterSeconds).toBe(45);
    expect(result.message).toContain("45s");
  });

  it("classifies 429 as rate-limited without Retry-After header", () => {
    const result = classifyHttpStatus(429, null);
    expect(result.code).toBe("rate-limited");
    expect(result.retryable).toBe(true);
    expect(result.retryAfterSeconds).toBeUndefined();
  });

  it("classifies 500 as server-error", () => {
    const result = classifyHttpStatus(500);
    expect(result.code).toBe("server-error");
    expect(result.retryable).toBe(true);
  });

  it("classifies 502, 503, and 504 as bad-gateway", () => {
    for (const status of [502, 503, 504]) {
      const result = classifyHttpStatus(status);
      expect(result.code).toBe("bad-gateway");
      expect(result.retryable).toBe(true);
    }
  });

  it("classifies other unhandled statuses as unknown", () => {
    const result = classifyHttpStatus(418);
    expect(result.code).toBe("unknown");
    expect(result.retryable).toBe(false);
  });

  it("integrates with upstreamError to return proper error payload", () => {
    const payload = upstreamError({
      status: 401,
      providerLabel: "Anthropic",
      bodyText: "invalid_api_key",
    });
    expect(payload.code).toBe("invalid-api-key");
    expect(payload.retryable).toBe(false);
    expect(payload.upstreamStatus).toBe(401);
  });

  it("integrates with toApiError for ProviderHttpError", () => {
    const headers = new Headers({ "retry-after": "15" });
    const err = new ProviderHttpError(429, "rate limited", headers);
    const payload = toApiError(err, "OpenAI");
    expect(payload.code).toBe("rate-limited");
    expect(payload.retryable).toBe(true);
    expect(payload.retryAfterSeconds).toBe(15);
  });

  it("formats user-facing error messages distinctly in formatErrorMessage", () => {
    expect(formatErrorMessage({ code: "invalid-api-key" })).toContain("Invalid API key");
    expect(formatErrorMessage({ code: "rate-limited", retryAfterSeconds: 20 })).toContain(
      "Rate limit exceeded. Try again in 20s.",
    );
    expect(formatErrorMessage({ code: "quota-exhausted" })).toContain("quota or credit exhausted");
  });
});
