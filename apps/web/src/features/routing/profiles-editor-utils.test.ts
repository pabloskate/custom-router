import { describe, expect, it } from "vitest";

import {
  createProfileFromPreset,
  findMatchingPresetForProfile,
  getQuickSetupPresets,
  getProfileIdValidationError,
  normalizeProfileIdInput,
  normalizeProfilesForEditor,
  parseImportedProfileJson,
  refreshProfileFromPreset,
  serializeProfileForJson,
} from "./profiles-editor-utils";
import { ROUTING_PRESETS } from "@/src/lib/routing-presets";

describe("normalizeProfilesForEditor", () => {
  it("preserves raw routing instruction whitespace while editing", () => {
    const profiles = normalizeProfilesForEditor(
      [
        {
          id: "planning-backend",
          name: "Planning Backend",
          routingInstructions: "Line one\n\n  indented line  ",
          models: [],
        },
      ],
      [],
    );

    expect(profiles[0]?.routingInstructions).toBe("Line one\n\n  indented line  ");
  });

  it("normalizes new profile ids into slug format", () => {
    expect(normalizeProfileIdInput(" Profile 2SFVdsfv jks od ow ")).toBe("profile-2sfvdsfv-jks-od-ow");
    expect(getProfileIdValidationError("profile-2sfvdsfv-jks-od-ow")).toBeNull();
    expect(getProfileIdValidationError("profile with spaces")).toBe("Profile IDs can only use lowercase letters, numbers, and hyphens.");
    expect(getProfileIdValidationError("auto")).toBeNull();
  });

  it("auto-binds suffixed OpenRouter variants to a unique synced base model", () => {
    const profiles = normalizeProfilesForEditor(
      [
        {
          id: "speed-first",
          name: "Speed First",
          models: [
            {
              modelId: "google/gemini-3.1-flash-lite-preview:nitro",
              name: "Gemini 3.1 Flash Lite (Nitro)",
            },
          ],
        },
      ],
      [
        {
          id: "gw_openrouter",
          name: "OpenRouter",
          baseUrl: "https://openrouter.ai/api/v1",
          createdAt: "2026-03-16T00:00:00.000Z",
          updatedAt: "2026-03-16T00:00:00.000Z",
          models: [
            {
              id: "google/gemini-3.1-flash-lite-preview",
              name: "Google: Gemini 3.1 Flash Lite Preview",
              modality: "text,image->text",
            },
          ],
        },
      ],
    );

    expect(profiles[0]?.models?.[0]).toMatchObject({
      gatewayId: "gw_openrouter",
      modelId: "google/gemini-3.1-flash-lite-preview:nitro",
      modality: "text,image->text",
    });
  });

  it("filters quick setup presets to the configured compatible gateways", () => {
    const presets = getQuickSetupPresets([
      {
        id: "gw_vercel",
        name: "Vercel AI Gateway",
        baseUrl: "https://ai-gateway.vercel.sh/v1",
        createdAt: "2026-03-16T00:00:00.000Z",
        updatedAt: "2026-03-16T00:00:00.000Z",
        models: [],
      },
      {
        id: "gw_custom",
        name: "Custom Gateway",
        baseUrl: "https://gateway.example.com/v1",
        createdAt: "2026-03-16T00:00:00.000Z",
        updatedAt: "2026-03-16T00:00:00.000Z",
        models: [],
      },
    ]);

    expect(presets.every((preset) => preset.gatewayPresetId === "vercel")).toBe(true);
    expect(presets.some((preset) => preset.id === "vercel-balanced")).toBe(true);
    expect(presets.some((preset) => preset.id === "general-balanced")).toBe(false);
  });
});

