CREATE TABLE IF NOT EXISTS router_config (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  version TEXT NOT NULL,
  config_json TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_router_config_updated_at ON router_config(updated_at DESC);

CREATE TABLE IF NOT EXISTS model_map (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  aa_source_id TEXT NOT NULL,
  aa_name TEXT NOT NULL,
  openrouter_id TEXT NOT NULL,
  confidence REAL NOT NULL,
  match_type TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_model_map_confidence ON model_map(confidence DESC);

CREATE TABLE IF NOT EXISTS model_scores (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  artifact_version TEXT NOT NULL,
  category TEXT NOT NULL,
  model_id TEXT NOT NULL,
  rank INTEGER NOT NULL,
  quality_norm REAL NOT NULL,
  speed_norm REAL NOT NULL,
  cost_norm REAL NOT NULL,
  generated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_model_scores_version_category ON model_scores(artifact_version, category, rank);

CREATE TABLE IF NOT EXISTS profile_scores (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  artifact_version TEXT NOT NULL,
  profile TEXT NOT NULL,
  model_id TEXT NOT NULL,
  rank INTEGER NOT NULL,
  quality_norm REAL NOT NULL,
  speed_norm REAL NOT NULL,
  cost_eff_norm REAL NOT NULL,
  reliability_norm REAL NOT NULL,
  generated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_profile_scores_version_profile ON profile_scores(artifact_version, profile, rank);

CREATE TABLE IF NOT EXISTS provider_scores (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  artifact_version TEXT NOT NULL,
  profile TEXT NOT NULL,
  model_id TEXT NOT NULL,
  provider TEXT NOT NULL,
  rank INTEGER NOT NULL,
  reliability_norm REAL NOT NULL,
  latency_norm REAL NOT NULL,
  generated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_provider_scores_version_profile_model ON provider_scores(artifact_version, profile, model_id, rank);

CREATE TABLE IF NOT EXISTS routing_events_agg (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  window_start TEXT NOT NULL,
  profile TEXT NOT NULL,
  model_id TEXT NOT NULL,
  provider TEXT NOT NULL,
  request_count INTEGER NOT NULL,
  error_count INTEGER NOT NULL,
  fallback_count INTEGER NOT NULL,
  p95_latency_ms REAL NOT NULL,
  avg_cost_usd REAL NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_routing_events_agg_window ON routing_events_agg(window_start DESC, profile, model_id, provider);

CREATE TABLE IF NOT EXISTS ingestion_runs (
  id TEXT PRIMARY KEY,
  status TEXT NOT NULL,
  started_at TEXT NOT NULL,
  finished_at TEXT,
  error TEXT,
  artifact_version TEXT
);

CREATE INDEX IF NOT EXISTS idx_ingestion_runs_started_at ON ingestion_runs(started_at DESC);

CREATE TABLE IF NOT EXISTS source_snapshots (
  id TEXT PRIMARY KEY,
  source TEXT NOT NULL,
  snapshot_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_source_snapshots_created_at ON source_snapshots(created_at DESC);

CREATE TABLE IF NOT EXISTS routing_explanations (
  request_id TEXT PRIMARY KEY,
  explanation_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_routing_explanations_created_at ON routing_explanations(created_at DESC);

-- ── User accounts ──
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT UNIQUE,
  password_hash TEXT,
  preferred_models TEXT,
  default_model TEXT,
  classifier_model TEXT,
  routing_instructions TEXT,
  blocklist TEXT,
  custom_catalog TEXT,
  profiles TEXT,           -- JSON: RouterProfile[] — named routing configurations
  route_trigger_keywords TEXT,  -- JSON: string[] — custom keywords that trigger re-routing
  routing_frequency TEXT,       -- "every_message" | "smart" | "new_thread_only"
  smart_pin_turns INTEGER,      -- Only used in smart mode: reroute after this many pinned turns
  config_agent_enabled INTEGER NOT NULL DEFAULT 0, -- legacy/deprecated: retained for schema compatibility
  config_agent_orchestrator_model TEXT, -- legacy/deprecated: retained for schema compatibility
  config_agent_search_model TEXT, -- legacy/deprecated: retained for schema compatibility
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS user_upstream_credentials (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  upstream_base_url TEXT,
  upstream_api_key_enc TEXT,
  classifier_base_url TEXT,
  classifier_api_key_enc TEXT,
  updated_at TEXT NOT NULL
);

-- Per-user gateway registry. Each gateway owns its base URL, encrypted API key,
-- and a JSON model catalog with native model IDs for that provider.
CREATE TABLE IF NOT EXISTS user_gateways (
  id          TEXT NOT NULL,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  base_url    TEXT NOT NULL,
  api_key_enc TEXT NOT NULL,
  models_json TEXT NOT NULL DEFAULT '[]',
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL,
  PRIMARY KEY (id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_user_gateways_user ON user_gateways(user_id);

-- ── User sessions ──
CREATE TABLE IF NOT EXISTS user_sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_user_sessions_user ON user_sessions(user_id);

-- ── Rate limits ──
CREATE TABLE IF NOT EXISTS rate_limit_counters (
  bucket TEXT NOT NULL,
  identifier TEXT NOT NULL,
  window_start INTEGER NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (bucket, identifier, window_start)
);

CREATE INDEX IF NOT EXISTS idx_rate_limit_counters_updated_at ON rate_limit_counters(updated_at DESC);

-- ── API keys (hashed) ──
CREATE TABLE IF NOT EXISTS api_keys (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  key_hash TEXT NOT NULL UNIQUE,
  key_prefix TEXT NOT NULL,
  label TEXT,
  revoked_at TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_api_keys_hash ON api_keys(key_hash);
CREATE INDEX IF NOT EXISTS idx_api_keys_user ON api_keys(user_id);

-- ── Thread Pins (Cache Locks) ──
CREATE TABLE IF NOT EXISTS thread_pins (
  thread_key TEXT PRIMARY KEY,
  model_id TEXT NOT NULL,
  request_id TEXT NOT NULL,
  pinned_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  turn_count INTEGER NOT NULL DEFAULT 1
);

CREATE INDEX IF NOT EXISTS idx_thread_pins_expires ON thread_pins(expires_at);

-- ── Invite codes (registration gating) ──
CREATE TABLE IF NOT EXISTS invite_codes (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  created_by TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  uses_remaining INTEGER NOT NULL DEFAULT 1,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_invite_codes_code ON invite_codes(code);
CREATE INDEX IF NOT EXISTS idx_invite_codes_created_by ON invite_codes(created_by);
