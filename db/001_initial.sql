CREATE TABLE IF NOT EXISTS learning_workspaces (
  id TEXT PRIMARY KEY,
  data JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT workspace_data_is_object CHECK (jsonb_typeof(data) = 'object')
);
INSERT INTO learning_workspaces (id, data)
VALUES ('local', '{"profile": null, "assignments": [], "messages": []}'::jsonb)
ON CONFLICT (id) DO NOTHING;

-- Learner directory. learning_workspaces.id holds the owning user's id, so there is one row per learner.
CREATE TABLE IF NOT EXISTS learning_users (
  id TEXT PRIMARY KEY,
  handle TEXT UNIQUE NOT NULL,
  display_name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Session storage for connect-pg-simple (server/auth.ts). The column names and types are the ones that
-- library expects and cannot be renamed. Declared here rather than letting the library create it on boot,
-- so the schema stays in this migration and a deploy with read-only DDL rights fails loudly instead of
-- silently running without persistent sessions.
CREATE TABLE IF NOT EXISTS learning_sessions (
  sid TEXT PRIMARY KEY,
  sess JSON NOT NULL,
  expire TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS learning_sessions_expire_idx ON learning_sessions (expire);
