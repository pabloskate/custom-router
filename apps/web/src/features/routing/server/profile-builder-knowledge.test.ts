import { describe, expect, it } from "vitest";

import {
  MODEL_REGISTRY,
  MODEL_REGISTRY_LAST_VERIFIED,
} from "./model-registry";
import {
  getProfileBuilderKnowledge,
  mergeProfileBuilderSources,
  PROFILE_BUILDER_KNOWLEDGE,
  PROFILE_BUILDER_LAST_VERIFIED,
  profileBuilderResearchModeFromVerification,
} from "./profile-builder-knowledge";

describe("profile-builder-knowledge", () => {
  it("derives one knowledge entry per model-registry entry", () => {
    expect(PROFILE_BUILDER_LAST_VERIFIED).toBe(MODEL_REGISTRY_LAST_VERIFIED);
    expect(PROFILE_BUILDER_KNOWLEDGE).toHaveLength(MODEL_REGISTRY.length);
  });

  it("maps coarse profile-builder fields from the canonical model dataset", () => {
    expect(getProfileBuilderKnowledge("openai/gpt-5.4-mini")).toMatchObject({
      id: "openai/gpt-5.4-mini",
      supportedGateways: ["openrouter", "vercel"],
      gatewayMappings: [
        expect.objectContaining({
          gatewayPresetId: "openrouter",
          modelId: "openai/gpt-5.4-mini",
          displayName: "GPT-5.4 Mini",
          operational: expect.objectContaining({
            contextWindow: 400000,
            inputPricePerMillion: 0.75,
          }),
        }),
        expect.objectContaining({
          gatewayPresetId: "vercel",
          modelId: "openai/gpt-5.4-mini",
          displayName: "GPT-5.4 Mini",
          operational: expect.objectContaining({
            note: expect.stringContaining("not yet verified"),
          }),
        }),
      ],
      contextBand: "long",
      costTier: "mid",
      vision: true,
      structuredOutput: true,
      toolUse: true,
      quality: 3,
      speed: 3,
      cost: 2,
      reliability: 3,
      taskFamilies: ["general", "coding", "agentic_coding", "multimodal"],
      capabilities: {
        fileInput: true,
        recommendedAsClassifier: false,
      },
    });
    expect(getProfileBuilderKnowledge("openai/gpt-5.4-mini")?.strengths).toEqual(
      expect.arrayContaining(["Fast frontier model", "Reliable tools and JSON"]),
    );
    expect(getProfileBuilderKnowledge("openai/gpt-5.4-mini")?.metrics.length).toBeGreaterThan(0);
    expect(getProfileBuilderKnowledge("openai/gpt-5.4-mini")?.lenses.length).toBeGreaterThan(0);
    expect(getProfileBuilderKnowledge("openai/gpt-5.4-mini")?.caveats).toEqual(
      expect.arrayContaining(["Still meaningfully pricier than budget classifiers"]),
    );

    expect(getProfileBuilderKnowledge("minimax/minimax-m2.7")).toMatchObject({
      costTier: "efficient",
      quality: 3,
      speed: 2,
      cost: 2,
      reliability: 2,
    });

    expect(getProfileBuilderKnowledge("inception/mercury-2")).toMatchObject({
      costTier: "budget",
      speed: 3,
      cost: 3,
    });

    expect(getProfileBuilderKnowledge("zai/glm-5")).toMatchObject({
      id: "z-ai/glm-5",
      supportedGateways: ["openrouter", "vercel"],
      gatewayMappings: [
        expect.objectContaining({
          gatewayPresetId: "openrouter",
          modelId: "z-ai/glm-5",
          displayName: "GLM 5",
        }),
        expect.objectContaining({
          gatewayPresetId: "vercel",
          modelId: "zai/glm-5",
          displayName: "GLM 5",
        }),
      ],
      costTier: "efficient",
      quality: 3,
    });
  });

  it("dedupes sources that come from raw metrics", () => {
    const knowledge = getProfileBuilderKnowledge("openai/gpt-5.4-mini");

    expect(knowledge?.sources).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          label: "OpenRouter models API",
          url: "https://openrouter.ai/api/v1/models",
        }),
        expect.objectContaining({
          label: "Artificial Analysis - GPT-5.4 mini",
          url: "https://artificialanalysis.ai/models/gpt-5-4-mini",
        }),
      ]),
    );

    const merged = mergeProfileBuilderSources(knowledge?.sources ?? [], knowledge?.sources ?? []);
    expect(merged).toHaveLength(knowledge?.sources.length ?? 0);
  });

  it("preserves registry evidence that a setup agent would need", () => {
    const knowledge = getProfileBuilderKnowledge("nvidia/nemotron-3-super-120b-a12b");

    expect(knowledge?.capabilities).toMatchObject({
      recommendedAsClassifier: true,
      nativeSearch: false,
    });
    expect(knowledge?.metrics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          metricId: "artificial_analysis_output_tps",
          value: 456.2,
        }),
      ]),
    );
    expect(knowledge?.lenses).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          lens: "classifier_candidate",
          rank: 1,
        }),
      ]),
    );
  });

  it("preserves the research mode helper contract", () => {
    expect(profileBuilderResearchModeFromVerification(true)).toBe("live_verified");
    expect(profileBuilderResearchModeFromVerification(false)).toBe("catalog_only");
  });
});
