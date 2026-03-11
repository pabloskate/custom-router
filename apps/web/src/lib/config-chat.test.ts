import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AuthResult } from "./auth";
import type { GatewayRowPublic } from "./gateway-store";
import type { RouterRuntimeBindings } from "./runtime";
import { encryptByokSecret } from "./byok-crypto";
import { handleConfigChat } from "./config-chat";
import { callOpenAiCompatible } from "./upstream";

vi.mock("./openrouter-models", () => ({
  validateModelId: vi.fn(),
  searchModels: vi.fn(),
}));

vi.mock("./upstream", () => ({
  callOpenAiCompatible: vi.fn(),
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
    configAgentEnabled: false,
    configAgentOrchestratorModel: null,
    configAgentSearchModel: null,
    upstreamBaseUrl: null,
    upstreamApiKeyEnc: null,
    classifierBaseUrl: null,
    classifierApiKeyEnc: null,
    ...overrides,
  };
}

function createBindings(overrides: Partial<RouterRuntimeBindings> = {}): RouterRuntimeBindings {
  return {
    ROUTER_DB: {} as any,
    ...overrides,
  };
}

function okChatResponse(body: unknown) {
  return {
    ok: true as const,
    status: 200,
    response: new Response(JSON.stringify(body), {
      status: 200,
      headers: { "content-type": "application/json" },
    }),
  };
}

describe("handleConfigChat", () => {
  const callMock = vi.mocked(callOpenAiCompatible);

  beforeEach(() => {
    callMock.mockReset();
  });

  it("returns setup error when config agent is disabled", async () => {
    const response = await handleConfigChat(
      [{ role: "user", content: "$$config show me config" }],
      createAuth({ configAgentEnabled: false }),
      createBindings(),
      [],
      false
    );

    expect(response.status).toBe(400);
    const body = await response.json() as { error: string };
    expect(body.error).toContain("Config agent is disabled");
    expect(callMock).not.toHaveBeenCalled();
  });

  it("returns setup error when orchestrator/search model is missing", async () => {
    const response = await handleConfigChat(
      [{ role: "user", content: "$$config show me config" }],
      createAuth({
        configAgentEnabled: true,
        configAgentOrchestratorModel: "gpt-4o",
        configAgentSearchModel: null,
      }),
      createBindings(),
      [],
      false
    );

    expect(response.status).toBe(400);
    const body = await response.json() as { error: string };
    expect(body.error).toContain("setup is incomplete");
    expect(callMock).not.toHaveBeenCalled();
  });

  it("uses configured orchestrator model for config rounds", async () => {
    callMock.mockResolvedValueOnce(
      okChatResponse({
        id: "chatcmpl_test",
        model: "gateway/orchestrator",
        choices: [{ message: { role: "assistant", content: "Done." } }],
      })
    );

    const response = await handleConfigChat(
      [{ role: "user", content: "$$config show me config" }],
      createAuth({
        configAgentEnabled: true,
        configAgentOrchestratorModel: "gateway/orchestrator",
        configAgentSearchModel: "gateway/search",
      }),
      createBindings({
        OPENROUTER_API_KEY: "legacy-key",
        OPENAI_COMPAT_BASE_URL: "https://legacy.example/v1",
      }),
      [],
      false
    );

    expect(response.status).toBe(200);
    expect(callMock).toHaveBeenCalledTimes(1);
    const firstCall = callMock.mock.calls[0]?.[0];
    expect(firstCall?.payload).toMatchObject({ model: "gateway/orchestrator" });
    expect(firstCall?.apiKey).toBe("legacy-key");
    expect(firstCall?.baseUrl).toBe("https://legacy.example/v1");
  });

  it("uses configured search model for web_search tool calls", async () => {
    callMock
      .mockResolvedValueOnce(
        okChatResponse({
          id: "chatcmpl_1",
          choices: [
            {
              message: {
                role: "assistant",
                content: null,
                tool_calls: [
                  {
                    id: "tool_1",
                    type: "function",
                    function: {
                      name: "web_search",
                      arguments: JSON.stringify({ query: "latest coding model" }),
                    },
                  },
                ],
              },
            },
          ],
        })
      )
      .mockResolvedValueOnce(
        okChatResponse({
          id: "chatcmpl_search",
          choices: [{ message: { role: "assistant", content: "search results" } }],
        })
      )
      .mockResolvedValueOnce(
        okChatResponse({
          id: "chatcmpl_2",
          choices: [{ message: { role: "assistant", content: "Updated." } }],
        })
      );

    const response = await handleConfigChat(
      [{ role: "user", content: "$$config recommend latest model for coding" }],
      createAuth({
        configAgentEnabled: true,
        configAgentOrchestratorModel: "gateway/orchestrator",
        configAgentSearchModel: "gateway/search",
      }),
      createBindings({
        OPENROUTER_API_KEY: "legacy-key",
        OPENAI_COMPAT_BASE_URL: "https://legacy.example/v1",
      }),
      [],
      false
    );

    expect(response.status).toBe(200);
    expect(callMock).toHaveBeenCalledTimes(3);
    const orchestratorCall = callMock.mock.calls[0]?.[0];
    const searchCall = callMock.mock.calls[1]?.[0];
    expect(orchestratorCall?.payload).toMatchObject({ model: "gateway/orchestrator" });
    expect(searchCall?.payload).toMatchObject({ model: "gateway/search" });
  });

  it("resolves gateway credentials by selected model", async () => {
    const secret = "1234567890abcdef";
    const apiKeyA = "gw-key-a";
    const apiKeyB = "gw-key-b";
    const encA = await encryptByokSecret({ plaintext: apiKeyA, secret });
    const encB = await encryptByokSecret({ plaintext: apiKeyB, secret });
    const gatewayRows: GatewayRowPublic[] = [
      {
        id: "gw_1",
        baseUrl: "https://gateway-one.example/v1",
        apiKeyEnc: encA,
        models: [{ id: "model/a", name: "Model A" }],
      },
      {
        id: "gw_2",
        baseUrl: "https://gateway-two.example/v1",
        apiKeyEnc: encB,
        models: [{ id: "model/b", name: "Model B" }],
      },
    ];

    callMock.mockResolvedValueOnce(
      okChatResponse({
        id: "chatcmpl_gateway",
        choices: [{ message: { role: "assistant", content: "ok" } }],
      })
    );

    const response = await handleConfigChat(
      [{ role: "user", content: "$$config show config" }],
      createAuth({
        configAgentEnabled: true,
        configAgentOrchestratorModel: "model/b",
        configAgentSearchModel: "model/a",
      }),
      createBindings({
        BYOK_ENCRYPTION_SECRET: secret,
      }),
      gatewayRows,
      false
    );

    expect(response.status).toBe(200);
    const firstCall = callMock.mock.calls[0]?.[0];
    expect(firstCall?.baseUrl).toBe("https://gateway-two.example/v1");
    expect(firstCall?.apiKey).toBe(apiKeyB);
    expect(firstCall?.payload).toMatchObject({ model: "model/b" });
  });

  it("falls back to legacy upstream credentials when no gateways are configured", async () => {
    const secret = "1234567890abcdef";
    const userKey = "user-upstream-key";
    const upstreamApiKeyEnc = await encryptByokSecret({ plaintext: userKey, secret });

    callMock.mockResolvedValueOnce(
      okChatResponse({
        id: "chatcmpl_legacy",
        choices: [{ message: { role: "assistant", content: "ok" } }],
      })
    );

    const response = await handleConfigChat(
      [{ role: "user", content: "$$config show config" }],
      createAuth({
        configAgentEnabled: true,
        configAgentOrchestratorModel: "legacy/model-a",
        configAgentSearchModel: "legacy/model-b",
        upstreamBaseUrl: "https://legacy-user.example/v1",
        upstreamApiKeyEnc,
      }),
      createBindings({
        BYOK_ENCRYPTION_SECRET: secret,
      }),
      [],
      false
    );

    expect(response.status).toBe(200);
    const firstCall = callMock.mock.calls[0]?.[0];
    expect(firstCall?.baseUrl).toBe("https://legacy-user.example/v1");
    expect(firstCall?.apiKey).toBe(userKey);
    expect(firstCall?.payload).toMatchObject({ model: "legacy/model-a" });
  });

  it("redacts upstream error details when config chat fails", async () => {
    callMock.mockResolvedValueOnce({
      ok: false,
      status: 502,
      errorBody: "Authorization: Bearer sk-secret-leak",
    });

    const response = await handleConfigChat(
      [{ role: "user", content: "$$config show me config" }],
      createAuth({
        configAgentEnabled: true,
        configAgentOrchestratorModel: "gateway/orchestrator",
        configAgentSearchModel: "gateway/search",
      }),
      createBindings({
        OPENROUTER_API_KEY: "legacy-key",
        OPENAI_COMPAT_BASE_URL: "https://legacy.example/v1",
      }),
      [],
      false
    );

    expect(response.status).toBe(502);
    const body = await response.json() as { detail: string; upstream_status: number };
    expect(body.upstream_status).toBe(502);
    expect(body.detail).toContain("redacted");
    expect(body.detail).not.toContain("sk-secret-leak");
  });
});
