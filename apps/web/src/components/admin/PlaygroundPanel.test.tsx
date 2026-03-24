import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { MessageBubble, RecentModelHistoryCard, RouteCard } from "./PlaygroundPanel";

describe("PlaygroundPanel", () => {
  it("renders inspect-provided confidence in the route card", () => {
    const markup = renderToStaticMarkup(
      createElement(RouteCard, {
        result: {
          requestId: "req_1",
          selectedModel: "model/alpha",
          classificationConfidence: 0.94,
          fallbackModels: [],
          decisionReason: "initial_route",
          classifierInvoked: true,
          classifierModel: "model/classifier",
          isContinuation: false,
          pinUsed: false,
          latencyMs: 18,
        },
      }),
    );

    expect(markup).toContain("Confidence");
    expect(markup).toContain("0.94");
  });

  it("renders full-chat confidence beside routed model metadata", () => {
    const markup = renderToStaticMarkup(
      createElement(MessageBubble, {
        message: {
          id: "assistant-1",
          role: "assistant",
          content: "ok",
          routedModel: "model/alpha",
          routingConfidence: 0.91,
        },
      }),
    );

    expect(markup).toContain("model/alpha");
    expect(markup).toContain("confidence 0.91");
  });

  it("renders recent routed model history entries", () => {
    const markup = renderToStaticMarkup(
      createElement(RecentModelHistoryCard, {
        loading: false,
        error: null,
        entries: [
          {
            requestId: "req_1",
            createdAt: "2026-03-22T10:00:00.000Z",
            requestedModel: "planning-backend",
            selectedModel: "model/alpha",
            decisionReason: "initial_route",
          },
        ],
      }),
    );

    expect(markup).toContain("Recent Routed Models");
    expect(markup).toContain("planning-backend");
    expect(markup).toContain("model/alpha");
    expect(markup).toContain("Classifier");
  });
});
