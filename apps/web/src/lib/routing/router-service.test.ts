import { beforeEach, describe, expect, it, vi } from "vitest";

import type { PinStore, RouterConfig } from "@custom-router/core";
import { encryptByokSecret } from "../auth/byok-crypto";
import { getRuntimeBindings } from "../infra/runtime-bindings";
import { getRouterRepository } from "../storage/repository";
import { callOpenAiCompatible } from "../upstream/upstream";
import { routeWithFrontierModel } from "./frontier-classifier";
import { routeAndProxy } from "./router-service";

vi.mock("./frontier-classifier", () => ({
  routeWithFrontierModel: vi.fn(),
}));

vi.mock("../infra/runtime-bindings", () => ({
  getRuntimeBindings: vi.fn(),
}));

vi.mock("../storage/repository", () => ({
  getRouterRepository: vi.fn(),
}));

vi.mock("./guardrail-manager", () => ({
  guardrailKey: vi.fn((modelId: string, provider: string) => `${modelId}:${provider}`),
  isDisabled: vi.fn(() => false),
  recordEvent: vi.fn(),
}));

vi.mock("../infra/request-id", () => ({
  requestId: vi.fn(() => "router_test_request"),
}));

vi.mock("../upstream/upstream", async () => {
  const actual = await vi.importActual<typeof import("../upstream/upstream")>("../upstream/upstream");
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
    classifierModel: "model/classifier",
    globalBlocklist: [],
  };

  return {
    getConfig: vi.fn(async () => config),
    getCatalog: vi.fn(async () => []),
    getPinStore: vi.fn(() => pinStore),
    putExplanation: vi.fn(async () => undefined),
  };
}

function key(gatewayId: string, modelId: string): string {
  return `${gatewayId}::${modelId}`;
}

