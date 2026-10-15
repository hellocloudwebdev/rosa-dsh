CREATE TABLE IF NOT EXISTS user_prefs (
         user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
         theme TEXT NOT NULL DEFAULT 'light',
         sidebar_width INTEGER,
         direct_browser INTEGER NOT NULL DEFAULT 0,
         preferences TEXT,
         updated_at INTEGER NOT NULL
       );
