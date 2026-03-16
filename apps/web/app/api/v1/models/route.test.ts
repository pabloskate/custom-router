import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AuthResult } from "@/src/lib/auth";
import { withApiKeyAuth } from "@/src/lib/auth";
import { gatewayRowToPublic, loadGatewaysWithMigration } from "@/src/lib/storage";
import { GET } from "./route";

vi.mock("@/src/lib/storage", () => ({
  loadGatewaysWithMigration: vi.fn(),
  gatewayRowToPublic: vi.fn(),
}));

vi.mock("@/src/lib/auth", () => ({
  withApiKeyAuth: vi.fn(),
}));

function createAuth(overrides: Partial<AuthResult> = {}): AuthResult {
  return {
    userId: "user_1",
    userName: "Test User",
    preferredModels: [],
    defaultModel: null,
    classifierModel: null,
    routingInstructions: null,
    blocklist: null,
    customCatalog: null,
    profiles: null,
    routeTriggerKeywords: null,
    routingFrequency: null,
    smartPinTurns: null,
    upstreamBaseUrl: null,
    upstreamApiKeyEnc: null,
    classifierBaseUrl: null,
    classifierApiKeyEnc: null,
    ...overrides,
  };
}

describe("/api/v1/models route", () => {
  const loadGatewaysMock = vi.mocked(loadGatewaysWithMigration);
  const toPublicMock = vi.mocked(gatewayRowToPublic);
  const withApiKeyAuthMock = vi.mocked(withApiKeyAuth);

  beforeEach(() => {
    vi.clearAllMocks();
    withApiKeyAuthMock.mockImplementation(async (_request, handler) => (
      handler(createAuth(), { ROUTER_DB: {} as any })
    ));
    loadGatewaysMock.mockResolvedValue([
      {
        id: "gw_1",
        user_id: "user_1",
        name: "Gateway",
        base_url: "https://openrouter.ai/api/v1",
        api_key_enc: "enc",
        models_json: "[]",
        created_at: "2026-03-11T00:00:00.000Z",
        updated_at: "2026-03-11T00:00:00.000Z",
      },
    ] as any);
    toPublicMock.mockReturnValue({
      id: "gw_1",
      baseUrl: "https://openrouter.ai/api/v1",
      apiKeyEnc: "enc",
      models: [
        { id: "openai/gpt-5.2", name: "GPT-5.2" },
        { id: "openai/gpt-5.2:high", name: "GPT-5.2 High", upstreamModelId: "openai/gpt-5.2", reasoningPreset: "high" },
        { id: "openai/gpt-5.2:xhigh", name: "GPT-5.2 Extra High", upstreamModelId: "openai/gpt-5.2", reasoningPreset: "xhigh" },
      ],
    } as any);
  });

  it("lists reasoning variants as separate model ids", async () => {
    const response = await GET(new Request("http://localhost/api/v1/models"));
    expect(response.status).toBe(200);

    const body = await response.json() as { data: Array<{ id: string }> };
    expect(body.data.map((item) => item.id)).toEqual(expect.arrayContaining([
      "auto",
      "openai/gpt-5.2",
      "openai/gpt-5.2:high",
      "openai/gpt-5.2:xhigh",
    ]));
  });
});
