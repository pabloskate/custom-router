export * from "./shared";

import {
  dedupeSourceList,
  type ModelIntelligenceGatewayPresetId,
  type ModelIntelligenceLens,
  type ModelIntelligenceLensId,
  getModelModalitySupport,
  type ModelIntelligenceModel,
  type ModelIntelligenceMetricFact,
  type ModelRegistryGatewayMapping,
  type ModelRegistryGatewayPresetId,
  type ModelRegistryEntry,
  type ModelRegistryCapabilities,
  type ModelRegistryGatewayOperationalData,
  type ModelRegistryLensId,
  type ModelRegistryMetricFact,
  type ProfileBuilderSource,
} from "./shared";
import { FRONTIER_REGISTRY_ENTRIES } from "./entries/frontier";
import { WORKHORSE_REGISTRY_ENTRIES } from "./entries/workhorses";
import { SPEED_AND_SPECIALIST_REGISTRY_ENTRIES } from "./entries/speed-and-specialists";
import { IMAGE_AND_OPEN_REGISTRY_ENTRIES } from "./entries/image-and-open";

export const MODEL_INTELLIGENCE: readonly ModelIntelligenceModel[] = [
  ...FRONTIER_REGISTRY_ENTRIES,
  ...WORKHORSE_REGISTRY_ENTRIES,
  ...SPEED_AND_SPECIALIST_REGISTRY_ENTRIES,
  ...IMAGE_AND_OPEN_REGISTRY_ENTRIES,
] as const;

const MODEL_INTELLIGENCE_BY_ID = new Map(
  MODEL_INTELLIGENCE.map((entry) => [entry.id, entry] as const),
);

type GatewayMappingOverride = Omit<ModelRegistryGatewayMapping, "operational">;

const GATEWAY_MAPPING_OVERRIDES = new Map<string, readonly GatewayMappingOverride[]>([
  [
    "google/gemini-3-flash-preview",
    [
      {
        gatewayPresetId: "openrouter",
        modelId: "google/gemini-3-flash-preview",
        displayName: "Gemini 3 Flash Preview",
      },
      {
        gatewayPresetId: "vercel",
        modelId: "google/gemini-3-flash",
        displayName: "Gemini 3 Flash",
      },
    ],
  ],
  [
    "z-ai/glm-5",
    [
      {
        gatewayPresetId: "openrouter",
        modelId: "z-ai/glm-5",
        displayName: "GLM 5",
      },
      {
        gatewayPresetId: "vercel",
        modelId: "zai/glm-5",
        displayName: "GLM 5",
      },
    ],
  ],
  [
    "x-ai/grok-4.20-beta",
    [
      {
        gatewayPresetId: "openrouter",
        modelId: "x-ai/grok-4.20-beta",
        displayName: "Grok 4.20 Beta",
      },
      {
        gatewayPresetId: "vercel",
        modelId: "xai/grok-4.20-reasoning-beta",
        displayName: "Grok 4.20 Beta Reasoning",
      },
    ],
  ],
  [
    "x-ai/grok-4.20-multi-agent-beta",
    [
      {
        gatewayPresetId: "openrouter",
        modelId: "x-ai/grok-4.20-multi-agent-beta",
        displayName: "Grok 4.20 Multi-Agent Beta",
      },
      {
        gatewayPresetId: "vercel",
        modelId: "xai/grok-4.20-multi-agent-beta",
        displayName: "Grok 4.20 Multi Agent Beta",
      },
    ],
  ],
  [
    "google/gemini-3-pro-image-preview",
    [
      {
        gatewayPresetId: "openrouter",
        modelId: "google/gemini-3-pro-image-preview",
        displayName: "Gemini 3 Pro Image Preview",
      },
      {
        gatewayPresetId: "vercel",
        modelId: "google/gemini-3-pro-image",
        displayName: "Gemini 3 Pro Image",
      },
    ],
  ],
  [
    "perplexity/sonar-pro-search",
    [
      {
        gatewayPresetId: "openrouter",
        modelId: "perplexity/sonar-pro-search",
        displayName: "Sonar Pro Search",
      },
      {
        gatewayPresetId: "vercel",
        modelId: "perplexity/sonar-pro",
        displayName: "Sonar Pro",
      },
    ],
  ],
]);

