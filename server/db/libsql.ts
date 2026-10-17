/**
 * libsql / Turso over HTTP.
 *
 * Documented, non-Cloudflare alternative to D1 so the deployment is not tied to
 * one vendor. Turso's free plan is compatible with a small Rosa deployment.
 *
 * Uses the libsql HTTP pipeline protocol directly rather than adding the
 * `@libsql/client` dependency: two endpoints, stable JSON, no native build
 * step. Nodes are positional ("?"), matching the rest of Rosa's portable SQL.
 */

import type { SqlDriver, SqlStatement } from "./driver.js";

interface LibsqlValue {
  type: "null" | "integer" | "float" | "text" | "blob";
  value?: string | number | null;
  base64?: string;
}

interface LibsqlCol {
  name: string;
}

interface LibsqlResult {
  cols?: LibsqlCol[];
  rows?: LibsqlValue[][];
  affected_row_count?: number;
  last_insert_rowid?: string | number | null;
}

interface LibsqlPipelineResponse {
  results?: LibsqlResult[];
  baton?: string | null;
  base_url?: string | null;
  error?: { message?: string; code?: string };
}

export interface LibsqlOptions {
  /** `libsql://…` or `https://…`. Converted to the https wire form. */
  url: string;
  authToken?: string;
  fetchImpl?: typeof fetch;
}

function toWireUrl(url: string): string {
  const trimmed = url.replace(/\/+$/, "");
  if (trimmed.startsWith("libsql://")) {
    return `https://${trimmed.slice("libsql://".length)}`;
  }
  return trimmed;
}

function decodeValue(v: LibsqlValue): unknown {
  switch (v.type) {
    case "null":
      return null;
    case "integer":
      return typeof v.value === "number" ? v.value : Number(v.value ?? 0);
    case "float":
      return typeof v.value === "number" ? v.value : Number(v.value ?? 0);
    case "text":
      return v.value === undefined || v.value === null ? null : String(v.value);
    case "blob":
      return v.base64 ?? null;
    default:
      return v.value ?? null;
  }
}

function decodeRows(result: LibsqlResult | undefined): Record<string, unknown>[] {
  if (!result?.rows || !result.cols) return [];
  const names = result.cols.map((c) => c.name);
  return result.rows.map((row) => {
    const out: Record<string, unknown> = {};
    names.forEach((name, i) => {
      out[name] = decodeValue(row[i]);
    });
    return out;
  });
}

/** Encode a bound parameter into libsql's tagged wire format. */
function encodeArg(value: (string | number | null | Uint8Array) | undefined): LibsqlValue {
  if (value === null || value === undefined) return { type: "null" };
  if (typeof value === "number") {
    return Number.isInteger(value)
      ? { type: "integer", value }
      : { type: "float", value };
  }
  if (typeof value === "string") return { type: "text", value };
  // Uint8Array → base64
  let binary = "";
  for (const b of value) binary += String.fromCharCode(b);
  return { type: "blob", base64: btoa(binary) };
}

class LibsqlStatement<Row> implements SqlStatement<Row> {
  constructor(
    private readonly driver: LibsqlHttpDriver,
    readonly sql: string,
    readonly args: Array<string | number | null | Uint8Array> = [],
  ) {}

  bind(...values: Array<string | number | null | Uint8Array>): SqlStatement<Row> {
    return new LibsqlStatement<Row>(this.driver, this.sql, values);
  }

  async first(): Promise<Row | null> {
    const rows = await this.driver.query<Row>(this.sql, this.args);
    return rows[0] ?? null;
  }

  async all(): Promise<{ results: Row[] }> {
    return { results: await this.driver.query<Row>(this.sql, this.args) };
  }

  async run(): Promise<{ meta: { changes: number; last_row_id: number } }> {
    return { meta: await this.driver.runMeta(this.sql, this.args) };
  }
}

export class LibsqlHttpDriver implements SqlDriver {
  readonly name = "http" as const;
  private readonly base: string;
  private readonly headers: Record<string, string>;
  private readonly fetchImpl: typeof fetch;

  constructor(opts: LibsqlOptions) {
    this.base = toWireUrl(opts.url);
    this.headers = { "content-type": "application/json" };
    if (opts.authToken) this.headers.authorization = `Bearer ${opts.authToken}`;
    this.fetchImpl = opts.fetchImpl ?? ((...args) => globalThis.fetch(...args));
  }

  prepare<Row = Record<string, unknown>>(sql: string): SqlStatement<Row> {
    return new LibsqlStatement<Row>(this, sql, []);
  }

  async query<Row>(sql: string, args: Array<string | number | null | Uint8Array>): Promise<Row[]> {
    const results = await this.pipeline([{ sql, args }]);
    return decodeRows(results[0]) as Row[];
  }

  async runMeta(
    sql: string,
    args: Array<string | number | null | Uint8Array>,
  ): Promise<{ changes: number; last_row_id: number }> {
    const results = await this.pipeline([{ sql, args }]);
    const r = results[0];
    return {
      changes: Number(r?.affected_row_count ?? 0),
      last_row_id: Number(r?.last_insert_rowid ?? 0),
    };
  }

  /**
   * libsql's pipeline endpoint executes every request in one HTTP round trip
   * and one implicit transaction — a real batch, not a loop of statements.
   */
  async batch(statements: SqlStatement[]): Promise<unknown[]> {
    const requests = statements.map((s) => {
      const stmt = s as unknown as Partial<LibsqlStatement<unknown>>;
      if (typeof stmt.sql !== "string") {
        throw new Error("LibsqlHttpDriver.batch received a foreign statement.");
      }
      return { sql: stmt.sql, args: stmt.args ?? [] };
    });
    const results = await this.pipeline(requests);
    return results.map((r) => ({
      meta: {
        changes: Number(r?.affected_row_count ?? 0),
        last_row_id: Number(r?.last_insert_rowid ?? 0),
      },
    }));
  }

  async exec(sql: string): Promise<void> {
    // libsql accepts exactly one statement per request, like D1's HTTP API.
    const { splitSqlStatements } = await import("./d1rest.js");
    const parts = splitSqlStatements(sql);
    if (parts.length === 0) return;
    await this.pipeline(parts.map((p) => ({ sql: p, args: [] })));
  }

  private async pipeline(
    requests: Array<{ sql: string; args: Array<string | number | null | Uint8Array> }>,
  ): Promise<LibsqlResult[]> {
    const body = JSON.stringify({
      requests: requests.map((r) => ({
        type: "execute",
        stmt: { sql: r.sql, args: r.args.map(encodeArg) },
      })),
    });

    let res: Response;
    try {
      res = await this.fetchImpl(`${this.base}/v2/pipeline`, {
        method: "POST",
        headers: this.headers,
        body,
      });
    } catch (err) {
      throw new Error(
        `Could not reach the libsql/Turso endpoint: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    if (res.status === 401 || res.status === 403) {
      throw new Error(
        `libsql/Turso rejected the credentials (HTTP ${res.status}). Check DATABASE_AUTH_TOKEN.`,
      );
    }
    if (!res.ok) throw new Error(`libsql/Turso returned HTTP ${res.status}.`);

    let payload: LibsqlPipelineResponse;
    try {
      payload = (await res.json()) as LibsqlPipelineResponse;
    } catch {
      throw new Error("libsql/Turso returned a malformed JSON response.");
    }
    if (payload.error?.message) throw new Error(`libsql error: ${payload.error.message}`);
    return payload.results ?? [];
  }
}
