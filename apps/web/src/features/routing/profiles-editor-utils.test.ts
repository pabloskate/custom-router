import { describe, expect, it } from "vitest";

import {
  getProfileIdValidationError,
  normalizeProfileIdInput,
  normalizeProfilesForEditor,
} from "./profiles-editor-utils";

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
    expect(getProfileIdValidationError("auto")).toBe('Profile ID "auto" is reserved. Use a descriptive named profile ID instead.');
  });
});
