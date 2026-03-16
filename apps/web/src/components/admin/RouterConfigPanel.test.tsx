import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { RouterConfigPanel } from "./RouterConfigPanel";

describe("RouterConfigPanel", () => {
  it("renders fallback/classifier labels and hints", () => {
    const markup = renderToStaticMarkup(
      createElement(RouterConfigPanel, {
        config: {
          defaultModel: null,
          classifierModel: null,
          routingInstructions: null,
          blocklist: null,
          routeTriggerKeywords: null,
          routingFrequency: null,
        },
        gatewayModelOptions: ["model/a", "model/b"],
        onChange: () => undefined,
        saveState: "pristine",
        onSave: async () => true,
      })
    );

    expect(markup).toContain("Fallback Model");
    expect(markup).toContain("Router Model");
    expect(markup).toContain("Used when the classifier fails to decide");
    expect(markup).toContain("Cheap, fast model for routing decisions");
  });

  it("renders save state text", () => {
    const markup = renderToStaticMarkup(
      createElement(RouterConfigPanel, {
        config: {
          defaultModel: null,
          classifierModel: null,
          routingInstructions: null,
          blocklist: null,
          routeTriggerKeywords: null,
          routingFrequency: null,
        },
        gatewayModelOptions: [],
        onChange: () => undefined,
        saveState: "saving",
        onSave: async () => true,
      })
    );

    expect(markup).toContain("Saving changes...");
    expect(markup).toContain("Saving...");
  });
});
