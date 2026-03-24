-- Migration 008: recent routing history columns
--
-- Adds indexed, per-user query support to routing_explanations without
-- introducing a second log table.
ALTER TABLE routing_explanations ADD COLUMN user_id TEXT;
ALTER TABLE routing_explanations ADD COLUMN requested_model TEXT;
ALTER TABLE routing_explanations ADD COLUMN selected_model TEXT;
ALTER TABLE routing_explanations ADD COLUMN decision_reason TEXT;

CREATE INDEX IF NOT EXISTS idx_routing_explanations_user_created_at
  ON routing_explanations(user_id, created_at DESC);
