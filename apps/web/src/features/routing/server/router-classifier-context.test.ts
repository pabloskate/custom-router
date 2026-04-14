import { describe, expect, it } from "vitest";

import type { RouterConfig } from "@custom-router/core";
import { encryptByokSecret } from "@/src/lib/auth/byok-crypto";
import { resolveUpstreamHostPolicy } from "@/src/lib/upstream";

import { resolveClassifierContext } from "./router-classifier-context";

const runtimeConfig: RouterConfig = {
  version: "test",
  classifierModel: "model/classifier",
  defaultModel: "model/default",
  globalBlocklist: [],
};
const permissivePolicy = resolveUpstreamHostPolicy({ UPSTREAM_ALLOW_ARBITRARY_HOSTS: "true" });

describe("resolveClassifierContext", () => {
  it("rejects partial dedicated classifier settings", async () => {
    const result = await resolveClassifierContext({
      requestId: "req_1",
      requestedModel: "planning-backend",
      routedRequest: true,
      runtimeConfig,
      catalog: [{ id: "model/classifier", name: "Classifier", gatewayId: "gw_classifier" }],
      gatewayMap: new Map([["gw_classifier", { baseUrl: "https://classifier.example/v1", apiKey: "secret" }]]),
      userConfig: {
        classifierBaseUrl: "https://classifier.example/v1",
      },
      byokSecret: "unused",
      upstreamHostPolicy: permissivePolicy,
    });

    expect(result.failure?.response.status).toBe(400);
  });

  it("rejects dedicated classifier hosts that are not allowed on this deployment", async () => {
    const byokSecret = "1234567890abcdef";
    const classifierApiKeyEnc = await encryptByokSecret({
      plaintext: "classifier-key",
      secret: byokSecret,
    });

    const result = await resolveClassifierContext({
      requestId: "req_blocked",
      requestedModel: "planning-backend",
      routedRequest: true,
      runtimeConfig,
      catalog: [{ id: "model/classifier", name: "Classifier", gatewayId: "gw_classifier" }],
      gatewayMap: new Map([["gw_classifier", { baseUrl: "https://api.openai.com/v1", apiKey: "secret" }]]),
      userConfig: {
        classifierBaseUrl: "https://classifier.example/v1",
        classifierApiKeyEnc,
      },
      byokSecret,
      upstreamHostPolicy: resolveUpstreamHostPolicy({}),
    });

    expect(result.failure?.response.status).toBe(400);
  });

  it("resolves classifier traffic through the gateway that owns the classifier model", async () => {
    const result = await resolveClassifierContext({
      requestId: "req_2",
      requestedModel: "planning-backend",
      routedRequest: true,
      runtimeConfig,
      matchedProfile: {
        id: "planning-backend",
        name: "Planning Backend",
        classifierModel: "gw_classifier::model/classifier",
        models: [{ gatewayId: "gw_default", modelId: "model/default", name: "Default" }],
      },
      catalog: [{ id: "model/default", name: "Default", gatewayId: "gw_default" }],
      gatewayMap: new Map([["gw_classifier", { baseUrl: "https://classifier.example/v1", apiKey: "secret" }]]),
      userConfig: {
        gatewayRows: [
          {
            id: "gw_classifier",
            baseUrl: "https://classifier.example/v1",
            apiKeyEnc: "enc:key",
            models: [{ id: "model/classifier", name: "Classifier" }],
          },
        ],
      },
      byokSecret: "unused",
      upstreamHostPolicy: permissivePolicy,
    });

    expect(result.context).toEqual({
      effectiveClassifierModel: "model/classifier",
      classifierBaseUrl: "https://classifier.example/v1",
      classifierApiKey: "secret",
      classifierGatewayId: "gw_classifier",
      classifierSupportsReasoningEffort: false,
    });
  });

  it("marks recognized classifier gateways as supporting reasoning controls", async () => {
    const result = await resolveClassifierContext({
      requestId: "req_3",
      requestedModel: "planning-backend",
      routedRequest: true,
      runtimeConfig,
      matchedProfile: {
        id: "planning-backend",
        name: "Planning Backend",
        classifierModel: "gw_classifier::model/classifier",
        models: [{ gatewayId: "gw_default", modelId: "model/default", name: "Default" }],
      },
      catalog: [{ id: "model/default", name: "Default", gatewayId: "gw_default" }],
      gatewayMap: new Map([["gw_classifier", { baseUrl: "https://openrouter.ai/api/v1", apiKey: "secret" }]]),
      userConfig: {
        gatewayRows: [
          {
            id: "gw_classifier",
            baseUrl: "https://openrouter.ai/api/v1",
            apiKeyEnc: "enc:key",
            models: [{ id: "model/classifier", name: "Classifier" }],
          },
        ],
      },
      byokSecret: "unused",
      upstreamHostPolicy: permissivePolicy,
    });

    expect(result.context).toEqual({
      effectiveClassifierModel: "model/classifier",
      classifierBaseUrl: "https://openrouter.ai/api/v1",
      classifierApiKey: "secret",
      classifierGatewayId: "gw_classifier",
      classifierSupportsReasoningEffort: true,
    });
  });
});
