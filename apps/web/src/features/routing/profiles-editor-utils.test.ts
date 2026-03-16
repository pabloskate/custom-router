import { describe, expect, it } from "vitest";

import {
  createProfileFromPreset,
  getProfileIdValidationError,
  normalizeProfileIdInput,
  normalizeProfilesForEditor,
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
    expect(getProfileIdValidationError("auto")).toBe('Profile ID "auto" is reserved. Use a descriptive named profile ID instead.');
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
});

describe("createProfileFromPreset", () => {
  it("binds speed-first nitro models when only base OpenRouter ids are synced", () => {
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
          { id: "bytedance-seed/seed-1.6-flash", name: "Seed 1.6 Flash" },
          { id: "x-ai/grok-4.1-fast", name: "Grok 4.1 Fast" },
          { id: "google/gemini-3.1-flash-lite-preview", name: "Google: Gemini 3.1 Flash Lite Preview" },
          { id: "meta-llama/llama-3.3-70b-instruct", name: "Meta: Llama 3.3 70B Instruct" },
        ],
      },
    ]);

    expect(profile.models).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          gatewayId: "gw_openrouter",
          modelId: "google/gemini-3.1-flash-lite-preview:nitro",
        }),
        expect.objectContaining({
          gatewayId: "gw_openrouter",
          modelId: "meta-llama/llama-3.3-70b-instruct:nitro",
        }),
      ]),
    );
  });
});
