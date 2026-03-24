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
    pinStore,
    getConfig: vi.fn(async () => config),
    getCatalog: vi.fn(async () => []),
    getPinStore: vi.fn(() => pinStore),
    listRecentModelUsage: vi.fn(async () => []),
    pruneOldExplanations: vi.fn(async () => undefined),
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

  it('passes through the explicit "auto" model when no profile matches', async () => {
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
      userId: "user_1",
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
            models: [{ id: "auto", name: "Auto Model" }],
          },
        ],
      },
    });

    expect(result.response.status).toBe(200);
    expect(classifierMock).not.toHaveBeenCalled();
    expect(upstreamMock).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: expect.objectContaining({
          model: "auto",
        }),
      })
    );
  });

  it('routes through the "auto" profile when a matching profile exists', async () => {
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
          choices: [{ message: { content: "ok" } }],
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      ),
    });

    const result = await routeAndProxy({
      apiPath: "/chat/completions",
      userId: "user_1",
      body: {
        model: "auto",
        messages: [{ role: "user", content: "route this" }],
      },
      userConfig: {
        routeLoggingEnabled: true,
        profiles: [
          {
            id: "auto",
            name: "Auto",
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

    expect(result.response.status).toBe(200);
    expect(classifierMock).toHaveBeenCalled();
    expect(upstreamMock).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: expect.objectContaining({
          model: "model/alpha",
        }),
      })
    );
    expect(repository.putExplanation).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user_1",
        explanation: expect.objectContaining({
          requestId: "router_test_request",
          requestedModel: "auto",
          selectedModel: "model/alpha",
        }),
      }),
    );
  });

  it("skips explanation persistence when route logging is disabled", async () => {
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
          choices: [{ message: { content: "ok" } }],
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      ),
    });

    const result = await routeAndProxy({
      apiPath: "/chat/completions",
      userId: "user_1",
      body: {
        model: "auto",
        messages: [{ role: "user", content: "route this" }],
      },
      userConfig: {
        routeLoggingEnabled: false,
        profiles: [
          {
            id: "auto",
            name: "Auto",
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

    expect(result.response.status).toBe(200);
    expect(repository.putExplanation).not.toHaveBeenCalled();
  });

  it("prefers an exact profile match over a gateway model with the same id", async () => {
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
      confidence: 0.88,
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
      userId: "user_1",
      body: {
        model: "shared-id",
        messages: [{ role: "user", content: "route this" }],
      },
      userConfig: {
        profiles: [
          {
            id: "shared-id",
            name: "Shared",
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
            models: [
              { id: "shared-id", name: "Shared Id Model" },
              { id: "model/alpha", name: "Alpha" },
            ],
          },
        ],
      },
    });

    expect(result.response.status).toBe(200);
    expect(classifierMock).toHaveBeenCalled();
    expect(upstreamMock).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: expect.objectContaining({
          model: "model/alpha",
        }),
      })
    );
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
      userId: "user_1",
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
      userId: "user_1",
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
      userId: "user_1",
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
      userId: "user_1",
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
        supportsReasoningEffort: false,
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
      userId: "user_1",
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
    expect(result.response.headers.get("x-router-model-selected")).toBe("model/alpha");
    expect(result.response.headers.get("x-router-score-version")).toBe("1.0");
    expect(result.response.headers.get("x-router-request-id")).toBe("router_test_request");
    expect(result.response.headers.get("x-router-confidence")).toBe("0.91");
    expect(result.response.headers.get("x-router-degraded")).toBeNull();
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
      stepClassification: {
        stepMode: "tool",
        complexity: "low",
        stakes: "low",
        latencySensitivity: "high",
        toolNeed: "required",
        expectedOutputSize: "short",
        interactionHorizon: "one_shot",
      },
      rerouteAfterTurns: 2,
    });

    const result = await routeAndProxy({
      apiPath: "/chat/completions",
      userId: "user_1",
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
      classificationConfidence?: number;
      selectedFamily?: string;
      selectedEffort?: string;
      pinRerouteAfterTurns?: number;
      pinBudgetSource?: string;
      pinConsumedUserTurns?: number;
      isAgentLoop?: boolean;
    };
    expect(body.classificationConfidence).toBe(0.91);
    expect(body.selectedFamily).toBe("model/alpha");
    expect(body.selectedEffort).toBe("low");
    expect(body.pinRerouteAfterTurns).toBe(2);
    expect(body.pinBudgetSource).toBe("classifier");
    expect(body.pinConsumedUserTurns).toBe(0);
    expect(body.isAgentLoop).toBe(false);
  });

  it("omits inspect confidence for passthrough requests", async () => {
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
      userId: "user_1",
      dryRun: true,
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
            models: [{ id: "auto", name: "Auto Model" }],
          },
        ],
      },
    });

    const body = await result.response.json() as {
      classificationConfidence?: number;
      selectedModel: string;
    };

    expect(body.selectedModel).toBe("auto");
    expect(body.classificationConfidence).toBeUndefined();
  });

  it("omits inspect confidence when a thread pin is reused", async () => {
    const secret = "1234567890abcdef";
    const defaultApiKeyEnc = await encryptByokSecret({
      plaintext: "gateway-default-key",
      secret,
    });
    const repository = createRepository();

    vi.mocked(repository.pinStore.get).mockResolvedValue({
      threadKey: "thread:pinned",
      modelId: "model/alpha",
      requestId: "pin_req",
      pinnedAt: "2026-03-20T00:00:00.000Z",
      expiresAt: "2026-03-21T00:00:00.000Z",
      turnCount: 0,
    });

    runtimeMock.mockReturnValue({
      BYOK_ENCRYPTION_SECRET: secret,
    });
    repositoryMock.mockReturnValue(repository as any);

    const result = await routeAndProxy({
      apiPath: "/chat/completions",
      userId: "user_1",
      dryRun: true,
      body: {
        model: "planning-backend",
        messages: [
          { role: "assistant", content: "Previous answer" },
          { role: "user", content: "Continue" },
        ],
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
      classificationConfidence?: number;
      classifierInvoked: boolean;
      pinUsed: boolean;
    };

    expect(body.classifierInvoked).toBe(false);
    expect(body.pinUsed).toBe(true);
    expect(body.classificationConfidence).toBeUndefined();
  });

  it("omits live confidence headers when the classifier is not invoked", async () => {
    const secret = "1234567890abcdef";
    const defaultApiKeyEnc = await encryptByokSecret({
      plaintext: "gateway-default-key",
      secret,
    });
    const repository = createRepository();

    vi.mocked(repository.pinStore.get).mockResolvedValue({
      threadKey: "thread:pinned",
      modelId: "model/alpha",
      requestId: "pin_req",
      pinnedAt: "2026-03-20T00:00:00.000Z",
      expiresAt: "2026-03-21T00:00:00.000Z",
      turnCount: 0,
    });

    runtimeMock.mockReturnValue({
      BYOK_ENCRYPTION_SECRET: secret,
    });
    repositoryMock.mockReturnValue(repository as any);
    upstreamMock.mockResolvedValue({
      ok: true,
      status: 200,
      response: new Response(JSON.stringify({ choices: [{ message: { content: "ok" } }] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    });

    const result = await routeAndProxy({
      apiPath: "/chat/completions",
      userId: "user_1",
      body: {
        model: "planning-backend",
        messages: [
          { role: "assistant", content: "Previous answer" },
          { role: "user", content: "Continue" },
        ],
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

    expect(result.response.headers.get("x-router-model-selected")).toBe("model/alpha");
    expect(result.response.headers.get("x-router-request-id")).toBe("router_test_request");
    expect(result.response.headers.get("x-router-confidence")).toBeNull();
    expect(result.response.headers.get("x-router-degraded")).toBeNull();
  });

  it("omits confidence headers and marks degraded responses on fallback-after-failure", async () => {
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
      confidence: 0.88,
      signals: ["frontier_classification"],
    });
    upstreamMock
      .mockResolvedValueOnce({
        ok: false,
        status: 502,
        errorBody: "alpha failed",
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        response: new Response(JSON.stringify({ choices: [{ message: { content: "ok" } }] }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      });

    const result = await routeAndProxy({
      apiPath: "/chat/completions",
      userId: "user_1",
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
              { gatewayId: "gw_default", modelId: "model/beta", name: "Beta" },
            ],
            defaultModel: key("gw_default", "model/beta"),
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
              { id: "model/beta", name: "Beta" },
            ],
          },
        ],
      },
    });

    expect(result.response.status).toBe(200);
    expect(result.response.headers.get("x-router-model-selected")).toBe("model/beta");
    expect(result.response.headers.get("x-router-score-version")).toBe("1.0");
    expect(result.response.headers.get("x-router-request-id")).toBe("router_test_request");
    expect(result.response.headers.get("x-router-confidence")).toBeNull();
    expect(result.response.headers.get("x-router-degraded")).toBe("true");
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
      userId: "user_1",
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
      userId: "user_1",
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
