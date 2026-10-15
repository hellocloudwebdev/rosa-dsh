import { describe, expect, it } from "vitest";
import { SSEParser, parseSSEAll, type SSEEvent } from "../shared/sse.js";

function collect(text: string): SSEEvent[] {
  const out: SSEEvent[] = [];
  const parser = new SSEParser({ onEvent: (e) => out.push(e) });
  parser.push(text);
  out.push(...parser.flush());
  return out;
}

describe("SSEParser", () => {
  it("parses a single simple event", () => {
    const events = collect("data: hello\n\n");
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ event: "message", data: "hello" });
  });

  it("strips exactly one leading space after the colon", () => {
    expect(collect("data:  two spaces\n\n")[0].data).toBe(" two spaces");
    expect(collect("data:no space\n\n")[0].data).toBe("no space");
  });

  it("joins multi-line data fields with newlines", () => {
    const events = collect("data: line1\ndata: line2\ndata: line3\n\n");
    expect(events[0].data).toBe("line1\nline2\nline3");
  });

  it("reads the event name", () => {
    const events = collect("event: content_block_delta\ndata: {}\n\n");
    expect(events[0].event).toBe("content_block_delta");
  });

  it("handles CRLF line endings", () => {
    const events = collect("event: ping\r\ndata: 1\r\n\r\n");
    expect(events).toHaveLength(1);
    expect(events[0].event).toBe("ping");
    expect(events[0].data).toBe("1");
  });

  it("handles bare CR line endings", () => {
    const events = collect("data: a\r\rdata: b\r\r");
    expect(events.map((e) => e.data)).toEqual(["a", "b"]);
  });

  it("parses several events in one buffer", () => {
    const text = 'data: {"a":1}\n\ndata: {"a":2}\n\ndata: [DONE]\n\n';
    const events = collect(text);
    expect(events).toHaveLength(3);
    expect(events[2].data).toBe("[DONE]");
  });

  it("does not emit an event with no data field", () => {
    // Per the SSE spec, an event with only an event: line and no data is ignored.
    const events = collect("event: ping\n\n");
    expect(events).toHaveLength(0);
  });

  it("emits incrementally across chunk boundaries", () => {
    const out: SSEEvent[] = [];
    const parser = new SSEParser({ onEvent: (e) => out.push(e) });
    parser.push('data: {"delta":"hel');
    expect(out).toHaveLength(0);
    parser.push('lo"}\n');
    expect(out).toHaveLength(0);
    parser.push("\n");
    expect(out).toHaveLength(1);
    expect(JSON.parse(out[0].data)).toEqual({ delta: "hello" });
  });

  it("keeps a partial trailing line buffered until a terminator arrives", () => {
    const out: SSEEvent[] = [];
    const parser = new SSEParser({ onEvent: (e) => out.push(e) });
    parser.push("data: partial");
    parser.push("-more\n\n");
    expect(out).toHaveLength(1);
    expect(out[0].data).toBe("partial-more");
  });

  it("flushes an unterminated event at end-of-stream", () => {
    // Some providers omit the final blank line.
    const out: SSEEvent[] = [];
    const parser = new SSEParser({ onEvent: (e) => out.push(e) });
    parser.push('data: {"finish":true}');
    expect(out).toHaveLength(0);
    const flushed = parser.flush();
    expect(flushed).toHaveLength(1);
    expect(JSON.parse(flushed[0].data)).toEqual({ finish: true });
  });

  it("parses a realistic OpenAI SSE stream", () => {
    const text = [
      'data: {"id":"1","choices":[{"delta":{"role":"assistant"}}]}',
      "",
      'data: {"id":"1","choices":[{"delta":{"content":"Hello"}}]}',
      "",
      'data: {"id":"1","choices":[{"delta":{"content":" world"}}]}',
      "",
      'data: {"id":"1","choices":[{"delta":{},"finish_reason":"stop"}],"usage":{"prompt_tokens":5,"completion_tokens":7}}',
      "",
      "data: [DONE]",
      "",
      "",
    ].join("\n");

    const events = collect(text);
    expect(events).toHaveLength(5);
    const contents = events
      .filter((e) => e.data !== "[DONE]")
      .map((e) => JSON.parse(e.data))
      .flatMap((j) => j.choices?.[0]?.delta?.content ?? []);
    expect(contents.join("")).toBe("Hello world");

    const last = JSON.parse(events[3].data);
    expect(last.usage).toEqual({ prompt_tokens: 5, completion_tokens: 7 });
    expect(events[4].data).toBe("[DONE]");
  });

  it("ignores comment lines", () => {
    const events = collect(": keep-alive\n\ndata: real\n\n");
    expect(events).toHaveLength(1);
    expect(events[0].data).toBe("real");
  });

  it("captures the id and retry fields", () => {
    const events = collect("id: 42\nretry: 3000\ndata: x\n\n");
    expect(events[0].id).toBe("42");
    expect(events[0].retry).toBe(3000);
  });

  it("strips a UTF-8 BOM", () => {
    const events = collect("\uFEFFdata: x\n\n");
    expect(events[0].data).toBe("x");
  });

  it("parseSSEAll agrees with incremental parsing", () => {
    const text = "data: a\n\ndata: b\n\n";
    expect(parseSSEAll(text).map((e) => e.data)).toEqual(
      collect(text).map((e) => e.data),
    );
  });
});