function buildGatewayOperationalData(
  model: ModelIntelligenceModel,
  gatewayPresetId: ModelRegistryGatewayPresetId,
): ModelRegistryGatewayOperationalData {
  const prefix = gatewayPresetId === "openrouter" ? "openrouter_" : "vercel_";
  const metrics = model.metrics.filter((metric) => metric.metricId.startsWith(prefix));
  const contextMetric = metrics.find((metric) => metric.metricId.endsWith("_context_window_tokens"));
  const inputMetric = metrics.find((metric) => metric.metricId.endsWith("_input_price_per_million"));
  const outputMetric = metrics.find((metric) => metric.metricId.endsWith("_output_price_per_million"));

  return {
    contextWindow: typeof contextMetric?.value === "number" ? contextMetric.value : undefined,
    inputPricePerMillion: typeof inputMetric?.value === "number" ? inputMetric.value : undefined,
    outputPricePerMillion: typeof outputMetric?.value === "number" ? outputMetric.value : undefined,
    structuredOutput: model.structuredOutput,
    toolUse: model.toolUse,
    vision: model.vision,
    verifiedAt: metrics[0]?.verifiedAt ?? model.lastVerified,
    sources: dedupeSourceList(metrics.map((metric) => metric.source)),
    note: metrics.length === 0
      ? `Gateway-specific context and pricing facts are not yet verified in the registry for ${gatewayPresetId}.`
      : undefined,
  };
}

function buildGatewayMappings(model: ModelIntelligenceModel): ModelRegistryGatewayMapping[] {
  const overrides = GATEWAY_MAPPING_OVERRIDES.get(model.id);
  if (overrides) {
    return overrides.map((override) => ({
      ...override,
      operational: buildGatewayOperationalData(model, override.gatewayPresetId),
    }));
  }

  return model.supportedGateways.map((gatewayPresetId) => ({
    gatewayPresetId,
    modelId: model.id,
    displayName: model.name,
    operational: buildGatewayOperationalData(model, gatewayPresetId),
  }));
}

function buildCapabilities(model: ModelIntelligenceModel): ModelRegistryCapabilities {
  const modality = getModelModalitySupport(model.modality);
  const metricIds = new Set(model.metrics.map((metric) => metric.metricId));
  const narrative = [
    model.derived.whenToUse,
    ...model.derived.strengths,
    ...(model.derived.caveats ?? []),
  ].join(" ").toLowerCase();

  return {
    nativeSearch:
      metricIds.has("openrouter_web_search_price_per_1k_calls")
      || model.id.includes("search")
      || narrative.includes("web-grounded")
      || narrative.includes("web search"),
    groundedSearch:
      metricIds.has("arena_search_grounding_rank")
      || metricIds.has("arena_search_variant_rank")
      || model.id.includes("grounding")
      || narrative.includes("grounded"),
    documentReasoning:
      metricIds.has("arena_document_rank")
      || model.derived.taskFamilies.includes("long_context")
      || narrative.includes("document"),
    imageGeneration:
      modality.output.includes("image")
      || model.lenses.some((lens) => lens.lens === "image_generation"),
    imageEditing:
      metricIds.has("arena_image_edit_rank")
      || narrative.includes("image edit")
      || narrative.includes("image editing"),
    fileInput: modality.input.includes("file"),
    audioInput: modality.input.includes("audio"),
    videoInput: modality.input.includes("video"),
    recommendedAsClassifier: model.lenses.some((lens) => lens.lens === "classifier_candidate"),
  };
}

export const MODEL_REGISTRY: readonly ModelRegistryEntry[] = MODEL_INTELLIGENCE.map((entry) => ({
  ...entry,
  canonicalModelId: entry.id,
  gatewayMappings: buildGatewayMappings(entry),
  capabilities: buildCapabilities(entry),
}));

const MODEL_REGISTRY_BY_ID = new Map(
  MODEL_REGISTRY.map((entry) => [entry.canonicalModelId, entry] as const),
);

