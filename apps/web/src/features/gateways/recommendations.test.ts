import { describe, expect, it } from "vitest";

import {
  GATEWAY_RECOMMENDATIONS,
  getDirectProviderPresets,
  getGatewayFormHint,
  getRecommendedGatewayPresets,
  isQuickSetupGatewayPreset,
} from "@/src/features/gateways/recommendations";

describe("gateway recommendations", () => {
  it("keeps the gateway tile order stable", () => {
    expect(GATEWAY_RECOMMENDATIONS.map((entry) => entry.id)).toEqual(["openrouter", "vercel", "custom"]);
  });

  it("maps each tile to a valid preset id", () => {
    for (const entry of GATEWAY_RECOMMENDATIONS) {
      expect(entry.presetId).toBeTruthy();
    }
  });

  it("limits quick setup presets to openrouter and vercel", () => {
    expect(getRecommendedGatewayPresets().map((preset) => preset.id)).toEqual(["openrouter", "vercel"]);
    expect(isQuickSetupGatewayPreset("openrouter")).toBe(true);
    expect(isQuickSetupGatewayPreset("vercel")).toBe(true);
    expect(isQuickSetupGatewayPreset("openai")).toBe(false);
  });

  it("keeps direct providers out of the recommended preset group", () => {
    expect(getDirectProviderPresets().some((preset) => preset.id === "openai")).toBe(true);
    expect(getDirectProviderPresets().some((preset) => preset.id === "openrouter")).toBe(false);
  });

  it("provides hints for default, custom, and direct provider setups", () => {
    expect(getGatewayFormHint()).toContain("dropdown");
    expect(getGatewayFormHint("__custom__")).toContain("OpenAI-compatible");
    expect(getGatewayFormHint("openai")).toContain("Direct providers");
  });
});
