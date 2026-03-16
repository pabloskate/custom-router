import { describe, expect, it } from "vitest";

import {
  buildManualGatewayModel,
  createManualGatewayModelDraft,
  mergeFetchedGatewayModels,
} from "@/src/features/gateways/inventory";

describe("gateway inventory helpers", () => {
  it("preserves existing manual metadata when fetched inventory overlaps", () => {
    const models = mergeFetchedGatewayModels(
      [
        {
          id: "custom/model-a",
          name: "Model A",
          description: "manual seed",
        },
      ],
      [
        { id: "custom/model-a", name: "Fetched name" },
        { id: "custom/model-b", name: "Model B" },
      ],
    );

    expect(models).toEqual([
      {
        id: "custom/model-a",
        name: "Model A",
        description: "manual seed",
      },
      {
        id: "custom/model-b",
        name: "Model B",
      },
    ]);
  });

  it("builds manual models with trimmed ids and default names", () => {
    const draft = createManualGatewayModelDraft();
    const model = buildManualGatewayModel({
      ...draft,
      modelId: " custom/model-a ",
      whenToUse: " general chat ",
    });

    expect(model).toEqual({
      id: "custom/model-a",
      name: "custom/model-a",
      modality: "text->text",
      reasoningPreset: "none",
      thinking: "none",
      whenToUse: "general chat",
      description: undefined,
    });
  });
});
