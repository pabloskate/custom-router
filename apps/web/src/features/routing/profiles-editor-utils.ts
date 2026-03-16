"use client";

import type { RouterProfile, RouterProfileModel } from "@custom-router/core";

import type { GatewayInfo, GatewayModel } from "@/src/features/gateways/contracts";
import {
  buildProfileModelKey,
  getProfileIdValidationError,
  hasResolvedProfileModel,
  normalizeProfileIdInput,
  normalizeProfiles,
  normalizeProfile,
  normalizeProfileModel,
} from "@/src/lib/routing/profile-config";
import { ROUTING_PRESETS, type RoutingPreset } from "@/src/lib/routing-presets";

export type ProfilesAutosaveState = "saved" | "dirty" | "saving" | "error" | "invalid";

export interface ProfilesAutosaveSnapshot {
  state: ProfilesAutosaveState;
  message: string | null;
}

export const DEFAULT_AUTOSAVE_SNAPSHOT: ProfilesAutosaveSnapshot = {
  state: "saved",
  message: null,
};

export { getProfileIdValidationError, normalizeProfileIdInput } from "@/src/lib/routing/profile-config";

function sanitizeOptionalString(value: string | null | undefined): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function modelBindingCandidates(modelId?: string): string[] {
  const normalized = sanitizeOptionalString(modelId);
  if (!normalized) {
    return [];
  }

  const separatorIndex = normalized.indexOf(":");
  if (separatorIndex <= 0) {
    return [normalized];
  }

  const baseModelId = normalized.slice(0, separatorIndex);
  return baseModelId && baseModelId !== normalized ? [normalized, baseModelId] : [normalized];
}

function resolveGatewayModelMatch(
  gateways: GatewayInfo[],
  args: { gatewayId?: string; modelId?: string },
): { gatewayId: string; model: GatewayModel } | undefined {
  const candidates = modelBindingCandidates(args.modelId);
  if (candidates.length === 0) {
    return undefined;
  }

  if (args.gatewayId) {
    const gateway = gateways.find((candidate) => candidate.id === args.gatewayId);
    if (!gateway) {
      return undefined;
    }

    for (const modelId of candidates) {
      const model = gateway.models.find((candidate) => candidate.id === modelId);
      if (model) {
        return { gatewayId: gateway.id, model };
      }
    }

    return undefined;
  }

  const matches = gateways.flatMap((gateway) => {
    for (const modelId of candidates) {
      const model = gateway.models.find((candidate) => candidate.id === modelId);
      if (model) {
        return [{ gatewayId: gateway.id, model }];
      }
    }

    return [];
  });

  return matches.length === 1 ? matches[0] : undefined;
}

export function getGatewayModel(gateways: GatewayInfo[], gatewayId?: string, modelId?: string): GatewayModel | undefined {
  return resolveGatewayModelMatch(gateways, { gatewayId, modelId })?.model;
}

export function gatewayName(gateways: GatewayInfo[], gatewayId?: string): string {
  if (!gatewayId) {
    return "Unresolved";
  }

  return gateways.find((gateway) => gateway.id === gatewayId)?.name ?? gatewayId;
}

export function buildGatewayModelKeySet(gateways: GatewayInfo[]): Set<string> {
  return new Set(
    gateways.flatMap((gateway) =>
      gateway.models.map((model) => buildProfileModelKey(gateway.id, model.id)),
    ),
  );
}

export function syncProfileModelFromGateway(gateways: GatewayInfo[], model: RouterProfileModel): RouterProfileModel {
  const normalized = normalizeProfileModel(model);
  const gatewayModel = getGatewayModel(gateways, normalized.gatewayId, normalized.modelId);
  const reasoningPreset = normalized.reasoningPreset ?? normalized.thinking ?? gatewayModel?.reasoningPreset ?? gatewayModel?.thinking;

  return {
    ...normalized,
    name: normalized.name ?? gatewayModel?.name ?? normalized.modelId,
    modality: normalized.modality ?? gatewayModel?.modality,
    reasoningPreset,
    thinking: reasoningPreset ?? normalized.thinking ?? gatewayModel?.thinking,
    whenToUse: normalized.whenToUse ?? gatewayModel?.whenToUse,
    description: normalized.description ?? gatewayModel?.description,
  };
}

