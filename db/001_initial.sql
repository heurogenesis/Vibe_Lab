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
