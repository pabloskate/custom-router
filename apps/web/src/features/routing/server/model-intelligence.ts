// Deprecated compatibility shim.
// Prefer importing from "./model-registry" for recommendation/setup work.

export {
  getModelIntelligence,
  getModelIntelligenceMetric,
  getTopModelIntelligenceForLens,
  listModelIntelligenceForLens,
  listModelIntelligenceSources,
  MODEL_INTELLIGENCE,
  MODEL_INTELLIGENCE_LAST_VERIFIED,
  MODEL_INTELLIGENCE_LENS_IDS,
  type ModelIntelligenceContextBand,
  type ModelIntelligenceCostTier,
  type ModelIntelligenceDerivedMetadata,
  type ModelIntelligenceGatewayPresetId,
  type ModelIntelligenceLens,
  type ModelIntelligenceLensId,
  type ModelIntelligenceMetricDirection,
  type ModelIntelligenceMetricFact,
  type ModelIntelligenceMetricKind,
  type ModelIntelligenceModel,
  type ModelIntelligenceProfileBuilderMetadata,
} from "./model-registry";
