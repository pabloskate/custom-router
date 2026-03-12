// ─────────────────────────────────────────────────────────────────────────────
// gateway-store.ts
//
// D1 CRUD for the user_gateways table. Each user can register multiple named
// gateways (name, base_url, encrypted_api_key, models). Models use the
// gateway's native model IDs (e.g., "gpt-4o" for OpenAI direct).
//
// All mutations scope to user_id to prevent cross-user access even if an id
// is guessed. Primary key is (id, user_id).
//
// Also exports loadGatewaysWithMigration: a lazy migration that converts the
// legacy user_upstream_credentials row into a "Default" gateway on first call.
// ─────────────────────────────────────────────────────────────────────────────

import type { CatalogItem } from "@auto-router/core";
import { UPSTREAM } from "./constants";
import type { D1Database } from "./cloudflare-types";

// ── Row types ────────────────────────────────────────────────────────────────

export interface GatewayRow {
  id: string;
  user_id: string;
  name: string;
  base_url: string;
  api_key_enc: string;
  models_json: string;  // JSON: CatalogItem[] with native model IDs for this gateway
  created_at: string;
  updated_at: string;
}

/** Safe public shape returned by the API (no key) */
export interface GatewayInfo {
  id: string;
  name: string;
  baseUrl: string;
  models: CatalogItem[];
  createdAt: string;
  updatedAt: string;
}

/** Shape used by router-service: still encrypted, models already parsed */
export interface GatewayRowPublic {
  id: string;
  baseUrl: string;
  apiKeyEnc: string;
  models: CatalogItem[];
}

// ── Table ensure ─────────────────────────────────────────────────────────────

const ENSURE_SQL = `
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
`;

let ensurePromise: Promise<void> | null = null;

export function ensureUserGatewaysTable(db: D1Database): Promise<void> {
  if (ensurePromise) return ensurePromise;
  ensurePromise = db
    .prepare(ENSURE_SQL)
    .run()
    .then(() => undefined)
    .catch((err) => {
      ensurePromise = null;
      throw err;
    });
  return ensurePromise;
}

// ── ID generation ─────────────────────────────────────────────────────────────

export function generateGatewayId(): string {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  const hex = Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return `gw_${hex}`;
}

// ── CRUD ─────────────────────────────────────────────────────────────────────

export async function getUserGateways(
  db: D1Database,
  userId: string
): Promise<GatewayRow[]> {
  await ensureUserGatewaysTable(db);
  const result = await db
    .prepare(
      `SELECT id, user_id, name, base_url, api_key_enc, models_json, created_at, updated_at
       FROM user_gateways
       WHERE user_id = ?1
       ORDER BY created_at ASC`
    )
    .bind(userId)
    .all<GatewayRow>();
  return result.results ?? [];
}

export async function getUserGateway(
  db: D1Database,
  userId: string,
  gatewayId: string
): Promise<GatewayRow | null> {
  await ensureUserGatewaysTable(db);
  return db
    .prepare(
      `SELECT id, user_id, name, base_url, api_key_enc, models_json, created_at, updated_at
       FROM user_gateways
       WHERE id = ?1 AND user_id = ?2
       LIMIT 1`
    )
    .bind(gatewayId, userId)
    .first<GatewayRow>();
}

export async function insertUserGateway(args: {
  db: D1Database;
  id: string;
  userId: string;
  name: string;
  baseUrl: string;
  apiKeyEnc: string;
  models?: CatalogItem[];
}): Promise<void> {
  await ensureUserGatewaysTable(args.db);
  const now = new Date().toISOString();
  const modelsJson = JSON.stringify(args.models ?? []);
  await args.db
    .prepare(
      `INSERT INTO user_gateways (id, user_id, name, base_url, api_key_enc, models_json, created_at, updated_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)`
    )
    .bind(args.id, args.userId, args.name, args.baseUrl, args.apiKeyEnc, modelsJson, now, now)
    .run();
}

