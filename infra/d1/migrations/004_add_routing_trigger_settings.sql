-- Migration 004: per-user routing trigger settings
--
-- route_trigger_keywords: JSON string[] — custom keywords that trigger re-routing (additive with built-in $$route)
-- routing_frequency: one of "every_message" | "smart" | "new_thread_only"
ALTER TABLE users ADD COLUMN route_trigger_keywords TEXT;
ALTER TABLE users ADD COLUMN routing_frequency TEXT;
