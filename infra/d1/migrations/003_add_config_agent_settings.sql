-- Migration 003: optional per-user config-agent settings for $$config mode
--
-- Safe to run once on existing deployments upgraded from older schemas.
ALTER TABLE users ADD COLUMN config_agent_enabled INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN config_agent_orchestrator_model TEXT;
ALTER TABLE users ADD COLUMN config_agent_search_model TEXT;
