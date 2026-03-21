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
});
