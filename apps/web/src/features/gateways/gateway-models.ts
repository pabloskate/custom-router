import type { GatewayModel } from "@/src/features/gateways/contracts";

export interface ManualGatewayModelDraft {
  description: string;
  modality: string;
  modelId: string;
  name: string;
  reasoningPreset: GatewayModel["reasoningPreset"];
  whenToUse: string;
}

export function mergeFetchedGatewayModels(
  existing: GatewayModel[],
  fetched: Array<Pick<GatewayModel, "id" | "name">>,
): GatewayModel[] {
  const existingById = new Map(existing.map((model) => [model.id, model] as const));
  for (const fetchedModel of fetched) {
    if (!existingById.has(fetchedModel.id)) {
      existingById.set(fetchedModel.id, { id: fetchedModel.id, name: fetchedModel.name });
    }
  }
  return Array.from(existingById.values()).sort((left, right) => left.id.localeCompare(right.id));
}

export function createManualGatewayModelDraft(): ManualGatewayModelDraft {
  return {
    modelId: "",
    name: "",
    modality: "text->text",
    reasoningPreset: "provider_default",
    whenToUse: "",
    description: "",
  };
}

export function buildManualGatewayModel(draft: ManualGatewayModelDraft): GatewayModel {
  const id = draft.modelId.trim();
  const name = draft.name.trim() || id;
  const modality = draft.modality.trim();
  const whenToUse = draft.whenToUse.trim();
  const description = draft.description.trim();

  return {
    id,
    name,
    modality: modality || undefined,
    reasoningPreset: draft.reasoningPreset,
    thinking: draft.reasoningPreset,
    whenToUse: whenToUse || undefined,
    description: description || undefined,
  };
}
