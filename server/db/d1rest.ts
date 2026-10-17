/**
 * D1-over-REST driver for Node runtimes (Vercel Functions, any Node host).
 *
 * Cloudflare's D1 HTTP API exposes the same query semantics as the Worker
 * binding (`POST /query` with `[{ sql, params }]`), so this class reuses the
 * D1 statement logic shape over plain fetch. No extra npm dependency: the API
 * is three endpoints and the response shapes are stable JSON.
 *
 * This driver is what makes the Vercel target work without a paid database:
 * the same D1 database that backs the Cloudflare deployment is reached over
 * HTTPS instead of a Worker binding.
 *
 * Required env:
 *   CLOUDFLARE_ACCOUNT_ID
 *   CLOUDFLARE_D1_DATABASE_ID
 *   CLOUDFLARE_API_TOKEN       token with D1 Edit permission
 */

import type { SqlDriver, SqlStatement } from "./driver.js";

interface D1HttpResultRow {
  results?: Record<string, unknown>[];
  success?: boolean;
  meta?: { changes?: number; last_row_id?: number; duration?: number };
}

interface D1HttpResponse {
  success: boolean;
  errors?: Array<{ code: number; message: string }>;
  messages?: string[];
  result?: D1HttpResultRow[];
}

export interface D1RestOptions {
  accountId: string;
  databaseId: string;
  apiToken: string;
  /** Base URL override for tests / gateways. Default: api.cloudflare.com */
  baseUrl?: string;
  /** Injected for tests. Defaults to global fetch. */
  fetchImpl?: typeof fetch;
}

/** One statement's SQL plus its bound parameters. */
interface Pending {
  sql: string;
  params: unknown[];
}

class D1RestStatement<Row> implements SqlStatement<Row> {
  constructor(
    private readonly driver: D1RestDriver,
    readonly sql: string,
    readonly params: unknown[] = [],
  ) {}

  bind(...values: unknown[]): SqlStatement<Row> {
    return new D1RestStatement<Row>(this.driver, this.sql, values);
  }

  async first(): Promise<Row | null> {
    const rows = await this.driver.query<Row>(this.sql, this.params);
    return rows[0] ?? null;
  }

  async all(): Promise<{ results: Row[] }> {
    return { results: await this.driver.query<Row>(this.sql, this.params) };
  }

  async run(): Promise<{ meta: { changes: number; last_row_id: number } }> {
    return { meta: await this.driver.runMeta(this.sql, this.params) };
  }
}

export class D1RestDriver implements SqlDriver {
  readonly name = "d1-rest" as const;
  private readonly endpoint: string;
  private readonly headers: Record<string, string>;
  private readonly fetchImpl: typeof fetch;

  constructor(opts: D1RestOptions) {
    const base = (opts.baseUrl ?? "https://api.cloudflare.com/client/v4").replace(/\/+$/, "");
    this.endpoint = `${base}/accounts/${opts.accountId}/d1/database/${opts.databaseId}/query`;
    this.headers = {
      authorization: `Bearer ${opts.apiToken}`,
      "content-type": "application/json",
    };
    this.fetchImpl = opts.fetchImpl ?? ((...args) => globalThis.fetch(...args));
  }

  prepare<Row = Record<string, unknown>>(sql: string): SqlStatement<Row> {
    return new D1RestStatement<Row>(this, sql, []);
  }

  /** Public so `first`/`all`/`run` above can reach it without a cast. */
  async query<Row>(sql: string, params: unknown[]): Promise<Row[]> {
    const result = await this.raw(sql, params);
    return (result[0]?.results ?? []) as Row[];
  }

  async runMeta(
    sql: string,
    params: unknown[],
  ): Promise<{ changes: number; last_row_id: number }> {
    const result = await this.raw(sql, params);
    const meta = result[0]?.meta ?? {};
    return {
      changes: Number(meta.changes ?? 0),
      last_row_id: Number(meta.last_row_id ?? 0),
    };
  }

  /**
   * D1's HTTP API takes a batch as one array body, which is a single
   * round trip. We only accept statements this driver produced, so their SQL
   * and params are read directly rather than guessed at.
   */
  async batch(statements: SqlStatement[]): Promise<unknown[]> {
    const pending: Pending[] = statements.map((s) => {
      const stmt = s as unknown as Partial<D1RestStatement<unknown>>;
      if (typeof stmt.sql !== "string") {
        throw new Error("D1RestDriver.batch received a foreign statement.");
      }
      return { sql: stmt.sql, params: stmt.params ?? [] };
    });

    const payload = await this.post(pending.map((p) => ({ sql: p.sql, params: p.params })));
    return (payload.result ?? []).map((r) => ({
      meta: {
        changes: Number(r.meta?.changes ?? 0),
        last_row_id: Number(r.meta?.last_row_id ?? 0),
      },
    }));
  }

