import { describe, expect, it } from "vitest";

import {
  getReasoningPresetBadgeLabel,
  REASONING_PRESET_FIELD_HINT,
  REASONING_PRESET_SELECT_OPTIONS,
} from "./reasoning-options";

describe("reasoning option copy", () => {
  it("describes provider_default as omitting the reasoning parameter", () => {
    expect(REASONING_PRESET_SELECT_OPTIONS.find((option) => option.value === "provider_default")?.label)
      .toBe("Provider default (omit reasoning param)");
    expect(REASONING_PRESET_FIELD_HINT).toContain("omits the reasoning parameter");
  });

  it("describes none as an explicit no-reasoning request", () => {
    expect(REASONING_PRESET_SELECT_OPTIONS.find((option) => option.value === "none")?.label)
      .toBe("Explicit off (reasoning.effort = none)");
    expect(getReasoningPresetBadgeLabel("none")).toBe("No reasoning");
  });
});
