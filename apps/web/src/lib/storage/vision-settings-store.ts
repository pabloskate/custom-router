import { VISION } from "@/src/lib/constants";
import type { D1Database } from "@/src/lib/infra/cloudflare-types";

export type StoredVisionMode = (typeof VISION.MODES)[number];

export interface StoredVisionSettings {
  gatewayId: string;
  modelId: string;
  defaultMode: StoredVisionMode;
  updatedAt: string;
}

interface VisionSettingsRow {
  user_id: string;
  gateway_id: string;
  model_id: string;
  default_mode: string;
  updated_at: string;
}

const ENSURE_SQL = `
CREATE TABLE IF NOT EXISTS user_vision_settings (
  user_id      TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  gateway_id   TEXT NOT NULL,
  model_id     TEXT NOT NULL,
  default_mode TEXT NOT NULL DEFAULT '${VISION.DEFAULT_MODE}',
  updated_at   TEXT NOT NULL
);
`;

let ensurePromise: Promise<void> | null = null;

function normalizeStoredVisionMode(value: string | null | undefined): StoredVisionMode {
  return VISION.MODES.includes(value as StoredVisionMode)
    ? value as StoredVisionMode
    : VISION.DEFAULT_MODE;
}

export function ensureUserVisionSettingsTable(db: D1Database): Promise<void> {
  if (ensurePromise) {
    return ensurePromise;
  }

  ensurePromise = db
    .prepare(ENSURE_SQL)
    .run()
    .then(() => undefined)
    .catch((error) => {
      ensurePromise = null;
      throw error;
    });
  return ensurePromise;
}

function rowToSettings(row: VisionSettingsRow | null): StoredVisionSettings | null {
  if (!row) {
    return null;
  }

  return {
    gatewayId: row.gateway_id,
    modelId: row.model_id,
    defaultMode: normalizeStoredVisionMode(row.default_mode),
    updatedAt: row.updated_at,
  };
}

export async function getUserVisionSettings(
  db: D1Database,
  userId: string,
): Promise<StoredVisionSettings | null> {
  await ensureUserVisionSettingsTable(db);
  const row = await db
    .prepare(
      `SELECT user_id, gateway_id, model_id, default_mode, updated_at
       FROM user_vision_settings
       WHERE user_id = ?1
       LIMIT 1`,
    )
    .bind(userId)
    .first<VisionSettingsRow>();
  return rowToSettings(row);
}

export async function upsertUserVisionSettings(args: {
  db: D1Database;
  userId: string;
  gatewayId: string;
  modelId: string;
  defaultMode: StoredVisionMode;
}): Promise<StoredVisionSettings> {
  await ensureUserVisionSettingsTable(args.db);
  const now = new Date().toISOString();
  await args.db
    .prepare(
      `INSERT INTO user_vision_settings (user_id, gateway_id, model_id, default_mode, updated_at)
       VALUES (?1, ?2, ?3, ?4, ?5)
       ON CONFLICT(user_id) DO UPDATE SET
         gateway_id = excluded.gateway_id,
         model_id = excluded.model_id,
         default_mode = excluded.default_mode,
         updated_at = excluded.updated_at`,
    )
    .bind(args.userId, args.gatewayId, args.modelId, args.defaultMode, now)
    .run();

  return {
    gatewayId: args.gatewayId,
    modelId: args.modelId,
    defaultMode: args.defaultMode,
    updatedAt: now,
  };
}
