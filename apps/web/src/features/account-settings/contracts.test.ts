import { describe, expect, it } from "vitest";

import { buildUserInfoUpdateRequest } from "./contracts";

describe("account settings contracts", () => {
  it("builds a partial update payload with only touched fields", () => {
    const payload = buildUserInfoUpdateRequest({
      expectedUpdatedAt: "2026-03-11T00:00:00.000Z",
      updates: {
        profiles: [{ id: "planning-backend", name: "Planning Backend", models: [] }],
        routingFrequency: "smart",
      },
    });

    expect(payload).toEqual({
      expected_updated_at: "2026-03-11T00:00:00.000Z",
      profiles: [{ id: "planning-backend", name: "Planning Backend", models: [] }],
      routing_frequency: "smart",
    });
  });

  it("preserves explicit nulls and booleans for clearing settings", () => {
    const payload = buildUserInfoUpdateRequest({
      expectedUpdatedAt: "2026-03-11T00:00:00.000Z",
      updates: {
        routeTriggerKeywords: null,
        routeLoggingEnabled: false,
      },
    });

    expect(payload).toEqual({
      expected_updated_at: "2026-03-11T00:00:00.000Z",
      route_trigger_keywords: null,
      route_logging_enabled: false,
    });
  });
});
