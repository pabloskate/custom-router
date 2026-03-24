import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.resetModules();
  vi.restoreAllMocks();
  vi.unmock("../infra/runtime-bindings");
});

async function loadRepositoryWithBindings(bindings: Record<string, unknown>) {
  vi.doMock("../infra/runtime-bindings", () => ({
    getRuntimeBindings: () => bindings,
  }));

  return import("./repository");
}

function createKvStub() {
  return {
    get: vi.fn(async () => null),
    put: vi.fn(async () => undefined),
    delete: vi.fn(async () => undefined),
  };
}

function createD1Stub(args: {
  routingExplanationColumns: string[];
  onRun?: (query: string, values: unknown[]) => void;
}) {
  const preparedQueries: string[] = [];

  const db = {
    prepare(query: string) {
      preparedQueries.push(query);
      let boundValues: unknown[] = [];

      return {
        bind(...values: unknown[]) {
          boundValues = values;
          return this;
        },
        async first() {
          return null;
        },
        async all() {
          if (query === "PRAGMA table_info(routing_explanations)") {
            return {
              results: args.routingExplanationColumns.map((name) => ({ name })),
            };
          }

          throw new Error(`Unexpected all() query in test: ${query}`);
        },
        async run() {
          args.onRun?.(query, boundValues);
          return { meta: { changes: 1 } };
        },
      };
    },
  };

  return { db, preparedQueries };
}

