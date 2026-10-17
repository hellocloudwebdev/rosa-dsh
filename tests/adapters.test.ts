import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";

/**
 * Provider adapter tests against a real local HTTP server.
 *
 * These are *mocked endpoints*, not real providers: every response is scripted.
 * They verify the adapter's wire handling (headers, body shape, SSE decoding,
 * usage extraction) rather than any provider's live behaviour.
 */

let server: Server;
let baseUrl: string;

/** Scripted responses keyed by path. */
const routes = new Map<string, { body: string; headers?: Record<string, string> }>();

beforeAll(async () => {
  server = createServer((req, res) => {
    const url = new URL(req.url ?? "/", `http://127.0.0.1`);
    const key = `${req.method} ${url.pathname}${url.search}`;
    const route = routes.get(key) ?? routes.get(`${req.method} ${url.pathname}`);
    if (!route) {
      res.writeHead(404, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: { message: `no route for ${key}` } }));
      return;
    }
    res.writeHead(200, {
      "content-type": "text/event-stream",
      ...route.headers,
    });
    // Emit in slices so the incremental SSE path is genuinely exercised.
    for (let i = 0; i < route.body.length; i += 7) {
      res.write(route.body.slice(i, i + 7));
    }
    res.end();
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const addr = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${addr.port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

function setRoute(method: string, path: string, body: string) {
  routes.set(`${method} ${path}`, { body });
}

/**
 * `chatHeaders` is protected and takes a single ctx argument; reach it through
 * a typed cast, exactly as `chatUrl` already is elsewhere in this file.
 */
function chatHeadersOf(
  adapter: unknown,
  ctx: unknown,
): Record<string, string> {
  return (adapter as { chatHeaders(c: unknown): Record<string, string> }).chatHeaders(ctx);
}

/**
 * `buildBody` is protected; call it through a cast so the test asserts the
 * exact wire shape without relaxing the adapter's encapsulation.
 */
function buildBodyOf(
  adapter: unknown,
  ctx: unknown,
  opts: unknown,
): Record<string, unknown> {
  return (adapter as { buildBody(c: unknown, o: unknown): Record<string, unknown> }).buildBody(
    ctx,
    opts,
  );
}

/** Capture what the server received. */
const received: Array<{ method: string; url: string; headers: Record<string, string>; body: unknown }> = [];

function recordRequests() {
  routes.clear();
  server.removeAllListeners("request");
  server.on("request", (req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (c) => chunks.push(c as Buffer));
    req.on("end", () => {
      const raw = Buffer.concat(chunks).toString("utf8");
      received.push({
        method: req.method ?? "",
        url: req.url ?? "",
        headers: req.headers as Record<string, string>,
        body: raw ? JSON.parse(raw) : null,
      });
      const key = `${req.method} ${new URL(req.url ?? "/", "http://x").pathname}`;
      const route = routes.get(key);
      if (!route) {
        res.writeHead(404).end("{}");
        return;
      }
      res.writeHead(200, { "content-type": "text/event-stream", ...route.headers });
      for (let i = 0; i < route.body.length; i += 11) res.write(route.body.slice(i, i + 11));
      res.end();
    });
  });
}

describe("OpenAI-compatible adapter", () => {
  it("streams deltas and reports usage", async () => {
    const { OpenAICompatibleAdapter } = await import("../server/adapters/openai.js");
    const { providerFetch, decodeTextStream } = await import("../server/http.js");
    const { SSEParser } = await import("../shared/sse.js");

    const sse = [
      'data: {"choices":[{"delta":{"role":"assistant"}}]}',
      "",
      'data: {"choices":[{"delta":{"content":"Hello"}}]}',
      "",
      'data: {"choices":[{"delta":{"content":", world"}}]}',
      "",
      'data: {"choices":[{"delta":{},"finish_reason":"stop"}],"usage":{"prompt_tokens":9,"completion_tokens":3}}',
      "",
      "data: [DONE]",
      "",
      "",
    ].join("\n");

    setRoute("POST", "/chat/completions", sse);

    const adapter = new OpenAICompatibleAdapter();
    const ctx = {
      baseUrl,
      apiKey: "sk-test-abcdefghijklmnop",
      organizationId: null,
      providerLabel: "Test",
      // The mock provider listens on 127.0.0.1. Production never sets this; the
      // local dev server sets it so it can reach the user's own Ollama.
      allowLocalhost: true,
    };

    const res = await providerFetch({
      url: `${baseUrl}/chat/completions`,
      method: "POST",
      headers: chatHeadersOf(adapter, ctx),
      body: JSON.stringify(buildBodyOf(adapter, ctx, {
        modelId: "test-model",
        messages: [{ role: "user", content: "hi" }],
        stream: true,
        timeoutMs: 5000,
        requestId: "r1",
      })),
      timeoutMs: 5000,
      allowLocalhost: true,
    });

    let text = "";
    let usage: { inputTokens: number | null; outputTokens: number | null } | null = null;
    const parser = new SSEParser({
      onEvent: (evt) => {
        if (evt.data === "[DONE]") return;
        const json = JSON.parse(evt.data) as {
          choices?: Array<{ delta?: { content?: string } }>;
          usage?: { prompt_tokens?: number; completion_tokens?: number };
        };
        text += json.choices?.[0]?.delta?.content ?? "";
        if (json.usage) {
          usage = {
            inputTokens: json.usage.prompt_tokens ?? null,
            outputTokens: json.usage.completion_tokens ?? null,
          };
        }
      },
    });
    for await (const chunk of decodeTextStream(res.body as ReadableStream<Uint8Array>)) {
      parser.push(chunk);
    }
    parser.flush();

    expect(text).toBe("Hello, world");
    expect(usage).toEqual({ inputTokens: 9, outputTokens: 3 });
  });

  it("sends a bearer token and a well-formed body", async () => {
    const { OpenAICompatibleAdapter } = await import("../server/adapters/openai.js");
    const { providerFetch } = await import("../server/http.js");

    recordRequests();
    setRoute("POST", "/chat/completions", "data: [DONE]\n\n");

    const adapter = new OpenAICompatibleAdapter();
    const ctx = {
      baseUrl,
      apiKey: "sk-secret-key-value",
      organizationId: "org-xyz",
      providerLabel: "Test",
      // The mock provider listens on 127.0.0.1. Production never sets this; the
      // local dev server sets it so it can reach the user's own Ollama.
      allowLocalhost: true,
    };

    await providerFetch({
      url: `${baseUrl}/chat/completions`,
      method: "POST",
      headers: chatHeadersOf(adapter, ctx),
      body: JSON.stringify(buildBodyOf(adapter, ctx, {
        modelId: "gpt-test",
        messages: [
          { role: "system", content: "be terse" },
          { role: "user", content: "hello" },
        ],
        temperature: 0.4,
        maxTokens: 256,
        stream: true,
        timeoutMs: 5000,
        requestId: "r2",
      })),
      timeoutMs: 5000,
      allowLocalhost: true,
    });

    const last = received.at(-1)!;
    expect(last.headers.authorization).toBe("Bearer sk-secret-key-value");
    expect(last.headers["openai-organization"]).toBe("org-xyz");
    expect(last.body).toMatchObject({
      model: "gpt-test",
      stream: true,
      temperature: 0.4,
      max_tokens: 256,
      stream_options: { include_usage: true },
    });
    expect((last.body as { messages: unknown[] }).messages).toHaveLength(2);
  });

  it("parses an OpenAI-style model listing", async () => {
    const { OpenAICompatibleAdapter } = await import("../server/adapters/openai.js");
    const adapter = new OpenAICompatibleAdapter();
    const parsed = adapter.parseModelList({
      object: "list",
      data: [
        {
          id: "gpt-4o",
          object: "model",
          created: 1,
          owned_by: "openai",
        },
        { id: "text-embedding-3-small", owned_by: "openai" },
        { id: "gpt-4o-mini", owned_by: "system" },
        // Malformed entries must be skipped, not crash the parse.
        { object: "model" },
        null,
        "not-an-object",
      ],
    });
    expect(parsed.fromListing).toBe(true);
    expect(parsed.models.map((m) => m.id)).toEqual([
      "gpt-4o",
      "text-embedding-3-small",
      "gpt-4o-mini",
    ]);
  });

  it("parses an OpenRouter-style listing with rich metadata", async () => {
    const { OpenAICompatibleAdapter } = await import("../server/adapters/openai.js");
    const adapter = new OpenAICompatibleAdapter();
    const parsed = adapter.parseModelList({
      data: [
        {
          id: "anthropic/claude-3.5-sonnet",
          name: "Anthropic: Claude 3.5 Sonnet",
          description: "A capable model.",
          context_length: 200000,
          architecture: { input_modalities: ["text", "image"], output_modalities: ["text"] },
          top_provider: { max_completion_tokens: 8192, context_length: 200000 },
          supported_parameters: ["tools", "temperature", "stream"],
        },
      ],
    });

    const m = parsed.models[0];
    expect(m.contextWindow).toBe(200000);
    expect(m.maxOutputTokens).toBe(8192);
    expect(m.vision).toBe(true);
    expect(m.tools).toBe(true);
    expect(m.streaming).toBe(true);
    expect(m.structuredOutput).toBe(false);
    expect(m.displayName).toBe("Anthropic: Claude 3.5 Sonnet");
  });

  it("returns an empty list, not a crash, for a malformed payload", async () => {
    const { OpenAICompatibleAdapter } = await import("../server/adapters/openai.js");
    const adapter = new OpenAICompatibleAdapter();
    expect(adapter.parseModelList({}).models).toEqual([]);
    expect(adapter.parseModelList(null).models).toEqual([]);
    expect(adapter.parseModelList({ data: "nope" }).models).toEqual([]);
  });

  it("completes without streaming", async () => {
    const { OpenAICompatibleAdapter } = await import("../server/adapters/openai.js");

    recordRequests();
    routes.set("POST /chat/completions", {
      body: JSON.stringify({
        choices: [{ message: { role: "assistant", content: "Non-streamed answer" } }],
        usage: { prompt_tokens: 4, completion_tokens: 6 },
      }),
    });

    const adapter = new OpenAICompatibleAdapter();
    const result = await adapter.complete(
      {
        baseUrl,
        apiKey: "sk-x",
        organizationId: null,
        providerLabel: "Test",
        allowLocalhost: true,
      },
      {
        modelId: "m",
        messages: [{ role: "user", content: "hi" }],
        stream: false,
        timeoutMs: 5000,
        requestId: "r3",
      },
    );

    expect(result.text).toBe("Non-streamed answer");
    expect(result.usage).toEqual({ inputTokens: 4, outputTokens: 6 });
  });
});

describe("Anthropic adapter", () => {
  it("uses x-api-key and anthropic-version headers", async () => {
    const { AnthropicAdapter } = await import("../server/adapters/anthropic.js");
    const { providerFetch } = await import("../server/http.js");

    recordRequests();
    routes.set("POST /messages", {
      body: [
        "event: message_start",
        'data: {"type":"message_start","message":{"usage":{"input_tokens":11}}}',
        "",
        "event: content_block_delta",
        'data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"Bonjour"}}',
        "",
        "event: content_block_delta",
        'data: {"type":"content_block_delta","delta":{"type":"text_delta","text":" monde"}}',
        "",
        "event: message_delta",
        'data: {"type":"message_delta","usage":{"output_tokens":5}}',
        "",
        "event: message_stop",
        'data: {"type":"message_stop"}',
        "",
        "",
      ].join("\n"),
    });

    const adapter = new AnthropicAdapter();
    const ctx = { baseUrl, apiKey: "sk-ant-secret", organizationId: null, providerLabel: "Anthropic" };

    const res = await providerFetch({
      url: `${baseUrl}/messages`,
      method: "POST",
      headers: chatHeadersOf(adapter, ctx),
      body: JSON.stringify(buildBodyOf(adapter, ctx, {
        modelId: "claude-test",
        messages: [
          { role: "system", content: "be brief" },
          { role: "user", content: "hi" },
        ],
        stream: true,
        timeoutMs: 5000,
        requestId: "r4",
      })),
      timeoutMs: 5000,
      allowLocalhost: true,
    });

    const last = received.at(-1)!;
    expect(last.headers["x-api-key"]).toBe("sk-ant-secret");
    expect(last.headers["anthropic-version"]).toBe("2023-06-01");

    const body = last.body as {
      model: string;
      system?: string;
      messages: Array<{ role: string; content: string }>;
      max_tokens: number;
      stream: boolean;
    };
    expect(body.model).toBe("claude-test");
    expect(body.system).toBe("be brief");
    expect(body.messages).toEqual([{ role: "user", content: "hi" }]);
    expect(typeof body.max_tokens).toBe("number");

    // Decode the typed SSE stream.
    const { SSEParser } = await import("../shared/sse.js");
    const { decodeTextStream } = await import("../server/http.js");
    let text = "";
    let outputTokens: number | null = null;
    const parser = new SSEParser({
      onEvent: (evt) => {
        const json = JSON.parse(evt.data) as {
          type: string;
          delta?: { text?: string };
          usage?: { output_tokens?: number };
        };
        if (json.type === "content_block_delta" && json.delta?.text) text += json.delta.text;
        if (json.type === "message_delta") outputTokens = json.usage?.output_tokens ?? null;
      },
    });
    for await (const chunk of decodeTextStream(res.body as ReadableStream<Uint8Array>)) {
      parser.push(chunk);
    }
    parser.flush();

    expect(text).toBe("Bonjour monde");
    expect(outputTokens).toBe(5);
  });

  it("requires max_tokens even when the caller omits it", async () => {
    const { AnthropicAdapter } = await import("../server/adapters/anthropic.js");
    const adapter = new AnthropicAdapter();
    const body = buildBodyOf(adapter, {
      baseUrl,
      apiKey: "k",
      organizationId: null,
      providerLabel: "A",
    }, {
      modelId: "m",
      messages: [{ role: "user", content: "hi" }],
      stream: false,
      timeoutMs: 5000,
      requestId: "r5",
    });
    expect(typeof body.max_tokens).toBe("number");
    expect(body.max_tokens as number).toBeGreaterThan(0);
  });

  it("parses an Anthropic model listing", async () => {
    const { AnthropicAdapter } = await import("../server/adapters/anthropic.js");
    const parsed = new AnthropicAdapter().parseModelList({
      data: [
        { id: "claude-3-5-sonnet-20241022", display_name: "Claude 3.5 Sonnet" },
        { id: "claude-3-opus-20240229" },
      ],
    });
    expect(parsed.models[0].displayName).toBe("Claude 3.5 Sonnet");
    expect(parsed.models[1].displayName).toBe("claude-3-opus-20240229");
    // Anthropic does not report a context window here, so we must not invent one.
    expect(parsed.models[0].contextWindow).toBeNull();
  });

  it("surfaces an Anthropic overload error from the stream", async () => {
    const { AnthropicAdapter } = await import("../server/adapters/anthropic.js");
    const events: Array<{ type: string }> = [];
    const adapter = new AnthropicAdapter();
    // handleSSE is protected; reach it through a typed cast for this unit test.
    const handle = (adapter as unknown as {
      handleSSE: (d: string, e: (x: unknown) => void) => void;
    }).handleSSE.bind(adapter);
    handle(
      JSON.stringify({ type: "error", error: { type: "overloaded_error", message: "Overloaded" } }),
      (e) => events.push(e as { type: string }),
    );
    expect(events[0]).toMatchObject({ type: "error" });
  });
});

describe("Google Gemini adapter", () => {
  it("uses x-goog-api-key and a per-model streaming URL", async () => {
    const { GoogleAdapter } = await import("../server/adapters/google.js");
    const adapter = new GoogleAdapter();
    const ctx = { baseUrl, apiKey: "AIzaSy-secret-key", organizationId: null, providerLabel: "Gemini" };

    const url = (adapter as unknown as { chatUrl: (c: unknown, m: string) => string }).chatUrl(
      ctx,
      "gemini-1.5-pro",
    );
    expect(url).toContain("/models/gemini-1.5-pro:streamGenerateContent");
    expect(url).toContain("alt=sse");

    const body = buildBodyOf(adapter, ctx, {
      modelId: "gemini-1.5-pro",
      messages: [
        { role: "system", content: "be brief" },
        { role: "user", content: "hi" },
        { role: "assistant", content: "hello!" },
        { role: "user", content: "how are you?" },
      ],
      stream: true,
      timeoutMs: 5000,
      requestId: "r6",
    }) as {
      contents: Array<{ role: string; parts: Array<{ text: string }> }>;
      systemInstruction?: { parts: Array<{ text: string }> };
    };

    expect(body.systemInstruction?.parts[0].text).toBe("be brief");
    // "assistant" must be mapped to Gemini's "model" role.
    expect(body.contents.map((c) => c.role)).toEqual(["user", "model", "user"]);
  });

  it("decodes candidate chunks and usageMetadata", async () => {
    const { GoogleAdapter } = await import("../server/adapters/google.js");
    const adapter = new GoogleAdapter();
    const events: Array<{ type: string; text?: string }> = [];
    const handle = (adapter as unknown as {
      handleSSE: (d: string, e: (x: unknown) => void) => void;
    }).handleSSE.bind(adapter);

    handle(
      JSON.stringify({
        candidates: [{ content: { parts: [{ text: "Hi" }] } }],
        usageMetadata: { promptTokenCount: 5, candidatesTokenCount: 1 },
      }),
      (e) => events.push(e as { type: string; text?: string }),
    );
    handle(
      JSON.stringify({ candidates: [{ content: { parts: [{ text: " there" }] } }] }),
      (e) => events.push(e as { type: string; text?: string }),
    );

    expect(events.filter((e) => e.type === "delta").map((e) => e.text).join("")).toBe("Hi there");
    const usage = events.find((e) => e.type === "usage") as unknown as {
      inputTokens: number;
      outputTokens: number;
    };
    expect(usage.inputTokens).toBe(5);
    expect(usage.outputTokens).toBe(1);
  });

  it("strips the models/ prefix when parsing a listing", async () => {
    const { GoogleAdapter } = await import("../server/adapters/google.js");
    const parsed = new GoogleAdapter().parseModelList({
      models: [
        {
          name: "models/gemini-1.5-pro",
          displayName: "Gemini 1.5 Pro",
          inputTokenLimit: 1_000_000,
          outputTokenLimit: 8192,
          supportedGenerationMethods: ["generateContent", "streamGenerateContent"],
        },
      ],
    });
    expect(parsed.models[0].id).toBe("gemini-1.5-pro");
    expect(parsed.models[0].contextWindow).toBe(1_000_000);
    expect(parsed.models[0].maxOutputTokens).toBe(8192);
    expect(parsed.models[0].streaming).toBe(true);
  });
});

describe("Azure OpenAI adapter", () => {
  it("uses api-key auth and puts the deployment in the path", async () => {
    const { AzureOpenAIAdapter } = await import("../server/adapters/azure.js");
    const adapter = new AzureOpenAIAdapter();
    const ctx = {
      baseUrl: "https://my-resource.openai.azure.com/openai",
      apiKey: "azure-key-123",
      organizationId: null,
      providerLabel: "Azure",
    };
    const url = (adapter as unknown as { chatUrl: (c: unknown, m: string) => string }).chatUrl(
      ctx,
      "my-deployment",
    );
    expect(url).toContain("/deployments/my-deployment/chat/completions");
    expect(url).toContain("api-version=");

    const headers = chatHeadersOf(adapter, ctx);
    expect(headers["api-key"]).toBe("azure-key-123");
    expect(headers.authorization).toBeUndefined();
  });

  it("throws a helpful error for model discovery", async () => {
    const { AzureOpenAIAdapter } = await import("../server/adapters/azure.js");
    const adapter = new AzureOpenAIAdapter();
    expect(() => adapter.listModelsUrl()).toThrow(/does not expose a model-listing/i);
  });
});

describe("adapter registry", () => {
  it("registers an adapter for every provider kind we advertise", async () => {
    const { getAdapter, hasAdapter } = await import("../server/adapters/index.js");
    for (const kind of [
      "openai",
      "openai-compatible",
      "anthropic",
      "google",
      "azure-openai",
      "openrouter",
      "groq",
      "mistral",
      "cohere",
    ] as const) {
      expect(hasAdapter(kind), `missing adapter for ${kind}`).toBe(true);
      expect(() => getAdapter(kind)).not.toThrow();
    }
  });

  it("reuses the OpenAI-compatible adapter for gateway providers", async () => {
    const { getAdapter } = await import("../server/adapters/index.js");
    for (const kind of ["openrouter", "groq", "mistral", "cohere"] as const) {
      expect(getAdapter(kind).kind, `${kind} should use the openai-compatible driver`).toBe(
        "openai-compatible",
      );
    }
  });

  it("keeps a dedicated adapter for genuinely different wire formats", async () => {
    const { getAdapter } = await import("../server/adapters/index.js");
    expect(getAdapter("anthropic").kind).toBe("anthropic");
    expect(getAdapter("google").kind).toBe("google");
    expect(getAdapter("azure-openai").kind).toBe("azure-openai");
  });

  it("uses the OpenAI-compatible driver for OpenAI itself", async () => {
    const { getAdapter } = await import("../server/adapters/index.js");
    // OpenAI's wire format is identical to the generic OpenAI-compatible one;
    // the dedicated subclass exists only to own its default base URL and org
    // header, not a different protocol.
    expect(getAdapter("openai").kind).toBe("openai-compatible");
  });
});
