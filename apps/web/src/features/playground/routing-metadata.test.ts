import { describe, expect, it } from "vitest";

import {
  formatRoutingConfidence,
  parseRoutingConfidence,
  readRoutedResponseMetadata,
} from "./routing-metadata";

describe("playground routing metadata helpers", () => {
  it("reads routed model and confidence from router headers", () => {
    const metadata = readRoutedResponseMetadata(new Headers({
      "x-router-model-selected": "model/alpha",
      "x-router-confidence": "0.91",
    }));

    expect(metadata).toEqual({
      routedModel: "model/alpha",
      classificationConfidence: 0.91,
    });
  });

  it("ignores missing or invalid confidence headers", () => {
    expect(parseRoutingConfidence(null)).toBeUndefined();
    expect(parseRoutingConfidence("not-a-number")).toBeUndefined();
    expect(parseRoutingConfidence("1.5")).toBeUndefined();
  });

  it("formats confidence for display with two decimals", () => {
    expect(formatRoutingConfidence(0.94)).toBe("0.94");
    expect(formatRoutingConfidence(0.9)).toBe("0.90");
    expect(formatRoutingConfidence(undefined)).toBeNull();
  });
});
