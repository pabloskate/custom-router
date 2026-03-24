// ─────────────────────────────────────────────────────────────────────────────
// repository.ts
//
// Repository pattern for all persistent router state. Two implementations:
//
//   CloudflareRepository  — Cloudflare D1 (SQL) + KV (blob storage)
//   MemoryRepository      — In-process fallback for local dev / testing
//
// getRouterRepository() auto-selects the implementation based on whether
// ROUTER_DB and ROUTER_KV bindings are present at runtime.
//
// D1 tables used (see infra/d1/schema.sql):
//   router_config         — versioned router config blobs
//   routing_explanations  — per-request routing decisions (for /explanations)
//   ingestion_runs        — history of catalog ingestion jobs
//   thread_pins           — model pinning for multi-turn threads
//
// KV keys used:
//   router:active:meta              — { version: string }
//   router:active:catalog:<version> — CatalogItem[]
// ─────────────────────────────────────────────────────────────────────────────

import {
  InMemoryPinStore,
  type CatalogItem,
  type PinStore,
  type RouterConfig,
  type RoutingExplanation,
  type ThreadPin
} from "@custom-router/core";
import type { RecentModelUsageEntry } from "@/src/features/routing/contracts";

import type { D1Database, KVNamespace } from "../infra/cloudflare-types";
import { ROUTER_CACHE } from "../constants";
import { DEFAULT_ROUTER_CONFIG } from "./defaults";
import { getRuntimeBindings } from "../infra/runtime-bindings";

const ACTIVE_META_KEY = "router:active:meta";
const ACTIVE_CATALOG_KEY = (version: string) => `router:active:catalog:${version}`;

interface CachedConfig {
  value: RouterConfig;
  cachedAtMs: number;
}

interface CachedCatalog {
  value: CatalogItem[];
  cachedAtMs: number;
}

export interface IngestionRunSummary {
  id: string;
  status: "ok" | "error" | "running";
  startedAt: string;
  finishedAt?: string;
  error?: string;
  artifactVersion?: string;
}

interface PersistedExplanationRecord {
  userId: string;
  explanation: RoutingExplanation;
}

export interface RouterRepository {
  getConfig(): Promise<RouterConfig>;
  setConfig(config: RouterConfig): Promise<void>;
  getCatalog(): Promise<CatalogItem[]>;
  setCatalog(version: string, catalog: CatalogItem[]): Promise<void>;
  getExplanation(requestId: string): Promise<RoutingExplanation | null>;
  putExplanation(record: PersistedExplanationRecord): Promise<void>;
  listRecentModelUsage(userId: string, limit?: number): Promise<RecentModelUsageEntry[]>;
  pruneOldExplanations(olderThanIso: string): Promise<void>;
  listRuns(limit?: number): Promise<IngestionRunSummary[]>;
  putRun(run: IngestionRunSummary): Promise<void>;
  getPinStore(): PinStore;
}

const memoryState = {
  config: { ...DEFAULT_ROUTER_CONFIG } as RouterConfig,
  catalog: [] as CatalogItem[],
  explanations: new Map<string, RoutingExplanation>(),
  recentModelUsage: [] as Array<RecentModelUsageEntry & { userId: string }>,
  runs: [] as IngestionRunSummary[],
  pinStore: new InMemoryPinStore()
};
const threadPinMetadataColumnCache = new WeakMap<D1Database, Promise<boolean>>();
const routingExplanationHistoryColumnCache = new WeakMap<D1Database, Promise<boolean>>();