export function sanitizeProfileSelections(profile: RouterProfile, gateways: GatewayInfo[]): RouterProfile {
  const resolvedSelections = new Set(
    (profile.models ?? [])
      .filter(hasResolvedProfileModel)
      .map((model) => buildProfileModelKey(model.gatewayId, model.modelId)),
  );
  const gatewayModelKeys = buildGatewayModelKeySet(gateways);

  return {
    ...profile,
    defaultModel: profile.defaultModel && resolvedSelections.has(profile.defaultModel) ? profile.defaultModel : undefined,
    classifierModel: profile.classifierModel && gatewayModelKeys.has(profile.classifierModel) ? profile.classifierModel : undefined,
  };
}

export function normalizeProfilesForEditor(profiles: RouterProfile[] | null | undefined, gateways: GatewayInfo[]): RouterProfile[] {
  return (profiles ?? []).map((profile) => {
    const normalized = normalizeProfile(profile);
    const models = (normalized.models ?? []).map((model) => {
      const resolved = resolveGatewayModelMatch(gateways, model);
      const withGatewayId = resolved ? { ...model, gatewayId: resolved.gatewayId } : model;
      return syncProfileModelFromGateway(gateways, withGatewayId);
    });

    return sanitizeProfileSelections({
      ...normalized,
      models,
      routingInstructions: typeof profile.routingInstructions === "string"
        ? profile.routingInstructions
        : normalized.routingInstructions,
    }, gateways);
  });
}

export function summarizeInstructions(value?: string): string {
  const trimmed = value?.trim();
  if (!trimmed) {
    return "No routing instructions";
  }

  return trimmed.length > 72 ? `${trimmed.slice(0, 72).trim()}...` : trimmed;
}

export function countResolvedProfileModels(profile: RouterProfile): number {
  return (profile.models ?? []).filter(hasResolvedProfileModel).length;
}

export function getProfileStatus(profile: RouterProfile): {
  tone: "success" | "warning";
  label: string;
  needsSetup: boolean;
  resolvedCount: number;
  unresolvedCount: number;
} {
  const totalModels = (profile.models ?? []).length;
  const resolvedCount = countResolvedProfileModels(profile);
  const unresolvedCount = totalModels - resolvedCount;
  const hasInstructions = Boolean(profile.routingInstructions?.trim());
  const needsSetup = totalModels === 0 || !hasInstructions;

  if (needsSetup) {
    return {
      tone: "warning",
      label: "Needs setup",
      needsSetup,
      resolvedCount,
      unresolvedCount,
    };
  }

  if (unresolvedCount > 0) {
    return {
      tone: "warning",
      label: `${unresolvedCount} unresolved`,
      needsSetup,
      resolvedCount,
      unresolvedCount,
    };
  }

  return {
    tone: "success",
    label: `${resolvedCount} resolved`,
    needsSetup,
    resolvedCount,
    unresolvedCount,
  };
}

export function formatGatewayModelOptionLabel(gateways: GatewayInfo[], value: { gatewayId: string; modelId: string; name?: string }): string {
  const gatewayModel = getGatewayModel(gateways, value.gatewayId, value.modelId);
  const label = value.name || gatewayModel?.name || value.modelId;
  return `${label} · ${gatewayName(gateways, value.gatewayId)} · ${value.modelId}`;
}

export function availableGatewayModels(gateway: GatewayInfo | undefined, profile: RouterProfile, rowIndex?: number): GatewayModel[] {
  if (!gateway) {
    return [];
  }

  const takenModelIds = new Set(
    (profile.models ?? [])
      .filter((_, index) => index !== rowIndex)
      .map((model) => model.modelId)
      .filter(Boolean),
  );

  return gateway.models.filter((model) => !takenModelIds.has(model.id));
}

export function buildNextProfileModelDraft(): RouterProfileModel {
  return {
    modelId: "",
    name: "",
  };
}

export interface CustomModelDraft {
  gatewayId: string;
  modelId: string;
  name: string;
  modality: string;
  reasoningPreset: GatewayModel["reasoningPreset"];
  whenToUse: string;
  description: string;
}

