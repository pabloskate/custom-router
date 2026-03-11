import { beforeEach, describe, expect, it, vi } from "vitest";

import type { PinStore, RouterConfig } from "@auto-router/core";
import { encryptByokSecret } from "./byok-crypto";
import { routeWithFrontierModel } from "./frontier-router-classifier";
import { getRuntimeBindings } from "./runtime-bindings";
import { getRouterRepository } from "./router-repository";
import { routeAndProxy } from "./router-service";
import { callOpenAiCompatible } from "./upstream";

vi.mock("./frontier-router-classifier", () => ({
  routeWithFrontierModel: vi.fn(),
}));

vi.mock("./runtime-bindings", () => ({
  getRuntimeBindings: vi.fn(),
}));

vi.mock("./router-repository", () => ({
  getRouterRepository: vi.fn(),
}));

vi.mock("./guardrail-manager", () => ({
  guardrailKey: vi.fn((modelId: string, provider: string) => `${modelId}:${provider}`),
  isDisabled: vi.fn(() => false),
  recordEvent: vi.fn(),
}));

vi.mock("./request-id", () => ({
  requestId: vi.fn(() => "router_test_request"),
}));

vi.mock("./upstream", async () => {
  const actual = await vi.importActual<typeof import("./upstream")>("./upstream");
  return {
    ...actual,
    callOpenAiCompatible: vi.fn(),
  };
});

function createRepository() {
  const pinStore: PinStore = {
    get: vi.fn(async () => null),
    set: vi.fn(async () => undefined),
    clear: vi.fn(async () => undefined),
  };

  const config: RouterConfig = {
    version: "test",
    defaultModel: "model/alpha",
    globalBlocklist: [],
  };

  return {
    getConfig: vi.fn(async () => config),
    getCatalog: vi.fn(async () => []),
    getPinStore: vi.fn(() => pinStore),
    putExplanation: vi.fn(async () => undefined),
  };
}

describe("routeAndProxy", () => {
  const runtimeMock = vi.mocked(getRuntimeBindings);
  const repositoryMock = vi.mocked(getRouterRepository);
  const classifierMock = vi.mocked(routeWithFrontierModel);
  const upstreamMock = vi.mocked(callOpenAiCompatible);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("uses dedicated classifier BYOK credentials when configured", async () => {
    const secret = "1234567890abcdef";
    const defaultApiKey = "gateway-default-key";
    const classifierApiKey = "classifier-key";
    const defaultApiKeyEnc = await encryptByokSecret({ plaintext: defaultApiKey, secret });
    const classifierApiKeyEnc = await encryptByokSecret({ plaintext: classifierApiKey, secret });
    const repository = createRepository();

    runtimeMock.mockReturnValue({
      BYOK_ENCRYPTION_SECRET: secret,
    });
    repositoryMock.mockReturnValue(repository as any);
    classifierMock.mockResolvedValue({
      selectedModel: "model/alpha",
      confidence: 0.91,
      signals: ["frontier_classification"],
    });
    upstreamMock.mockResolvedValue({
      ok: true,
      status: 200,
      response: new Response(
        JSON.stringify({
          choices: [{ message: { content: "ok" } }],
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      ),
    });

    const result = await routeAndProxy({
      apiPath: "/chat/completions",
      body: {
        model: "auto",
        messages: [{ role: "user", content: "route this" }],
      },
      userConfig: {
        gatewayRows: [
          {
            id: "gw_default",
            baseUrl: "https://gateway.example/v1",
            apiKeyEnc: defaultApiKeyEnc,
            models: [{ id: "model/alpha", name: "Alpha" }],
          },
        ],
        classifierBaseUrl: "https://classifier.example/v1",
        classifierApiKeyEnc,
      },
    });

    expect(result.response.status).toBe(200);
    expect(classifierMock).toHaveBeenCalledWith(
      expect.objectContaining({
        apiKey: classifierApiKey,
        baseUrl: "https://classifier.example/v1",
      })
    );
    expect(upstreamMock).toHaveBeenCalledWith(
      expect.objectContaining({
        apiKey: defaultApiKey,
        baseUrl: "https://gateway.example/v1",
      })
    );
  });

  it("redacts raw upstream error bodies from failure responses", async () => {
    const secret = "1234567890abcdef";
    const defaultApiKeyEnc = await encryptByokSecret({
      plaintext: "gateway-default-key",
      secret,
    });
    const repository = createRepository();

    runtimeMock.mockReturnValue({
      BYOK_ENCRYPTION_SECRET: secret,
    });
    repositoryMock.mockReturnValue(repository as any);
    classifierMock.mockResolvedValue({
      selectedModel: "model/alpha",
      confidence: 0.8,
      signals: ["frontier_classification"],
    });
    upstreamMock.mockResolvedValue({
      ok: false,
      status: 500,
      errorBody: 'Authorization: Bearer sk-secret-leak "api_key":"super-secret"',
    });

    const result = await routeAndProxy({
      apiPath: "/chat/completions",
      body: {
        model: "auto",
        messages: [{ role: "user", content: "route this" }],
      },
      userConfig: {
        gatewayRows: [
          {
            id: "gw_default",
            baseUrl: "https://gateway.example/v1",
            apiKeyEnc: defaultApiKeyEnc,
            models: [{ id: "model/alpha", name: "Alpha" }],
          },
        ],
      },
    });

    expect(result.response.status).toBe(502);
    const body = await result.response.json() as { details: string[] };
    expect(body.details).toHaveLength(1);
    expect(body.details[0]).toContain("reason=upstream_error_details_redacted");
    expect(body.details[0]).not.toContain("sk-secret-leak");
    expect(body.details[0]).not.toContain("Authorization");
  });
});
