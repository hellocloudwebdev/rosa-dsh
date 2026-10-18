import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createServer, type Server, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { ChatRun } from "../server/chatRun.js";
import { OpenAICompatibleAdapter } from "../server/adapters/openai.js";
import type { StreamEvent } from "../shared/types.js";

type RouteEntry = {
  body?: string;
  headers?: Record<string, string>;
  handler?: (req: IncomingMessage, res: ServerResponse) => void;
};

describe("ChatRun", () => {
  let server: Server;
  let baseUrl: string;
  const routes = new Map<string, RouteEntry>();

  beforeAll(async () => {
    server = createServer((req, res) => {
      const url = new URL(req.url ?? "/", "http://127.0.0.1");
      const key = `${req.method} ${url.pathname}`;
      const route = routes.get(key);
      if (!route) {
        res.writeHead(404, { "content-type": "application/json" });
        res.end(JSON.stringify({ error: { message: `no route for ${key}` } }));
        return;
      }
      if (route.handler) {
        route.handler(req, res);
        return;
      }
      res.writeHead(200, {
        "content-type": "text/event-stream",
        ...route.headers,
      });
      res.end(route.body);
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const addr = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${addr.port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it("detects truncated streams when connection closes mid-generation without finish signal", async () => {
    // Deliberately cut off mid-sentence: sends delta but no [DONE] and no finish_reason
    routes.set("POST /chat/completions", {
      body: [
        'data: {"choices":[{"delta":{"content":"Half a sentence that got cut"}}]}',
        "",
        "",
      ].join("\n"),
    });

    const run = new ChatRun("req-trunc-1", "TestProvider");
    const adapter = new OpenAICompatibleAdapter();
    const events: StreamEvent[] = [];

    await run.run({
      adapter,
      ctx: {
        baseUrl,
        apiKey: "sk-test",
        organizationId: null,
        providerLabel: "TestProvider",
        allowLocalhost: true,
      },
      opts: {
        modelId: "gpt-mock",
        messages: [{ role: "user", content: "hello" }],
        stream: true,
        timeoutMs: 5000,
        requestId: "req-trunc-1",
      },
      emit: (e) => events.push(e),
    });

    // Verify done was NOT emitted
    const doneEvent = events.find((e) => e.type === "done");
    expect(doneEvent).toBeUndefined();

    // Verify error event was emitted with code "truncated-stream"
    const errorEvent = events.find((e) => e.type === "error");
    expect(errorEvent).toBeDefined();
    expect(errorEvent).toMatchObject({
      type: "error",
      error: {
        code: "truncated-stream",
        message: "TestProvider closed the stream without finishing the response.",
        retryable: true,
      },
    });

    expect(run.error).toEqual({
      code: "truncated-stream",
      message: "TestProvider closed the stream without finishing the response.",
      retryable: true,
    });
    expect(run.text).toBe("Half a sentence that got cut");
  });

  it("emits done when stream finishes with [DONE] sentinel", async () => {
    routes.set("POST /chat/completions", {
      body: [
        'data: {"choices":[{"delta":{"content":"Complete response"}}]}',
        "",
        "data: [DONE]",
        "",
        "",
      ].join("\n"),
    });

    const run = new ChatRun("req-done-1", "TestProvider");
    const adapter = new OpenAICompatibleAdapter();
    const events: StreamEvent[] = [];

    await run.run({
      adapter,
      ctx: {
        baseUrl,
        apiKey: "sk-test",
        organizationId: null,
        providerLabel: "TestProvider",
        allowLocalhost: true,
      },
      opts: {
        modelId: "gpt-mock",
        messages: [{ role: "user", content: "hello" }],
        stream: true,
        timeoutMs: 5000,
        requestId: "req-done-1",
      },
      emit: (e) => events.push(e),
    });

    const errorEvent = events.find((e) => e.type === "error");
    expect(errorEvent).toBeUndefined();

    const doneEvent = events.find((e) => e.type === "done");
    expect(doneEvent).toBeDefined();
    if (doneEvent && doneEvent.type === "done") {
      expect(doneEvent.finishReason).toBe("stop");
      expect(doneEvent.metrics.totalMs).toBeGreaterThanOrEqual(0);
    }
    expect(run.error).toBeNull();
    expect(run.text).toBe("Complete response");
  });

  it("emits done when stream finishes with finish_reason in choice", async () => {
    routes.set("POST /chat/completions", {
      body: [
        'data: {"choices":[{"delta":{"content":"Complete response"},"finish_reason":"stop"}]}',
        "",
        "",
      ].join("\n"),
    });

    const run = new ChatRun("req-finish-1", "TestProvider");
    const adapter = new OpenAICompatibleAdapter();
    const events: StreamEvent[] = [];

    await run.run({
      adapter,
      ctx: {
        baseUrl,
        apiKey: "sk-test",
        organizationId: null,
        providerLabel: "TestProvider",
        allowLocalhost: true,
      },
      opts: {
        modelId: "gpt-mock",
        messages: [{ role: "user", content: "hello" }],
        stream: true,
        timeoutMs: 5000,
        requestId: "req-finish-1",
      },
      emit: (e) => events.push(e),
    });

    const errorEvent = events.find((e) => e.type === "error");
    expect(errorEvent).toBeUndefined();

    const doneEvent = events.find((e) => e.type === "done");
    expect(doneEvent).toBeDefined();
    expect(run.text).toBe("Complete response");
  });

  it("emits bad-response error when stream closes without sending any content", async () => {
    routes.set("POST /chat/completions", {
      body: "",
    });

    const run = new ChatRun("req-empty-1", "TestProvider");
    const adapter = new OpenAICompatibleAdapter();
    const events: StreamEvent[] = [];

    await run.run({
      adapter,
      ctx: {
        baseUrl,
        apiKey: "sk-test",
        organizationId: null,
        providerLabel: "TestProvider",
        allowLocalhost: true,
      },
      opts: {
        modelId: "gpt-mock",
        messages: [{ role: "user", content: "hello" }],
        stream: true,
        timeoutMs: 5000,
        requestId: "req-empty-1",
      },
      emit: (e) => events.push(e),
    });

    const errorEvent = events.find((e) => e.type === "error");
    expect(errorEvent).toBeDefined();
    expect(errorEvent).toMatchObject({
      type: "error",
      error: {
        code: "bad-response",
      },
    });
  });

  it("emits cancelled done event when client cancels mid-stream", async () => {
    const run = new ChatRun("req-cancel-1", "TestProvider");
    const adapter = new OpenAICompatibleAdapter();
    const events: StreamEvent[] = [];

    run.cancel();
    expect(run.isCancelled).toBe(true);

    await run.run({
      adapter,
      ctx: {
        baseUrl,
        apiKey: "sk-test",
        organizationId: null,
        providerLabel: "TestProvider",
        allowLocalhost: true,
      },
      opts: {
        modelId: "gpt-mock",
        messages: [{ role: "user", content: "hello" }],
        stream: true,
        timeoutMs: 5000,
        requestId: "req-cancel-1",
      },
      emit: (e) => events.push(e),
    });

    const doneEvent = events.find((e) => e.type === "done");
    expect(doneEvent).toBeDefined();
    if (doneEvent && doneEvent.type === "done") {
      expect(doneEvent.finishReason).toBe("cancelled");
    }
  });

  it("times out when chunks stop arriving and inactivity window expires", async () => {
    let cleanupTimer: ReturnType<typeof setTimeout> | undefined;
    routes.set("POST /chat/completions", {
      handler: (_req, res) => {
        res.writeHead(200, {
          "content-type": "text/event-stream",
          "cache-control": "no-cache",
        });
        res.write('data: {"choices":[{"delta":{"content":"First chunk"}}]}\n\n');
        // Do not send anything else; clean up after 500ms so socket closes
        cleanupTimer = setTimeout(() => {
          try {
            res.end();
          } catch {
            /* ignore */
          }
        }, 500);
      },
    });

    const run = new ChatRun("req-inactivity-1", "TestProvider");
    const adapter = new OpenAICompatibleAdapter();
    const events: StreamEvent[] = [];

    await run.run({
      adapter,
      ctx: {
        baseUrl,
        apiKey: "sk-test",
        organizationId: null,
        providerLabel: "TestProvider",
        allowLocalhost: true,
      },
      opts: {
        modelId: "gpt-mock",
        messages: [{ role: "user", content: "hello" }],
        stream: true,
        timeoutMs: 80, // Inactivity timeout 80ms
        requestId: "req-inactivity-1",
      },
      emit: (e) => events.push(e),
    });

    clearTimeout(cleanupTimer);

    const errorEvent = events.find((e) => e.type === "error");
    expect(errorEvent).toBeDefined();
    expect(errorEvent).toMatchObject({
      type: "error",
      error: {
        code: "timeout",
        retryable: true,
      },
    });
    expect(run.error?.code).toBe("timeout");
  });

  it("completes successfully when chunks arrive steadily past the inactivity timeout", async () => {
    routes.set("POST /chat/completions", {
      handler: (_req, res) => {
        res.writeHead(200, {
          "content-type": "text/event-stream",
          "cache-control": "no-cache",
        });

        // Send 4 chunks 35ms apart (total elapsed ~105ms, exceeding 70ms inactivity window)
        res.write('data: {"choices":[{"delta":{"content":"Part1"}}]}\n\n');
        setTimeout(() => {
          res.write('data: {"choices":[{"delta":{"content":"Part2"}}]}\n\n');
          setTimeout(() => {
            res.write('data: {"choices":[{"delta":{"content":"Part3"}}]}\n\n');
            setTimeout(() => {
              res.write("data: [DONE]\n\n");
              res.end();
            }, 35);
          }, 35);
        }, 35);
      },
    });

    const run = new ChatRun("req-steady-1", "TestProvider");
    const adapter = new OpenAICompatibleAdapter();
    const events: StreamEvent[] = [];

    await run.run({
      adapter,
      ctx: {
        baseUrl,
        apiKey: "sk-test",
        organizationId: null,
        providerLabel: "TestProvider",
        allowLocalhost: true,
      },
      opts: {
        modelId: "gpt-mock",
        messages: [{ role: "user", content: "hello" }],
        stream: true,
        timeoutMs: 70, // 70ms inactivity window
        requestId: "req-steady-1",
      },
      emit: (e) => events.push(e),
    });

    const errorEvent = events.find((e) => e.type === "error");
    expect(errorEvent).toBeUndefined();

    const doneEvent = events.find((e) => e.type === "done");
    expect(doneEvent).toBeDefined();
    expect(run.text).toBe("Part1Part2Part3");
    expect(run.error).toBeNull();
  });
});
