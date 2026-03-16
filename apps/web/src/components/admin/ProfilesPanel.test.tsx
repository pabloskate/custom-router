import React, { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { ProfilesPanel } from "./ProfilesPanel";

const GATEWAYS = [
  {
    id: "gw_openrouter",
    name: "OpenRouter",
    baseUrl: "https://openrouter.ai/api/v1",
    models: [
      { id: "model/a", name: "Model A" },
      { id: "model/b", name: "Model B" },
    ],
    createdAt: "2026-03-16T00:00:00.000Z",
    updatedAt: "2026-03-16T00:00:00.000Z",
  },
];

describe("ProfilesPanel", () => {
  it("renders quick setup and named routing profiles", () => {
    const markup = renderToStaticMarkup(
      createElement(ProfilesPanel, {
        profiles: [{ id: "planning-backend", name: "Planning Backend", models: [] }],
        gateways: GATEWAYS,
        onChange: () => undefined,
        saveState: "dirty",
        onSave: async () => true,
      }),
    );

    expect(markup).toContain("Quick setup");
    expect(markup).toContain("All changes saved");
    expect(markup).toContain("Add profile");
    expect(markup).toContain("Needs setup");
    expect(markup).toContain("No routing instructions");
    expect(markup).toContain("planning-backend");
  });

  it("renders the reset notice when legacy routing config is detected", () => {
    const markup = renderToStaticMarkup(
      createElement(ProfilesPanel, {
        profiles: null,
        gateways: GATEWAYS,
        onChange: () => undefined,
        saveState: "pristine",
        onSave: async () => true,
        routingConfigRequiresReset: true,
        routingConfigResetMessage: "Legacy routing settings were detected.",
      }),
    );

    expect(markup).toContain("Routing profiles need to be rebuilt");
    expect(markup).toContain("Reset routing profiles");
  });
});