describe("routeAndProxy", () => {
  const runtimeMock = vi.mocked(getRuntimeBindings);
  const repositoryMock = vi.mocked(getRouterRepository);
  const classifierMock = vi.mocked(routeWithFrontierModel);
  const upstreamMock = vi.mocked(callOpenAiCompatible);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects the deprecated "auto" routing alias', async () => {
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

    const result = await routeAndProxy({
      apiPath: "/chat/completions",
      body: {
        model: "auto",
        messages: [{ role: "user", content: "route this" }],
      },
      userConfig: {
        profiles: [
          {
            id: "planning-backend",
            name: "Planning Backend",
            models: [
              { gatewayId: "gw_default", modelId: "model/alpha", name: "Alpha" },
            ],
            defaultModel: key("gw_default", "model/alpha"),
            classifierModel: key("gw_default", "model/alpha"),
          },
        ],
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

    expect(result.response.status).toBe(400);
    await expect(result.response.json()).resolves.toEqual(
      expect.objectContaining({
        error: expect.stringContaining("explicit profile ID"),
      }),
    );
    expect(classifierMock).not.toHaveBeenCalled();
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
        model: "planning-backend",
        messages: [{ role: "user", content: "route this" }],
      },
      userConfig: {
        profiles: [
          {
            id: "planning-backend", name: "Planning Backend",
            models: [
              { gatewayId: "gw_default", modelId: "model/alpha", name: "Alpha" },
            ],
            defaultModel: key("gw_default", "model/alpha"),
            classifierModel: key("gw_default", "model/alpha"),
          },
        ],
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
        model: "planning-backend",
        messages: [{ role: "user", content: "route this" }],
      },
      userConfig: {
        profiles: [
          {
            id: "planning-backend", name: "Planning Backend",
            models: [
              { gatewayId: "gw_default", modelId: "model/classifier", name: "Classifier" },
              { gatewayId: "gw_default", modelId: "model/alpha", name: "Alpha" },
            ],
            defaultModel: key("gw_default", "model/alpha"),
            classifierModel: key("gw_default", "model/classifier"),
          },
        ],
        gatewayRows: [
          {
            id: "gw_default",
            baseUrl: "https://gateway.example/v1",
            apiKeyEnc: defaultApiKeyEnc,
            models: [
              { id: "model/classifier", name: "Classifier" },
              { id: "model/alpha", name: "Alpha" },
            ],
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

  it("fails fast when routed request has no explicit classifier model", async () => {
    const secret = "1234567890abcdef";
    const defaultApiKeyEnc = await encryptByokSecret({
      plaintext: "gateway-default-key",
      secret,
    });
    const repository = createRepository();
    repository.getConfig.mockResolvedValue({
      version: "test",
      globalBlocklist: [],
    });

    runtimeMock.mockReturnValue({
      BYOK_ENCRYPTION_SECRET: secret,
    });
    repositoryMock.mockReturnValue(repository as any);

    const result = await routeAndProxy({
      apiPath: "/chat/completions",
      body: {
        model: "planning-backend",
        messages: [{ role: "user", content: "route this" }],
      },
      userConfig: {
        profiles: [
          {
            id: "planning-backend", name: "Planning Backend",
            models: [
              { gatewayId: "gw_default", modelId: "model/alpha", name: "Alpha" },
            ],
            defaultModel: key("gw_default", "model/alpha"),
          },
        ],
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

    expect(result.response.status).toBe(400);
    const body = await result.response.json() as { error: string };
    expect(body.error).toContain("explicit classifier model");
    expect(classifierMock).not.toHaveBeenCalled();
  });

  it("resolves classifier traffic through the gateway that owns the classifier model", async () => {
    const secret = "1234567890abcdef";
    const alphaKeyEnc = await encryptByokSecret({ plaintext: "alpha-key", secret });
    const classifierKeyEnc = await encryptByokSecret({ plaintext: "classifier-key", secret });
    const repository = createRepository();

    runtimeMock.mockReturnValue({
      BYOK_ENCRYPTION_SECRET: secret,
    });
    repositoryMock.mockReturnValue(repository as any);
    classifierMock.mockResolvedValue({
      selectedModel: "model/alpha",
      confidence: 0.9,
      signals: ["frontier_classification"],
    });
    upstreamMock.mockResolvedValue({
      ok: true,
      status: 200,
      response: new Response(
        JSON.stringify({ choices: [{ message: { content: "ok" } }], model: "model/alpha" }),
        { status: 200, headers: { "content-type": "application/json" } }
      ),
    });

    const result = await routeAndProxy({
      apiPath: "/chat/completions",
      body: {
        model: "planning-backend",
        messages: [{ role: "user", content: "route this" }],
      },
      userConfig: {
        profiles: [
          {
            id: "planning-backend", name: "Planning Backend",
            models: [
              { gatewayId: "gw_alpha", modelId: "model/alpha", name: "Alpha" },
              { gatewayId: "gw_classifier", modelId: "model/classifier", name: "Classifier" },
            ],
            defaultModel: key("gw_alpha", "model/alpha"),
            classifierModel: key("gw_classifier", "model/classifier"),
          },
        ],
        gatewayRows: [
          {
            id: "gw_alpha",
            baseUrl: "https://alpha.example/v1",
            apiKeyEnc: alphaKeyEnc,
            models: [{ id: "model/alpha", name: "Alpha" }],
          },
          {
            id: "gw_classifier",
            baseUrl: "https://classifier.example/v1",
            apiKeyEnc: classifierKeyEnc,
            models: [{ id: "model/classifier", name: "Classifier" }],
          },
        ],
      },
    });

    expect(result.response.status).toBe(200);
    expect(classifierMock).toHaveBeenCalledWith(
      expect.objectContaining({
        apiKey: "classifier-key",
        baseUrl: "https://classifier.example/v1",
        model: "model/classifier",
      })
    );
    expect(upstreamMock).toHaveBeenCalledWith(
      expect.objectContaining({
        apiKey: "alpha-key",
        baseUrl: "https://alpha.example/v1",
      })
    );
  });

  it("returns upstream responses unchanged", async () => {
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
      confidence: 0.91,
      signals: ["frontier_classification"],
    });
    upstreamMock.mockResolvedValue({
      ok: true,
      status: 200,
      response: new Response(
        JSON.stringify({
          id: "resp_123",
          object: "response",
          output: [
            {
              type: "message",
              role: "assistant",
              content: [{ type: "output_text", text: "ok" }],
            },
          ],
        }),
        {
          status: 200,
          headers: {
            "content-type": "application/json",
            "content-length": "2",
          },
        }
      ),
    });

    const result = await routeAndProxy({
      apiPath: "/responses",
      body: {
        model: "planning-backend",
        input: "route this",
      },
      userConfig: {
        profiles: [
          {
            id: "planning-backend", name: "Planning Backend",
            models: [
              { gatewayId: "gw_default", modelId: "model/classifier", name: "Classifier" },
              { gatewayId: "gw_default", modelId: "model/alpha", name: "Alpha" },
            ],
            defaultModel: key("gw_default", "model/alpha"),
            classifierModel: key("gw_default", "model/classifier"),
          },
        ],
        gatewayRows: [
          {
            id: "gw_default",
            baseUrl: "https://gateway.example/v1",
            apiKeyEnc: defaultApiKeyEnc,
            models: [
              { id: "model/classifier", name: "Classifier" },
              { id: "model/alpha", name: "Alpha" },
            ],
          },
        ],
      },
    });

    expect(result.response.status).toBe(200);
    const body = await result.response.json() as {
      output: Array<{ content: Array<{ text: string }> }>;
    };
    expect(body.output[0]?.content[0]?.text).toBe("ok");
    expect(result.response.headers.get("x-router-model-selected")).toBeNull();
  });

  it("returns smart pin inspect fields during dry-run routing", async () => {
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
      confidence: 0.91,
      signals: ["frontier_classification"],
      rerouteAfterTurns: 2,
    });

    const result = await routeAndProxy({
      apiPath: "/chat/completions",
      dryRun: true,
      body: {
        model: "planning-backend",
        messages: [{ role: "user", content: "Plan this task" }],
      },
      userConfig: {
        profiles: [
          {
            id: "planning-backend", name: "Planning Backend",
            models: [
              { gatewayId: "gw_default", modelId: "model/classifier", name: "Classifier" },
              { gatewayId: "gw_default", modelId: "model/alpha", name: "Alpha" },
            ],
            defaultModel: key("gw_default", "model/alpha"),
            classifierModel: key("gw_default", "model/classifier"),
          },
        ],
        gatewayRows: [
          {
            id: "gw_default",
            baseUrl: "https://gateway.example/v1",
            apiKeyEnc: defaultApiKeyEnc,
            models: [
              { id: "model/classifier", name: "Classifier" },
              { id: "model/alpha", name: "Alpha" },
            ],
          },
        ],
      },
    });

    const body = await result.response.json() as {
      pinRerouteAfterTurns?: number;
      pinBudgetSource?: string;
      pinConsumedUserTurns?: number;
      isAgentLoop?: boolean;
    };
    expect(body.pinRerouteAfterTurns).toBe(2);
    expect(body.pinBudgetSource).toBe("classifier");
    expect(body.pinConsumedUserTurns).toBe(0);
    expect(body.isAgentLoop).toBe(false);
  });

  it("passes the selected model through unchanged for OpenRouter gateways", async () => {
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
      selectedModel: "openai/gpt-5.2:high",
      confidence: 0.88,
      signals: ["frontier_classification"],
    });
    upstreamMock.mockResolvedValue({
      ok: true,
      status: 200,
      response: new Response(JSON.stringify({ choices: [{ message: { content: "ok" } }] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    });

    await routeAndProxy({
      apiPath: "/chat/completions",
      body: {
        model: "planning-backend",
        reasoning: { effort: "xhigh" },
        messages: [{ role: "user", content: "Plan a migration." }],
      },
      userConfig: {
        profiles: [
          {
            id: "planning-backend", name: "Planning Backend",
            models: [
              { gatewayId: "gw_default", modelId: "model/classifier", name: "Classifier" },
              { gatewayId: "gw_default", modelId: "openai/gpt-5.2:high", name: "GPT-5.2 High" },
            ],
            defaultModel: key("gw_default", "openai/gpt-5.2:high"),
            classifierModel: key("gw_default", "model/classifier"),
          },
        ],
        gatewayRows: [
          {
            id: "gw_default",
            baseUrl: "https://openrouter.ai/api/v1",
            apiKeyEnc: defaultApiKeyEnc,
            models: [
              {
                id: "model/classifier",
                name: "Classifier",
              },
              {
                id: "openai/gpt-5.2:high",
                name: "GPT-5.2 High",
                upstreamModelId: "openai/gpt-5.2",
                reasoningPreset: "high",
              },
            ],
          },
        ],
      },
    });

    expect(upstreamMock).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: expect.objectContaining({
          model: "openai/gpt-5.2:high",
          reasoning: { effort: "xhigh" },
        }),
      })
    );
  });

  it("does not rewrite payload fields for non-OpenRouter gateways", async () => {
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
      selectedModel: "openai/gpt-5.2:high",
      confidence: 0.88,
      signals: ["frontier_classification"],
    });
    upstreamMock.mockResolvedValue({
      ok: true,
      status: 200,
      response: new Response(JSON.stringify({ choices: [{ message: { content: "ok" } }] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    });

    await routeAndProxy({
      apiPath: "/chat/completions",
      body: {
        model: "planning-backend",
        reasoning: { effort: "xhigh" },
        messages: [{ role: "user", content: "Plan a migration." }],
      },
      userConfig: {
        profiles: [
          {
            id: "planning-backend", name: "Planning Backend",
            models: [
              { gatewayId: "gw_default", modelId: "model/classifier", name: "Classifier" },
              { gatewayId: "gw_default", modelId: "openai/gpt-5.2:high", name: "GPT-5.2 High" },
            ],
            defaultModel: key("gw_default", "openai/gpt-5.2:high"),
            classifierModel: key("gw_default", "model/classifier"),
          },
        ],
        gatewayRows: [
          {
            id: "gw_default",
            baseUrl: "https://gateway.example/v1",
            apiKeyEnc: defaultApiKeyEnc,
            models: [
              {
                id: "model/classifier",
                name: "Classifier",
              },
              {
                id: "openai/gpt-5.2:high",
                name: "GPT-5.2 High",
                upstreamModelId: "openai/gpt-5.2",
                reasoningPreset: "high",
              },
            ],
          },
        ],
      },
    });

    const payload = upstreamMock.mock.calls[0]?.[0]?.payload as Record<string, unknown>;
    expect(payload.model).toBe("openai/gpt-5.2:high");
    expect(payload.reasoning).toEqual({ effort: "xhigh" });
  });
});
