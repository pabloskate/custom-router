import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import {
  getModelRegistryEntry,
  getTopModelRegistryEntryForLens,
  listModelRegistryForLens,
  MODEL_REGISTRY,
  MODEL_REGISTRY_LENS_IDS,
} from "./model-registry";

describe("model-registry", () => {
  it("uses unique deployable ids and required top-level metadata", () => {
    const seen = new Set<string>();

    for (const model of MODEL_REGISTRY) {
      expect(model.canonicalModelId).toContain("/");
      expect(seen.has(model.canonicalModelId)).toBe(false);
      seen.add(model.canonicalModelId);

      expect(model.supportedGateways.length).toBeGreaterThan(0);
      expect(model.gatewayMappings.length).toBeGreaterThan(0);
      expect(model.lenses.length).toBeGreaterThan(0);
      expect(model.lastVerified).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  it("seeds every recommendation lens at least once", () => {
    for (const lens of MODEL_REGISTRY_LENS_IDS) {
      expect(listModelRegistryForLens({ lens }).length).toBeGreaterThan(0);
    }
  });

  it("requires source-backed numeric facts without estimated values", () => {
    const approximatePattern = /\b(estimate|estimated|approx|approximately|~)\b/i;

    for (const model of MODEL_REGISTRY) {
      for (const metric of model.metrics) {
        if (typeof metric.value !== "number") {
          continue;
        }

        expect(Number.isFinite(metric.value)).toBe(true);
        expect(metric.source.label.length).toBeGreaterThan(0);
        expect(metric.source.url).toMatch(/^https?:\/\//);
        expect(metric.verifiedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        expect(metric.label).not.toMatch(approximatePattern);
        expect(metric.note ?? "").not.toMatch(approximatePattern);
      }
    }
  });

  it("returns the intended best-in-category seeded winners", () => {
    expect(getTopModelRegistryEntryForLens({ lens: "throughput" })?.canonicalModelId).toBe("inception/mercury-2");
    expect(getTopModelRegistryEntryForLens({ lens: "coding_value" })?.canonicalModelId).toBe("minimax/minimax-m2.7");
    expect(getTopModelRegistryEntryForLens({ lens: "open_source" })?.canonicalModelId).toBe("z-ai/glm-5");
    expect(getTopModelRegistryEntryForLens({ lens: "image_generation" })?.canonicalModelId).toBe("google/gemini-3.1-flash-image-preview");
    expect(getTopModelRegistryEntryForLens({ lens: "frontend_ui" })?.canonicalModelId).toBe("anthropic/claude-opus-4.6");
    expect(getTopModelRegistryEntryForLens({ lens: "classifier_candidate", gatewayPresetId: "openrouter" })?.canonicalModelId).toBe("nvidia/nemotron-3-super-120b-a12b");
  });

  it("does not require TTFT or throughput facts for lens ranking helpers", () => {
    const winner = getTopModelRegistryEntryForLens({ lens: "image_generation" });

    expect(winner?.canonicalModelId).toBe("google/gemini-3.1-flash-image-preview");
    expect(winner?.metrics.map((metric) => metric.metricId)).not.toContain("artificial_analysis_output_tps");
    expect(winner?.metrics.map((metric) => metric.metricId)).not.toContain("artificial_analysis_ttft_seconds");
    expect(listModelRegistryForLens({ lens: "image_generation" }).map((model) => model.canonicalModelId)).toContain("google/gemini-3.1-flash-image-preview");
  });

  it("stores per-gateway deployment mappings alongside each canonical model", () => {
    expect(getModelRegistryEntry("openai/gpt-5.4-mini")?.gatewayMappings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          gatewayPresetId: "openrouter",
          modelId: "openai/gpt-5.4-mini",
          displayName: "GPT-5.4 Mini",
          operational: expect.objectContaining({
            contextWindow: 400000,
            inputPricePerMillion: 0.75,
            outputPricePerMillion: 4.5,
          }),
        }),
        expect.objectContaining({
          gatewayPresetId: "vercel",
          modelId: "openai/gpt-5.4-mini",
          displayName: "GPT-5.4 Mini",
          operational: expect.objectContaining({
            contextWindow: undefined,
            note: expect.stringContaining("not yet verified"),
          }),
        }),
      ]),
    );
    expect(getModelRegistryEntry("nvidia/nemotron-3-super-120b-a12b")?.gatewayMappings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          gatewayPresetId: "openrouter",
          modelId: "nvidia/nemotron-3-super-120b-a12b",
          displayName: "NVIDIA Nemotron 3 Super",
          operational: expect.objectContaining({
            contextWindow: 262144,
            inputPricePerMillion: 0.1,
            outputPricePerMillion: 0.5,
          }),
        }),
      ]),
    );
    expect(getModelRegistryEntry("z-ai/glm-5")?.gatewayMappings).toEqual(
      expect.arrayContaining([
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
      ]),
    );
    expect(getModelRegistryEntry("perplexity/sonar-pro-search")?.gatewayMappings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          gatewayPresetId: "openrouter",
          modelId: "perplexity/sonar-pro-search",
          displayName: "Sonar Pro Search",
        }),
        expect.objectContaining({
          gatewayPresetId: "vercel",
          modelId: "perplexity/sonar-pro",
          displayName: "Sonar Pro",
        }),
      ]),
    );
  });

  it("computes explicit capabilities for agent-facing profile research", () => {
    expect(getModelRegistryEntry("openai/o3-deep-research")?.capabilities).toMatchObject({
      nativeSearch: true,
      fileInput: true,
      recommendedAsClassifier: false,
    });
    expect(getModelRegistryEntry("google/gemini-3.1-flash-image-preview")?.capabilities).toMatchObject({
      imageGeneration: true,
      imageEditing: true,
    });
    expect(getModelRegistryEntry("nvidia/nemotron-3-super-120b-a12b")?.capabilities).toMatchObject({
      recommendedAsClassifier: true,
      nativeSearch: false,
      fileInput: false,
    });
  });

  it("keeps runtime defaults and presets disconnected from the model registry", () => {
    const defaultsSource = readFileSync(
      fileURLToPath(new URL("../../../lib/storage/defaults.ts", import.meta.url)),
      "utf8",
    );
    const presetsSource = readFileSync(
      fileURLToPath(new URL("../../../lib/routing-presets.ts", import.meta.url)),
      "utf8",
    );

    expect(defaultsSource).not.toMatch(/model-registry|profile-builder-knowledge/);
    expect(presetsSource).not.toMatch(/model-registry|profile-builder-knowledge/);
  });
});