describe("createProfileFromPreset", () => {
  it("binds the speed-first preset to synced OpenRouter models", () => {
    const speedFirst = ROUTING_PRESETS.find((preset) => preset.id === "speed-first");
    expect(speedFirst).toBeTruthy();

    const profile = createProfileFromPreset(speedFirst!, [
      {
        id: "gw_openrouter",
        name: "OpenRouter",
        baseUrl: "https://openrouter.ai/api/v1",
        createdAt: "2026-03-16T00:00:00.000Z",
        updatedAt: "2026-03-16T00:00:00.000Z",
        models: [
          { id: "inception/mercury-2", name: "Mercury 2" },
          { id: "google/gemini-3-flash-preview", name: "Gemini 3 Flash" },
          { id: "x-ai/grok-4.1-fast", name: "Grok 4.1 Fast" },
          { id: "google/gemini-3.1-flash-lite-preview", name: "Google: Gemini 3.1 Flash Lite Preview" },
          { id: "nvidia/nemotron-3-super-120b-a12b", name: "NVIDIA Nemotron 3 Super" },
        ],
      },
    ]);

    expect(profile.defaultModel).toBe("gw_openrouter::inception/mercury-2");
    expect(profile.classifierModel).toBe("gw_openrouter::nvidia/nemotron-3-super-120b-a12b");
    expect(profile.models).toHaveLength(5);
    expect(profile.models).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          gatewayId: "gw_openrouter",
          modelId: "google/gemini-3-flash-preview",
        }),
        expect.objectContaining({
          gatewayId: "gw_openrouter",
          modelId: "nvidia/nemotron-3-super-120b-a12b",
        }),
      ]),
    );
  });

  it("binds the customer-support preset default and classifier to synced OpenRouter models", () => {
    const customerSupport = ROUTING_PRESETS.find((preset) => preset.id === "customer-support");
    expect(customerSupport).toBeTruthy();

    const profile = createProfileFromPreset(customerSupport!, [
      {
        id: "gw_openrouter",
        name: "OpenRouter",
        baseUrl: "https://openrouter.ai/api/v1",
        createdAt: "2026-03-16T00:00:00.000Z",
        updatedAt: "2026-03-16T00:00:00.000Z",
        models: [
          { id: "anthropic/claude-sonnet-4.6", name: "Anthropic: Claude Sonnet 4.6" },
          { id: "nvidia/nemotron-3-super-120b-a12b", name: "NVIDIA Nemotron 3 Super" },
          { id: "google/gemini-3.1-pro-preview", name: "Google: Gemini 3.1 Pro Preview" },
          { id: "x-ai/grok-4.1-fast", name: "xAI: Grok 4.1 Fast" },
          { id: "google/gemini-3-flash-preview", name: "Google: Gemini 3 Flash Preview" },
          { id: "deepseek/deepseek-v3.2", name: "DeepSeek: DeepSeek V3.2" },
        ],
      },
    ]);

    expect(profile.defaultModel).toBe("gw_openrouter::anthropic/claude-sonnet-4.6");
    expect(profile.classifierModel).toBe("gw_openrouter::nvidia/nemotron-3-super-120b-a12b");
    expect(profile.models).toHaveLength(5);
    expect(profile.models).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          gatewayId: "gw_openrouter",
          modelId: "google/gemini-3.1-pro-preview",
        }),
        expect.objectContaining({
          gatewayId: "gw_openrouter",
          modelId: "x-ai/grok-4.1-fast",
        }),
      ]),
    );
  });

  it("binds the cheap frontier coding preset to synced OpenRouter models", () => {
    const cheapFrontierCoding = ROUTING_PRESETS.find((preset) => preset.id === "coding-cheap-frontier");
    expect(cheapFrontierCoding).toBeTruthy();

    const profile = createProfileFromPreset(cheapFrontierCoding!, [
      {
        id: "gw_openrouter",
        name: "OpenRouter",
        baseUrl: "https://openrouter.ai/api/v1",
        createdAt: "2026-03-16T00:00:00.000Z",
        updatedAt: "2026-03-16T00:00:00.000Z",
        models: [
          { id: "minimax/minimax-m2.7", name: "MiniMax: MiniMax M2.7" },
          { id: "z-ai/glm-5", name: "Z.ai: GLM 5" },
          { id: "moonshotai/kimi-k2.5", name: "MoonshotAI: Kimi K2.5" },
          { id: "inception/mercury-2", name: "Inception: Mercury 2" },
          { id: "google/gemini-3.1-flash-lite-preview", name: "Google: Gemini 3.1 Flash Lite Preview" },
          { id: "nvidia/nemotron-3-super-120b-a12b", name: "NVIDIA Nemotron 3 Super" },
        ],
      },
    ]);

    expect(profile.defaultModel).toBe("gw_openrouter::minimax/minimax-m2.7");
    expect(profile.classifierModel).toBe("gw_openrouter::nvidia/nemotron-3-super-120b-a12b");
    expect(profile.models).toHaveLength(5);
    expect(profile.models).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          gatewayId: "gw_openrouter",
          modelId: "z-ai/glm-5",
        }),
        expect.objectContaining({
          gatewayId: "gw_openrouter",
          modelId: "moonshotai/kimi-k2.5",
        }),
      ]),
    );
  });

  it("binds the affordable deep research preset to synced OpenRouter models", () => {
    const researchAffordable = ROUTING_PRESETS.find((preset) => preset.id === "research-affordable");
    expect(researchAffordable).toBeTruthy();

    const profile = createProfileFromPreset(researchAffordable!, [
      {
        id: "gw_openrouter",
        name: "OpenRouter",
        baseUrl: "https://openrouter.ai/api/v1",
        createdAt: "2026-03-16T00:00:00.000Z",
        updatedAt: "2026-03-16T00:00:00.000Z",
        models: [
          { id: "z-ai/glm-5", name: "Z.ai: GLM 5" },
          { id: "x-ai/grok-4.20-beta", name: "xAI: Grok 4.20 Beta" },
          { id: "google/gemini-3-flash-preview", name: "Google: Gemini 3 Flash Preview" },
          { id: "google/gemini-3.1-flash-lite-preview", name: "Google: Gemini 3.1 Flash Lite Preview" },
        ],
      },
    ]);

    expect(profile.defaultModel).toBe("gw_openrouter::z-ai/glm-5");
    expect(profile.classifierModel).toBe("gw_openrouter::google/gemini-3.1-flash-lite-preview");
    expect(profile.models).toHaveLength(3);
    expect(profile.models).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          gatewayId: "gw_openrouter",
          modelId: "x-ai/grok-4.20-beta",
        }),
        expect.objectContaining({
          gatewayId: "gw_openrouter",
          modelId: "google/gemini-3-flash-preview",
        }),
      ]),
    );
  });

  it("binds the frontend UI builder preset to synced OpenRouter models", () => {
    const frontendUiBuilder = ROUTING_PRESETS.find((preset) => preset.id === "frontend-ui-builder");
    expect(frontendUiBuilder).toBeTruthy();

    const profile = createProfileFromPreset(frontendUiBuilder!, [
      {
        id: "gw_openrouter",
        name: "OpenRouter",
        baseUrl: "https://openrouter.ai/api/v1",
        createdAt: "2026-03-16T00:00:00.000Z",
        updatedAt: "2026-03-16T00:00:00.000Z",
        models: [
          { id: "anthropic/claude-sonnet-4.6", name: "Anthropic: Claude Sonnet 4.6" },
          { id: "anthropic/claude-opus-4.6", name: "Anthropic: Claude Opus 4.6" },
          { id: "z-ai/glm-5", name: "Z.ai: GLM 5" },
          { id: "moonshotai/kimi-k2.5", name: "MoonshotAI: Kimi K2.5" },
          { id: "inception/mercury-2", name: "Inception: Mercury 2" },
          { id: "nvidia/nemotron-3-super-120b-a12b", name: "NVIDIA Nemotron 3 Super" },
        ],
      },
    ]);

    expect(profile.defaultModel).toBe("gw_openrouter::anthropic/claude-sonnet-4.6");
    expect(profile.classifierModel).toBe("gw_openrouter::nvidia/nemotron-3-super-120b-a12b");
    expect(profile.models).toHaveLength(5);
    expect(profile.models).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          gatewayId: "gw_openrouter",
          modelId: "inception/mercury-2",
        }),
        expect.objectContaining({
          gatewayId: "gw_openrouter",
          modelId: "moonshotai/kimi-k2.5",
        }),
      ]),
    );
  });

  it("binds the open-source sovereign preset to synced OpenRouter models", () => {
    const openSourceSovereign = ROUTING_PRESETS.find((preset) => preset.id === "open-source-sovereign");
    expect(openSourceSovereign).toBeTruthy();

    const profile = createProfileFromPreset(openSourceSovereign!, [
      {
        id: "gw_openrouter",
        name: "OpenRouter",
        baseUrl: "https://openrouter.ai/api/v1",
        createdAt: "2026-03-16T00:00:00.000Z",
        updatedAt: "2026-03-16T00:00:00.000Z",
        models: [
          { id: "z-ai/glm-5", name: "Z.ai: GLM 5" },
          { id: "qwen/qwen3.5-397b-a17b", name: "Qwen3.5 397B A17B" },
          { id: "moonshotai/kimi-k2.5", name: "MoonshotAI: Kimi K2.5" },
          { id: "deepseek/deepseek-v3.2", name: "DeepSeek: DeepSeek V3.2" },
          { id: "nvidia/nemotron-3-super-120b-a12b", name: "NVIDIA Nemotron 3 Super" },
        ],
      },
    ]);

    expect(profile.defaultModel).toBe("gw_openrouter::z-ai/glm-5");
    expect(profile.classifierModel).toBe("gw_openrouter::nvidia/nemotron-3-super-120b-a12b");
    expect(profile.models).toHaveLength(5);
    expect(profile.models).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          gatewayId: "gw_openrouter",
          modelId: "qwen/qwen3.5-397b-a17b",
        }),
        expect.objectContaining({
          gatewayId: "gw_openrouter",
          modelId: "deepseek/deepseek-v3.2",
        }),
      ]),
    );
  });

  it("binds the vercel customer-support preset to synced Vercel AI Gateway models", () => {
    const vercelSupport = ROUTING_PRESETS.find((preset) => preset.id === "vercel-customer-support");
    expect(vercelSupport).toBeTruthy();

    const profile = createProfileFromPreset(vercelSupport!, [
      {
        id: "gw_vercel",
        name: "Vercel AI Gateway",
        baseUrl: "https://ai-gateway.vercel.sh/v1",
        createdAt: "2026-03-16T00:00:00.000Z",
        updatedAt: "2026-03-16T00:00:00.000Z",
        models: [
          { id: "anthropic/claude-sonnet-4.6", name: "Claude Sonnet 4.6" },
          { id: "google/gemini-3.1-flash-lite-preview", name: "Gemini 3.1 Flash Lite Preview" },
          { id: "google/gemini-3.1-pro-preview", name: "Gemini 3.1 Pro Preview" },
          { id: "google/gemini-3-flash", name: "Gemini 3 Flash" },
          { id: "openai/gpt-5.4-mini", name: "GPT-5.4 Mini" },
          { id: "deepseek/deepseek-v3.2", name: "DeepSeek V3.2" },
        ],
      },
    ]);

    expect(profile.defaultModel).toBe("gw_vercel::anthropic/claude-sonnet-4.6");
    expect(profile.classifierModel).toBe("gw_vercel::google/gemini-3.1-flash-lite-preview");
    expect(profile.models).toHaveLength(5);
    expect(profile.models).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          gatewayId: "gw_vercel",
          modelId: "google/gemini-3.1-pro-preview",
        }),
        expect.objectContaining({
          gatewayId: "gw_vercel",
          modelId: "openai/gpt-5.4-mini",
        }),
      ]),
    );
  });

  it("binds the vercel premium coding preset to synced Vercel AI Gateway models", () => {
    const vercelPremiumCoding = ROUTING_PRESETS.find((preset) => preset.id === "vercel-coding-agentic-premium");
    expect(vercelPremiumCoding).toBeTruthy();

    const profile = createProfileFromPreset(vercelPremiumCoding!, [
      {
        id: "gw_vercel",
        name: "Vercel AI Gateway",
        baseUrl: "https://ai-gateway.vercel.sh/v1",
        createdAt: "2026-03-16T00:00:00.000Z",
        updatedAt: "2026-03-16T00:00:00.000Z",
        models: [
          { id: "anthropic/claude-sonnet-4.6", name: "Claude Sonnet 4.6" },
          { id: "anthropic/claude-opus-4.6", name: "Claude Opus 4.6" },
          { id: "openai/gpt-5.4-mini", name: "GPT-5.4 Mini" },
          { id: "zai/glm-5", name: "GLM 5" },
          { id: "google/gemini-3.1-flash-lite-preview", name: "Gemini 3.1 Flash Lite Preview" },
          { id: "google/gemini-3.1-pro-preview", name: "Gemini 3.1 Pro Preview" },
        ],
      },
    ]);

    expect(profile.defaultModel).toBe("gw_vercel::anthropic/claude-sonnet-4.6");
    expect(profile.classifierModel).toBe("gw_vercel::google/gemini-3.1-flash-lite-preview");
    expect(profile.models).toHaveLength(5);
    expect(profile.models).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          gatewayId: "gw_vercel",
          modelId: "anthropic/claude-opus-4.6",
        }),
        expect.objectContaining({
          gatewayId: "gw_vercel",
          modelId: "zai/glm-5",
        }),
      ]),
    );
  });

  it("binds the vercel affordable deep research preset to synced Vercel AI Gateway models", () => {
    const vercelResearchAffordable = ROUTING_PRESETS.find((preset) => preset.id === "vercel-research-affordable");
    expect(vercelResearchAffordable).toBeTruthy();

    const profile = createProfileFromPreset(vercelResearchAffordable!, [
      {
        id: "gw_vercel",
        name: "Vercel AI Gateway",
        baseUrl: "https://ai-gateway.vercel.sh/v1",
        createdAt: "2026-03-16T00:00:00.000Z",
        updatedAt: "2026-03-16T00:00:00.000Z",
        models: [
          { id: "zai/glm-5", name: "GLM 5" },
          { id: "xai/grok-4.20-reasoning-beta", name: "Grok 4.20 Beta Reasoning" },
          { id: "google/gemini-3-flash", name: "Gemini 3 Flash" },
          { id: "google/gemini-3.1-flash-lite-preview", name: "Gemini 3.1 Flash Lite Preview" },
        ],
      },
    ]);

    expect(profile.defaultModel).toBe("gw_vercel::zai/glm-5");
    expect(profile.classifierModel).toBe("gw_vercel::google/gemini-3.1-flash-lite-preview");
    expect(profile.models).toHaveLength(3);
    expect(profile.models).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          gatewayId: "gw_vercel",
          modelId: "xai/grok-4.20-reasoning-beta",
        }),
        expect.objectContaining({
          gatewayId: "gw_vercel",
          modelId: "google/gemini-3-flash",
        }),
      ]),
    );
  });
});

