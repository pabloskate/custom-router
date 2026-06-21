import { describe, expect, it } from "vitest";

import { normalizeBaseUrl } from "../src/config.js";

describe("vision helper config", () => {
  it("normalizes CustomRouter origins and API-root URLs", () => {
    expect(normalizeBaseUrl("https://customrouter.ai")).toBe("https://customrouter.ai");
    expect(normalizeBaseUrl("https://customrouter.ai/")).toBe("https://customrouter.ai");
    expect(normalizeBaseUrl("https://customrouter.ai/api")).toBe("https://customrouter.ai");
    expect(normalizeBaseUrl("https://customrouter.ai/api/v1")).toBe("https://customrouter.ai");
    expect(normalizeBaseUrl("https://customrouter.ai/team/api/v1")).toBe("https://customrouter.ai/team");
  });
});