describe("repository execution catalog defaults", () => {
  it("does not seed a hard-coded execution catalog in memory mode", async () => {
    const { getRouterRepository } = await loadRepositoryWithBindings({});

    const repository = getRouterRepository();

    await expect(repository.getCatalog()).resolves.toEqual([]);
  });

  it("returns an empty catalog when no active system catalog version exists", async () => {
    const kv = {
      get: vi.fn(async () => null),
      put: vi.fn(async () => undefined),
    };
    const { getRouterRepository } = await loadRepositoryWithBindings({
      ROUTER_DB: {},
      ROUTER_KV: kv,
    });

    const repository = getRouterRepository();

    await expect(repository.getCatalog()).resolves.toEqual([]);
    expect(kv.get).toHaveBeenCalledWith("router:active:meta", { type: "text" });
  });

  it("fails closed when the active catalog blob is missing or invalid", async () => {
    const kv = {
      get: vi.fn(async (key: string) => {
        if (key === "router:active:meta") {
          return JSON.stringify({ version: "catalog-2026-03-21" });
        }
        return null;
      }),
      put: vi.fn(async () => undefined),
    };
    const { getRouterRepository } = await loadRepositoryWithBindings({
      ROUTER_DB: {},
      ROUTER_KV: kv,
    });

    const repository = getRouterRepository();

    await expect(repository.getCatalog()).resolves.toEqual([]);
    expect(kv.get).toHaveBeenCalledWith("router:active:catalog:catalog-2026-03-21", { type: "text" });
  });

  it("lists recent model usage newest-first per user in memory mode", async () => {
    const { getRouterRepository } = await loadRepositoryWithBindings({});
    const repository = getRouterRepository();

    await repository.putExplanation({
      userId: "user_1",
      explanation: {
        requestId: "req_1",
        createdAt: "2026-03-22T10:00:00.000Z",
        requestedModel: "planning-backend",
        catalogVersion: "1.0",
        classificationConfidence: 0.91,
        classificationSignals: [],
        threadKey: "thread_1",
        isContinuation: false,
        pinUsed: false,
        selectedModel: "model/alpha",
        decisionReason: "initial_route",
        fallbackChain: [],
        notes: [],
      },
    });
    await repository.putExplanation({
      userId: "user_2",
      explanation: {
        requestId: "req_2",
        createdAt: "2026-03-22T10:01:00.000Z",
        requestedModel: "review-backend",
        catalogVersion: "1.0",
        classificationConfidence: 0.88,
        classificationSignals: [],
        threadKey: "thread_2",
        isContinuation: false,
        pinUsed: false,
        selectedModel: "model/beta",
        decisionReason: "thread_pin",
        fallbackChain: [],
        notes: [],
      },
    });
    await repository.putExplanation({
      userId: "user_1",
      explanation: {
        requestId: "req_3",
        createdAt: "2026-03-22T10:02:00.000Z",
        requestedModel: "planning-backend",
        catalogVersion: "1.0",
        classificationConfidence: 0.93,
        classificationSignals: [],
        threadKey: "thread_3",
        isContinuation: true,
        pinUsed: true,
        selectedModel: "model/gamma",
        decisionReason: "fallback_after_failure",
        fallbackChain: ["model/alpha"],
        notes: [],
      },
    });

    await expect(repository.listRecentModelUsage("user_1", 20)).resolves.toEqual([
      {
        requestId: "req_3",
        createdAt: "2026-03-22T10:02:00.000Z",
        requestedModel: "planning-backend",
        selectedModel: "model/gamma",
        decisionReason: "fallback_after_failure",
      },
      {
        requestId: "req_1",
        createdAt: "2026-03-22T10:00:00.000Z",
        requestedModel: "planning-backend",
        selectedModel: "model/alpha",
        decisionReason: "initial_route",
      },
    ]);
  });

  it("prunes old explanation history in memory mode", async () => {
    const { getRouterRepository } = await loadRepositoryWithBindings({});
    const repository = getRouterRepository();

    await repository.putExplanation({
      userId: "user_1",
      explanation: {
        requestId: "req_old",
        createdAt: "2026-03-19T10:00:00.000Z",
        requestedModel: "planning-backend",
        catalogVersion: "1.0",
        classificationConfidence: 0.5,
        classificationSignals: [],
        threadKey: "thread_old",
        isContinuation: false,
        pinUsed: false,
        selectedModel: "model/old",
        decisionReason: "initial_route",
        fallbackChain: [],
        notes: [],
      },
    });
    await repository.putExplanation({
      userId: "user_1",
      explanation: {
        requestId: "req_new",
        createdAt: "2026-03-22T10:00:00.000Z",
        requestedModel: "planning-backend",
        catalogVersion: "1.0",
        classificationConfidence: 0.5,
        classificationSignals: [],
        threadKey: "thread_new",
        isContinuation: false,
        pinUsed: false,
        selectedModel: "model/new",
        decisionReason: "initial_route",
        fallbackChain: [],
        notes: [],
      },
    });

    await repository.pruneOldExplanations("2026-03-21T00:00:00.000Z");

    await expect(repository.getExplanation("req_old")).resolves.toBeNull();
    await expect(repository.listRecentModelUsage("user_1", 20)).resolves.toEqual([
      {
        requestId: "req_new",
        createdAt: "2026-03-22T10:00:00.000Z",
        requestedModel: "planning-backend",
        selectedModel: "model/new",
        decisionReason: "initial_route",
      },
    ]);
  });

  it("falls back to legacy explanation writes when D1 is missing history columns", async () => {
    const runCalls: Array<{ query: string; values: unknown[] }> = [];
    const { db } = createD1Stub({
      routingExplanationColumns: ["request_id", "explanation_json", "created_at"],
      onRun: (query, values) => {
        runCalls.push({ query, values });
      },
    });
    const { getRouterRepository } = await loadRepositoryWithBindings({
      ROUTER_DB: db,
      ROUTER_KV: createKvStub(),
    });

    const repository = getRouterRepository();

    await repository.putExplanation({
      userId: "user_1",
      explanation: {
        requestId: "req_legacy",
        createdAt: "2026-03-24T20:00:00.000Z",
        requestedModel: "planning-backend",
        catalogVersion: "1.0",
        classificationConfidence: 0.7,
        classificationSignals: [],
        threadKey: "thread_legacy",
        isContinuation: false,
        pinUsed: false,
        selectedModel: "model/legacy",
        decisionReason: "initial_route",
        fallbackChain: [],
        notes: [],
      },
    });

    expect(runCalls).toHaveLength(1);
    expect(runCalls[0]?.query).toContain("request_id");
    expect(runCalls[0]?.query).toContain("explanation_json");
    expect(runCalls[0]?.query).toContain("created_at");
    expect(runCalls[0]?.query).not.toContain("user_id");
    expect(runCalls[0]?.values).toEqual([
      "req_legacy",
      JSON.stringify({
        requestId: "req_legacy",
        createdAt: "2026-03-24T20:00:00.000Z",
        requestedModel: "planning-backend",
        catalogVersion: "1.0",
        classificationConfidence: 0.7,
        classificationSignals: [],
        threadKey: "thread_legacy",
        isContinuation: false,
        pinUsed: false,
        selectedModel: "model/legacy",
        decisionReason: "initial_route",
        fallbackChain: [],
        notes: [],
      }),
      "2026-03-24T20:00:00.000Z",
    ]);
  });

  it("returns empty recent history when D1 is missing history columns", async () => {
    const { db, preparedQueries } = createD1Stub({
      routingExplanationColumns: ["request_id", "explanation_json", "created_at"],
    });
    const { getRouterRepository } = await loadRepositoryWithBindings({
      ROUTER_DB: db,
      ROUTER_KV: createKvStub(),
    });

    const repository = getRouterRepository();

    await expect(repository.listRecentModelUsage("user_1", 20)).resolves.toEqual([]);
    expect(preparedQueries).toEqual(["PRAGMA table_info(routing_explanations)"]);
  });
});
