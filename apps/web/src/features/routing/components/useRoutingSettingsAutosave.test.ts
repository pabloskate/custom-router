import { describe, expect, it } from "vitest";

import {
  getRoutingSettingsAutosaveKey,
  normalizeRoutingSettingsDraft,
} from "@/src/features/routing/components/useRoutingSettingsAutosave";

describe("useRoutingSettingsAutosave helpers", () => {
  it("normalizes empty and duplicate trigger keywords", () => {
    expect(
      normalizeRoutingSettingsDraft({
        routeTriggerKeywords: [" reroute ", "", "reroute", "urgent"],
        routingFrequency: "smart",
      }),
    ).toEqual({
      routeTriggerKeywords: ["reroute", "urgent"],
      routingFrequency: "smart",
    });
  });

  it("treats null and empty trigger keyword lists as the same autosave draft", () => {
    expect(
      getRoutingSettingsAutosaveKey({
        routeTriggerKeywords: null,
        routingFrequency: "smart",
      }),
    ).toBe(
      getRoutingSettingsAutosaveKey({
        routeTriggerKeywords: [],
        routingFrequency: "smart",
      }),
    );
  });
});
