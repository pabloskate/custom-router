import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AuthResult } from "@/src/lib/auth";
import { parseJsonBody, withBrowserSessionOrApiKeyAuth } from "@/src/lib/auth";
import { requestId } from "@/src/lib/infra/request-id";
import { routeAndProxy } from "@/src/lib/routing/router-service";
import { getRouterRepository } from "@/src/lib/storage";
import { buildUserRouterConfig } from "@/src/features/routing/server/routed-request-context";
import { POST } from "./route";

vi.mock("@/src/lib/auth", async () => {
  const actual = await vi.importActual<typeof import("@/src/lib/auth")>("@/src/lib/auth");
  return {
    ...actual,
    parseJsonBody: vi.fn(),
    withBrowserSessionOrApiKeyAuth: vi.fn(),
  };
});

vi.mock("@/src/lib/routing/router-service", () => ({
  routeAndProxy: vi.fn(),
}));

vi.mock("@/src/lib/storage", async () => {
  const actual = await vi.importActual<typeof import("@/src/lib/storage")>("@/src/lib/storage");
  return {
    ...actual,
    getRouterRepository: vi.fn(),
  };
});

vi.mock("@/src/lib/infra/request-id", () => ({
  requestId: vi.fn(),
}));

vi.mock("@/src/features/routing/server/routed-request-context", () => ({
  buildUserRouterConfig: vi.fn(),
}));

function createAuth(overrides: Partial<AuthResult> = {}): AuthResult {
  return {
    userId: "user_1",
    userName: "Test User",
    updatedAt: "2026-03-11T00:00:00.000Z",
    preferredModels: null,
    defaultModel: null,
    classifierModel: null,
    routingInstructions: null,
    blocklist: null,
    customCatalog: null,
    profiles: null,
    routeTriggerKeywords: null,
    routingFrequency: null,
    routeLoggingEnabled: false,
    routingConfigRequiresReset: false,
    upstreamBaseUrl: null,
    upstreamApiKeyEnc: null,
    classifierBaseUrl: null,
    classifierApiKeyEnc: null,
    ...overrides,
  };
}

describe("/api/v1/chat/completions route", () => {
  const parseJsonBodyMock = vi.mocked(parseJsonBody);
  const withBrowserSessionOrApiKeyAuthMock = vi.mocked(withBrowserSessionOrApiKeyAuth);
  const routeAndProxyMock = vi.mocked(routeAndProxy);
  const repositoryMock = vi.mocked(getRouterRepository);
  const requestIdMock = vi.mocked(requestId);
  const buildUserRouterConfigMock = vi.mocked(buildUserRouterConfig);

  beforeEach(() => {
    vi.clearAllMocks();
    parseJsonBodyMock.mockImplementation(async (request) => ({
      data: await request.json(),
    }) as any);
    withBrowserSessionOrApiKeyAuthMock.mockImplementation(async (_request, handler) => {
      return handler(createAuth(), { ROUTER_DB: {} as any } as any);
    });
    requestIdMock.mockReturnValue("router_inspect_test");
    repositoryMock.mockReturnValue({
      listRecentModelUsage: vi.fn(async () => [
        {
          requestId: "req_1",
          createdAt: "2026-03-22T10:00:00.000Z",
          requestedModel: "planning-backend",
          selectedModel: "model/alpha",
          decisionReason: "initial_route",
        },
      ]),
    } as any);
  });

  it("short-circuits $$inspect without building routing config or proxying upstream", async () => {
    const response = await POST(
      new Request("http://localhost/api/v1/chat/completions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          model: "planning-backend",
          messages: [
            { role: "user", content: "$$inspect" },
          ],
        }),
      }),
    );

    expect(response.status).toBe(200);
    expect(buildUserRouterConfigMock).not.toHaveBeenCalled();
    expect(routeAndProxyMock).not.toHaveBeenCalled();
    expect(response.headers.get("x-router-model-selected")).toBeNull();

    const payload = await response.json() as {
      id: string;
      choices: Array<{ message?: { content?: string } }>;
    };
    expect(payload.id).toBe("router_inspect_test");
    expect(payload.choices[0]?.message?.content).toContain("Recent routed models");
    expect(payload.choices[0]?.message?.content).toContain("planning-backend -> model/alpha");
  });

  it("routes normal chat-completions requests through routeAndProxy", async () => {
    buildUserRouterConfigMock.mockResolvedValue({ profiles: null, gatewayRows: [] });
    routeAndProxyMock.mockResolvedValue({
      requestId: "router_normal_test",
      response: new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    });

    const response = await POST(
      new Request("http://localhost/api/v1/chat/completions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          model: "planning-backend",
          messages: [
            { role: "user", content: "hello" },
          ],
        }),
      }),
    );

    expect(response.status).toBe(200);
    expect(buildUserRouterConfigMock).toHaveBeenCalledTimes(1);
    expect(routeAndProxyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        apiPath: "/chat/completions",
        userId: "user_1",
      }),
    );
  });
});
