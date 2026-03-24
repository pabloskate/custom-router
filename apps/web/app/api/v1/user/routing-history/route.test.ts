import { beforeEach, describe, expect, it, vi } from "vitest";

import { withSessionAuth } from "@/src/lib/auth";
import { getRouterRepository } from "@/src/lib/storage";
import { GET } from "./route";

vi.mock("@/src/lib/auth", async () => {
  const actual = await vi.importActual<typeof import("@/src/lib/auth")>("@/src/lib/auth");
  return {
    ...actual,
    withSessionAuth: vi.fn(),
  };
});

vi.mock("@/src/lib/storage", async () => {
  const actual = await vi.importActual<typeof import("@/src/lib/storage")>("@/src/lib/storage");
  return {
    ...actual,
    getRouterRepository: vi.fn(),
  };
});

describe("/api/v1/user/routing-history route", () => {
  const withSessionAuthMock = vi.mocked(withSessionAuth);
  const getRouterRepositoryMock = vi.mocked(getRouterRepository);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects unauthenticated requests", async () => {
    withSessionAuthMock.mockResolvedValue(new Response(JSON.stringify({ error: "Unauthorized." }), { status: 401 }));

    const response = await GET(new Request("http://localhost/api/v1/user/routing-history"));

    expect(response.status).toBe(401);
  });

  it("returns recent history for the authenticated user with a capped limit", async () => {
    const listRecentModelUsage = vi.fn(async () => [
      {
        requestId: "req_1",
        createdAt: "2026-03-22T10:00:00.000Z",
        requestedModel: "planning-backend",
        selectedModel: "model/alpha",
        decisionReason: "initial_route",
      },
    ]);

    getRouterRepositoryMock.mockReturnValue({
      listRecentModelUsage,
    } as any);
    withSessionAuthMock.mockImplementation(async (request, handler) => {
      return handler({ userId: "user_1", routeLoggingEnabled: true } as any, {} as any);
    });

    const response = await GET(new Request("http://localhost/api/v1/user/routing-history?limit=999"));

    expect(response.status).toBe(200);
    expect(listRecentModelUsage).toHaveBeenCalledWith("user_1", 50);
    expect(response.headers.get("cache-control")).toBe("no-store");
    const payload = await response.json() as { entries: Array<{ requestId: string }> };
    expect(payload.entries).toHaveLength(1);
    expect(payload.entries[0]?.requestId).toBe("req_1");
  });

  it("returns an empty list when routing logs are disabled", async () => {
    const listRecentModelUsage = vi.fn(async () => []);
    getRouterRepositoryMock.mockReturnValue({
      listRecentModelUsage,
    } as any);
    withSessionAuthMock.mockImplementation(async (_request, handler) => {
      return handler({ userId: "user_1", routeLoggingEnabled: false } as any, {} as any);
    });

    const response = await GET(new Request("http://localhost/api/v1/user/routing-history"));

    expect(response.status).toBe(200);
    expect(listRecentModelUsage).not.toHaveBeenCalled();
    const payload = await response.json() as { entries: unknown[] };
    expect(payload.entries).toEqual([]);
  });
});