  async exec(sql: string): Promise<void> {
    // D1's /query endpoint runs ONE statement per entry, so DDL is split and
    // sent as a single batch to keep migrations to one round trip.
    const parts = splitSqlStatements(sql);
    if (parts.length === 0) return;
    await this.post(parts.map((s) => ({ sql: s, params: [] })));
  }

  private async raw(sql: string, params: unknown[]): Promise<D1HttpResultRow[]> {
    const payload = await this.post([{ sql, params }]);
    return payload.result ?? [];
  }

  private async post(
    statements: Array<{ sql: string; params: unknown[] }>,
  ): Promise<D1HttpResponse> {
    let res: Response;
    try {
      res = await this.fetchImpl(this.endpoint, {
        method: "POST",
        headers: this.headers,
        body: JSON.stringify(statements),
      });
    } catch (err) {
      throw new Error(
        `Could not reach the Cloudflare D1 API: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    // Never echo the response body verbatim into an error: it can contain
    // query text and row data.
    if (res.status === 401 || res.status === 403) {
      throw new Error(
        `Cloudflare rejected the D1 API token (HTTP ${res.status}). Check CLOUDFLARE_API_TOKEN permissions.`,
      );
    }
    if (!res.ok) {
      throw new Error(`Cloudflare D1 API returned HTTP ${res.status}.`);
    }

    let payload: D1HttpResponse;
    try {
      payload = (await res.json()) as D1HttpResponse;
    } catch {
      throw new Error("Cloudflare D1 API returned a malformed JSON response.");
    }

    if (!payload.success) {
      // D1 error messages are SQL diagnostics; they do not contain credentials.
      const detail = payload.errors?.[0]?.message ?? "unknown error";
      throw new Error(`D1 query failed: ${detail}`);
    }
    return payload;
  }
}

/**
 * Split a migration script into individual statements.
 *
 * Handles single-quoted and double-quoted string literals, backtick and
 * bracket identifiers, `--` line comments and block comments, because
 * migration files legitimately contain all of them and a naive split on
 * every `;` would corrupt the script.
 *
 * A fragment consisting only of comments and whitespace is discarded rather
 * than emitted: sending `-- a comment` to the database is not merely useless,
 * it fails as a syntax error. `hasCode` tracks whether any real token was seen
 * in the current fragment, which is what makes comment-only files safe to pass
 * through `exec()`.
 */
export function splitSqlStatements(sql: string): string[] {
  const out: string[] = [];
  let current = "";
  let hasCode = false;
  let quote: "'" | '"' | "`" | null = null;
  let inLineComment = false;
  let inBlockComment = false;

  for (let i = 0; i < sql.length; i++) {
    const ch = sql[i];
    const next = sql[i + 1];

    if (inLineComment) {
      // Preserve the comment text so a caller logging the statement sees the
      // original script, but never count it as code.
      if (ch === "\n") inLineComment = false;
      current += ch;
      continue;
    }
    if (inBlockComment) {
      if (ch === "*" && next === "/") {
        inBlockComment = false;
        i++;
      }
      continue;
    }

    if (quote) {
      current += ch;
      // A string literal is a real token, even if its contents are spaces.
      hasCode = true;
      // '' or "" inside a literal is an escaped quote, not a terminator.
      if (ch === quote) {
        if (next === quote) {
          current += next;
          i++;
        } else {
          quote = null;
        }
      }
      continue;
    }

    if (ch === "-" && next === "-") {
      inLineComment = true;
      current += ch;
      continue;
    }
    if (ch === "/" && next === "*") {
      inBlockComment = true;
      current += ch;
      continue;
    }
    if (ch === "'" || ch === '"' || ch === "`") {
      quote = ch;
      current += ch;
      hasCode = true;
      continue;
    }
    if (ch === ";") {
      if (hasCode) out.push(current.trim());
      current = "";
      hasCode = false;
      continue;
    }
    if (!/\s/.test(ch)) hasCode = true;
    current += ch;
  }

  if (hasCode) out.push(current.trim());
  return out;
}
