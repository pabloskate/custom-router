import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AuthResult } from "@/src/lib/auth";
import type { BuilderCandidate } from "./profile-builder-service";
import {
  handleApplyProfileBuilderRun,
  handleCreateProfileBuilderRun,
  handleGetProfileBuilderRun,
  maybeLiveVerifyOpenRouter,
  scoreBuilderCandidate,
  selectClassifierCandidate,
  selectProfileBuilderExecutor,
} from "./profile-builder-service";
import { getProfileBuilderRun, insertProfileBuilderRun } from "./profile-builder-store";
import { gatewayRowToPublic, loadGatewaysWithMigration } from "@/src/lib/storage";
import { validateModelId } from "@/src/lib/upstream/openrouter-models";
import type { ProfileBuilderKnowledgeModel } from "./profile-builder-knowledge";
import type { ProfileBuilderRequest } from "@/src/features/routing/profile-builder-contracts";

vi.mock("@/src/lib/storage", async () => {
  const actual = await vi.importActual<typeof import("@/src/lib/storage")>("@/src/lib/storage");
  return {
    ...actual,
    gatewayRowToPublic: vi.fn(),
    loadGatewaysWithMigration: vi.fn(),
  };
});

vi.mock("./profile-builder-store", async () => {
  const actual = await vi.importActual<typeof import("./profile-builder-store")>("./profile-builder-store");
  return {
    ...actual,
    getProfileBuilderRun: vi.fn(),
    insertProfileBuilderRun: vi.fn(),
    completeProfileBuilderRun: vi.fn(),
    failProfileBuilderRun: vi.fn(),
  };
});

vi.mock("@/src/lib/upstream/openrouter-models", async () => {
  const actual = await vi.importActual<typeof import("@/src/lib/upstream/openrouter-models")>("@/src/lib/upstream/openrouter-models");
  return {
    ...actual,
    validateModelId: vi.fn(),
  };
});

