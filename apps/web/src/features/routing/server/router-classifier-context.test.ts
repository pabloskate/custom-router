import { describe, expect, it } from "vitest";

import type { RouterConfig } from "@custom-router/core";

import { resolveClassifierContext } from "./router-classifier-context";

const runtimeConfig: RouterConfig = {
  version: "test",
  classifierModel: "model/classifier",
  defaultModel: "model/default",
  globalBlocklist: [],
};

describe("resolveClassifierContext", () => {
  it("rejects partial dedicated classifier settings", async () => {
    const result = await resolveClassifierContext({
      requestId: "req_1",
      requestedModel: "auto",
      routedRequest: true,
      runtimeConfig,
      catalog: [{ id: "model/classifier", name: "Classifier", gatewayId: "gw_classifier" }],
      gatewayMap: new Map([["gw_classifier", { baseUrl: "https://classifier.example/v1", apiKey: "secret" }]]),
      userConfig: {
        classifierBaseUrl: "https://classifier.example/v1",
      },
      byokSecret: "unused",
    });

    expect(result.failure?.response.status).toBe(400);
  });

  it("resolves classifier traffic through the gateway that owns the classifier model", async () => {
    const result = await resolveClassifierContext({
      requestId: "req_2",
      requestedModel: "auto",
      routedRequest: true,
      runtimeConfig,
      catalog: [{ id: "model/classifier", name: "Classifier", gatewayId: "gw_classifier" }],
      gatewayMap: new Map([["gw_classifier", { baseUrl: "https://classifier.example/v1", apiKey: "secret" }]]),
      byokSecret: "unused",
    });

    expect(result.context).toEqual({
      effectiveClassifierModel: "model/classifier",
      classifierBaseUrl: "https://classifier.example/v1",
      classifierApiKey: "secret",
      classifierGatewayId: "gw_classifier",
    });
  });
});
