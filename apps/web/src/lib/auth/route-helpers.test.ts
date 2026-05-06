import { beforeEach, describe, expect, it, vi } from "vitest";

import { authenticateRequest, authenticateSession } from "./auth";
import { consumeRateLimit } from "./rate-limit";
import { withApiKeyAuth, withBrowserSessionOrApiKeyAuth } from "./route-helpers";
import { getRuntimeBindings } from "../infra/runtime-bindings";

vi.mock("./auth", () => ({
  authenticateRequest: vi.fn(),
  authenticateSession: vi.fn(),
  verifyAdminSecret: vi.fn(),
}));

vi.mock("./rate-limit", () => ({
  consumeRateLimit: vi.fn(),
}));

vi.mock("../infra/runtime-bindings", () => ({
  getRuntimeBindings: vi.fn(),
}));

describe("route auth helpers", () => {
  const runtimeMock = vi.mocked(getRuntimeBindings);
  const authenticateRequestMock = vi.mocked(authenticateRequest);
  const authenticateSessionMock = vi.mocked(authenticateSession);
  const consumeRateLimitMock = vi.mocked(consumeRateLimit);

  beforeEach(() => {
    vi.clearAllMocks();
    runtimeMock.mockReturnValue({ ROUTER_DB: {} as any });
    consumeRateLimitMock.mockResolvedValue({
      allowed: true,
      remaining: 1,
      retryAfterSeconds: 0,
    });
  });

  it("rejects API key requests that exceed the key's per-minute limit", async () => {
    authenticateRequestMock.mockResolvedValue({
      authType: "api_key",
      apiKeyId: "key_1",
      apiKeyRateLimitPerMinute: 2,
      userId: "user_1",
      userName: "Test User",
      updatedAt: "2026-05-05T00:00:00.000Z",
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
    });
    consumeRateLimitMock.mockResolvedValue({
      allowed: false,
      remaining: 0,
      retryAfterSeconds: 42,
    });
    const handler = vi.fn(async () => new Response("ok"));

    const response = await withApiKeyAuth(new Request("http://localhost/api"), handler);

    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("42");
    expect(response.headers.get("x-ratelimit-limit")).toBe("2");
    expect(handler).not.toHaveBeenCalled();
  });

  it("does not rate-limit same-origin session fallbacks", async () => {
    authenticateRequestMock.mockResolvedValue(null);
    authenticateSessionMock.mockResolvedValue({
      authType: "session",
      userId: "user_1",
      userName: "Test User",
      updatedAt: "2026-05-05T00:00:00.000Z",
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
    });
    const handler = vi.fn(async () => new Response("ok"));

    const response = await withBrowserSessionOrApiKeyAuth(
      new Request("http://localhost/api", { headers: { origin: "http://localhost" } }),
      handler
    );

    expect(response.status).toBe(200);
    expect(consumeRateLimitMock).not.toHaveBeenCalled();
    expect(handler).toHaveBeenCalled();
  });
});
