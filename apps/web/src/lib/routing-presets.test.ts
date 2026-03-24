import { describe, expect, it } from "vitest";

import { MODEL_REGISTRY } from "@/src/features/routing/server/model-registry";
import { getGatewayPresetId, ROUTING_PRESETS } from "./routing-presets";

describe("getGatewayPresetId", () => {
  it("recognizes the Vercel AI Gateway base URL", () => {
    expect(getGatewayPresetId("https://ai-gateway.vercel.sh/v1")).toBe("vercel");
    expect(getGatewayPresetId("https://ai-gateway.vercel.sh/v1/")).toBe("vercel");
  });

  it("returns undefined for unrecognized gateways", () => {
    expect(getGatewayPresetId("https://gateway.example.com/v1")).toBeUndefined();
  });
});

describe("ROUTING_PRESETS", () => {
  it("only references models that resolve through the current registry for the target gateway", () => {
    const available = new Set(
      MODEL_REGISTRY.flatMap((entry) =>
        entry.gatewayMappings.map((mapping) => `${mapping.gatewayPresetId}:${mapping.modelId}`)
      )
    );

    for (const preset of ROUTING_PRESETS) {
      expect(available.has(`${preset.gatewayPresetId}:${preset.classifierModel}`), `${preset.id} classifier`).toBe(true);
      expect(available.has(`${preset.gatewayPresetId}:${preset.defaultModel}`), `${preset.id} default`).toBe(true);
      for (const model of preset.models) {
        expect(available.has(`${preset.gatewayPresetId}:${model.id}`), `${preset.id} routed model ${model.id}`).toBe(true);
      }
    }
  });

  it("defaults built-in routed models to non-reasoning presets", () => {
    for (const preset of ROUTING_PRESETS) {
      for (const model of preset.models) {
        expect(
          model.reasoningPreset ?? model.thinking,
          `${preset.id} routed model ${model.id}`,
        ).toBe("none");
      }
    }
  });
});