function parseJson<T>(value: string | null | undefined): T | null {
  if (!value) {
    return null;
  }

  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

class MemoryRepository implements RouterRepository {
  async getConfig(): Promise<RouterConfig> {
    return memoryState.config;
  }

  async setConfig(config: RouterConfig): Promise<void> {
    memoryState.config = config;
  }

  async getCatalog(): Promise<CatalogItem[]> {
    return memoryState.catalog;
  }

  async setCatalog(version: string, catalog: CatalogItem[]): Promise<void> {
    memoryState.catalog = catalog;
  }

  async getExplanation(requestId: string): Promise<RoutingExplanation | null> {
    return memoryState.explanations.get(requestId) ?? null;
  }

  async putExplanation(record: PersistedExplanationRecord): Promise<void> {
    memoryState.explanations.set(record.explanation.requestId, record.explanation);
    memoryState.recentModelUsage = [
      {
        userId: record.userId,
        requestId: record.explanation.requestId,
        createdAt: record.explanation.createdAt,
        requestedModel: record.explanation.requestedModel,
        selectedModel: record.explanation.selectedModel,
        decisionReason: record.explanation.decisionReason,
      },
      ...memoryState.recentModelUsage.filter((entry) => entry.requestId !== record.explanation.requestId),
    ];
  }

  async listRecentModelUsage(userId: string, limit = 20): Promise<RecentModelUsageEntry[]> {
    return memoryState.recentModelUsage
      .filter((entry) => entry.userId === userId)
      .slice(0, limit)
      .map(({ userId: _userId, ...entry }) => entry);
  }

  async pruneOldExplanations(olderThanIso: string): Promise<void> {
    const cutoffMs = Date.parse(olderThanIso);
    if (!Number.isFinite(cutoffMs)) {
      return;
    }

    for (const [requestId, explanation] of memoryState.explanations.entries()) {
      if (Date.parse(explanation.createdAt) < cutoffMs) {
        memoryState.explanations.delete(requestId);
      }
    }

    memoryState.recentModelUsage = memoryState.recentModelUsage.filter((entry) => Date.parse(entry.createdAt) >= cutoffMs);
  }

  async listRuns(limit = 20): Promise<IngestionRunSummary[]> {
    return memoryState.runs.slice(0, limit);
  }

  async putRun(run: IngestionRunSummary): Promise<void> {
    memoryState.runs = [run, ...memoryState.runs].slice(0, 100);
  }

  getPinStore(): PinStore {
    return memoryState.pinStore;
  }
}

class D1PinStore implements PinStore {
  constructor(private readonly db: D1Database) { }

  private hasMetadataColumns(): Promise<boolean> {
    const cached = threadPinMetadataColumnCache.get(this.db);
    if (cached) {
      return cached;
    }

    const lookup = this.db
      .prepare("PRAGMA table_info(thread_pins)")
      .all<{ name?: string | null }>()
      .then(({ results }) => {
        const names = new Set(results.map((column) => column.name).filter((value): value is string => typeof value === "string"));
        return names.has("family_id") && names.has("reasoning_effort") && names.has("step_mode");
      })
      .catch(() => false);

    threadPinMetadataColumnCache.set(this.db, lookup);
    return lookup;
  }

  async get(threadKey: string) {
    const includeMetadata = await this.hasMetadataColumns();
    const row = await this.db
      .prepare(
        includeMetadata
          ? "SELECT model_id, request_id, pinned_at, expires_at, turn_count, reroute_after_turns, budget_source, family_id, reasoning_effort, step_mode FROM thread_pins WHERE thread_key = ?1 LIMIT 1"
          : "SELECT model_id, request_id, pinned_at, expires_at, turn_count, reroute_after_turns, budget_source FROM thread_pins WHERE thread_key = ?1 LIMIT 1"
      )
      .bind(threadKey)
      .first<{
        model_id: string;
        request_id: string;
        pinned_at: string;
        expires_at: string;
        turn_count: number;
        reroute_after_turns?: number | null;
        budget_source?: "classifier" | "default" | null;
        family_id?: string | null;
        reasoning_effort?: ThreadPin["reasoningEffort"] | null;
        step_mode?: ThreadPin["stepMode"] | null;
      }>();

    if (!row) {
      return null;
    }

    if (Date.parse(row.expires_at) <= Date.now()) {
      await this.clear(threadKey);
      return null;
    }

    return {
      threadKey,
      modelId: row.model_id,
      requestId: row.request_id,
      pinnedAt: row.pinned_at,
      expiresAt: row.expires_at,
      turnCount: row.turn_count,
      rerouteAfterTurns: typeof row.reroute_after_turns === "number" ? row.reroute_after_turns : undefined,
      budgetSource: row.budget_source ?? undefined,
      familyId: row.family_id ?? undefined,
      reasoningEffort: row.reasoning_effort ?? undefined,
      stepMode: row.step_mode ?? undefined,
    };
  }

  async set(pin: ThreadPin): Promise<void> {
    const includeMetadata = await this.hasMetadataColumns();
    await this.db
      .prepare(
        includeMetadata
          ? `INSERT INTO thread_pins (thread_key, model_id, request_id, pinned_at, expires_at, turn_count, reroute_after_turns, budget_source, family_id, reasoning_effort, step_mode)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)
             ON CONFLICT(thread_key) DO UPDATE SET
             model_id = excluded.model_id,
             request_id = excluded.request_id,
             pinned_at = excluded.pinned_at,
             expires_at = excluded.expires_at,
             turn_count = excluded.turn_count,
             reroute_after_turns = excluded.reroute_after_turns,
             budget_source = excluded.budget_source,
             family_id = excluded.family_id,
             reasoning_effort = excluded.reasoning_effort,
             step_mode = excluded.step_mode`
          : `INSERT INTO thread_pins (thread_key, model_id, request_id, pinned_at, expires_at, turn_count, reroute_after_turns, budget_source)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
             ON CONFLICT(thread_key) DO UPDATE SET
             model_id = excluded.model_id,
             request_id = excluded.request_id,
             pinned_at = excluded.pinned_at,
             expires_at = excluded.expires_at,
             turn_count = excluded.turn_count,
             reroute_after_turns = excluded.reroute_after_turns,
             budget_source = excluded.budget_source`
      )
      .bind(
        pin.threadKey,
        pin.modelId,
        pin.requestId,
        pin.pinnedAt,
        pin.expiresAt,
        pin.turnCount,
        pin.rerouteAfterTurns ?? null,
        pin.budgetSource ?? null,
        ...(includeMetadata
          ? [
              pin.familyId ?? null,
              pin.reasoningEffort ?? null,
              pin.stepMode ?? null,
            ]
          : []),
      )
      .run();
  }

  async clear(threadKey: string): Promise<void> {
    await this.db
      .prepare("DELETE FROM thread_pins WHERE thread_key = ?1")
      .bind(threadKey)
      .run();
  }
}

class CloudflareRepository implements RouterRepository {
  private readonly pinStore: PinStore;
  private configCache: CachedConfig | null = null;
  private catalogCache: CachedCatalog | null = null;

  constructor(
    private readonly db: D1Database,
    private readonly kv: KVNamespace
  ) {
    this.pinStore = new D1PinStore(db);
  }

  private hasRoutingExplanationHistoryColumns(): Promise<boolean> {
    const cached = routingExplanationHistoryColumnCache.get(this.db);
    if (cached) {
      return cached;
    }

    const lookup = this.db
      .prepare("PRAGMA table_info(routing_explanations)")
      .all<{ name?: string | null }>()
      .then(({ results }) => {
        const names = new Set(results.map((column) => column.name).filter((value): value is string => typeof value === "string"));
        return names.has("user_id")
          && names.has("requested_model")
          && names.has("selected_model")
          && names.has("decision_reason");
      })
      .catch(() => false);

    routingExplanationHistoryColumnCache.set(this.db, lookup);
    return lookup;
  }

  async getConfig(): Promise<RouterConfig> {
    const nowMs = Date.now();
    if (this.configCache && nowMs - this.configCache.cachedAtMs < ROUTER_CACHE.CONFIG_TTL_MS) {
      return this.configCache.value;
    }

    const row = await this.db
      .prepare(
        "SELECT config_json FROM router_config ORDER BY updated_at DESC LIMIT 1"
      )
      .first<{ config_json: string }>();

    const parsed = parseJson<RouterConfig>(row?.config_json);
    const value = parsed ?? { ...DEFAULT_ROUTER_CONFIG };
    this.configCache = { value, cachedAtMs: nowMs };
    return value;
  }

  async setConfig(config: RouterConfig): Promise<void> {
    const nowMs = Date.now();
    await this.db
      .prepare(
        "INSERT INTO router_config (version, config_json, updated_at) VALUES (?1, ?2, ?3)"
      )
      .bind(config.version, JSON.stringify(config), new Date(nowMs).toISOString())
      .run();
    this.configCache = { value: config, cachedAtMs: nowMs };
  }

  async getCatalog(): Promise<CatalogItem[]> {
    const nowMs = Date.now();
    if (this.catalogCache && nowMs - this.catalogCache.cachedAtMs < ROUTER_CACHE.CATALOG_TTL_MS) {
      return this.catalogCache.value;
    }

    const metaRaw = await this.kv.get(ACTIVE_META_KEY, { type: "text" });
    const meta = parseJson<{ version?: string }>(
      typeof metaRaw === "string" ? metaRaw : undefined
    );

    if (!meta?.version) {
      this.catalogCache = { value: [], cachedAtMs: nowMs };
      return [];
    }

    const catalogRaw = await this.kv.get(ACTIVE_CATALOG_KEY(meta.version), { type: "text" });
    const catalog = parseJson<CatalogItem[]>(
      typeof catalogRaw === "string" ? catalogRaw : undefined
    );

    // Execution model inventories must come from stored system data or synced
    // gateway models. If the stored catalog blob is missing or invalid, fail
    // closed with an empty list instead of reviving a hard-coded fallback.
    const value = catalog ?? [];
    this.catalogCache = { value, cachedAtMs: nowMs };
    return value;
  }

  async setCatalog(version: string, catalog: CatalogItem[]): Promise<void> {
    const nowMs = Date.now();
    await this.kv.put(ACTIVE_CATALOG_KEY(version), JSON.stringify(catalog));
    await this.kv.put(ACTIVE_META_KEY, JSON.stringify({ version }));
    this.catalogCache = { value: catalog, cachedAtMs: nowMs };
  }

  async getExplanation(requestId: string): Promise<RoutingExplanation | null> {
    const row = await this.db
      .prepare(
        "SELECT explanation_json FROM routing_explanations WHERE request_id = ?1 LIMIT 1"
      )
      .bind(requestId)
      .first<{ explanation_json: string }>();

    return parseJson<RoutingExplanation>(row?.explanation_json) ?? null;
  }

  async putExplanation(record: PersistedExplanationRecord): Promise<void> {
    const includeHistoryColumns = await this.hasRoutingExplanationHistoryColumns();
    await this.db
      .prepare(
        includeHistoryColumns
          ? `INSERT OR REPLACE INTO routing_explanations (
               request_id,
               user_id,
               requested_model,
               selected_model,
               decision_reason,
               explanation_json,
               created_at
             ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)`
          : `INSERT OR REPLACE INTO routing_explanations (
               request_id,
               explanation_json,
               created_at
             ) VALUES (?1, ?2, ?3)`
      )
      .bind(
        record.explanation.requestId,
        ...(includeHistoryColumns
          ? [
              record.userId,
              record.explanation.requestedModel,
              record.explanation.selectedModel,
              record.explanation.decisionReason,
              JSON.stringify(record.explanation),
              record.explanation.createdAt,
            ]
          : [
              JSON.stringify(record.explanation),
              record.explanation.createdAt,
            ]),
      )
      .run();
  }

  async listRecentModelUsage(userId: string, limit = 20): Promise<RecentModelUsageEntry[]> {
    const includeHistoryColumns = await this.hasRoutingExplanationHistoryColumns();
    if (!includeHistoryColumns) {
      return [];
    }

    const cappedLimit = Math.max(1, Math.min(limit, 50));
    const { results } = await this.db
      .prepare(
        `SELECT request_id, created_at, requested_model, selected_model, decision_reason
         FROM routing_explanations
         WHERE user_id = ?1
         ORDER BY created_at DESC
         LIMIT ?2`
      )
      .bind(userId, cappedLimit)
      .all<{
        request_id: string;
        created_at: string;
        requested_model: string;
        selected_model: string;
        decision_reason: string;
      }>();

    return results.map((row) => ({
      requestId: row.request_id,
      createdAt: row.created_at,
      requestedModel: row.requested_model,
      selectedModel: row.selected_model,
      decisionReason: row.decision_reason,
    }));
  }

  async pruneOldExplanations(olderThanIso: string): Promise<void> {
    await this.db
      .prepare("DELETE FROM routing_explanations WHERE created_at < ?1")
      .bind(olderThanIso)
      .run();
  }

  async listRuns(limit = 20): Promise<IngestionRunSummary[]> {
    const { results } = await this.db
      .prepare(
        "SELECT id, status, started_at, finished_at, error, artifact_version FROM ingestion_runs ORDER BY started_at DESC LIMIT ?1"
      )
      .bind(limit)
      .all<{
        id: string;
        status: IngestionRunSummary["status"];
        started_at: string;
        finished_at: string | null;
        error: string | null;
        artifact_version: string | null;
      }>();

    return results.map((row) => ({
      id: row.id,
      status: row.status,
      startedAt: row.started_at,
      finishedAt: row.finished_at ?? undefined,
      error: row.error ?? undefined,
      artifactVersion: row.artifact_version ?? undefined
    }));
  }

  async putRun(run: IngestionRunSummary): Promise<void> {
    await this.db
      .prepare(
        "INSERT OR REPLACE INTO ingestion_runs (id, status, started_at, finished_at, error, artifact_version) VALUES (?1, ?2, ?3, ?4, ?5, ?6)"
      )
      .bind(
        run.id,
        run.status,
        run.startedAt,
        run.finishedAt ?? null,
        run.error ?? null,
        run.artifactVersion ?? null
      )
      .run();
  }

  getPinStore(): PinStore {
    return this.pinStore;
  }
}

let cachedRepository: RouterRepository | null = null;

export function getRouterRepository(): RouterRepository {
  if (cachedRepository) {
    return cachedRepository;
  }

  const bindings = getRuntimeBindings();

  if (bindings.ROUTER_DB && bindings.ROUTER_KV) {
    cachedRepository = new CloudflareRepository(bindings.ROUTER_DB, bindings.ROUTER_KV);
    return cachedRepository;
  }

  cachedRepository = new MemoryRepository();
  return cachedRepository;
}