function dedupeSources(sources: readonly ProfileBuilderSource[]): ProfileBuilderSource[] {
  return dedupeSourceList(sources);
}

function findLens(
  model: Pick<ModelIntelligenceModel, "lenses">,
  lens: ModelIntelligenceLensId,
): ModelIntelligenceLens | undefined {
  return model.lenses.find((entry) => entry.lens === lens);
}

export function getModelIntelligence(modelId: string): ModelIntelligenceModel | undefined {
  return MODEL_INTELLIGENCE_BY_ID.get(modelId);
}

export function getModelIntelligenceMetric(
  modelId: string,
  metricId: string,
): ModelIntelligenceMetricFact | undefined {
  return MODEL_INTELLIGENCE_BY_ID.get(modelId)?.metrics.find((metric) => metric.metricId === metricId);
}

export function listModelIntelligenceSources(model: ModelIntelligenceModel): ProfileBuilderSource[] {
  return dedupeSources(model.metrics.map((metric) => metric.source));
}

export function getModelRegistryEntry(modelId: string): ModelRegistryEntry | undefined {
  return MODEL_REGISTRY_BY_ID.get(modelId);
}

export function getModelRegistryMetric(
  modelId: string,
  metricId: string,
): ModelRegistryMetricFact | undefined {
  return MODEL_REGISTRY_BY_ID.get(modelId)?.metrics.find((metric) => metric.metricId === metricId);
}

export function listModelRegistrySources(model: ModelRegistryEntry): ProfileBuilderSource[] {
  return dedupeSources(model.metrics.map((metric) => metric.source));
}

export function listModelRegistryForLens(args: {
  lens: ModelRegistryLensId;
  gatewayPresetId?: ModelRegistryGatewayPresetId;
}): ModelRegistryEntry[] {
  return MODEL_REGISTRY
    .filter((entry) => findLens(entry, args.lens))
    .filter((entry) => args.gatewayPresetId
      ? entry.gatewayMappings.some((mapping) => mapping.gatewayPresetId === args.gatewayPresetId)
      : true)
    .sort((left, right) => {
      const leftLens = findLens(left, args.lens);
      const rightLens = findLens(right, args.lens);
      if (!leftLens || !rightLens) {
        return left.canonicalModelId.localeCompare(right.canonicalModelId);
      }
      return leftLens.rank - rightLens.rank || left.canonicalModelId.localeCompare(right.canonicalModelId);
    });
}

export function getTopModelRegistryEntryForLens(args: {
  lens: ModelRegistryLensId;
  gatewayPresetId?: ModelRegistryGatewayPresetId;
}): ModelRegistryEntry | undefined {
  return listModelRegistryForLens(args)[0];
}

export function getModelRegistryGatewayMapping(args: {
  canonicalModelId: string;
  gatewayPresetId: ModelRegistryGatewayPresetId;
}): ModelRegistryGatewayMapping | undefined {
  return MODEL_REGISTRY_BY_ID
    .get(args.canonicalModelId)
    ?.gatewayMappings.find((mapping) => mapping.gatewayPresetId === args.gatewayPresetId);
}

export function listModelIntelligenceForLens(args: {
  lens: ModelIntelligenceLensId;
  gatewayPresetId?: ModelIntelligenceGatewayPresetId;
}): ModelIntelligenceModel[] {
  return MODEL_INTELLIGENCE
    .filter((entry) => findLens(entry, args.lens))
    .filter((entry) => args.gatewayPresetId ? entry.supportedGateways.includes(args.gatewayPresetId) : true)
    .sort((left, right) => {
      const leftLens = findLens(left, args.lens);
      const rightLens = findLens(right, args.lens);
      if (!leftLens || !rightLens) {
        return left.id.localeCompare(right.id);
      }
      return leftLens.rank - rightLens.rank || left.id.localeCompare(right.id);
    });
}

export function getTopModelIntelligenceForLens(args: {
  lens: ModelIntelligenceLensId;
  gatewayPresetId?: ModelIntelligenceGatewayPresetId;
}): ModelIntelligenceModel | undefined {
  return listModelIntelligenceForLens(args)[0];
}
