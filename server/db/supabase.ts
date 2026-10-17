/**
 * Supabase / PostgreSQL driver for Cloudflare Workers, Node, and Vercel.
 *
 * Provides full compatibility between Rosa's portable data layer (AppDatabase)
 * and Supabase's hosted PostgreSQL database.
 *
 * Supported connection methods:
 *   1. Supabase Postgres Connection Pooling / Direct (via `@neondatabase/serverless`)
 *      Compatible with Cloudflare Workers over HTTP/WebSockets.
 *      Configured via `SUPABASE_DB_URL` or `DATABASE_URL` (postgres://...).
 *   2. Supabase REST API client (via `@supabase/supabase-js`)
 *      Configured via `SUPABASE_URL` and `SUPABASE_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY`.
 */

import { neon, type NeonQueryFunction } from "@neondatabase/serverless";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { SqlDriver, SqlStatement, BindValue } from "./driver.js";
import type { ApiEnv } from "../env.js";

/**
 * Translate portable SQLite SQL into PostgreSQL syntax:
 *   - Replaces positional `?` placeholders with `$1, $2, ...`
 *   - Translates `INSERT OR IGNORE` to `ON CONFLICT DO NOTHING`
 *   - Translates `INSERT OR REPLACE` to appropriate Postgres `ON CONFLICT ... DO UPDATE`
 */
export function toPostgresSql(sql: string): string {
  let translated = sql;

  // Handle SQLite INSERT OR IGNORE
  if (/\bINSERT\s+OR\s+IGNORE\s+INTO\b/i.test(translated)) {
    translated = translated.replace(/\bINSERT\s+OR\s+IGNORE\s+INTO\b/i, "INSERT INTO");
    if (!/\bON\s+CONFLICT\b/i.test(translated)) {
      translated = `${translated} ON CONFLICT DO NOTHING`;
    }
  }

  // Handle SQLite INSERT OR REPLACE
  if (/\bINSERT\s+OR\s+REPLACE\s+INTO\s+([a-zA-Z0-9_]+)/i.test(translated)) {
    const match = /\bINSERT\s+OR\s+REPLACE\s+INTO\s+([a-zA-Z0-9_]+)/i.exec(translated);
    const table = match ? match[1].toLowerCase() : "";
    translated = translated.replace(/\bINSERT\s+OR\s+REPLACE\s+INTO\b/i, "INSERT INTO");

    if (table === "model_favourites") {
      translated = `${translated} ON CONFLICT (user_id, model_ref) DO UPDATE SET pinned = EXCLUDED.pinned, created_at = EXCLUDED.created_at`;
    } else if (table === "oauth_states") {
      translated = `${translated} ON CONFLICT (state) DO UPDATE SET provider = EXCLUDED.provider, code_verifier = EXCLUDED.code_verifier, redirect_to = EXCLUDED.redirect_to, created_at = EXCLUDED.created_at, expires_at = EXCLUDED.expires_at`;
    } else if (table === "rate_limits") {
      translated = `${translated} ON CONFLICT (bucket, subject) DO UPDATE SET count = EXCLUDED.count, window_start = EXCLUDED.window_start`;
    } else if (table === "user_prefs") {
      translated = `${translated} ON CONFLICT (user_id) DO UPDATE SET theme = EXCLUDED.theme, sidebar_width = EXCLUDED.sidebar_width, direct_browser = EXCLUDED.direct_browser, preferences = EXCLUDED.preferences, updated_at = EXCLUDED.updated_at`;
    }
  }

  // Parameter placeholders: ? -> $1, $2, ...
  let paramIndex = 1;
  let inString = false;
  let out = "";
  for (let i = 0; i < translated.length; i++) {
    const char = translated[i];
    if (char === "'" && (i === 0 || translated[i - 1] !== "\\")) {
      inString = !inString;
      out += char;
    } else if (char === "?" && !inString) {
      out += `$${paramIndex++}`;
    } else {
      out += char;
    }
  }

  return out;
}

export interface SupabaseDriverOptions {
  connectionString: string;
}

class SupabaseStatement<Row> implements SqlStatement<Row> {
  private args: unknown[] = [];
  private readonly pgSql: string;

  constructor(
    private readonly client: NeonQueryFunction<false, false>,
    sql: string,
  ) {
    this.pgSql = toPostgresSql(sql);
  }

  bind(...values: BindValue[]): SqlStatement<Row> {
    this.args = values;
    return this;
  }

  async first(): Promise<Row | null> {
    const rows = (await this.client.query(this.pgSql, this.args)) as Row[];
    return rows && rows.length > 0 ? rows[0] : null;
  }

  async all(): Promise<{ results: Row[] }> {
    const rows = (await this.client.query(this.pgSql, this.args)) as Row[];
    return { results: rows ?? [] };
  }

  async run(): Promise<{ meta: { changes: number; last_row_id: number } }> {
    const rows = (await this.client.query(this.pgSql, this.args)) as Row[];
    return {
      meta: {
        changes: Array.isArray(rows) ? rows.length : 1,
        last_row_id: 0,
      },
    };
  }
}

export class SupabaseDriver implements SqlDriver {
  readonly name = "http" as const;
  private readonly client: NeonQueryFunction<false, false>;

  constructor(opts: SupabaseDriverOptions) {
    this.client = neon(opts.connectionString);
  }

  prepare<Row = Record<string, unknown>>(sql: string): SqlStatement<Row> {
    return new SupabaseStatement<Row>(this.client, sql);
  }

  async batch(statements: SqlStatement[]): Promise<unknown[]> {
    const results: unknown[] = [];
    for (const stmt of statements) {
      results.push(await stmt.all());
    }
    return results;
  }

  async exec(sql: string): Promise<void> {
    const chunks = sql
      .split(";")
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    for (const chunk of chunks) {
      await this.client.query(chunk, []);
    }
  }
}

/**
 * Create a Supabase JavaScript client for high-level storage, auth, or realtime.
 */
export function createSupabaseClient(env: ApiEnv): SupabaseClient | null {
  const url = env.SUPABASE_URL || env.VITE_SUPABASE_URL;
  const key =
    env.SUPABASE_SERVICE_ROLE_KEY ||
    env.SUPABASE_ANON_KEY ||
    env.VITE_SUPABASE_ANON_KEY;

  if (!url || !key) return null;
  return createClient(url, key);
}
