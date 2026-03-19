import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { RouterConfigPanel } from "./RouterConfigPanel";

describe("RouterConfigPanel", () => {
  it("renders rerouting controls and hints", () => {
    const markup = renderToStaticMarkup(
      createElement(RouterConfigPanel, {
        config: {
          routeTriggerKeywords: null,
          routingFrequency: null,
        },
        onChange: () => undefined,
        saveState: "pristine",
        onSave: async () => true,
      }),
    );

    expect(markup).toContain("Re-routing Behavior");
    expect(markup).toContain("All changes saved");
    expect(markup).toContain("Routing frequency");
    expect(markup).toContain("Trigger keywords");
    expect(markup).toContain("Pins model for 1-6 turns, then re-evaluates");
    expect(markup).toContain("Keywords at the start of a message force re-routing.");
  });

  it("renders autosave state text without a manual save button", () => {
    const markup = renderToStaticMarkup(
      createElement(RouterConfigPanel, {
        config: {
          routeTriggerKeywords: [],
          routingFrequency: "smart",
        },
        onChange: () => undefined,
        saveState: "saving",
        onSave: async () => true,
      }),
    );

    expect(markup).toContain("Saving in background...");
    expect(markup).not.toContain("Save re-routing settings");
  });
});