export function createCustomModelDraft(gateways: GatewayInfo[]): CustomModelDraft {
  return {
    gatewayId: gateways[0]?.id ?? "",
    modelId: "",
    name: "",
    modality: "text->text",
    reasoningPreset: "none",
    whenToUse: "",
    description: "",
  };
}

function createSuggestedProfileModel(gateways: GatewayInfo[], presetModel: GatewayModel): RouterProfileModel {
  const match = resolveGatewayModelMatch(gateways, { modelId: presetModel.id });

  if (match) {
    return {
      gatewayId: match.gatewayId,
      modelId: presetModel.id,
      name: presetModel.name,
      modality: presetModel.modality,
      reasoningPreset: presetModel.reasoningPreset ?? presetModel.thinking,
      thinking: presetModel.reasoningPreset ?? presetModel.thinking,
      whenToUse: presetModel.whenToUse,
      description: presetModel.description,
    };
  }

  return {
    modelId: presetModel.id,
    name: presetModel.name,
    modality: presetModel.modality,
    reasoningPreset: presetModel.reasoningPreset ?? presetModel.thinking,
    thinking: presetModel.reasoningPreset ?? presetModel.thinking,
    whenToUse: presetModel.whenToUse,
    description: presetModel.description,
  };
}

export function createProfileFromPreset(preset: RoutingPreset, gateways: GatewayInfo[]): RouterProfile {
  const models = preset.models.map((model) => createSuggestedProfileModel(gateways, model));
  const resolvedPresetModels = models.filter(hasResolvedProfileModel);
  const defaultModel = resolvedPresetModels.find((model) => model.modelId === preset.defaultModel);
  const classifierModel = gateways.flatMap((gateway) =>
    gateway.models
      .filter((model) => model.id === preset.classifierModel)
      .map((model) => buildProfileModelKey(gateway.id, model.id)),
  )[0];

  return {
    id: preset.id,
    name: preset.name,
    description: preset.description,
    routingInstructions: preset.routingInstructions,
    defaultModel: defaultModel ? buildProfileModelKey(defaultModel.gatewayId, defaultModel.modelId) : undefined,
    classifierModel,
    models,
  };
}

export function getQuickSetupPresets(): readonly RoutingPreset[] {
  return ROUTING_PRESETS;
}

export function createBlankProfile(input?: { id?: string; name?: string }): RouterProfile {
  return {
    id: sanitizeOptionalString(input?.id) ?? "",
    name: sanitizeOptionalString(input?.name) ?? "",
    models: [],
  };
}

export function validateProfilesDraft(profiles: RouterProfile[], gateways: GatewayInfo[]): string | null {
  const seenProfileIds = new Set<string>();
  const validGatewayKeys = buildGatewayModelKeySet(gateways);

  for (const profile of profiles) {
    const profileId = profile.id.trim();
    const displayName = profile.name.trim();

    if (!profileId) {
      return "Every profile needs an ID before it can be saved.";
    }

    if (seenProfileIds.has(profileId)) {
      return `Profile ID "${profileId}" is duplicated. Profile IDs must be unique.`;
    }
    seenProfileIds.add(profileId);

    if (!displayName) {
      return `Profile "${profileId}" needs a display name before it can be saved.`;
    }

    const seenModelIds = new Set<string>();
    const resolvedKeys = new Set(
      (profile.models ?? [])
        .filter(hasResolvedProfileModel)
        .map((model) => buildProfileModelKey(model.gatewayId, model.modelId)),
    );

    for (const model of profile.models ?? []) {
      const normalized = normalizeProfileModel(model);
      if (!normalized.modelId.trim()) {
        return `Every model in "${displayName}" needs a model ID.`;
      }

      if (seenModelIds.has(normalized.modelId)) {
        return `Profile "${displayName}" includes "${normalized.modelId}" more than once.`;
      }
      seenModelIds.add(normalized.modelId);
    }

    if (profile.defaultModel && !resolvedKeys.has(profile.defaultModel)) {
      return `Profile "${displayName}" has an invalid fallback model selection.`;
    }

    if (profile.classifierModel && !validGatewayKeys.has(profile.classifierModel)) {
      return `Profile "${displayName}" has an invalid router model selection.`;
    }
  }

  return null;
}
