/**
 * Storage selection for every deployment target.
 *
 * The application is deliberately storage-agnostic: the same `AppDatabase`
 * repository runs on any `SqlDriver`. This module is the single place that
 * decides *which* driver a given runtime gets, so the Vercel function, the
 * Cloudflare Worker and the local dev server cannot drift apart.
 *
 * Resolution order in a Node runtime:
 *   1. An in-process injected driver (tests, local dev).
 *   2. Cloudflare D1 over the HTTP API, when CLOUDFLARE_* is configured.
 *      This is the recommended free-tier Vercel database: D1's free plan
 *      covers a small deployment and it needs no always-on server.
 *   3. A libsql/Turso or Neon HTTP endpoint, when DATABASE_URL is set.
 *      Documented alternative so nobody is locked into Cloudflare.
 *   4. node:sqlite on a local file (self-hosting, local development).
 *
 * No driver is ever selected implicitly from client input; only from
 * environment variables the deployer controls.
 */

import type { SqlDriver } from "./driver.js";
import type { ApiEnv } from "../env.js";

export interface DriverResolution {
  driver: SqlDriver;
  /** Human-readable description, surfaced by `GET /api/health`. */
  kind: string;
  /** True when migrations still need to be applied by the caller. */
  needsMigrate: boolean;
}

export interface ResolveOptions {
  /** Overrides env-driven selection entirely (local dev, tests). */
  injected?: SqlDriver;
  /** Skip the node:sqlite fallback and fail instead. */
  requireRemote?: boolean;
}

export class NoDatabaseConfiguredError extends Error {
  constructor() {
    super(
      "No database is configured. Set CLOUDFLARE_ACCOUNT_ID + CLOUDFLARE_D1_DATABASE_ID + " +
        "CLOUDFLARE_API_TOKEN (Cloudflare D1 over HTTP), or DATABASE_URL (libsql/Turso), " +
        "or ROSA_DB_PATH for a local SQLite file. See .env.example.",
    );
    this.name = "NoDatabaseConfiguredError";
  }
}

function isSet(...values: Array<string | undefined>): boolean {
  return values.every((v) => typeof v === "string" && v.trim().length > 0);
}

/**
 * Resolve a driver for a Node runtime. Importing this module never pulls
 * `node:sqlite` into a Cloudflare Workers bundle because the sqlite import is
 * dynamic and only reached on the last branch.
 */
export async function resolveNodeDriver(
  env: ApiEnv,
  opts: ResolveOptions = {},
): Promise<DriverResolution> {
  if (opts.injected) {
    return { driver: opts.injected, kind: "injected", needsMigrate: false };
  }

  // ---- Cloudflare D1 over HTTPS (works from Vercel's free tier) ----------
  if (
    isSet(env.CLOUDFLARE_ACCOUNT_ID, env.CLOUDFLARE_D1_DATABASE_ID, env.CLOUDFLARE_API_TOKEN)
  ) {
    const { D1RestDriver } = await import("./d1rest.js");
    const driver = new D1RestDriver({
      accountId: env.CLOUDFLARE_ACCOUNT_ID as string,
      databaseId: env.CLOUDFLARE_D1_DATABASE_ID as string,
      apiToken: env.CLOUDFLARE_API_TOKEN as string,
      baseUrl: env.CLOUDFLARE_API_BASE_URL,
    });
    return { driver, kind: "d1-rest", needsMigrate: true };
  }

  // ---- libsql / Turso over HTTP ----------------------------------------
  if (isSet(env.DATABASE_URL) && env.DATABASE_URL!.startsWith("libsql:")) {
    const { LibsqlHttpDriver } = await import("./libsql.js");
    const driver = new LibsqlHttpDriver({
      url: env.DATABASE_URL as string,
      authToken: env.DATABASE_AUTH_TOKEN,
    });
    return { driver, kind: "libsql-http", needsMigrate: true };
  }

  // ---- Supabase / PostgreSQL over HTTP --------------------------------
  if (
    isSet(env.SUPABASE_DB_URL) ||
    (isSet(env.DATABASE_URL) && env.DATABASE_URL!.includes("supabase"))
  ) {
    const { SupabaseDriver } = await import("./supabase.js");
    const driver = new SupabaseDriver({
      connectionString: (env.SUPABASE_DB_URL || env.DATABASE_URL) as string,
    });
    return { driver, kind: "supabase", needsMigrate: true };
  }

  // ---- Neon / Generic Postgres -----------------------------------------
  if (isSet(env.DATABASE_URL) && (env.DATABASE_URL!.startsWith("postgres:") || env.DATABASE_URL!.startsWith("postgresql:"))) {
    throw new Error(
      "DATABASE_URL looks like Postgres/Neon. Rosa's portable schema is SQLite dialect " +
        "(D1, libsql, node:sqlite). Use Supabase with SUPABASE_DB_URL, Cloudflare D1 over HTTP, or libsql/Turso instead.",
    );
  }

  if (opts.requireRemote) throw new NoDatabaseConfiguredError();

  // ---- node:sqlite (local dev, self-hosted Node) -----------------------
  const { SqliteDriver } = await import("./sqlite.js");
  const path = env.ROSA_DB_PATH ?? "./data/rosa.sqlite";
  const driver = new SqliteDriver(path);
  return { driver, kind: "sqlite", needsMigrate: true };
}

/**
 * Apply pending migrations for a driver that needs them.
 *
 * Migrations are idempotent (`CREATE TABLE IF NOT EXISTS` / `CREATE INDEX IF
 * NOT EXISTS`) and tracked in `schema_migrations`, so running this on every
 * cold start is safe and costs one read.
 */
export async function applyMigrations(driver: SqlDriver): Promise<number[]> {
  const { MIGRATIONS } = await import("./schema.js");

  await driver.exec(
    `CREATE TABLE IF NOT EXISTS schema_migrations (
       version INTEGER PRIMARY KEY,
       applied_at INTEGER NOT NULL
     )`,
  );

  const row = await driver
    .prepare<{ version: number | null }>("SELECT MAX(version) AS version FROM schema_migrations")
    .first();
  const current = Number(row?.version ?? 0);

  const applied: number[] = [];
  for (const migration of MIGRATIONS) {
    if (migration.version <= current) continue;
    for (const statement of migration.statements) {
      try {
        await driver.exec(statement);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        // Tolerate duplicate columns or already-existing tables when D1 migrations ran out-of-band
        if (
          msg.includes("duplicate column") ||
          msg.includes("already exists") ||
          msg.includes("SQLITE_ERROR: duplicate column name")
        ) {
          // column or table already exists; continue
        } else {
          throw err;
        }
      }
    }
    await driver
      .prepare("INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?) ON CONFLICT DO NOTHING")
      .bind(migration.version, Date.now())
      .run();
    applied.push(migration.version);
  }
  return applied;
}
