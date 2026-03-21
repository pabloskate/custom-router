// Canonical hard-coded model registry for setup/profile recommendations.
// This dataset is intentionally separate from runtime gateway inventories.

import type {
  ProfileBuilderSource,
  ProfileBuilderTaskFamily,
} from "@/src/features/routing/profile-builder-contracts";
export type {
  ProfileBuilderSource,
  ProfileBuilderTaskFamily,
} from "@/src/features/routing/profile-builder-contracts";

export type ModelIntelligenceGatewayPresetId = "openrouter" | "vercel";
export type ModelIntelligenceContextBand = "standard" | "long" | "ultra";
export type ModelIntelligenceCostTier = "budget" | "efficient" | "mid" | "premium";

export type ModelRegistryGatewayPresetId = ModelIntelligenceGatewayPresetId;
export type ModelRegistryContextBand = ModelIntelligenceContextBand;
export type ModelRegistryCostTier = ModelIntelligenceCostTier;

export type ModelIntelligenceMetricKind =
  | "benchmark"
  | "cost"
  | "latency"
  | "throughput"
  | "context"
  | "capability";

export type ModelIntelligenceMetricDirection =
  | "higher_better"
  | "lower_better"
  | "neutral";

export type ModelRegistryMetricKind = ModelIntelligenceMetricKind;
export type ModelRegistryMetricDirection = ModelIntelligenceMetricDirection;

export const MODEL_INTELLIGENCE_LENS_IDS = [
  "overall_quality",
  "coding_quality",
  "coding_value",
  "frontend_ui",
  "throughput",
  "ttft",
  "long_context",
  "research",
  "multimodal",
  "structured_output",
  "classifier_candidate",
  "budget_text",
  "open_source",
  "image_generation",
] as const;

export type ModelIntelligenceLensId = (typeof MODEL_INTELLIGENCE_LENS_IDS)[number];
export const MODEL_REGISTRY_LENS_IDS = MODEL_INTELLIGENCE_LENS_IDS;
export type ModelRegistryLensId = ModelIntelligenceLensId;

export interface ModelIntelligenceMetricFact {
  metricId: string;
  label: string;
  kind: ModelIntelligenceMetricKind;
  value: number | string | boolean;
  unit: string;
  direction: ModelIntelligenceMetricDirection;
  source: ProfileBuilderSource;
  verifiedAt: string;
  note?: string;
}

export type ModelRegistryMetricFact = ModelIntelligenceMetricFact;

export interface ModelIntelligenceLens {
  lens: ModelIntelligenceLensId;
  rank: number;
  rationale: string;
}

export type ModelRegistryLens = ModelIntelligenceLens;

export interface ModelIntelligenceProfileBuilderMetadata {
  contextBand: ModelIntelligenceContextBand;
  costTier: ModelIntelligenceCostTier;
  quality: number;
  speed: number;
  cost: number;
  reliability: number;
}

export type ModelRegistryProfileBuilderMetadata = ModelIntelligenceProfileBuilderMetadata;

export interface ModelIntelligenceDerivedMetadata {
  taskFamilies: readonly ProfileBuilderTaskFamily[];
  strengths: readonly string[];
  caveats?: readonly string[];
  whenToUse: string;
  profileBuilder: ModelIntelligenceProfileBuilderMetadata;
}

export type ModelRegistryDerivedMetadata = ModelIntelligenceDerivedMetadata;

export interface ModelIntelligenceModel {
  id: string;
  name: string;
  supportedGateways: readonly ModelIntelligenceGatewayPresetId[];
  modality?: string;
  openSource: boolean;
  structuredOutput: boolean;
  toolUse: boolean;
  vision: boolean;
  contextWindow?: number;
  lastVerified: string;
  metrics: readonly ModelIntelligenceMetricFact[];
  lenses: readonly ModelIntelligenceLens[];
  derived: ModelIntelligenceDerivedMetadata;
}

export interface ModelRegistryCapabilities {
  nativeSearch: boolean;
  groundedSearch: boolean;
  documentReasoning: boolean;
  imageGeneration: boolean;
  imageEditing: boolean;
  fileInput: boolean;
  audioInput: boolean;
  videoInput: boolean;
  recommendedAsClassifier: boolean;
}

export interface ModelRegistryGatewayOperationalData {
  contextWindow?: number;
  inputPricePerMillion?: number;
  outputPricePerMillion?: number;
  structuredOutput: boolean;
  toolUse: boolean;
  vision: boolean;
  verifiedAt: string;
  sources: readonly ProfileBuilderSource[];
  note?: string;
}

export interface ModelRegistryGatewayMapping {
  gatewayPresetId: ModelRegistryGatewayPresetId;
  modelId: string;
  displayName: string;
  operational: ModelRegistryGatewayOperationalData;
}

export interface ModelRegistryEntry extends ModelIntelligenceModel {
  canonicalModelId: string;
  gatewayMappings: readonly ModelRegistryGatewayMapping[];
  capabilities: ModelRegistryCapabilities;
}

export const MODEL_INTELLIGENCE_LAST_VERIFIED = "2026-03-21";
export const MODEL_REGISTRY_LAST_VERIFIED = MODEL_INTELLIGENCE_LAST_VERIFIED;

export function source(label: string, url: string): ProfileBuilderSource {
  return {
    label,
    url,
    verifiedAt: MODEL_INTELLIGENCE_LAST_VERIFIED,
  };
}

export function fact(args: Omit<ModelIntelligenceMetricFact, "verifiedAt">): ModelIntelligenceMetricFact {
  return {
    ...args,
    verifiedAt: args.source.verifiedAt,
  };
}