export async function updateUserGateway(args: {
  db: D1Database;
  id: string;
  userId: string;
  name?: string;
  baseUrl?: string;
  apiKeyEnc?: string;
  models?: CatalogItem[];
}): Promise<{ found: boolean }> {
  await ensureUserGatewaysTable(args.db);

  const setClauses: string[] = ["updated_at = ?1"];
  const bindings: unknown[] = [new Date().toISOString()];
  let paramIdx = 2;

  if (args.name !== undefined) {
    setClauses.push(`name = ?${paramIdx}`);
    bindings.push(args.name);
    paramIdx++;
  }
  if (args.baseUrl !== undefined) {
    setClauses.push(`base_url = ?${paramIdx}`);
    bindings.push(args.baseUrl);
    paramIdx++;
  }
  if (args.apiKeyEnc !== undefined) {
    setClauses.push(`api_key_enc = ?${paramIdx}`);
    bindings.push(args.apiKeyEnc);
    paramIdx++;
  }
  if (args.models !== undefined) {
    setClauses.push(`models_json = ?${paramIdx}`);
    bindings.push(JSON.stringify(args.models));
    paramIdx++;
  }

  bindings.push(args.id);
  bindings.push(args.userId);

  const result = await args.db
    .prepare(
      `UPDATE user_gateways
       SET ${setClauses.join(", ")}
       WHERE id = ?${paramIdx} AND user_id = ?${paramIdx + 1}`
    )
    .bind(...bindings)
    .run();

  return { found: (result.meta?.changes ?? 0) > 0 };
}

export async function deleteUserGateway(args: {
  db: D1Database;
  id: string;
  userId: string;
}): Promise<{ found: boolean }> {
  await ensureUserGatewaysTable(args.db);
  const result = await args.db
    .prepare(`DELETE FROM user_gateways WHERE id = ?1 AND user_id = ?2`)
    .bind(args.id, args.userId)
    .run();
  return { found: (result.meta?.changes ?? 0) > 0 };
}

// ── Shape converters ──────────────────────────────────────────────────────────

function parseModels(modelsJson: string): CatalogItem[] {
  try {
    const parsed = JSON.parse(modelsJson);
    return Array.isArray(parsed)
      ? parsed.map((item) => {
          if (!item || typeof item !== "object") {
            return item;
          }

          const model = item as CatalogItem;
          const reasoningPreset = model.reasoningPreset;

          return {
            ...model,
            thinking: reasoningPreset ?? model.thinking,
          };
        })
      : [];
  } catch {
    return [];
  }
}

export function gatewayRowToInfo(row: GatewayRow): GatewayInfo {
  return {
    id: row.id,
    name: row.name,
    baseUrl: row.base_url,
    models: parseModels(row.models_json),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function gatewayRowToPublic(row: GatewayRow): GatewayRowPublic {
  return {
    id: row.id,
    baseUrl: row.base_url,
    apiKeyEnc: row.api_key_enc,
    models: parseModels(row.models_json),
  };
}

// ── Lazy migration ────────────────────────────────────────────────────────────

/**
 * Lazy migration from the legacy single-upstream model to the gateway system.
 *
 * If the user has upstream credentials in user_upstream_credentials but no
 * gateways yet, creates a "Default" gateway from those credentials and
 * migrates their custom_catalog models into it. Then clears upstream_base_url
 * and upstream_api_key_enc from user_upstream_credentials (classifier fields
 * are left untouched).
 *
 * If gateways already exist, returns them as-is.
 * If no upstream credentials exist either, returns [].
 */
export async function loadGatewaysWithMigration(args: {
  db: D1Database;
  userId: string;
  upstreamBaseUrl: string | null;
  upstreamApiKeyEnc: string | null;
  customCatalogJson: string | null;
}): Promise<GatewayRow[]> {
  const existing = await getUserGateways(args.db, args.userId);
  if (existing.length > 0) return existing;

  // No gateways yet — check if there's something to migrate
  if (!args.upstreamApiKeyEnc) return [];

  const defaultId = generateGatewayId();
  const baseUrl = args.upstreamBaseUrl ?? UPSTREAM.DEFAULT_BASE_URL;
  const modelsJson = args.customCatalogJson ?? "[]";

  await insertUserGateway({
    db: args.db,
    id: defaultId,
    userId: args.userId,
    name: "Default",
    baseUrl,
    apiKeyEnc: args.upstreamApiKeyEnc,
    models: parseModels(modelsJson),
  });

  // Clear the legacy upstream fields (classifier fields untouched)
  await args.db
    .prepare(
      `UPDATE user_upstream_credentials
       SET upstream_base_url = NULL, upstream_api_key_enc = NULL, updated_at = ?1
       WHERE user_id = ?2`
    )
    .bind(new Date().toISOString(), args.userId)
    .run();

  return getUserGateways(args.db, args.userId);
}
