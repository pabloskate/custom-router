import { describe, expect, it, vi } from "vitest";

import type { RouteDecision } from "@custom-router/core";

import { buildAttemptOrder } from "./router-attempts";

vi.mock("@/src/lib/routing/guardrail-manager", () => ({
  guardrailKey: vi.fn((modelId: string, provider: string) => `${modelId}:${provider}`),
  isDisabled: vi.fn(() => false),
}));

const guardrailModule = await import("@/src/lib/routing/guardrail-manager");

function createDecision(): RouteDecision {
  return {
    mode: "routed",
    requestedModel: "auto",
    selectedModel: "model/alpha",
    catalogVersion: "test",
    threadKey: "thread",
    isContinuation: false,
    pinUsed: false,
    degraded: false,
    fallbackModels: ["model/beta", "model/gamma"],
    shouldPin: true,
    explanation: {
      requestId: "req_1",
      createdAt: new Date().toISOString(),
      catalogVersion: "test",
      classificationConfidence: 1,
      classificationSignals: [],
      threadKey: "thread",
      isContinuation: false,
      pinUsed: false,
      selectedModel: "model/alpha",
      decisionReason: "initial_route",
      fallbackChain: [],
      notes: [],
    },
  };
}

describe("buildAttemptOrder", () => {
  it("filters disabled fallback models", () => {
    vi.mocked(guardrailModule.isDisabled).mockImplementation((key: string) => key === "model/beta:default");

    const attempts = buildAttemptOrder({
      decision: createDecision(),
      nowMs: Date.now(),
    });

    expect(attempts).toEqual([
      { modelId: "model/alpha", provider: "default" },
      { modelId: "model/gamma", provider: "default" },
    ]);
  });

  it("keeps the primary model when every candidate is disabled", () => {
    vi.mocked(guardrailModule.isDisabled).mockReturnValue(true);

    const attempts = buildAttemptOrder({
      decision: createDecision(),
      nowMs: Date.now(),
    });

    expect(attempts).toEqual([{ modelId: "model/alpha", provider: "default" }]);
  });
});
