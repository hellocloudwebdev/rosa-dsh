/**
 * Minimal D1 driver for Cloudflare Workers / Pages Functions.
 *
 * D1's binding API (`prepare(...).bind(...).first()/all()/run()` and `batch()`)
 * is close enough to our SqlDriver interface that this is a thin wrapper.
 * Keeping it separate means importing `server/db/d1.ts` never pulls node:sqlite
 * into a Workers bundle.
 */

import type { SqlDriver, SqlStatement } from "./driver.js";

/** Structural subset of the D1 binding we depend on. */
export interface D1Like {
  prepare: (sql: string) => {
    bind: (...values: unknown[]) => {
      first: <T = Record<string, unknown>>() => Promise<T | null>;
      all: <T = Record<string, unknown>>() => Promise<{ results: T[] }>;
      run: () => Promise<{ meta: { changes: number; last_row_id: number } }>;
    };
    first: <T = Record<string, unknown>>() => Promise<T | null>;
    all: <T = Record<string, unknown>>() => Promise<{ results: T[] }>;
    run: () => Promise<{ meta: { changes: number; last_row_id: number } }>;
  };
  batch: <T = unknown>(statements: unknown[]) => Promise<T[]>;
  exec: (sql: string) => Promise<void>;
}

class D1Statement<Row> implements SqlStatement<Row> {
  private args: unknown[] = [];
  constructor(private readonly db: D1Like, private readonly sql: string) {}

  bind(...values: unknown[]): SqlStatement<Row> {
    this.args = values;
    return this;
  }

  private stmt() {
    return this.db.prepare(this.sql).bind(...this.args);
  }

  async first(): Promise<Row | null> {
    const row = await this.stmt().first<Row>();
    return row ?? null;
  }

  async all(): Promise<{ results: Row[] }> {
    const res = await this.stmt().all<Row>();
    return { results: res?.results ?? [] };
  }

  async run(): Promise<{ meta: { changes: number; last_row_id: number } }> {
    const res = await this.stmt().run();
    return { meta: res.meta };
  }
}

export class D1Driver implements SqlDriver {
  readonly name = "d1" as const;
  constructor(private readonly db: D1Like) {}

  prepare<Row = Record<string, unknown>>(sql: string): SqlStatement<Row> {
    return new D1Statement<Row>(this.db, sql);
  }

  async batch(statements: SqlStatement[]): Promise<unknown[]> {
    const prepared = statements.map((s) =>
      // Re-bind through D1's own bind chain.
      (this.db.prepare((s as unknown as { sql: string }).sql) as unknown as {
        bind: (...v: unknown[]) => unknown;
      }),
    );
    // Each statement already carries its args; D1's batch takes bound stmts.
    const bound = statements.map((s) =>
      this.db
        .prepare(sqlOf(s))
        .bind(...argsOf(s)),
    );
    void prepared;
    return this.db.batch(bound);
  }

  async exec(sql: string): Promise<void> {
    // D1's exec only runs a single statement; split conservatively.
    for (const stmt of splitStatements(sql)) {
      await this.db.prepare(stmt).run();
    }
  }
}

function sqlOf(s: SqlStatement): string {
  return (s as unknown as { sql: string }).sql;
}

function argsOf(s: SqlStatement): unknown[] {
  return (s as unknown as { args: unknown[] }).args ?? [];
}

/** Split on semicolons that are not inside a string literal. */
export function splitStatements(sql: string): string[] {
  const out: string[] = [];
  let current = "";
  let inString = false;
  for (let i = 0; i < sql.length; i++) {
    const ch = sql[i];
    if (ch === "'") inString = !inString;
    if (ch === ";" && !inString) {
      if (current.trim()) out.push(current.trim());
      current = "";
    } else {
      current += ch;
    }
  }
  if (current.trim()) out.push(current.trim());
  return out;
}
