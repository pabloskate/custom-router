import { describe, expect, it } from "vitest";

import {
  buildThreadFingerprint,
  hasForceRouteRequest,
  isContinuationRequest,
  isNewConversation
} from "../src/threading";

describe("threading", () => {
  it("treats request with assistant messages as continuation", () => {
    expect(
      isContinuationRequest({
        messages: [
          { role: "user", content: "hi" },
          { role: "assistant", content: "hello" },
          { role: "user", content: "next" }
        ]
      })
    ).toBe(true);
  });

  it("treats request without assistant/tool and no previous id as new", () => {
    expect(
      isNewConversation({
        messages: [{ role: "user", content: "new thread" }]
      })
    ).toBe(true);
  });

  it("uses previous_response_id as stable thread key", () => {
    const key = buildThreadFingerprint({ previousResponseId: "resp_123" });
    expect(key).toBe("response:resp_123");
  });

  it("keeps same fingerprint when early context is unchanged", () => {
    const base = buildThreadFingerprint({
      messages: [
        { role: "system", content: "be concise" },
        { role: "user", content: "help with code" }
      ]
    });

    const extended = buildThreadFingerprint({
      messages: [
        { role: "system", content: "be concise" },
        { role: "user", content: "help with code" },
        { role: "assistant", content: "share snippet" },
        { role: "user", content: "here" }
      ]
    });

    expect(extended).toBe(base);
  });

  it("only triggers #route when it is in the latest user message", () => {
    expect(
      hasForceRouteRequest({
        messages: [
          { role: "user", content: "#route" },
          { role: "assistant", content: "Rerouted." },
          { role: "user", content: "continue please" }
        ]
      })
    ).toBe(false);

    expect(
      hasForceRouteRequest({
        messages: [
          { role: "user", content: "hello" },
          { role: "assistant", content: "hi" },
          { role: "user", content: "#route now" }
        ]
      })
    ).toBe(true);
  });

  it("detects #route from latest Responses API input item only", () => {
    expect(
      hasForceRouteRequest({
        input: [
          { type: "input_text", text: "#route" },
          { type: "input_text", text: "normal follow-up" }
        ]
      })
    ).toBe(false);

    expect(
      hasForceRouteRequest({
        input: [
          { type: "input_text", text: "normal follow-up" },
          { type: "input_text", text: "#route" }
        ]
      })
    ).toBe(true);
  });
});
