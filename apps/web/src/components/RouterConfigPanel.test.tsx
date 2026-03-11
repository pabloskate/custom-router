import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { RouterConfigPanel } from "./RouterConfigPanel";

describe("RouterConfigPanel", () => {
  it("renders the optional Config Agent card with command guidance", () => {
    const markup = renderToStaticMarkup(
      createElement(RouterConfigPanel, {
        config: {
          defaultModel: null,
          classifierModel: null,
          routingInstructions: null,
          blocklist: null,
          showModelInResponse: false,
          configAgentEnabled: false,
          configAgentOrchestratorModel: null,
          configAgentSearchModel: null,
        },
        gatewayModelOptions: ["model/orchestrator", "model/search"],
        onChange: () => undefined,
        onSave: async () => true,
      })
    );

    expect(markup).toContain("Config Agent (Optional)");
    expect(markup).toContain("Only needed if you want to manage router settings via chat.");
    expect(markup).toContain("$$config");
    expect(markup).toContain("#endconfig");
    expect(markup).toContain("Recommend latest model for coding");
  });
});
