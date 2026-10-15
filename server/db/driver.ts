/**
 * A tiny SQL driver abstraction so the same data layer runs on:
 *   - node:sqlite          (local dev, and any Node host)
 *   - Cloudflare D1        (Workers / Pages Functions)
 *   - libsql / Neon (optional HTTP drivers, via the SqlDriver interface)
 *
 * The interface is intentionally smaller than a real driver: we only need
 * parameterised execute, first() and all() plus a batch helper.
 */

export interface SqlStatement<Row = Record<string, unknown>> {
  bind: (...values: (string | number | null | Uint8Array)[]) => SqlStatement<Row>;
  first: () => Promise<Row | null>;
  all: () => Promise<{ results: Row[] }>;
  run: () => Promise<{ meta: { changes: number; last_row_id: number } }>;
}

export interface SqlDriver {
  readonly name: "sqlite" | "d1" | "http";
  prepare: <Row = Record<string, unknown>>(sql: string) => SqlStatement<Row>;
  /** Run several statements in one transaction when the backend supports it. */
  batch: (statements: SqlStatement[]) => Promise<unknown[]>;
  /** Execute DDL directly (migrations). */
  exec: (sql: string) => Promise<void>;
}

export type BindValue = string | number | null | Uint8Array;

/** Convert SQLite/D1 INTEGER 0|1 booleans and TEXT JSON columns. */
export function num(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

export function str(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  return String(value);
}

/** INSERT OR IGNORE / upsert helpers that both SQLite and D1 accept. */
export function nowSec(): number {
  return Math.floor(Date.now() / 1000);
}

export function newId(prefix = ""): string {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === "function") return `${prefix}${c.randomUUID()}`;
  return `${prefix}${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
}