describe("preset refresh helpers", () => {
  it("matches preset-backed profiles by display name", () => {
    const preset = findMatchingPresetForProfile(
      { name: "  balanced general-purpose " },
      ROUTING_PRESETS,
    );

    expect(preset?.id).toBe("general-balanced");
  });

  it("refreshes a preset-backed profile while keeping the API-facing id", () => {
    const preset = ROUTING_PRESETS.find((entry) => entry.id === "general-balanced");
    expect(preset).toBeTruthy();

    const refreshed = refreshProfileFromPreset(
      {
        id: "team-router",
        name: "Balanced General-Purpose",
        routingInstructions: "Custom instructions",
        defaultModel: "gw_openrouter::custom/default",
        classifierModel: "gw_openrouter::custom/classifier",
        models: [
          {
            gatewayId: "gw_openrouter",
            modelId: "custom/model",
            name: "Custom model",
          },
        ],
      },
      preset!,
      [
        {
          id: "gw_openrouter",
          name: "OpenRouter",
          baseUrl: "https://openrouter.ai/api/v1",
          createdAt: "2026-03-16T00:00:00.000Z",
          updatedAt: "2026-03-16T00:00:00.000Z",
          models: [
            { id: "anthropic/claude-sonnet-4.6", name: "Anthropic: Claude Sonnet 4.6" },
            { id: "nvidia/nemotron-3-super-120b-a12b", name: "NVIDIA Nemotron 3 Super" },
            { id: "google/gemini-3.1-pro-preview", name: "Google: Gemini 3.1 Pro Preview" },
            { id: "google/gemini-3-flash-preview", name: "Google: Gemini 3 Flash Preview" },
            { id: "inception/mercury-2", name: "Mercury 2" },
            { id: "perplexity/sonar-pro-search", name: "Perplexity: Sonar Pro Search" },
          ],
        },
      ],
    );

    expect(refreshed.id).toBe("team-router");
    expect(refreshed.name).toBe("Balanced General-Purpose");
    expect(refreshed.routingInstructions).toContain("Route every request to the single best model.");
    expect(refreshed.defaultModel).toBe("gw_openrouter::anthropic/claude-sonnet-4.6");
    expect(refreshed.classifierModel).toBe("gw_openrouter::nvidia/nemotron-3-super-120b-a12b");
    expect(refreshed.models).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          gatewayId: "gw_openrouter",
          modelId: "inception/mercury-2",
        }),
      ]),
    );
  });
});

