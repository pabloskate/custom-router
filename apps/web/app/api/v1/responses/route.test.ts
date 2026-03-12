import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AuthResult } from "@/src/lib/auth";
import { authenticateRequest, authenticateSession } from "@/src/lib/auth";
import { extractResponsesInputMessages, handleConfigChat, isResponsesConfigMode } from "@/src/lib/config-chat";
import { isSameOriginRequest } from "@/src/lib/csrf";
import { gatewayRowToPublic, loadGatewaysWithMigration } from "@/src/lib/gateway-store";
import { routeAndProxy } from "@/src/lib/router-service";
import { getRuntimeBindings } from "@/src/lib/runtime";
import { POST } from "./route";

vi.mock("@/src/lib/runtime", () => ({
  getRuntimeBindings: vi.fn(),
}));

vi.mock("@/src/lib/auth", () => ({
  authenticateRequest: vi.fn(),
  authenticateSession: vi.fn(),
}));

vi.mock("@/src/lib/csrf", () => ({
  isSameOriginRequest: vi.fn(),
}));

vi.mock("@/src/lib/gateway-store", () => ({
  loadGatewaysWithMigration: vi.fn(),
  gatewayRowToPublic: vi.fn(),
}));

vi.mock("@/src/lib/router-service", () => ({
  routeAndProxy: vi.fn(),
}));

vi.mock("@/src/lib/config-chat", () => ({
  extractResponsesInputMessages: vi.fn(),
  handleConfigChat: vi.fn(),
  isResponsesConfigMode: vi.fn(),
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
    showModelInResponse: false,
    configAgentEnabled: true,
    configAgentOrchestratorModel: "gateway/orchestrator",
    configAgentSearchModel: "gateway/search",
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
  const extractMessagesMock = vi.mocked(extractResponsesInputMessages);
  const handleConfigChatMock = vi.mocked(handleConfigChat);
  const isResponsesConfigModeMock = vi.mocked(isResponsesConfigMode);

  beforeEach(() => {
    vi.clearAllMocks();
    runtimeMock.mockReturnValue({ ROUTER_DB: {} as any });
    authRequestMock.mockResolvedValue(createAuth());
    authSessionMock.mockResolvedValue(null);
    sameOriginMock.mockReturnValue(false);
    loadGatewaysMock.mockResolvedValue([]);
    toPublicMock.mockImplementation((row: any) => row);
  });

  it("intercepts $$config requests on the Responses endpoint", async () => {
    const configMessages = [{ role: "user", content: "$$config show me config" }];
    const configResponse = new Response(
      JSON.stringify({
        object: "response",
        output: [
          {
            role: "assistant",
            content: [{ type: "output_text", text: "Here is your config." }],
          },
        ],
      }),
      {
        status: 200,
        headers: { "content-type": "application/json" },
      }
    );

    isResponsesConfigModeMock.mockReturnValue(true);
    extractMessagesMock.mockReturnValue(configMessages);
    handleConfigChatMock.mockResolvedValue(configResponse);

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
    expect(isResponsesConfigModeMock).toHaveBeenCalledWith("$$config show me config");
    expect(extractMessagesMock).toHaveBeenCalledWith("$$config show me config");
    expect(handleConfigChatMock).toHaveBeenCalledWith(
      configMessages,
      expect.objectContaining({ userId: "user_1" }),
      expect.objectContaining({ ROUTER_DB: expect.anything() }),
      [],
      false,
      "responses"
    );
    expect(routeAndProxyMock).not.toHaveBeenCalled();
  });
});
