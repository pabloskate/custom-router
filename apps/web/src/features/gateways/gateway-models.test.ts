import { describe, expect, it } from "vitest";

import {
  buildManualGatewayModel,
  createManualGatewayModelDraft,
  mergeFetchedGatewayModels,
  removeGatewayModel,
} from "@/src/features/gateways/gateway-models";

describe("gateway model merge helpers", () => {
  it("preserves existing manual metadata when fetched models overlap", () => {
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
      reasoningPreset: "provider_default",
      thinking: "provider_default",
      whenToUse: "general chat",
      description: undefined,
    });
  });

  it("removes only the selected gateway model from the inventory", () => {
    const models = removeGatewayModel(
      [
        { id: "custom/model-a", name: "Model A" },
        { id: "custom/model-b", name: "Model B" },
      ],
      "custom/model-a",
    );

    expect(models).toEqual([
      { id: "custom/model-b", name: "Model B" },
    ]);
  });
});
