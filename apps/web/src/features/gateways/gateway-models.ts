import type { GatewayInfo, GatewayModel } from "@/src/features/gateways/contracts";

const DEFAULT_MODALITIES = [
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
] as const;
const DEFAULT_MODALITY_SET = new Set<string>(DEFAULT_MODALITIES);

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
  fetched: Array<Pick<GatewayModel, "id" | "name" | "modality">>,
): GatewayModel[] {
  const existingById = new Map(existing.map((model) => [model.id, model] as const));
  for (const fetchedModel of fetched) {
    if (!existingById.has(fetchedModel.id)) {
      existingById.set(fetchedModel.id, {
        id: fetchedModel.id,
        name: fetchedModel.name,
        modality: fetchedModel.modality,
      });
    }
  }
  return Array.from(existingById.values()).sort((left, right) => left.id.localeCompare(right.id));
}

export function removeGatewayModel(models: GatewayModel[], modelId: string): GatewayModel[] {
  return models.filter((model) => model.id !== modelId);
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

export function createGatewayModelDraft(model: GatewayModel): ManualGatewayModelDraft {
  return {
    modelId: model.id,
    name: model.name === model.id ? "" : model.name,
    modality: model.modality ?? "text->text",
    reasoningPreset: model.reasoningPreset ?? model.thinking ?? "provider_default",
    whenToUse: model.whenToUse ?? "",
    description: model.description ?? "",
  };
}

export function collectGatewayModalities(
  gateways: GatewayInfo[],
  selectedValues: Array<string | undefined> = [],
): string[] {
  const extras = new Set<string>();

  for (const gateway of gateways) {
    for (const model of gateway.models) {
      const modality = model.modality?.trim();
      if (modality && !DEFAULT_MODALITY_SET.has(modality)) {
        extras.add(modality);
      }
    }
  }

  for (const selectedValue of selectedValues) {
    const modality = selectedValue?.trim();
    if (modality && !DEFAULT_MODALITY_SET.has(modality)) {
      extras.add(modality);
    }
  }

  return [...DEFAULT_MODALITIES, ...Array.from(extras).sort((left, right) => left.localeCompare(right))];
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

export function upsertGatewayModel(
  models: GatewayModel[],
  draft: ManualGatewayModelDraft,
  previousModelId?: string,
): GatewayModel[] {
  const model = buildManualGatewayModel(draft);
  const targetId = previousModelId ?? model.id;
  const remaining = models.filter((entry) => entry.id !== targetId);
  return [...remaining, model].sort((left, right) => left.id.localeCompare(right.id));
}
