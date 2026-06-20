CREATE TABLE IF NOT EXISTS user_vision_settings (
  user_id      TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  gateway_id   TEXT NOT NULL,
  model_id     TEXT NOT NULL,
  default_mode TEXT NOT NULL DEFAULT 'ui',
  updated_at   TEXT NOT NULL
);
