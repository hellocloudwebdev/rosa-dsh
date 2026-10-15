/**
 * A minimal, allocation-conscious Server-Sent-Events parser.
 *
 * Deliberately framework-free so the same code runs in the browser, in Node
 * serverless functions and in Workers.
 */

export interface SSEEvent {
  /** `event:` field, defaults to "message" per the SSE spec. */
  event: string;
  /** Concatenated `data:` lines, joined with "\n". */
  data: string;
  /** `id:` field when present. */
  id?: string;
  /** `retry:` field in ms when present. */
  retry?: number;
}

export interface SSEParserHandlers {
  onEvent: (event: SSEEvent) => void;
  /** Called when a comment line (`:comment`) is received. */
  onComment?: (text: string) => void;
}

/**
 * Incremental SSE parser. Feed it decoded text chunks; it emits complete events.
 * Handles CRLF, LF and CR line endings, multi-line data fields, and BOM.
 */
export class SSEParser {
  private buffer = "";
  private dataLines: string[] = [];
  private eventName: string | null = null;
  private lastEventId: string | undefined;
  private retry: number | undefined;
  private seenField = false;

  constructor(private readonly handlers: SSEParserHandlers) {}

  /** Feed a chunk of text. Returns the events completed by this chunk. */
  push(chunk: string): SSEEvent[] {
    this.buffer += chunk;
    const emitted: SSEEvent[] = [];

    // Strip a UTF-8 BOM at the very start of the stream.
    if (this.buffer.charCodeAt(0) === 0xfeff) this.buffer = this.buffer.slice(1);

    let idx: number;
    // Normalise line endings to LF as we scan.
    while ((idx = this.buffer.search(/\r\n|\n|\r/)) !== -1) {
      const match = this.buffer.match(/\r\n|\n|\r/);
      const terminator = match ? match[0] : "\n";
      const line = this.buffer.slice(0, idx);
      this.buffer = this.buffer.slice(idx + terminator.length);

      if (line === "") {
        const completed = this.dispatch();
        if (completed) {
          emitted.push(completed);
          this.handlers.onEvent(completed);
        }
      } else {
        this.field(line);
      }
    }
    return emitted;
  }

  /** Flush at end-of-stream; some providers omit the final blank line. */
  flush(): SSEEvent[] {
    if (this.buffer.length > 0) {
      const line = this.buffer;
      this.buffer = "";
      if (line !== "") this.field(line);
    }
    if (this.dataLines.length > 0 || this.eventName !== null || this.seenField) {
      const completed = this.dispatch();
      return completed ? [completed] : [];
    }
    return [];
  }

  private field(line: string): void {
    if (line.startsWith(":")) {
      this.handlers.onComment?.(line.slice(1));
      return;
    }
    const colon = line.indexOf(":");
    let field: string;
    let value: string;
    if (colon === -1) {
      field = line;
      value = "";
    } else {
      field = line.slice(0, colon);
      value = line.slice(colon + 1);
      if (value.startsWith(" ")) value = value.slice(1);
    }

    this.seenField = true;
    switch (field) {
      case "data":
        this.dataLines.push(value);
        break;
      case "event":
        this.eventName = value;
        break;
      case "id":
        this.lastEventId = value;
        break;
      case "retry": {
        const n = Number.parseInt(value, 10);
        if (Number.isFinite(n) && n >= 0) this.retry = n;
        break;
      }
      default:
        // Unknown field — ignore per the SSE spec.
        break;
    }
  }

  private dispatch(): SSEEvent | null {
    if (!this.seenField) {
      this.reset();
      return null;
    }
    if (this.dataLines.length === 0) {
      // An event with no data is dropped per the SSE spec.
      this.reset();
      return null;
    }
    const event: SSEEvent = {
      event: this.eventName ?? "message",
      data: this.dataLines.join("\n"),
    };
    if (this.lastEventId !== undefined) event.id = this.lastEventId;
    if (this.retry !== undefined) event.retry = this.retry;
    this.reset();
    return event;
  }

  private reset(): void {
    this.dataLines = [];
    this.eventName = null;
    this.seenField = false;
  }
}

/**
 * Convenience wrapper: parse an entire SSE body string into events.
 * Exported for tests and for non-streaming fallbacks.
 */
export function parseSSEAll(text: string): SSEEvent[] {
  const out: SSEEvent[] = [];
  const parser = new SSEParser({ onEvent: (e) => out.push(e) });
  parser.push(text);
  out.push(...parser.flush());
  return out;
}
