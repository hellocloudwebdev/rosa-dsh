import { DatabaseSync, type StatementSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import type { SqlDriver, SqlStatement } from "./driver.js";
import { MIGRATIONS } from "./schema.js";

/**
 * node:sqlite-backed driver.
 *
 * Used for local development and any self-hosted Node deployment. Node 22.5+
 * ships `node:sqlite` behind no flag, so this adds zero native dependencies —
 * which is what keeps `npm ci` fast and the Cloudflare build small.
 */

class SqliteStatement<Row> implements SqlStatement<Row> {
  private args: unknown[] = [];

  constructor(private readonly stmt: StatementSync) {}

  bind(...values: unknown[]): SqlStatement<Row> {
    this.args = values;
    return this;
  }

  async first(): Promise<Row | null> {
    const row = this.stmt.get(...(this.args as never[]));
    return (row as Row | undefined) ?? null;
  }

  async all(): Promise<{ results: Row[] }> {
    return { results: this.stmt.all(...(this.args as never[])) as Row[] };
  }

  async run(): Promise<{ meta: { changes: number; last_row_id: number } }> {
    const info = this.stmt.run(...(this.args as never[]));
    return {
      meta: {
        changes: Number(info.changes ?? 0),
        last_row_id: Number(info.lastInsertRowid ?? 0),
      },
    };
  }
}

export class SqliteDriver implements SqlDriver {
  readonly name = "sqlite" as const;
  private readonly db: DatabaseSync;

  constructor(filename: string, opts: { enableForeignKey?: boolean } = {}) {
    // node:sqlite refuses to create the file if the parent directory is
    // missing, which broke every boot with a nested ROSA_DB_PATH on a fresh
    // checkout. Create it instead of failing.
    mkdirSync(dirname(filename), { recursive: true });
    this.db = new DatabaseSync(filename);
    if (opts.enableForeignKey !== false) {
      this.db.exec("PRAGMA foreign_keys = ON;");
    }
    // WAL keeps concurrent reads fast and avoids "database is locked" under
    // the dev server's poll-for-changes pattern.
    this.db.exec("PRAGMA journal_mode = WAL;");
    this.db.exec("PRAGMA busy_timeout = 5000;");
    this.db.exec("PRAGMA synchronous = NORMAL;");
  }

  prepare<Row = Record<string, unknown>>(sql: string): SqlStatement<Row> {
    // Both node:sqlite and D1 accept "?"-style placeholders.
    return new SqliteStatement<Row>(this.db.prepare(sql));
  }

  async batch(statements: SqlStatement[]): Promise<unknown[]> {
    this.db.exec("BEGIN");
    try {
      const out: unknown[] = [];
      for (const s of statements) {
        // Statements hold their own bound args.
        const stmt = (s as SqliteStatement<unknown>);
        out.push(await stmt.run());
      }
      this.db.exec("COMMIT");
      return out;
    } catch (err) {
      this.db.exec("ROLLBACK");
      throw err;
    }
  }

  async exec(sql: string): Promise<void> {
    this.db.exec(sql);
  }

  /** Apply any pending migrations. Safe to call on every boot. */
  async migrate(): Promise<{ applied: number[] }> {
    await this.ensureVersionTable();
    const current = await this.currentVersion();
    const applied: number[] = [];
    for (const migration of MIGRATIONS) {
      if (migration.version <= current) continue;
      for (const stmt of migration.statements) {
        await this.exec(stmt);
      }
      await this.exec(
        `INSERT INTO schema_migrations (version, applied_at) VALUES (${migration.version}, ${Date.now()})`,
      );
      applied.push(migration.version);
    }
    return { applied };
  }

  private async ensureVersionTable(): Promise<void> {
    await this.exec(
      `CREATE TABLE IF NOT EXISTS schema_migrations (
         version INTEGER PRIMARY KEY,
         applied_at INTEGER NOT NULL
       )`,
    );
  }

  private async currentVersion(): Promise<number> {
    const row = await this.prepare<{ version: number }>(
      "SELECT MAX(version) AS version FROM schema_migrations",
    ).first();
    return Number(row?.version ?? 0);
  }

  close(): void {
    this.db.close();
  }
}

/** Create a driver, migrate it, and return it ready for use. */
export async function openSqlite(
  filename: string,
  opts: { enableForeignKey?: boolean; migrate?: boolean } = {},
): Promise<SqliteDriver> {
  const driver = new SqliteDriver(filename, opts);
  if (opts.migrate !== false) await driver.migrate();
  return driver;
}
