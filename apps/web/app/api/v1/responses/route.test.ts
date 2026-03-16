import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AuthResult } from "@/src/lib/auth";
import { authenticateRequest, authenticateSession, isSameOriginRequest } from "@/src/lib/auth";
import { getRuntimeBindings } from "@/src/lib/infra";
import { routeAndProxy } from "@/src/lib/routing";
import { gatewayRowToPublic, loadGatewaysWithMigration } from "@/src/lib/storage";
import { POST } from "./route";

vi.mock("@/src/lib/infra", async () => {
  const actual = await vi.importActual<typeof import("@/src/lib/infra")>("@/src/lib/infra");
  return {
    ...actual,
    getRuntimeBindings: vi.fn(),
  };
});

vi.mock("@/src/lib/auth", () => ({
  authenticateRequest: vi.fn(),
  authenticateSession: vi.fn(),
  isSameOriginRequest: vi.fn(),
}));

vi.mock("@/src/lib/storage", () => ({
  loadGatewaysWithMigration: vi.fn(),
  gatewayRowToPublic: vi.fn(),
}));

vi.mock("@/src/lib/routing", () => ({
  routeAndProxy: vi.fn(),
}));

function createAuth(overrides: Partial<AuthResult> = {}): AuthResult {
  return {
    userId: "user_1",
    userName: "Test User",
    preferredModels: null,
    defaultModel: null,
    classifierModel: null,
    routingInstructions: null,
    blocklist: null,
    customCatalog: null,
    profiles: null,
    routeTriggerKeywords: null,
    routingFrequency: null,
    upstreamBaseUrl: null,
    upstreamApiKeyEnc: null,
    classifierBaseUrl: null,
    classifierApiKeyEnc: null,
    ...overrides,
  };
}

describe("/api/v1/responses route", () => {
  const runtimeMock = vi.mocked(getRuntimeBindings);
  const authRequestMock = vi.mocked(authenticateRequest);
  const authSessionMock = vi.mocked(authenticateSession);
  const sameOriginMock = vi.mocked(isSameOriginRequest);
  const loadGatewaysMock = vi.mocked(loadGatewaysWithMigration);
  const toPublicMock = vi.mocked(gatewayRowToPublic);
  const routeAndProxyMock = vi.mocked(routeAndProxy);

  beforeEach(() => {
    vi.clearAllMocks();
    runtimeMock.mockReturnValue({ ROUTER_DB: {} as any });
    authRequestMock.mockResolvedValue(createAuth());
    authSessionMock.mockResolvedValue(null);
    sameOriginMock.mockReturnValue(false);
    loadGatewaysMock.mockResolvedValue([]);
    toPublicMock.mockImplementation((row: any) => row);
  });

  it("routes responses payloads through routeAndProxy", async () => {
    routeAndProxyMock.mockResolvedValue({
      requestId: "router_test",
      response: new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    });

    const response = await POST(
      new Request("http://localhost/api/v1/responses", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          model: "auto",
          input: "$$config show me config",
        }),
      })
    );

    expect(response.status).toBe(200);
    expect(routeAndProxyMock).toHaveBeenCalledTimes(1);
    expect(routeAndProxyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        apiPath: "/responses",
      })
    );
  });
});