function createAuth(overrides: Partial<AuthResult> = {}): AuthResult {
  return {
    userId: "user_1",
    userName: "Test User",
    updatedAt: "2026-03-19T00:00:00.000Z",
    preferredModels: [],
    defaultModel: null,
    classifierModel: null,
    routingInstructions: null,
    blocklist: null,
    customCatalog: null,
    profiles: [],
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

function createBindings() {
  const runMock = vi.fn(async () => ({ meta: { changes: 1 } }));
  const bindMock = vi.fn((_args: unknown[]) => ({ run: runMock }));
  const prepareMock = vi.fn((_sql: string) => ({ bind: (...args: unknown[]) => bindMock(args) }));
  return {
    ROUTER_DB: {
      prepare: prepareMock,
    } as any,
    BYOK_ENCRYPTION_SECRET: "1234567890abcdef",
    __bindMock: bindMock,
    __prepareMock: prepareMock,
    __runMock: runMock,
  };
}

function createCandidate(overrides: Partial<BuilderCandidate> & Pick<BuilderCandidate, "model" | "knowledge">): BuilderCandidate {
  return {
    gatewayId: "gw_openrouter",
    gatewayName: "OpenRouter",
    gatewayPresetId: "openrouter",
    score: 10,
    liveVerified: false,
    ...overrides,
  };
}

function createKnowledge(
  overrides: Partial<ProfileBuilderKnowledgeModel> & Pick<ProfileBuilderKnowledgeModel, "id" | "name">,
): ProfileBuilderKnowledgeModel {
  return {
    id: overrides.id,
    name: overrides.name,
    supportedGateways: overrides.supportedGateways ?? ["openrouter"],
    gatewayMappings: overrides.gatewayMappings ?? [{
      gatewayPresetId: "openrouter",
      modelId: overrides.id,
      displayName: overrides.name,
      operational: {
        structuredOutput: true,
        toolUse: true,
        vision: false,
        verifiedAt: "2026-03-21",
        sources: [],
      },
    }],
    modality: overrides.modality ?? "text->text",
    contextBand: overrides.contextBand ?? "long",
    costTier: overrides.costTier ?? "efficient",
    vision: overrides.vision ?? false,
    structuredOutput: overrides.structuredOutput ?? true,
    toolUse: overrides.toolUse ?? true,
    quality: overrides.quality ?? 2,
    speed: overrides.speed ?? 2,
    cost: overrides.cost ?? 2,
    reliability: overrides.reliability ?? 2,
    taskFamilies: overrides.taskFamilies ?? ["general"],
    strengths: overrides.strengths ?? ["strong"],
    caveats: overrides.caveats ?? [],
    whenToUse: overrides.whenToUse ?? "strong",
    metrics: overrides.metrics ?? [],
    lenses: overrides.lenses ?? [],
    capabilities: overrides.capabilities ?? {
      nativeSearch: false,
      groundedSearch: false,
      documentReasoning: false,
      imageGeneration: false,
      imageEditing: false,
      fileInput: false,
      audioInput: false,
      videoInput: false,
      recommendedAsClassifier: false,
    },
    lastVerified: overrides.lastVerified ?? "2026-03-21",
    sources: overrides.sources ?? [],
  };
}

describe("profile-builder-service", () => {
  const loadGatewaysMock = vi.mocked(loadGatewaysWithMigration);
  const gatewayRowToPublicMock = vi.mocked(gatewayRowToPublic);
  const getRunMock = vi.mocked(getProfileBuilderRun);
  const insertRunMock = vi.mocked(insertProfileBuilderRun);
  const validateModelIdMock = vi.mocked(validateModelId);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects create-run when no supported gateway with synced models is available", async () => {
    loadGatewaysMock.mockResolvedValue([
      {
        id: "gw_custom",
        user_id: "user_1",
        name: "Custom",
        base_url: "https://gateway.example.com/v1",
        api_key_enc: "enc:key",
        models_json: "[]",
        created_at: "2026-03-19T00:00:00.000Z",
        updated_at: "2026-03-19T00:00:00.000Z",
      },
    ] as any);
    gatewayRowToPublicMock.mockReturnValue({
      id: "gw_custom",
      baseUrl: "https://gateway.example.com/v1",
      apiKeyEnc: "enc:key",
      models: [],
    } as any);

    const response = await handleCreateProfileBuilderRun(
      new Request("http://localhost/api/v1/user/profile-builder/runs", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          profileId: "agent-profile",
          displayName: "Agent Profile",
          optimizeFor: "balanced",
          taskFamilies: ["general", "coding"],
          needsVision: false,
          needsLongContext: false,
          latencySensitivity: "medium",
          budgetPosture: "balanced",
          additionalContext: "Prefer exact structured outputs for internal automations.",
        }),
      }),
      createAuth(),
      createBindings() as any,
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: expect.stringContaining("supported gateway"),
    });
  });

  it("creates a running run with the preferred executor when supported models exist", async () => {
    loadGatewaysMock.mockResolvedValue([
      {
        id: "gw_openrouter",
        user_id: "user_1",
        name: "OpenRouter",
        base_url: "https://openrouter.ai/api/v1",
        api_key_enc: "enc:key",
        models_json: "[]",
        created_at: "2026-03-19T00:00:00.000Z",
        updated_at: "2026-03-19T00:00:00.000Z",
      },
    ] as any);
    gatewayRowToPublicMock.mockReturnValue({
      id: "gw_openrouter",
      baseUrl: "https://openrouter.ai/api/v1",
      apiKeyEnc: "enc:key",
      models: [
        { id: "openai/gpt-5.4-mini", name: "GPT-5.4 mini", modality: "text,image->text" },
        { id: "google/gemini-3-flash-preview", name: "Gemini 3 Flash Preview", modality: "text,image->text" },
      ],
    } as any);
    insertRunMock.mockImplementation(async (args) => ({
      id: args.id,
      status: "running",
      request: args.request,
      executor: args.executor,
      recommendations: [],
      rejections: [],
      sources: [],
      createdAt: "2026-03-19T00:00:00.000Z",
      updatedAt: "2026-03-19T00:00:00.000Z",
    }));

    const response = await handleCreateProfileBuilderRun(
      new Request("http://localhost/api/v1/user/profile-builder/runs", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          profileId: "agent-profile",
          displayName: "Agent Profile",
          optimizeFor: "balanced",
          taskFamilies: ["general", "coding"],
          needsVision: false,
          needsLongContext: false,
          latencySensitivity: "medium",
          budgetPosture: "balanced",
          additionalContext: "Need low-noise outputs for downstream tooling.",
        }),
      }),
      createAuth(),
      createBindings() as any,
    );

    expect(response.status).toBe(202);
    const body = await response.json() as { run: { executor: { modelId: string }; request: { additionalContext?: string } } };
    expect(body.run.executor.modelId).toBe("openai/gpt-5.4-mini");
    expect(body.run.request.additionalContext).toBe("Need low-noise outputs for downstream tooling.");
  });

  it("returns running, completed, and error status payloads", async () => {
    const auth = createAuth();
    const bindings = createBindings();

    getRunMock.mockResolvedValueOnce({
      id: "run_1",
      status: "running",
      request: {
        profileId: "agent-profile",
        displayName: "Agent Profile",
        optimizeFor: "balanced",
        taskFamilies: ["general"],
        needsVision: false,
        needsLongContext: false,
        latencySensitivity: "medium",
        budgetPosture: "balanced",
      },
      executor: {
        gatewayId: "gw_openrouter",
        gatewayName: "OpenRouter",
        gatewayPresetId: "openrouter",
        modelId: "openai/gpt-5.4-mini",
        modelName: "GPT-5.4 mini",
      },
      recommendations: [],
      rejections: [],
      sources: [],
      createdAt: "2026-03-19T00:00:00.000Z",
      updatedAt: "2026-03-19T00:00:00.000Z",
    });
    let response = await handleGetProfileBuilderRun(auth, bindings as any, "run_1");
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ run: { status: "running" } });

    getRunMock.mockResolvedValueOnce({
      id: "run_1",
      status: "completed",
      request: {
        profileId: "agent-profile",
        displayName: "Agent Profile",
        optimizeFor: "balanced",
        taskFamilies: ["general"],
        needsVision: false,
        needsLongContext: false,
        latencySensitivity: "medium",
        budgetPosture: "balanced",
      },
      executor: {
        gatewayId: "gw_openrouter",
        gatewayName: "OpenRouter",
        gatewayPresetId: "openrouter",
        modelId: "openai/gpt-5.4-mini",
        modelName: "GPT-5.4 mini",
      },
      draftProfile: { id: "agent-profile", name: "Agent Profile", models: [] },
      recommendations: [],
      rejections: [],
      sources: [],
      createdAt: "2026-03-19T00:00:00.000Z",
      updatedAt: "2026-03-19T00:00:00.000Z",
      finishedAt: "2026-03-19T00:00:02.000Z",
    });
    response = await handleGetProfileBuilderRun(auth, bindings as any, "run_1");
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ run: { status: "completed" } });

    getRunMock.mockResolvedValueOnce({
      id: "run_1",
      status: "error",
      request: {
        profileId: "agent-profile",
        displayName: "Agent Profile",
        optimizeFor: "balanced",
        taskFamilies: ["general"],
        needsVision: false,
        needsLongContext: false,
        latencySensitivity: "medium",
        budgetPosture: "balanced",
      },
      executor: {
        gatewayId: "gw_openrouter",
        gatewayName: "OpenRouter",
        gatewayPresetId: "openrouter",
        modelId: "openai/gpt-5.4-mini",
        modelName: "GPT-5.4 mini",
      },
      recommendations: [],
      rejections: [],
      sources: [],
      error: "boom",
      createdAt: "2026-03-19T00:00:00.000Z",
      updatedAt: "2026-03-19T00:00:02.000Z",
      finishedAt: "2026-03-19T00:00:02.000Z",
    });
    response = await handleGetProfileBuilderRun(auth, bindings as any, "run_1");
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ run: { status: "error", error: "boom" } });
  });

  it("applies a completed draft by writing exactly one new profile", async () => {
    const bindings = createBindings();
    getRunMock.mockResolvedValue({
      id: "run_1",
      status: "completed",
      request: {
        profileId: "agent-profile",
        displayName: "Agent Profile",
        optimizeFor: "balanced",
        taskFamilies: ["general"],
        needsVision: false,
        needsLongContext: false,
        latencySensitivity: "medium",
        budgetPosture: "balanced",
      },
      executor: {
        gatewayId: "gw_openrouter",
        gatewayName: "OpenRouter",
        gatewayPresetId: "openrouter",
        modelId: "openai/gpt-5.4-mini",
        modelName: "GPT-5.4 mini",
      },
      draftProfile: {
        id: "agent-profile",
        name: "Agent Profile",
        models: [
          {
            gatewayId: "gw_openrouter",
            modelId: "openai/gpt-5.4-mini",
            name: "GPT-5.4 mini",
          },
        ],
        defaultModel: "gw_openrouter::openai/gpt-5.4-mini",
        classifierModel: "gw_openrouter::openai/gpt-5.4-mini",
      },
      recommendations: [],
      rejections: [],
      sources: [],
      createdAt: "2026-03-19T00:00:00.000Z",
      updatedAt: "2026-03-19T00:00:02.000Z",
      finishedAt: "2026-03-19T00:00:02.000Z",
    });
    loadGatewaysMock.mockResolvedValue([
      {
        id: "gw_openrouter",
        user_id: "user_1",
        name: "OpenRouter",
        base_url: "https://openrouter.ai/api/v1",
        api_key_enc: "enc:key",
        models_json: "[]",
        created_at: "2026-03-19T00:00:00.000Z",
        updated_at: "2026-03-19T00:00:00.000Z",
      },
    ] as any);
    gatewayRowToPublicMock.mockReturnValue({
      id: "gw_openrouter",
      baseUrl: "https://openrouter.ai/api/v1",
      apiKeyEnc: "enc:key",
      models: [{ id: "openai/gpt-5.4-mini", name: "GPT-5.4 mini" }],
    } as any);

    const response = await handleApplyProfileBuilderRun({
      request: new Request("http://localhost/api/v1/user/profile-builder/runs/run_1/apply", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
      }),
      auth: createAuth(),
      bindings: bindings as any,
      runId: "run_1",
    });

    expect(response.status).toBe(200);
    const updateSql = bindings.__prepareMock.mock.calls.find((entry: [string]) => entry[0].includes("UPDATE users"))?.[0] ?? "";
    expect(updateSql).toContain("profiles = ?1");
    const bindArgs = bindings.__bindMock.mock.calls.at(-1)?.[0] ?? [];
    expect(JSON.parse(String(bindArgs[0]))).toHaveLength(1);
  });

  it("rejects apply when the edited profile id already exists", async () => {
    const bindings = createBindings();
    getRunMock.mockResolvedValue({
      id: "run_1",
      status: "completed",
      request: {
        profileId: "agent-profile",
        displayName: "Agent Profile",
        optimizeFor: "balanced",
        taskFamilies: ["general"],
        needsVision: false,
        needsLongContext: false,
        latencySensitivity: "medium",
        budgetPosture: "balanced",
      },
      executor: {
        gatewayId: "gw_openrouter",
        gatewayName: "OpenRouter",
        gatewayPresetId: "openrouter",
        modelId: "openai/gpt-5.4-mini",
        modelName: "GPT-5.4 mini",
      },
      draftProfile: { id: "agent-profile", name: "Agent Profile", models: [] },
      recommendations: [],
      rejections: [],
      sources: [],
      createdAt: "2026-03-19T00:00:00.000Z",
      updatedAt: "2026-03-19T00:00:02.000Z",
      finishedAt: "2026-03-19T00:00:02.000Z",
    });

    const response = await handleApplyProfileBuilderRun({
      request: new Request("http://localhost/api/v1/user/profile-builder/runs/run_1/apply", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ profileId: "existing-profile" }),
      }),
      auth: createAuth({
        profiles: [{ id: "existing-profile", name: "Existing Profile", models: [] }],
      }),
      bindings: bindings as any,
      runId: "run_1",
    });

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      error: expect.stringContaining("already exists"),
    });
  });

  it("falls back from GPT-5.4 mini to Claude Haiku for executor selection", () => {
    const executor = selectProfileBuilderExecutor([
      createCandidate({
        model: { id: "anthropic/claude-haiku-4.5", name: "Claude Haiku 4.5" },
        knowledge: {
          id: "anthropic/claude-haiku-4.5",
          name: "Claude Haiku 4.5",
          supportedGateways: ["openrouter"],
          gatewayMappings: [{
            gatewayPresetId: "openrouter",
            modelId: "anthropic/claude-haiku-4.5",
            displayName: "Claude Haiku 4.5",
            operational: {
              structuredOutput: true,
              toolUse: true,
              vision: true,
              verifiedAt: "2026-03-19",
              sources: [],
            },
          }],
          contextBand: "long",
          costTier: "efficient",
          vision: true,
          structuredOutput: true,
          toolUse: true,
          quality: 2,
          speed: 3,
          cost: 2,
          reliability: 3,
          taskFamilies: ["general"],
          strengths: ["fast"],
          caveats: [],
          whenToUse: "fast",
          metrics: [],
          lenses: [],
          capabilities: {
            nativeSearch: false,
            groundedSearch: false,
            documentReasoning: false,
            imageGeneration: false,
            imageEditing: false,
            fileInput: false,
            audioInput: false,
            videoInput: false,
            recommendedAsClassifier: false,
          },
          lastVerified: "2026-03-19",
          sources: [],
        },
      }),
      createCandidate({
        model: { id: "google/gemini-3-flash-preview", name: "Gemini 3 Flash Preview" },
        knowledge: {
          id: "google/gemini-3-flash-preview",
          name: "Gemini 3 Flash Preview",
          supportedGateways: ["openrouter"],
          gatewayMappings: [{
            gatewayPresetId: "openrouter",
            modelId: "google/gemini-3-flash-preview",
            displayName: "Gemini 3 Flash Preview",
            operational: {
              structuredOutput: true,
              toolUse: true,
              vision: true,
              verifiedAt: "2026-03-19",
              sources: [],
            },
          }],
          contextBand: "ultra",
          costTier: "efficient",
          vision: true,
          structuredOutput: true,
          toolUse: true,
          quality: 2,
          speed: 3,
          cost: 2,
          reliability: 2,
          taskFamilies: ["general"],
          strengths: ["fast"],
          caveats: [],
          whenToUse: "fast",
          metrics: [],
          lenses: [],
          capabilities: {
            nativeSearch: false,
            groundedSearch: false,
            documentReasoning: false,
            imageGeneration: false,
            imageEditing: false,
            fileInput: false,
            audioInput: false,
            videoInput: false,
            recommendedAsClassifier: false,
          },
          lastVerified: "2026-03-19",
          sources: [],
        },
      }),
    ]);

    expect(executor?.model.id).toBe("anthropic/claude-haiku-4.5");
  });

  it("prefers registry-ranked classifier candidates over the legacy hardcoded order", () => {
    const classifier = selectClassifierCandidate(
      [],
      [
        createCandidate({
          model: { id: "google/gemini-3.1-flash-lite-preview", name: "Gemini 3.1 Flash Lite Preview" },
          knowledge: {
            id: "google/gemini-3.1-flash-lite-preview",
            name: "Gemini 3.1 Flash Lite Preview",
            supportedGateways: ["openrouter"],
            gatewayMappings: [{
              gatewayPresetId: "openrouter",
              modelId: "google/gemini-3.1-flash-lite-preview",
              displayName: "Gemini 3.1 Flash Lite Preview",
              operational: {
                structuredOutput: true,
                toolUse: true,
                vision: true,
                verifiedAt: "2026-03-21",
                sources: [],
              },
            }],
            contextBand: "ultra",
            costTier: "budget",
            vision: true,
            structuredOutput: true,
            toolUse: true,
            quality: 2,
            speed: 3,
            cost: 3,
            reliability: 2,
            taskFamilies: ["general"],
            strengths: ["cheap"],
            caveats: [],
            whenToUse: "cheap",
            metrics: [],
            lenses: [],
            capabilities: {
              nativeSearch: false,
              groundedSearch: false,
              documentReasoning: false,
              imageGeneration: false,
              imageEditing: false,
              fileInput: false,
              audioInput: false,
              videoInput: false,
              recommendedAsClassifier: true,
            },
            lastVerified: "2026-03-21",
            sources: [],
          },
        }),
        createCandidate({
          model: { id: "nvidia/nemotron-3-super-120b-a12b", name: "NVIDIA Nemotron 3 Super" },
          knowledge: {
            id: "nvidia/nemotron-3-super-120b-a12b",
            name: "NVIDIA Nemotron 3 Super",
            supportedGateways: ["openrouter"],
            gatewayMappings: [{
              gatewayPresetId: "openrouter",
              modelId: "nvidia/nemotron-3-super-120b-a12b",
              displayName: "NVIDIA Nemotron 3 Super",
              operational: {
                structuredOutput: true,
                toolUse: true,
                vision: false,
                verifiedAt: "2026-03-21",
                sources: [],
              },
            }],
            contextBand: "long",
            costTier: "budget",
            vision: false,
            structuredOutput: true,
            toolUse: true,
            quality: 2,
            speed: 3,
            cost: 3,
            reliability: 2,
            taskFamilies: ["general"],
            strengths: ["fast"],
            caveats: [],
            whenToUse: "fast",
            metrics: [],
            lenses: [],
            capabilities: {
              nativeSearch: false,
              groundedSearch: false,
              documentReasoning: false,
              imageGeneration: false,
              imageEditing: false,
              fileInput: false,
              audioInput: false,
              videoInput: false,
              recommendedAsClassifier: true,
            },
            lastVerified: "2026-03-21",
            sources: [],
          },
        }),
      ],
    );

    expect(classifier?.model.id).toBe("nvidia/nemotron-3-super-120b-a12b");
  });

  it("scores real gateway pricing above coarse cost buckets for budget-sensitive profiles", () => {
    const request: ProfileBuilderRequest = {
      profileId: "budget-ops",
      displayName: "Budget Ops",
      optimizeFor: "cost",
      taskFamilies: ["general", "support"],
      needsVision: false,
      needsLongContext: false,
      latencySensitivity: "medium",
      budgetPosture: "budget_first",
    };

    const cheapScore = scoreBuilderCandidate({
      gatewayPresetId: "openrouter",
      request,
      knowledge: createKnowledge({
        id: "cheap/model",
        name: "Cheap Model",
        costTier: "mid",
        cost: 2,
        speed: 2,
        gatewayMappings: [{
          gatewayPresetId: "openrouter",
          modelId: "cheap/model",
          displayName: "Cheap Model",
          operational: {
            contextWindow: 200000,
            inputPricePerMillion: 0.1,
            outputPricePerMillion: 0.5,
            structuredOutput: true,
            toolUse: true,
            vision: false,
            verifiedAt: "2026-03-21",
            sources: [],
          },
        }],
      }),
    });

    const expensiveScore = scoreBuilderCandidate({
      gatewayPresetId: "openrouter",
      request,
      knowledge: createKnowledge({
        id: "expensive/model",
        name: "Expensive Model",
        costTier: "mid",
        cost: 2,
        speed: 2,
        gatewayMappings: [{
          gatewayPresetId: "openrouter",
          modelId: "expensive/model",
          displayName: "Expensive Model",
          operational: {
            contextWindow: 200000,
            inputPricePerMillion: 5,
            outputPricePerMillion: 15,
            structuredOutput: true,
            toolUse: true,
            vision: false,
            verifiedAt: "2026-03-21",
            sources: [],
          },
        }],
      }),
    });

    expect(cheapScore).toBeGreaterThan(expensiveScore);
  });

  it("scores context and lens evidence directly for frontend long-context profiles", () => {
    const request: ProfileBuilderRequest = {
      profileId: "frontend-long",
      displayName: "Frontend Long",
      optimizeFor: "quality",
      taskFamilies: ["general", "long_context"],
      needsVision: false,
      needsLongContext: true,
      latencySensitivity: "medium",
      budgetPosture: "balanced",
      additionalContext: "Need strong frontend UI implementation for a React component library.",
    };

    const strongScore = scoreBuilderCandidate({
      gatewayPresetId: "openrouter",
      request,
      knowledge: createKnowledge({
        id: "strong/model",
        name: "Strong Model",
        contextBand: "long",
        quality: 2,
        reliability: 2,
        gatewayMappings: [{
          gatewayPresetId: "openrouter",
          modelId: "strong/model",
          displayName: "Strong Model",
          operational: {
            contextWindow: 1_048_576,
            inputPricePerMillion: 1,
            outputPricePerMillion: 5,
            structuredOutput: true,
            toolUse: true,
            vision: false,
            verifiedAt: "2026-03-21",
            sources: [],
          },
        }],
        lenses: [
          { lens: "frontend_ui", rank: 1, rationale: "Best frontend option." },
          { lens: "long_context", rank: 2, rationale: "Strong long-context option." },
        ],
      }),
    });

    const weakScore = scoreBuilderCandidate({
      gatewayPresetId: "openrouter",
      request,
      knowledge: createKnowledge({
        id: "weak/model",
        name: "Weak Model",
        contextBand: "long",
        quality: 2,
        reliability: 2,
        gatewayMappings: [{
          gatewayPresetId: "openrouter",
          modelId: "weak/model",
          displayName: "Weak Model",
          operational: {
            contextWindow: 200000,
            inputPricePerMillion: 1,
            outputPricePerMillion: 5,
            structuredOutput: true,
            toolUse: true,
            vision: false,
            verifiedAt: "2026-03-21",
            sources: [],
          },
        }],
      }),
    });

    expect(strongScore).toBeGreaterThan(weakScore);
  });

  it("does not shortlist image-generation models for text routing profiles", async () => {
    loadGatewaysMock.mockResolvedValue([
      {
        id: "gw_openrouter",
        user_id: "user_1",
        name: "OpenRouter",
        base_url: "https://openrouter.ai/api/v1",
        api_key_enc: "enc:key",
        models_json: "[]",
        created_at: "2026-03-21T00:00:00.000Z",
        updated_at: "2026-03-21T00:00:00.000Z",
      },
    ] as any);
    gatewayRowToPublicMock.mockReturnValue({
      id: "gw_openrouter",
      baseUrl: "https://openrouter.ai/api/v1",
      apiKeyEnc: "enc:key",
      models: [
        { id: "google/gemini-3.1-flash-image-preview", name: "Gemini 3.1 Flash Image Preview", modality: "text,image->text,image" },
      ],
    } as any);

    const response = await handleCreateProfileBuilderRun(
      new Request("http://localhost/api/v1/user/profile-builder/runs", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          profileId: "image-only-profile",
          displayName: "Image Only Profile",
          optimizeFor: "balanced",
          taskFamilies: ["general"],
          needsVision: true,
          needsLongContext: false,
          latencySensitivity: "medium",
          budgetPosture: "balanced",
        }),
      }),
      createAuth(),
      createBindings() as any,
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: expect.stringContaining("No suitable executor model"),
    });
  });

  it("live-verifies OpenRouter candidates without mutating the original input", async () => {
    validateModelIdMock.mockResolvedValue({
      id: "openai/gpt-5.4-mini",
      name: "GPT-5.4 mini",
      context_length: 400000,
      pricing: {
        prompt: "0.00000075",
        completion: "0.0000045",
      },
      architecture: { modality: "text+image->text" },
    });
    const candidate = createCandidate({
      model: { id: "openai/gpt-5.4-mini", name: "GPT-5.4 mini" },
      knowledge: {
        id: "openai/gpt-5.4-mini",
        name: "GPT-5.4 mini",
        supportedGateways: ["openrouter"],
        gatewayMappings: [{
          gatewayPresetId: "openrouter",
          modelId: "openai/gpt-5.4-mini",
          displayName: "GPT-5.4 mini",
          operational: {
            structuredOutput: true,
            toolUse: true,
            vision: true,
            verifiedAt: "2026-03-19",
            sources: [],
          },
        }],
        contextBand: "long",
        costTier: "mid",
        vision: true,
        structuredOutput: true,
        toolUse: true,
        quality: 3,
        speed: 3,
        cost: 2,
        reliability: 3,
        taskFamilies: ["general"],
        strengths: ["fast"],
        caveats: [],
        whenToUse: "fast",
        metrics: [],
        lenses: [],
        capabilities: {
          nativeSearch: false,
          groundedSearch: false,
          documentReasoning: false,
          imageGeneration: false,
          imageEditing: false,
          fileInput: true,
          audioInput: false,
          videoInput: false,
          recommendedAsClassifier: false,
        },
        lastVerified: "2026-03-19",
        sources: [],
      },
    });

    const result = await maybeLiveVerifyOpenRouter([candidate]);
    expect(result.usedLiveVerification).toBe(true);
    expect(result.candidates[0]?.liveVerified).toBe(true);
    expect(result.candidates[0]?.contextSummary).toContain("400K");
    expect(candidate.liveVerified).toBe(false);
  });
});
