import { describe, expect, it } from "vitest";

import { updateGatewaySchema } from "./schemas";

describe("updateGatewaySchema", () => {
  it("accepts gateway models with reasoningPreset", () => {
    const parsed = updateGatewaySchema.safeParse({
      models: [
        {
          id: "openai/gpt-5.2:high",
          name: "GPT-5.2 High",
          reasoningPreset: "high",
          thinking: "high",
        },
      ],
    });

    expect(parsed.success).toBe(true);
  });

  it("rejects duplicate gateway model ids", () => {
    const parsed = updateGatewaySchema.safeParse({
      models: [
        { id: "openai/gpt-5.2", name: "GPT-5.2" },
        { id: "openai/gpt-5.2", name: "GPT-5.2 Duplicate" },
      ],
    });

    expect(parsed.success).toBe(false);
  });
});
