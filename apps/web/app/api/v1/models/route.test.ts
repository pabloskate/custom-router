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
    updatedAt: "2026-03-11T00:00:00.000Z",
    preferredModels: [],
    defaultModel: null,
    classifierModel: null,
    routingInstructions: null,
    blocklist: null,
    customCatalog: null,
    profiles: [{ id: "planning-backend", name: "Planning Backend", models: [] }],
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
      "planning-backend",
      "openai/gpt-5.2",
      "openai/gpt-5.2:high",
      "openai/gpt-5.2:xhigh",
    ]));
  });

  it("advertises profile image input support from the routed model pool", async () => {
    withApiKeyAuthMock.mockImplementation(async (_request, handler) => (
      handler(createAuth({
        profiles: [
          {
            id: "custom-profile",
            name: "Custom Profile",
            models: [
              { gatewayId: "gw_1", modelId: "model/vision", name: "Vision", modality: "text,image->text" },
              { gatewayId: "gw_1", modelId: "model/text", name: "Text", modality: "text->text" },
            ],
          },
        ],
      }), { ROUTER_DB: {} as any })
    ));

    const response = await GET(new Request("http://localhost/api/v1/models"));
    expect(response.status).toBe(200);

    const body = await response.json() as {
      data: Array<{
        id: string;
        attachment?: boolean;
        modalities?: { input: string[]; output: string[] };
      }>;
    };
    const profileModel = body.data.find((item) => item.id === "custom-profile");

    expect(profileModel).toMatchObject({
      id: "custom-profile",
      attachment: true,
      modalities: {
        input: ["image", "text"],
        output: ["text"],
      },
    });
  });

  it("falls back to preset modality metadata for existing saved profiles", async () => {
    withApiKeyAuthMock.mockImplementation(async (_request, handler) => (
      handler(createAuth({
        profiles: [
          {
            id: "general-balanced",
            name: "General Balanced",
            models: [
              { gatewayId: "gw_1", modelId: "anthropic/claude-sonnet-4.6", name: "Claude Sonnet 4.6" },
              { gatewayId: "gw_1", modelId: "inception/mercury-2", name: "Mercury 2" },
            ],
          },
        ],
      }), { ROUTER_DB: {} as any })
    ));

    const response = await GET(new Request("http://localhost/api/v1/models"));
    expect(response.status).toBe(200);

    const body = await response.json() as {
      data: Array<{
        id: string;
        attachment?: boolean;
        modalities?: { input: string[]; output: string[] };
      }>;
    };
    const profileModel = body.data.find((item) => item.id === "general-balanced");

    expect(profileModel).toMatchObject({
      id: "general-balanced",
      attachment: true,
    });
    expect(profileModel?.modalities?.input).toEqual(expect.arrayContaining(["image", "text"]));
    expect(profileModel?.modalities?.output).toEqual(expect.arrayContaining(["text"]));
  });

});
