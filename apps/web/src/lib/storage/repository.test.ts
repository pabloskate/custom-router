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
});
