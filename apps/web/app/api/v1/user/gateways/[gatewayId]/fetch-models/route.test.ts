import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { decryptByokSecret, resolveByokEncryptionSecret, withSessionAuth } from "@/src/lib/auth";
import { getUserGateway } from "@/src/lib/storage";
import { GET } from "./route";

vi.mock("@/src/lib/auth", () => ({
  decryptByokSecret: vi.fn(),
  resolveByokEncryptionSecret: vi.fn(),
  withSessionAuth: vi.fn(),
}));

vi.mock("@/src/lib/storage", () => ({
  getUserGateway: vi.fn(),
}));

describe("/api/v1/user/gateways/[gatewayId]/fetch-models route", () => {
  const decryptMock = vi.mocked(decryptByokSecret);
  const resolveSecretMock = vi.mocked(resolveByokEncryptionSecret);
  const withSessionAuthMock = vi.mocked(withSessionAuth);
  const getUserGatewayMock = vi.mocked(getUserGateway);
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", fetchMock);

    withSessionAuthMock.mockImplementation(async (request, handler) => (
      handler({ userId: "user_1" } as any, { ROUTER_DB: {} as any, BYOK_ENCRYPTION_SECRET: "secret" } as any)
    ));
    resolveSecretMock.mockReturnValue("secret");
    decryptMock.mockResolvedValue("gateway-key");
    getUserGatewayMock.mockResolvedValue({
      id: "gw_openrouter",
      user_id: "user_1",
      name: "OpenRouter",
      base_url: "https://openrouter.ai/api/v1",
      api_key_enc: "enc",
      models_json: "[]",
      created_at: "2026-03-21T00:00:00.000Z",
      updated_at: "2026-03-21T00:00:00.000Z",
    } as any);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("retains modality metadata from gateway model architectures", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({
      data: [
        {
          id: "openai/gpt-5-image",
          architecture: {
            modality: "text+image->text+image",
          },
        },
        {
          id: "openai/gpt-5.4-mini",
          architecture: {
            input_modalities: ["text", "image", "file"],
            output_modalities: ["text"],
          },
        },
      ],
    }), {
      status: 200,
      headers: { "content-type": "application/json" },
    }));

    const response = await GET(
      new Request("http://localhost/api/v1/user/gateways/gw_openrouter/fetch-models"),
      { params: Promise.resolve({ gatewayId: "gw_openrouter" }) }
    );

    expect(response.status).toBe(200);
    const body = await response.json() as {
      models: Array<{ id: string; name: string; modality?: string }>;
    };

    expect(body.models).toEqual([
      {
        id: "openai/gpt-5-image",
        name: "openai/gpt-5-image",
        modality: "text,image->text,image",
      },
      {
        id: "openai/gpt-5.4-mini",
        name: "openai/gpt-5.4-mini",
        modality: "text,image,file->text",
      },
    ]);
  });
});
