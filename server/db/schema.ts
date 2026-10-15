/**
 * Schema for the Rosa data layer.
 *
 * Written in portable SQLite dialect so the identical file works on
 * node:sqlite, Cloudflare D1 and libsql. Every table that holds user data is
 * scoped by user_id and every query filters on it — that is the only thing
 * standing between two users on a shared deployment.
 */

export const SCHEMA_VERSION = 3;

export const MIGRATIONS: Array<{ version: number; statements: string[] }> = [
  {
    version: 1,
    statements: [
      `CREATE TABLE IF NOT EXISTS users (
         id TEXT PRIMARY KEY,
         email TEXT,
         name TEXT,
         avatar_url TEXT,
         provider TEXT NOT NULL,
         provider_account_id TEXT NOT NULL,
         created_at INTEGER NOT NULL,
         UNIQUE (provider, provider_account_id)
       )`,

      `CREATE TABLE IF NOT EXISTS sessions (
         token_hash TEXT PRIMARY KEY,
         user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
         created_at INTEGER NOT NULL,
         expires_at INTEGER NOT NULL,
         user_agent TEXT,
         ip TEXT
       )`,
      `CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id)`,
      `CREATE INDEX IF NOT EXISTS idx_sessions_expiry ON sessions(expires_at)`,

      `CREATE TABLE IF NOT EXISTS providers (
         id TEXT PRIMARY KEY,
         user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
         kind TEXT NOT NULL,
         display_name TEXT NOT NULL,
         base_url TEXT NOT NULL,
         api_key_enc TEXT,
         api_key_hint TEXT,
         organization_id TEXT,
         status INTEGER NOT NULL DEFAULT 1,
         connection_status TEXT NOT NULL DEFAULT 'unknown',
         connection_error TEXT,
         last_error_code TEXT,
         last_connected_at INTEGER,
         last_model_discovery_at INTEGER,
         model_count INTEGER,
         settings TEXT,
         created_at INTEGER NOT NULL,
         updated_at INTEGER NOT NULL
       )`,
      `CREATE INDEX IF NOT EXISTS idx_providers_user ON providers(user_id)`,

      `CREATE TABLE IF NOT EXISTS models (
         id TEXT PRIMARY KEY,
         provider_id TEXT NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
         model_id TEXT NOT NULL,
         display_name TEXT NOT NULL,
         description TEXT,
         context_window INTEGER,
         max_output_tokens INTEGER,
         capabilities TEXT,
         sources TEXT,
         discovered_at INTEGER NOT NULL,
         verified INTEGER NOT NULL DEFAULT 0,
         created_at INTEGER NOT NULL,
         updated_at INTEGER NOT NULL,
         UNIQUE (provider_id, model_id)
       )`,
      `CREATE INDEX IF NOT EXISTS idx_models_provider ON models(provider_id)`,

      `CREATE TABLE IF NOT EXISTS model_favourites (
         user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
         model_ref TEXT NOT NULL,
         pinned INTEGER NOT NULL DEFAULT 0,
         created_at INTEGER NOT NULL,
         PRIMARY KEY (user_id, model_ref)
       )`,

      `CREATE TABLE IF NOT EXISTS conversations (
         id TEXT PRIMARY KEY,
         user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
         title TEXT NOT NULL,
         folder_id TEXT REFERENCES folders(id) ON DELETE SET NULL,
         pinned INTEGER NOT NULL DEFAULT 0,
         favourite INTEGER NOT NULL DEFAULT 0,
         pane_count INTEGER NOT NULL DEFAULT 1,
         pane_models TEXT,
         created_at INTEGER NOT NULL,
         updated_at INTEGER NOT NULL
       )`,
      `CREATE INDEX IF NOT EXISTS idx_conv_user ON conversations(user_id, updated_at DESC)`,

      `CREATE TABLE IF NOT EXISTS folders (
         id TEXT PRIMARY KEY,
         user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
         name TEXT NOT NULL,
         parent_id TEXT,
         created_at INTEGER NOT NULL
       )`,
      `CREATE INDEX IF NOT EXISTS idx_folders_user ON folders(user_id)`,

      `CREATE TABLE IF NOT EXISTS messages (
         id TEXT PRIMARY KEY,
         conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
         role TEXT NOT NULL,
         content TEXT NOT NULL,
         provider_id TEXT,
         model_id TEXT,
         model_label TEXT,
         status TEXT,
         metrics TEXT,
         error TEXT,
         parent_message_id TEXT,
         pane_index INTEGER,
         created_at INTEGER NOT NULL
       )`,
      `CREATE INDEX IF NOT EXISTS idx_msg_conv ON messages(conversation_id, created_at)`,

      `CREATE TABLE IF NOT EXISTS oauth_states (
         state TEXT PRIMARY KEY,
         provider TEXT NOT NULL,
         code_verifier TEXT,
         redirect_to TEXT,
         created_at INTEGER NOT NULL,
         expires_at INTEGER NOT NULL
       )`,
      `CREATE INDEX IF NOT EXISTS idx_oauth_expiry ON oauth_states(expires_at)`,

      `CREATE TABLE IF NOT EXISTS rate_limits (
         bucket TEXT NOT NULL,
         subject TEXT NOT NULL,
         window_start INTEGER NOT NULL,
         count INTEGER NOT NULL,
         PRIMARY KEY (bucket, subject)
       )`,
      `CREATE INDEX IF NOT EXISTS idx_rl_window ON rate_limits(window_start)`,
    ],
  },
  {
    // v2: per-conversation default model, for "remember my selection".
    version: 2,
    statements: [
      `ALTER TABLE conversations ADD COLUMN default_provider_id TEXT`,
      `ALTER TABLE conversations ADD COLUMN default_model_id TEXT`,
    ],
  },
  {
    // v3: user preferences (theme, sidebar width, direct-browser opt-in).
    version: 3,
    statements: [
      `CREATE TABLE IF NOT EXISTS user_prefs (
         user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
         theme TEXT NOT NULL DEFAULT 'light',
         sidebar_width INTEGER,
         direct_browser INTEGER NOT NULL DEFAULT 0,
         preferences TEXT,
         updated_at INTEGER NOT NULL
       )`,
    ],
  },
];

/** Full DDL concatenated — used for `exec` on a fresh database. */
export function fullSchema(): string {
  // Migrations are additive; running only v1 DDL then the ALTERs in order is
  // equivalent, so we return every statement joined.
  return MIGRATIONS.map((m) => m.statements.join(";\n")).join(";\n");
}
