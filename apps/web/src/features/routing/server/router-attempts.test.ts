import { describe, expect, it, vi } from "vitest";

import type { RouteDecision } from "@custom-router/core";

import { buildAttemptOrder, buildAttemptPayload } from "./router-attempts";

vi.mock("@/src/lib/routing/guardrail-manager", () => ({
  guardrailKey: vi.fn((modelId: string, provider: string) => `${modelId}:${provider}`),
  isDisabled: vi.fn(() => false),
}));

const guardrailModule = await import("@/src/lib/routing/guardrail-manager");

function createDecision(): RouteDecision {
  return {
    mode: "routed",
    requestedModel: "planning-backend",
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
      requestedModel: "planning-backend",
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

describe("buildAttemptPayload", () => {
  it("maps adaptive effort to the upstream family model for full-capability gateways", () => {
    const payload = buildAttemptPayload({
      body: { model: "planning-backend", messages: [{ role: "user", content: "Plan this." }] },
      selectedModelId: "openai/gpt-5.2:high",
      selectedEffort: "low",
      catalog: [
        {
          id: "openai/gpt-5.2:high",
          name: "GPT-5.2 High",
          upstreamModelId: "openai/gpt-5.2",
          reasoningPreset: "high",
        },
      ],
      baseUrl: "https://openrouter.ai/api/v1",
      apiPath: "/chat/completions",
    });

    expect(payload.model).toBe("openai/gpt-5.2");
    expect(payload.reasoning).toEqual({ effort: "low" });
  });

  it("preserves explicit reasoning settings from the request body", () => {
    const payload = buildAttemptPayload({
      body: {
        model: "planning-backend",
        reasoning: { effort: "xhigh" },
        messages: [{ role: "user", content: "Plan this." }],
      },
      selectedModelId: "openai/gpt-5.2:high",
      selectedEffort: "low",
      catalog: [
        {
          id: "openai/gpt-5.2:high",
          name: "GPT-5.2 High",
          upstreamModelId: "openai/gpt-5.2",
          reasoningPreset: "high",
        },
      ],
      baseUrl: "https://openrouter.ai/api/v1",
      apiPath: "/chat/completions",
    });

    expect(payload.model).toBe("openai/gpt-5.2:high");
    expect(payload.reasoning).toEqual({ effort: "xhigh" });
  });

  it("strips explicit reasoning settings for gateways that do not support reasoning effort", () => {
    const payload = buildAttemptPayload({
      body: {
        model: "opencode-go-coding",
        reasoning: { effort: "none" },
        messages: [{ role: "user", content: "Patch this." }],
      },
      selectedModelId: "deepseek/deepseek-v4-flash",
      selectedEffort: "none",
      catalog: [
        {
          id: "deepseek/deepseek-v4-flash",
          name: "DeepSeek V4 Flash",
          reasoningPreset: "none",
        },
      ],
      baseUrl: "https://opencode.ai/zen/go/v1",
      apiPath: "/chat/completions",
    });

    expect(payload.model).toBe("deepseek/deepseek-v4-flash");
    expect(payload.reasoning).toBeUndefined();
  });

  it("omits reasoning.effort for provider-default routing while still using the family model", () => {
    const payload = buildAttemptPayload({
      body: { model: "planning-backend", messages: [{ role: "user", content: "Plan this." }] },
      selectedModelId: "google/gemini-2.5-pro:thinking",
      selectedEffort: "provider_default",
      catalog: [
        {
          id: "google/gemini-2.5-pro:thinking",
          name: "Gemini 2.5 Pro Thinking",
          upstreamModelId: "google/gemini-2.5-pro",
          reasoningPreset: "high",
        },
      ],
      baseUrl: "https://openrouter.ai/api/v1",
      apiPath: "/chat/completions",
    });

    expect(payload.model).toBe("google/gemini-2.5-pro");
    expect(payload.reasoning).toBeUndefined();
  });

  it("falls back to exact model routing for unknown gateways", () => {
    const payload = buildAttemptPayload({
      body: { model: "planning-backend", messages: [{ role: "user", content: "Plan this." }] },
      selectedModelId: "openai/gpt-5.2:high",
      selectedEffort: "low",
      catalog: [
        {
          id: "openai/gpt-5.2:high",
          name: "GPT-5.2 High",
          upstreamModelId: "openai/gpt-5.2",
          reasoningPreset: "high",
        },
      ],
      baseUrl: "https://gateway.example/v1",
      apiPath: "/chat/completions",
    });

    expect(payload.model).toBe("openai/gpt-5.2:high");
    expect(payload.reasoning).toBeUndefined();
  });

  it("preserves image generation controls in the upstream payload", () => {
    const payload = buildAttemptPayload({
      body: {
        model: "creative-images",
        messages: [{ role: "user", content: "Create a magazine cover." }],
        modalities: ["image", "text"],
        image_config: { aspect_ratio: "16:9" },
      },
      selectedModelId: "openai/gpt-5-image",
      catalog: [
        {
          id: "openai/gpt-5-image",
          name: "GPT-5 Image",
          modality: "text,image->text,image",
        },
      ],
      baseUrl: "https://openrouter.ai/api/v1",
      apiPath: "/chat/completions",
    });

    expect(payload.model).toBe("openai/gpt-5-image");
    expect(payload.modalities).toEqual(["image", "text"]);
    expect(payload.image_config).toEqual({ aspect_ratio: "16:9" });
  });

  it("repro: forwards valid chat image parts when the client actually sends them", () => {
    const payload = buildAttemptPayload({
      body: {
        model: "opencode-go-coding",
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: "whats this" },
              { type: "image_url", image_url: { url: "data:image/png;base64,abc" } },
            ],
          },
        ],
      },
      selectedModelId: "kimi-k2.6",
      catalog: [{ id: "kimi-k2.6", name: "Kimi K2.6", modality: "text,image->text" }],
      baseUrl: "https://opencode.ai/zen/go/v1",
      apiPath: "/chat/completions",
    });

    expect(payload).toMatchObject({
      model: "kimi-k2.6",
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: "whats this" },
            { type: "image_url", image_url: { url: "data:image/png;base64,abc" } },
          ],
        },
      ],
    });
  });

  it("repro: forwards responses-style image parts unchanged to chat completions", () => {
    const payload = buildAttemptPayload({
      body: {
        model: "opencode-go-coding",
        messages: [
          {
            role: "user",
            content: [
              { type: "input_text", text: "whats this" },
              { type: "input_image", image_url: "data:image/png;base64,abc" },
            ],
          },
        ],
      },
      selectedModelId: "kimi-k2.6",
      catalog: [{ id: "kimi-k2.6", name: "Kimi K2.6", modality: "text,image->text" }],
      baseUrl: "https://opencode.ai/zen/go/v1",
      apiPath: "/chat/completions",
    });

    expect(payload).toMatchObject({
      model: "kimi-k2.6",
      messages: [
        {
          role: "user",
          content: [
            { type: "input_text", text: "whats this" },
            { type: "input_image", image_url: "data:image/png;base64,abc" },
          ],
        },
      ],
    });
  });

  it("repro: selecting Kimi does not add an image if the client request has none", () => {
    const payload = buildAttemptPayload({
      body: {
        model: "opencode-go-coding",
        messages: [{ role: "user", content: "whats this" }],
      },
      selectedModelId: "kimi-k2.6",
      catalog: [{ id: "kimi-k2.6", name: "Kimi K2.6", modality: "text,image->text" }],
      baseUrl: "https://opencode.ai/zen/go/v1",
      apiPath: "/chat/completions",
    });

    expect(payload).toEqual({
      model: "kimi-k2.6",
      messages: [{ role: "user", content: "whats this" }],
    });
  });
});
