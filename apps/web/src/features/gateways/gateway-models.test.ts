import { describe, expect, it } from "vitest";

import {
  buildManualGatewayModel,
  collectGatewayModalities,
  createGatewayModelDraft,
  createManualGatewayModelDraft,
  mergeFetchedGatewayModels,
  removeGatewayModel,
  upsertGatewayModel,
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
        { id: "custom/model-a", name: "Fetched name", modality: "text,image->text" },
        { id: "custom/model-b", name: "Model B", modality: "text,image->text" },
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
        modality: "text,image->text",
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

  it("creates editable drafts from saved gateway models", () => {
    const draft = createGatewayModelDraft({
      id: "openai/gpt-5",
      name: "GPT-5",
      modality: "text,image->text",
      reasoningPreset: "high",
      whenToUse: "Complex planning",
      description: "Best for long reasoning chains.",
    });

    expect(draft).toEqual({
      modelId: "openai/gpt-5",
      name: "GPT-5",
      modality: "text,image->text",
      reasoningPreset: "high",
      whenToUse: "Complex planning",
      description: "Best for long reasoning chains.",
    });
  });

  it("collects shared modality options with defaults and existing model values", () => {
    const modalities = collectGatewayModalities(
      [
        {
          id: "gateway-a",
          name: "Gateway A",
          baseUrl: "https://example.com",
          createdAt: "2026-04-13T00:00:00.000Z",
          updatedAt: "2026-04-13T00:00:00.000Z",
          models: [
            { id: "model-a", name: "Model A", modality: "text,image,file->text,image" },
          ],
        },
      ],
      ["text,video->text"],
    );

    expect(modalities).toEqual([
      "text->text",
      "text,image->text",
      "text,image->text,image",
      "text->image",
      "text,image,video->text",
      "text,image,file->text",
      "text,image,file->text,image",
      "text,image,file,audio,video->text",
      "text,audio->text",
      "text->audio",
      "text,video->text",
    ]);
  });

  it("updates an existing model entry in place and preserves sorting", () => {
    const models = upsertGatewayModel(
      [
        { id: "custom/model-b", name: "Model B" },
        { id: "custom/model-a", name: "Model A" },
      ],
      {
        modelId: "custom/model-b",
        name: "Model B Updated",
        modality: "text,image->text",
        reasoningPreset: "high",
        whenToUse: "Vision tasks",
        description: "Updated details",
      },
      "custom/model-b",
    );

    expect(models).toEqual([
      { id: "custom/model-a", name: "Model A" },
      {
        id: "custom/model-b",
        name: "Model B Updated",
        modality: "text,image->text",
        reasoningPreset: "high",
        thinking: "high",
        whenToUse: "Vision tasks",
        description: "Updated details",
      },
    ]);
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