export function artificialAnalysisSource(slug: string, label: string): ProfileBuilderSource {
  return source(label, `https://artificialanalysis.ai/models/${slug}`);
}

export function openRouterSource(): ProfileBuilderSource {
  return source("OpenRouter models API", "https://openrouter.ai/api/v1/models");
}

export function vercelModelsSource(): ProfileBuilderSource {
  return source("Vercel AI Gateway models endpoint", "https://ai-gateway.vercel.sh/v1/models");
}

export function arenaSource(path: string, label: string): ProfileBuilderSource {
  return source(label, `https://arena.ai${path}`);
}

export function designArenaSource(path: string, label: string): ProfileBuilderSource {
  return source(label, `https://www.designarena.ai${path}`);
}

export function parseModalityTokens(segment: string | undefined): string[] {
  if (!segment) {
    return [];
  }
  return segment
    .split(/[,+]/)
    .map((token) => token.trim().toLowerCase())
    .filter(Boolean);
}

export function getModelModalitySupport(modality?: string): { input: string[]; output: string[] } {
  const raw = modality?.trim().toLowerCase();
  if (!raw) {
    return { input: [], output: [] };
  }
  const [inputSegment, outputSegment] = raw.split("->", 2);
  return {
    input: parseModalityTokens(inputSegment),
    output: parseModalityTokens(outputSegment ?? inputSegment),
  };
}

export function dedupeSourceList(sources: readonly ProfileBuilderSource[]): ProfileBuilderSource[] {
  const seen = new Set<string>();
  return sources.filter((item) => {
    const key = `${item.label}::${item.url}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

export function openRouterOperationalFacts(args: {
  contextWindow: number;
  inputPricePerMillion: number;
  outputPricePerMillion: number;
}): ModelIntelligenceMetricFact[] {
  const apiSource = openRouterSource();
  return [
    fact({
      metricId: "openrouter_context_window_tokens",
      label: "OpenRouter context window",
      kind: "context",
      value: args.contextWindow,
      unit: "tokens",
      direction: "higher_better",
      source: apiSource,
    }),
    fact({
      metricId: "openrouter_input_price_per_million",
      label: "OpenRouter input price",
      kind: "cost",
      value: args.inputPricePerMillion,
      unit: "usd_per_million_tokens",
      direction: "lower_better",
      source: apiSource,
    }),
    fact({
      metricId: "openrouter_output_price_per_million",
      label: "OpenRouter output price",
      kind: "cost",
      value: args.outputPricePerMillion,
      unit: "usd_per_million_tokens",
      direction: "lower_better",
      source: apiSource,
    }),
  ];
}

export function vercelOperationalFacts(args: {
  contextWindow: number;
  inputPricePerMillion: number;
  outputPricePerMillion: number;
}): ModelIntelligenceMetricFact[] {
  const apiSource = vercelModelsSource();
  return [
    fact({
      metricId: "vercel_context_window_tokens",
      label: "Vercel context window",
      kind: "context",
      value: args.contextWindow,
      unit: "tokens",
      direction: "higher_better",
      source: apiSource,
    }),
    fact({
      metricId: "vercel_input_price_per_million",
      label: "Vercel input price",
      kind: "cost",
      value: args.inputPricePerMillion,
      unit: "usd_per_million_tokens",
      direction: "lower_better",
      source: apiSource,
    }),
    fact({
      metricId: "vercel_output_price_per_million",
      label: "Vercel output price",
      kind: "cost",
      value: args.outputPricePerMillion,
      unit: "usd_per_million_tokens",
      direction: "lower_better",
      source: apiSource,
    }),
  ];
}

export function artificialAnalysisFacts(args: {
  slug: string;
  label: string;
  intelligenceIndex: number;
  outputTps?: number;
  ttftSeconds?: number;
  note?: string;
}): ModelIntelligenceMetricFact[] {
  const modelSource = artificialAnalysisSource(args.slug, args.label);
  const results: ModelIntelligenceMetricFact[] = [
    fact({
      metricId: "artificial_analysis_intelligence_index",
      label: "Artificial Analysis Intelligence Index",
      kind: "benchmark",
      value: args.intelligenceIndex,
      unit: "index",
      direction: "higher_better",
      source: modelSource,
      note: args.note,
    }),
  ];

  if (typeof args.outputTps === "number") {
    results.push(
      fact({
        metricId: "artificial_analysis_output_tps",
        label: "Artificial Analysis output speed",
        kind: "throughput",
        value: args.outputTps,
        unit: "tokens_per_second",
        direction: "higher_better",
        source: modelSource,
        note: args.note,
      }),
    );
  }

  if (typeof args.ttftSeconds === "number") {
    results.push(
      fact({
        metricId: "artificial_analysis_ttft_seconds",
        label: "Artificial Analysis TTFT",
        kind: "latency",
        value: args.ttftSeconds,
        unit: "seconds",
        direction: "lower_better",
        source: modelSource,
        note: args.note,
      }),
    );
  }

  return results;
}

export function benchmarkClaimFact(args: {
  metricId: string;
  label: string;
  value: number | string;
  unit: string;
  source: ProfileBuilderSource;
  note?: string;
}): ModelIntelligenceMetricFact {
  return fact({
    metricId: args.metricId,
    label: args.label,
    kind: "benchmark",
    value: args.value,
    unit: args.unit,
    direction: "higher_better",
    source: args.source,
    note: args.note,
  });
}
