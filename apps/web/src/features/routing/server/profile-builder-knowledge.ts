import type {
  ProfileBuilderResearchMode,
  ProfileBuilderSource,
  ProfileBuilderTaskFamily,
} from "@/src/features/routing/profile-builder-contracts";
import {
  listModelRegistrySources,
  MODEL_REGISTRY,
  MODEL_REGISTRY_LAST_VERIFIED,
  type ModelRegistryCapabilities,
  type ModelRegistryContextBand,
  type ModelRegistryCostTier,
  type ModelRegistryEntry,
  type ModelRegistryGatewayMapping,
  type ModelRegistryGatewayPresetId,
  type ModelRegistryLens,
  type ModelRegistryMetricFact,
} from "./model-registry";

export type ProfileBuilderGatewayPresetId = ModelRegistryGatewayPresetId;
export type ProfileBuilderContextBand = ModelRegistryContextBand;
export type ProfileBuilderCostTier = ModelRegistryCostTier;

export interface ProfileBuilderKnowledgeModel {
  id: string;
  name: string;
  supportedGateways: readonly ProfileBuilderGatewayPresetId[];
  gatewayMappings: readonly ModelRegistryGatewayMapping[];
  modality?: string;
  contextBand: ProfileBuilderContextBand;
  costTier: ProfileBuilderCostTier;
  vision: boolean;
  structuredOutput: boolean;
  toolUse: boolean;
  quality: number;
  speed: number;
  cost: number;
  reliability: number;
  taskFamilies: readonly ProfileBuilderTaskFamily[];
  strengths: readonly string[];
  caveats: readonly string[];
  whenToUse: string;
  metrics: readonly ModelRegistryMetricFact[];
  lenses: readonly ModelRegistryLens[];
  capabilities: ModelRegistryCapabilities;
  lastVerified: string;
  sources: readonly ProfileBuilderSource[];
}

export const PROFILE_BUILDER_LAST_VERIFIED = MODEL_REGISTRY_LAST_VERIFIED;

function toProfileBuilderKnowledgeModel(model: ModelRegistryEntry): ProfileBuilderKnowledgeModel {
  return {
    id: model.id,
    name: model.name,
    supportedGateways: model.gatewayMappings.map((mapping) => mapping.gatewayPresetId),
    gatewayMappings: model.gatewayMappings,
    modality: model.modality,
    contextBand: model.derived.profileBuilder.contextBand,
    costTier: model.derived.profileBuilder.costTier,
    vision: model.vision,
    structuredOutput: model.structuredOutput,
    toolUse: model.toolUse,
    quality: model.derived.profileBuilder.quality,
    speed: model.derived.profileBuilder.speed,
    cost: model.derived.profileBuilder.cost,
    reliability: model.derived.profileBuilder.reliability,
    taskFamilies: model.derived.taskFamilies,
    strengths: model.derived.strengths,
    caveats: model.derived.caveats ?? [],
    whenToUse: model.derived.whenToUse,
    metrics: model.metrics,
    lenses: model.lenses,
    capabilities: model.capabilities,
    lastVerified: model.lastVerified,
    sources: listModelRegistrySources(model),
  };
}

export const PROFILE_BUILDER_KNOWLEDGE: readonly ProfileBuilderKnowledgeModel[] =
  MODEL_REGISTRY.map(toProfileBuilderKnowledgeModel);

const PROFILE_BUILDER_KNOWLEDGE_BY_MODEL_ID = new Map<string, ProfileBuilderKnowledgeModel>();

for (const model of PROFILE_BUILDER_KNOWLEDGE) {
  PROFILE_BUILDER_KNOWLEDGE_BY_MODEL_ID.set(model.id, model);
  for (const mapping of model.gatewayMappings) {
    PROFILE_BUILDER_KNOWLEDGE_BY_MODEL_ID.set(mapping.modelId, model);
  }
}

export function getProfileBuilderKnowledge(modelId: string): ProfileBuilderKnowledgeModel | undefined {
  return PROFILE_BUILDER_KNOWLEDGE_BY_MODEL_ID.get(modelId);
}

export function mergeProfileBuilderSources(
  sources: readonly ProfileBuilderSource[],
  extras: readonly ProfileBuilderSource[] = [],
): ProfileBuilderSource[] {
  const seen = new Set<string>();
  const merged = [...sources, ...extras].filter((source) => {
    const key = `${source.label}::${source.url}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
  return merged;
}

export function profileBuilderResearchModeFromVerification(usedLiveVerification: boolean): ProfileBuilderResearchMode {
  return usedLiveVerification ? "live_verified" : "catalog_only";
}