describe("profile JSON helpers", () => {
  it("serializes a profile as normalized pretty-printed JSON", () => {
    const json = serializeProfileForJson({
      id: "team-router",
      name: " Team Router ",
      description: "  Balanced routing profile. ",
      routingInstructions: " Route by latency and quality. ",
      models: [
        {
          gatewayId: "gw_openrouter",
          modelId: "openai/gpt-5.4",
          name: " GPT-5.4 ",
        },
      ],
    });

    expect(json).toContain('"id": "team-router"');
    expect(json).toContain('"name": "Team Router"');
    expect(json).toContain('"description": "Balanced routing profile."');
    expect(json.endsWith("\n")).toBe(true);
  });

  it("parses imported profile JSON and binds unique synced models", () => {
    const profile = parseImportedProfileJson(JSON.stringify({
      id: "support-router",
      name: "Support Router",
      models: [
        {
          modelId: "google/gemini-3.1-flash-lite-preview:nitro",
          name: "Gemini 3.1 Flash Lite",
        },
      ],
    }), [
      {
        id: "gw_openrouter",
        name: "OpenRouter",
        baseUrl: "https://openrouter.ai/api/v1",
        createdAt: "2026-03-16T00:00:00.000Z",
        updatedAt: "2026-03-16T00:00:00.000Z",
        models: [
          {
            id: "google/gemini-3.1-flash-lite-preview",
            name: "Google: Gemini 3.1 Flash Lite Preview",
            modality: "text,image->text",
          },
        ],
      },
    ]);

    expect(profile.models?.[0]).toMatchObject({
      gatewayId: "gw_openrouter",
      modelId: "google/gemini-3.1-flash-lite-preview:nitro",
      modality: "text,image->text",
    });
  });

  it("rejects non-object profile imports", () => {
    expect(() => parseImportedProfileJson("[]", [])).toThrow("Profile JSON must be a single object.");
  });
});
