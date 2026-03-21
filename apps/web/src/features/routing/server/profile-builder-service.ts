import type { CatalogItem, RouterProfile, RouterProfileModel } from "@custom-router/core";

import type { AuthResult } from "@/src/lib/auth";
import { decryptByokSecret, resolveByokEncryptionSecret } from "@/src/lib/auth";
import { json } from "@/src/lib/infra";
import {
  buildProfileModelKey,
  getProfileIdValidationError,
  normalizeProfileIdInput,
  normalizeProfiles,
} from "@/src/lib/routing/profile-config";
import { profileBuilderApplySchema, profileBuilderRequestSchema } from "@/src/lib/schemas";
import { gatewayRowToPublic, loadGatewaysWithMigration } from "@/src/lib/storage";
import { callOpenAiCompatible, normalizeBaseUrl } from "@/src/lib/upstream/upstream";
import { getGatewayPresetId } from "@/src/lib/routing-presets";
import { parseJsonBody } from "@/src/lib/auth/route-helpers";
import type { RouterRuntimeBindings } from "@/src/lib/infra/runtime-bindings";
import type { GatewayRowPublic } from "@/src/lib/storage";
import type {
  ProfileBuilderExecutor,
  ProfileBuilderRecommendation,
  ProfileBuilderRequest,
  ProfileBuilderRejection,
  ProfileBuilderRun,
  ProfileBuilderSource,
  ProfileBuilderTaskFamily,
} from "@/src/features/routing/profile-builder-contracts";
import {
  completeProfileBuilderRun,
  failProfileBuilderRun,
  getProfileBuilderRun,
  insertProfileBuilderRun,
} from "./profile-builder-store";
import {
  getProfileBuilderKnowledge,
  mergeProfileBuilderSources,
  profileBuilderResearchModeFromVerification,
  PROFILE_BUILDER_LAST_VERIFIED,
  type ProfileBuilderGatewayPresetId,
  type ProfileBuilderKnowledgeModel,
} from "./profile-builder-knowledge";
import { listModelRegistryForLens } from "./model-registry";
import { validateModelId } from "@/src/lib/upstream/openrouter-models";

interface BuilderGateway extends GatewayRowPublic {
  name: string;
  presetId: ProfileBuilderGatewayPresetId;
}

export interface BuilderCandidate {
  gatewayId: string;
  gatewayName: string;
  gatewayPresetId: ProfileBuilderGatewayPresetId;
  model: CatalogItem;
  knowledge: ProfileBuilderKnowledgeModel;
  score: number;
  liveVerified: boolean;
  contextSummary?: string;
  costSummary?: string;
}

interface BuilderPlan {
  summary: string;
  routedModelIds: string[];
  defaultModelId: string;
  classifierModelId: string;
  recommendations: Array<{
    modelId: string;
    roleLabel: string;
    rationale: string;
  }>;
  rejections: Array<{
    modelId: string;
    reason: string;
  }>;
  routingInstructions: string;
}

interface ChatCompletionJson {
  choices?: Array<{
    message?: {
      content?: unknown;
    };
  }>;
}

const SUPPORTED_GATEWAY_PRESET_IDS = new Set<ProfileBuilderGatewayPresetId>(["openrouter", "vercel"]);
const EXECUTOR_MODEL_PREFERENCE = [
  "openai/gpt-5.4-mini",
  "anthropic/claude-haiku-4.5",
  "google/gemini-3.1-flash-lite-preview",
  "google/gemini-3-flash-preview",
  "google/gemini-3-flash",
] as const;

function runId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2, 10)}`;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function splitTerms(value?: string): string[] {
  return (value ?? "")
    .split(/[,\n]/g)
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
}

function normalizeAdditionalContext(value?: string): string | undefined {
  const normalized = value?.trim();
  return normalized ? normalized : undefined;
}

function includesImage(modality?: string): boolean {
  return modality?.toLowerCase().includes("image") ?? false;
}

function outputsGeneratedImage(modality?: string): boolean {
  const output = modality?.split("->")[1]?.toLowerCase();
  return output?.includes("image") ?? false;
}

function inferSyntheticCapabilities(model: CatalogItem, taskFamilies: readonly ProfileBuilderTaskFamily[], structuredOutput: boolean, toolUse: boolean): ProfileBuilderKnowledgeModel["capabilities"] {
  const modality = model.modality?.toLowerCase() ?? "";
  const hintText = `${model.whenToUse ?? ""} ${model.description ?? ""} ${model.name ?? ""}`.toLowerCase();

  return {
    nativeSearch: model.id.includes("search") || hintText.includes("web search"),
    groundedSearch: model.id.includes("grounding") || hintText.includes("grounded"),
    documentReasoning: taskFamilies.includes("long_context") || hintText.includes("document"),
    imageGeneration: outputsGeneratedImage(model.modality),
    imageEditing: hintText.includes("image edit") || hintText.includes("image editing"),
    fileInput: modality.includes("file"),
    audioInput: modality.includes("audio"),
    videoInput: modality.includes("video"),
    recommendedAsClassifier: structuredOutput && !outputsGeneratedImage(model.modality),
  };
}

function syntheticContextBand(model: CatalogItem): "standard" | "long" | "ultra" {
  const text = `${model.whenToUse ?? ""} ${model.description ?? ""} ${model.name ?? ""}`.toLowerCase();
  if (text.includes("2m") || text.includes("1m") || text.includes("1m ctx") || text.includes("1m context")) {
    return "ultra";
  }
  if (text.includes("400k") || text.includes("256k") || text.includes("200k") || text.includes("long-context") || text.includes("long context")) {
    return "long";
  }
  return "standard";
}

function syntheticCostTier(model: CatalogItem): "budget" | "efficient" | "mid" | "premium" {
  const text = `${model.whenToUse ?? ""} ${model.description ?? ""}`.toLowerCase();
  if (text.includes("cheapest") || text.includes("budget") || text.includes("$0.") || text.includes("low-cost")) {
    return "budget";
  }
  if (text.includes("fraction of the cost") || text.includes("cost-quality") || text.includes("cost-performance")) {
    return "efficient";
  }
  if (text.includes("premium") || text.includes("highest-stakes") || text.includes("$5/") || text.includes("$15/")) {
    return "premium";
  }
  return "mid";
}

function inferTaskFamilies(model: CatalogItem): ProfileBuilderTaskFamily[] {
  const text = `${model.whenToUse ?? ""} ${model.description ?? ""} ${model.name ?? ""}`.toLowerCase();
  const families = new Set<ProfileBuilderTaskFamily>();
  if (text.includes("coding") || text.includes("code") || text.includes("implementation") || text.includes("debug")) {
    families.add("coding");
  }
  if (text.includes("agent") || text.includes("tool") || text.includes("orchestration")) {
    families.add("agentic_coding");
  }
  if (text.includes("research") || text.includes("analysis")) {
    families.add("research");
  }
  if (text.includes("support") || text.includes("triage") || text.includes("customer")) {
    families.add("support");
  }
  if (text.includes("context") || text.includes("repo") || text.includes("transcript") || text.includes("long")) {
    families.add("long_context");
  }
  if (includesImage(model.modality)) {
    families.add("multimodal");
  }
  if (families.size === 0) {
    families.add("general");
  }
  return [...families];
}

function synthesizeKnowledge(model: CatalogItem, gatewayPresetId: ProfileBuilderGatewayPresetId): ProfileBuilderKnowledgeModel {
  const taskFamilies = inferTaskFamilies(model);
  const text = `${model.whenToUse ?? ""} ${model.description ?? ""}`.toLowerCase();
  const structuredOutput = text.includes("json") || text.includes("structured") || model.id.includes("gpt-5");
  const toolUse = text.includes("tool") || text.includes("agent") || model.id.includes("gpt-5");

  return {
    id: model.id,
    name: model.name ?? model.id,
    supportedGateways: [gatewayPresetId],
    gatewayMappings: [
      {
        gatewayPresetId,
        modelId: model.id,
        displayName: model.name ?? model.id,
        operational: {
          structuredOutput,
          toolUse,
          vision: includesImage(model.modality),
          verifiedAt: PROFILE_BUILDER_LAST_VERIFIED,
          sources: [],
          note: "Derived from synced gateway model metadata; registry-backed gateway operational facts were not available.",
        },
      },
    ],
    modality: model.modality,
    contextBand: syntheticContextBand(model),
    costTier: syntheticCostTier(model),
    vision: includesImage(model.modality),
    structuredOutput,
    toolUse,
    quality: taskFamilies.includes("coding") || taskFamilies.includes("research") ? 2 : 1,
    speed: syntheticCostTier(model) === "premium" ? 1 : 2,
    cost: syntheticCostTier(model) === "budget" ? 3 : syntheticCostTier(model) === "efficient" ? 2 : 1,
    reliability: structuredOutput ? 2 : 1,
    taskFamilies,
    strengths: [model.whenToUse ?? "Derived from synced gateway model metadata."],
    caveats: [],
    whenToUse: model.whenToUse ?? model.description ?? "Derived from synced gateway model metadata.",
    metrics: [],
    lenses: [],
    capabilities: inferSyntheticCapabilities(model, taskFamilies, structuredOutput, toolUse),
    lastVerified: PROFILE_BUILDER_LAST_VERIFIED,
    sources: [
      {
        label: "Synced gateway model metadata",
        url: "about:blank",
        verifiedAt: PROFILE_BUILDER_LAST_VERIFIED,
      },
    ],
  };
}

function findCandidateKnowledge(model: CatalogItem, gatewayPresetId: ProfileBuilderGatewayPresetId): ProfileBuilderKnowledgeModel {
  const exact = getProfileBuilderKnowledge(model.id);
  if (exact) {
    return exact;
  }
  if (model.upstreamModelId) {
    const upstream = getProfileBuilderKnowledge(model.upstreamModelId);
    if (upstream) {
      return upstream;
    }
  }
  return synthesizeKnowledge(model, gatewayPresetId);
}

function modelMatchesTerms(model: CatalogItem, knowledge: ProfileBuilderKnowledgeModel, terms: string[]): boolean {
  if (terms.length === 0) {
    return false;
  }
  const haystack = `${model.id}\n${model.name ?? ""}\n${knowledge.name}\n${knowledge.whenToUse}\n${knowledge.strengths.join(" ")}`
    + `\n${knowledge.caveats.join(" ")}`
    + `\n${Object.entries(knowledge.capabilities).filter(([, enabled]) => enabled).map(([name]) => name).join(" ")}`
    .toLowerCase();
  return terms.some((term) => haystack.includes(term));
}

function getGatewayOperationalData(
  knowledge: ProfileBuilderKnowledgeModel,
  gatewayPresetId: ProfileBuilderGatewayPresetId,
) {
  return knowledge.gatewayMappings.find((mapping) => mapping.gatewayPresetId === gatewayPresetId)?.operational;
}

function getMetricNumber(knowledge: ProfileBuilderKnowledgeModel, metricId: string): number | undefined {
  const metric = knowledge.metrics.find((entry) => entry.metricId === metricId);
  return typeof metric?.value === "number" ? metric.value : undefined;
}

function getLensRank(knowledge: ProfileBuilderKnowledgeModel, lens: string): number | undefined {
  return knowledge.lenses.find((entry) => entry.lens === lens)?.rank;
}

function rankBonus(rank: number | undefined, maxPoints: number): number {
  if (!rank || rank <= 0) {
    return 0;
  }
  return Math.max(maxPoints - rank + 1, 0);
}

function scorePriceByMillion(totalPricePerMillion: number | undefined): number {
  if (typeof totalPricePerMillion !== "number" || !Number.isFinite(totalPricePerMillion)) {
    return 0;
  }
  if (totalPricePerMillion <= 0.75) {
    return 4;
  }
  if (totalPricePerMillion <= 2) {
    return 3;
  }
  if (totalPricePerMillion <= 6) {
    return 2;
  }
  if (totalPricePerMillion <= 15) {
    return 1;
  }
  return -2;
}

function scoreThroughput(outputTps: number | undefined): number {
  if (typeof outputTps !== "number" || !Number.isFinite(outputTps)) {
    return 0;
  }
  if (outputTps >= 250) {
    return 4;
  }
  if (outputTps >= 150) {
    return 3;
  }
  if (outputTps >= 80) {
    return 2;
  }
  if (outputTps >= 40) {
    return 1;
  }
  return 0;
}

function scoreTtft(ttftSeconds: number | undefined): number {
  if (typeof ttftSeconds !== "number" || !Number.isFinite(ttftSeconds)) {
    return 0;
  }
  if (ttftSeconds <= 1) {
    return 4;
  }
  if (ttftSeconds <= 2) {
    return 3;
  }
  if (ttftSeconds <= 5) {
    return 1;
  }
  return -1;
}

function scoreContextWindow(contextWindow: number | undefined): number {
  if (typeof contextWindow !== "number" || !Number.isFinite(contextWindow)) {
    return 0;
  }
  if (contextWindow >= 1_000_000) {
    return 5;
  }
  if (contextWindow >= 400_000) {
    return 4;
  }
  if (contextWindow >= 200_000) {
    return 3;
  }
  if (contextWindow >= 128_000) {
    return 2;
  }
  return 0;
}

function requestSignalsFrontendWork(request: ProfileBuilderRequest): boolean {
  const haystack = `${request.displayName}\n${request.additionalContext ?? ""}\n${request.mustUse ?? ""}`.toLowerCase();
  return /(frontend|website|landing page|ui component|ui\b|design system|react|tailwind|component library)/.test(haystack);
}

export function scoreBuilderCandidate(args: {
  knowledge: ProfileBuilderKnowledgeModel;
  gatewayPresetId: ProfileBuilderGatewayPresetId;
  request: ProfileBuilderRequest;
}): number {
  const { knowledge, gatewayPresetId, request } = args;
  const gatewayOperational = getGatewayOperationalData(knowledge, gatewayPresetId);
  const outputTps = getMetricNumber(knowledge, "artificial_analysis_output_tps");
  const ttftSeconds = getMetricNumber(knowledge, "artificial_analysis_ttft_seconds");
  const totalGatewayPricePerMillion =
    typeof gatewayOperational?.inputPricePerMillion === "number" && typeof gatewayOperational?.outputPricePerMillion === "number"
      ? gatewayOperational.inputPricePerMillion + gatewayOperational.outputPricePerMillion
      : undefined;
  const contextWindow = gatewayOperational?.contextWindow;
  let score = 0;

  if (request.optimizeFor === "quality") {
    score += knowledge.quality * 4 + knowledge.reliability * 2;
  } else if (request.optimizeFor === "speed") {
    score += knowledge.speed * 2 + knowledge.cost;
  } else if (request.optimizeFor === "cost") {
    score += knowledge.cost * 2 + knowledge.speed;
  } else {
    score += knowledge.quality * 2 + knowledge.reliability * 2 + knowledge.speed + knowledge.cost;
  }

  if (request.optimizeFor === "quality") {
    score += rankBonus(getLensRank(knowledge, "overall_quality"), 5);
    if (request.taskFamilies.includes("coding")) {
      score += rankBonus(getLensRank(knowledge, "coding_quality"), 4);
    }
    if (request.taskFamilies.includes("research")) {
      score += rankBonus(getLensRank(knowledge, "research"), 4);
    }
  } else if (request.optimizeFor === "speed") {
    score += scoreThroughput(outputTps) * 2;
    score += scoreTtft(ttftSeconds) * 2;
    score += rankBonus(getLensRank(knowledge, "throughput"), 4);
    score += rankBonus(getLensRank(knowledge, "ttft"), 4);
  } else if (request.optimizeFor === "cost") {
    score += scorePriceByMillion(totalGatewayPricePerMillion) * 3;
    if (request.taskFamilies.includes("coding")) {
      score += rankBonus(getLensRank(knowledge, "coding_value"), 4);
    }
    score += rankBonus(getLensRank(knowledge, "budget_text"), 4);
  } else {
    score += rankBonus(getLensRank(knowledge, "overall_quality"), 3);
    score += scorePriceByMillion(totalGatewayPricePerMillion);
    score += scoreThroughput(outputTps);
    score += scoreTtft(ttftSeconds);
  }

  if (request.budgetPosture === "budget_first") {
    if (typeof totalGatewayPricePerMillion === "number") {
      score += scorePriceByMillion(totalGatewayPricePerMillion) * 2;
    } else {
      score += knowledge.cost * 2;
    }
    if (
      knowledge.costTier === "premium"
      || (typeof totalGatewayPricePerMillion === "number" && totalGatewayPricePerMillion > 15)
    ) {
      score -= 6;
    }
  } else if (request.budgetPosture === "quality_first") {
    score += knowledge.quality * 2;
  }

  if (request.latencySensitivity === "high") {
    if (typeof outputTps === "number" || typeof ttftSeconds === "number") {
      score += scoreThroughput(outputTps) * 2;
      score += scoreTtft(ttftSeconds) * 2;
    } else {
      score += knowledge.speed * 2;
    }
  } else if (request.latencySensitivity === "medium") {
    if (typeof outputTps === "number" || typeof ttftSeconds === "number") {
      score += scoreThroughput(outputTps);
      score += scoreTtft(ttftSeconds);
    } else {
      score += knowledge.speed;
    }
  }

  for (const family of request.taskFamilies) {
    if (knowledge.taskFamilies.includes(family)) {
      score += 4;
    }

    if (family === "coding") {
      score += rankBonus(getLensRank(knowledge, request.optimizeFor === "cost" ? "coding_value" : "coding_quality"), 3);
    }

    if (family === "research") {
      score += rankBonus(getLensRank(knowledge, "research"), 3);
      if (knowledge.capabilities.nativeSearch || knowledge.capabilities.groundedSearch) {
        score += 3;
      }
      if (knowledge.capabilities.documentReasoning) {
        score += 2;
      }
    }

    if (family === "long_context") {
      score += rankBonus(getLensRank(knowledge, "long_context"), 3);
      score += scoreContextWindow(contextWindow);
    }

    if (family === "multimodal") {
      score += rankBonus(getLensRank(knowledge, "multimodal"), 3);
    }
  }

  if (request.needsVision) {
    score += knowledge.vision ? 4 : -20;
  }
  if (request.needsLongContext) {
    if (typeof contextWindow === "number") {
      score += contextWindow >= 1_000_000 ? 8 : contextWindow >= 400_000 ? 5 : contextWindow >= 200_000 ? 2 : -12;
    } else {
      score += knowledge.contextBand === "ultra" ? 6 : knowledge.contextBand === "long" ? 3 : -12;
    }
  }

  if (knowledge.structuredOutput) {
    score += 2;
  }
  if (knowledge.toolUse && request.taskFamilies.includes("agentic_coding")) {
    score += 3;
  }
  if (requestSignalsFrontendWork(request)) {
    score += rankBonus(getLensRank(knowledge, "frontend_ui"), 5);
  }
  if (request.taskFamilies.includes("research") && knowledge.capabilities.fileInput) {
    score += 1;
  }

  return score;
}

function buildContextSummary(knowledge: ProfileBuilderKnowledgeModel, liveContext?: number): string | undefined {
  if (typeof liveContext === "number" && Number.isFinite(liveContext)) {
    if (liveContext >= 1_000_000) {
      return "1M+ context";
    }
    if (liveContext >= 400_000) {
      return `${Math.round(liveContext / 1000)}K context`;
    }
    return `${Math.round(liveContext / 1000)}K context`;
  }

  if (knowledge.contextBand === "ultra") {
    return "Long-context model";
  }
  if (knowledge.contextBand === "long") {
    return "Extended-context model";
  }
  return undefined;
}

function buildCostSummary(promptPrice?: string, completionPrice?: string, tier?: string): string | undefined {
  if (promptPrice && completionPrice) {
    const prompt = (Number(promptPrice) * 1_000_000).toFixed(2).replace(/\.00$/, "");
    const completion = (Number(completionPrice) * 1_000_000).toFixed(2).replace(/\.00$/, "");
    return `$${prompt}/$${completion} per 1M tokens`;
  }
  if (tier) {
    return `${tier} cost tier`;
  }
  return undefined;
}

export async function maybeLiveVerifyOpenRouter(candidates: BuilderCandidate[]): Promise<{ candidates: BuilderCandidate[]; usedLiveVerification: boolean }> {
  if (candidates.length === 0 || candidates[0]?.gatewayPresetId !== "openrouter") {
    return { candidates, usedLiveVerification: false };
  }

  const enriched = await Promise.all(
    candidates.map(async (candidate) => {
      try {
        const verified = await validateModelId(candidate.model.id);
        if (!verified) {
          return candidate;
        }

        return {
          ...candidate,
          liveVerified: true,
          contextSummary: buildContextSummary(candidate.knowledge, verified.context_length),
          costSummary: buildCostSummary(verified.pricing?.prompt, verified.pricing?.completion, candidate.knowledge.costTier),
        };
      } catch {
        return candidate;
      }
    }),
  );

  return {
    candidates: enriched,
    usedLiveVerification: enriched.some((candidate) => candidate.liveVerified),
  };
}

function buildRecommendation(candidate: BuilderCandidate, roleLabel: string, rationale: string): ProfileBuilderRecommendation {
  return {
    gatewayId: candidate.gatewayId,
    modelId: candidate.model.id,
    modelName: candidate.model.name ?? candidate.knowledge.name,
    roleLabel,
    rationale,
    score: candidate.score,
    liveVerified: candidate.liveVerified,
    contextSummary: candidate.contextSummary ?? buildContextSummary(candidate.knowledge),
    costSummary: candidate.costSummary ?? buildCostSummary(undefined, undefined, candidate.knowledge.costTier),
  };
}

function buildRejection(candidate: BuilderCandidate, reason: string): ProfileBuilderRejection {
  return {
    modelId: candidate.model.id,
    modelName: candidate.model.name ?? candidate.knowledge.name,
    reason,
  };
}

function buildProfileModel(candidate: BuilderCandidate): RouterProfileModel {
  return {
    gatewayId: candidate.gatewayId,
    modelId: candidate.model.id,
    upstreamModelId: candidate.model.upstreamModelId,
    name: candidate.model.name ?? candidate.knowledge.name,
    modality: candidate.model.modality ?? candidate.knowledge.modality,
    reasoningPreset: candidate.model.reasoningPreset ?? candidate.model.thinking,
    thinking: candidate.model.reasoningPreset ?? candidate.model.thinking,
    whenToUse: candidate.model.whenToUse ?? candidate.knowledge.whenToUse,
    description: candidate.model.description,
  };
}

function buildDefaultRoutingInstructions(request: ProfileBuilderRequest, selected: BuilderCandidate[], defaultModelId: string, classifierModelId: string): string {
  const selectedLines = selected.map((candidate) => {
    const use = candidate.model.whenToUse ?? candidate.knowledge.whenToUse;
    return `  ${candidate.model.id} — ${use}`;
  });

  const familyHints = request.taskFamilies.length > 0 ? request.taskFamilies.join(", ") : "general";
  const lines = [
    `Route every request to the best model for this profile. Optimize for ${request.optimizeFor} and a ${request.budgetPosture.replace(/_/g, " ")} budget posture.`,
    "",
    `Primary task families: ${familyHints}.`,
    request.needsVision ? "This profile must stay multimodal when the input contains images." : "Vision is optional; prefer cheaper text-only routes when they fit.",
    request.needsLongContext ? "Prefer long-context models whenever the request is large or repo-wide." : "Only escalate to long-context models when the prompt truly needs the extra window.",
    "",
    "MODEL REFERENCE",
    ...selectedLines,
    "",
    `Default to ${defaultModelId} when the task is ambiguous.`,
    `Use ${classifierModelId} as the routing classifier because it is the cheapest strong structured-output option available on this gateway.`,
  ];

  const additionalContext = normalizeAdditionalContext(request.additionalContext);
  if (additionalContext) {
    lines.push("", `Additional builder context: ${additionalContext}`);
  }

  return lines.join("\n").trim();
}

export function selectProfileBuilderExecutor(candidates: BuilderCandidate[]): BuilderCandidate | null {
  for (const preferred of EXECUTOR_MODEL_PREFERENCE) {
    const match = candidates.find((candidate) => candidate.model.id === preferred);
    if (match) {
      return match;
    }
  }

  const structured = [...candidates]
    .filter((candidate) => candidate.knowledge.structuredOutput)
    .sort((left, right) => {
      if (left.knowledge.cost !== right.knowledge.cost) {
        return right.knowledge.cost - left.knowledge.cost;
      }
      if (left.knowledge.speed !== right.knowledge.speed) {
        return right.knowledge.speed - left.knowledge.speed;
      }
      return right.score - left.score;
    });

  return structured[0] ?? candidates[0] ?? null;
}

export function selectClassifierCandidate(selected: BuilderCandidate[], allCandidates: BuilderCandidate[]): BuilderCandidate | null {
  const gatewayPresetIds = [...new Set(allCandidates.map((candidate) => candidate.gatewayPresetId))];
  for (const gatewayPresetId of gatewayPresetIds) {
    for (const registryEntry of listModelRegistryForLens({ lens: "classifier_candidate", gatewayPresetId })) {
      const mapping = registryEntry.gatewayMappings.find((entry) => entry.gatewayPresetId === gatewayPresetId);
      if (!mapping) {
        continue;
      }
      const match = allCandidates.find((candidate) =>
        candidate.gatewayPresetId === gatewayPresetId
        && (candidate.model.id === mapping.modelId || candidate.model.id === registryEntry.canonicalModelId),
      );
      if (match) {
        return match;
      }
    }
  }

  const preferredIds = [
    "google/gemini-3.1-flash-lite-preview",
    "google/gemini-3-flash-preview",
    "google/gemini-3-flash",
    "openai/gpt-5.4-mini",
    "anthropic/claude-haiku-4.5",
  ];
  for (const modelId of preferredIds) {
    const match = allCandidates.find((candidate) => candidate.model.id === modelId);
    if (match) {
      return match;
    }
  }

  const structured = [...allCandidates]
    .filter((candidate) => candidate.knowledge.structuredOutput)
    .sort((left, right) => {
      if (left.knowledge.cost !== right.knowledge.cost) {
        return right.knowledge.cost - left.knowledge.cost;
      }
      return right.score - left.score;
    });

  return structured[0] ?? selected[0] ?? null;
}

function normalizePlan(plan: Partial<BuilderPlan>, shortlist: BuilderCandidate[], request: ProfileBuilderRequest): BuilderPlan {
  const shortlistedIds = new Set(shortlist.map((candidate) => candidate.model.id));
  const safeSelected = (plan.routedModelIds ?? []).filter((modelId) => shortlistedIds.has(modelId));
  const routedModelIds = safeSelected.length >= 2 ? safeSelected.slice(0, 5) : shortlist.slice(0, Math.min(4, shortlist.length)).map((candidate) => candidate.model.id);
  const defaultModelId = routedModelIds.includes(plan.defaultModelId ?? "") ? plan.defaultModelId! : (routedModelIds[0] ?? shortlist[0]?.model.id ?? "");
  const classifierCandidate = selectClassifierCandidate(shortlist.filter((candidate) => routedModelIds.includes(candidate.model.id)), shortlist);
  const classifierModelId = shortlistedIds.has(plan.classifierModelId ?? "") ? plan.classifierModelId! : (classifierCandidate?.model.id ?? defaultModelId);

  const recommendations = (plan.recommendations ?? [])
    .filter((entry) => shortlistedIds.has(entry.modelId))
    .slice(0, 5);

  const fallbackRecommendations = shortlist
    .slice(0, Math.min(4, shortlist.length))
    .map((candidate, index) => ({
      modelId: candidate.model.id,
      roleLabel: index === 0 ? "Primary default" : index === 1 ? "Long-context / harder tasks" : "Specialist",
      rationale: candidate.model.whenToUse ?? candidate.knowledge.whenToUse,
    }));

  const rejections = (plan.rejections ?? [])
    .filter((entry) => shortlistedIds.has(entry.modelId) || shortlist.some((candidate) => candidate.model.id === entry.modelId))
    .slice(0, 4);

  const fallbackRejections = shortlist.slice(4, 7).map((candidate) => ({
    modelId: candidate.model.id,
    reason: "Strong candidate, but it lost on cost-performance or overlap with the selected pool.",
  }));

  return {
    summary: plan.summary?.trim() || `Profile draft for ${request.displayName} optimized for ${request.optimizeFor}.`,
    routedModelIds,
    defaultModelId,
    classifierModelId,
    recommendations: recommendations.length > 0 ? recommendations : fallbackRecommendations,
    rejections: rejections.length > 0 ? rejections : fallbackRejections,
    routingInstructions: plan.routingInstructions?.trim()
      || buildDefaultRoutingInstructions(request, shortlist.filter((candidate) => routedModelIds.includes(candidate.model.id)), defaultModelId, classifierModelId),
  };
}

function parseChatContent(content: unknown): string {
  if (typeof content === "string") {
    return content;
  }
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === "string") {
          return part;
        }
        if (part && typeof part === "object" && "text" in part && typeof (part as { text?: unknown }).text === "string") {
          return (part as { text: string }).text;
        }
        return "";
      })
      .join("\n");
  }
  return "";
}

function extractJsonObject(text: string): string | null {
  const fenced = text.match(/```json\s*([\s\S]*?)```/i) ?? text.match(/```\s*([\s\S]*?)```/i);
  if (fenced?.[1]) {
    return fenced[1].trim();
  }

  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    return null;
  }

  return text.slice(start, end + 1);
}

async function callProfileBuilderExecutor(args: {
  gateway: BuilderGateway;
  executor: BuilderCandidate;
  request: ProfileBuilderRequest;
  shortlist: BuilderCandidate[];
  bindings: RouterRuntimeBindings;
}): Promise<Partial<BuilderPlan> | null> {
  const byokSecret = resolveByokEncryptionSecret({
    byokSecret: args.bindings.BYOK_ENCRYPTION_SECRET ?? null,
  });
  if (!byokSecret) {
    throw new Error("Server misconfigured: missing BYOK encryption secret.");
  }

  const apiKey = await decryptByokSecret({
    ciphertext: args.gateway.apiKeyEnc,
    secret: byokSecret,
  });
  if (!apiKey) {
    throw new Error("Gateway key cannot be decrypted. Re-save the gateway and try again.");
  }

  const candidatePayload = args.shortlist.map((candidate) => ({
    id: candidate.model.id,
    name: candidate.model.name ?? candidate.knowledge.name,
    modality: candidate.model.modality ?? candidate.knowledge.modality,
    whenToUse: candidate.model.whenToUse ?? candidate.knowledge.whenToUse,
    taskFamilies: candidate.knowledge.taskFamilies,
    strengths: candidate.knowledge.strengths,
    caveats: candidate.knowledge.caveats,
    capabilities: candidate.knowledge.capabilities,
    lenses: candidate.knowledge.lenses,
    metrics: candidate.knowledge.metrics.map((metric) => ({
      metricId: metric.metricId,
      label: metric.label,
      value: metric.value,
      unit: metric.unit,
      direction: metric.direction,
      sourceLabel: metric.source.label,
      verifiedAt: metric.verifiedAt,
      note: metric.note,
    })),
    gatewayDeployment:
      candidate.knowledge.gatewayMappings.find((mapping) => mapping.gatewayPresetId === candidate.gatewayPresetId)
      ?? null,
    lastVerified: candidate.knowledge.lastVerified,
    score: candidate.score,
    contextSummary: candidate.contextSummary,
    costSummary: candidate.costSummary,
  }));

  const systemPrompt = [
    "You are building a routing profile draft for a model router admin console.",
    "Return exactly one JSON object and no prose.",
    "You may only choose model ids that appear in the provided candidate list.",
    "Select 3 to 5 routedModelIds with differentiated roles.",
    "Use the cheapest strong structured-output-capable model as classifierModelId when possible.",
    "Prefer explicit benchmark, capability, caveat, and gateway-deployment evidence over generic summaries when the candidate payload includes it.",
    "Keep routingInstructions durable and capability-focused, not benchmark- or price-heavy.",
  ].join(" ");

  const userPrompt = JSON.stringify({
    profile: {
      profileId: args.request.profileId,
      displayName: args.request.displayName,
      optimizeFor: args.request.optimizeFor,
      taskFamilies: args.request.taskFamilies,
      needsVision: args.request.needsVision,
      needsLongContext: args.request.needsLongContext,
      latencySensitivity: args.request.latencySensitivity,
      budgetPosture: args.request.budgetPosture,
      mustUse: args.request.mustUse ?? null,
      avoid: args.request.avoid ?? null,
      additionalContext: normalizeAdditionalContext(args.request.additionalContext) ?? null,
    },
    gateway: {
      id: args.gateway.id,
      name: args.gateway.name,
      presetId: args.gateway.presetId,
    },
    candidates: candidatePayload,
    outputSchema: {
      summary: "string",
      routedModelIds: ["model/id"],
      defaultModelId: "model/id",
      classifierModelId: "model/id",
      recommendations: [{ modelId: "model/id", roleLabel: "string", rationale: "string" }],
      rejections: [{ modelId: "model/id", reason: "string" }],
      routingInstructions: "string",
    },
  }, null, 2);

  const upstream = await callOpenAiCompatible({
    apiPath: "/chat/completions",
    baseUrl: normalizeBaseUrl(args.gateway.baseUrl),
    apiKey,
    payload: {
      model: args.executor.model.id,
      temperature: 0,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
    },
  });

  if (!upstream.ok) {
    throw new Error(`Profile builder executor failed (${upstream.status}).`);
  }

  const payload = (await upstream.response.json()) as ChatCompletionJson;
  const rawContent = parseChatContent(payload.choices?.[0]?.message?.content);
  const jsonText = extractJsonObject(rawContent);
  if (!jsonText) {
    return null;
  }

  try {
    return JSON.parse(jsonText) as Partial<BuilderPlan>;
  } catch {
    return null;
  }
}

function buildDraftProfile(args: {
  request: ProfileBuilderRequest;
  selected: BuilderCandidate[];
  defaultModelId: string;
  classifierModelId: string;
  routingInstructions: string;
  summary: string;
}): RouterProfile {
  const selected = args.selected.length > 0 ? args.selected : [];
  const models = selected.map(buildProfileModel);
  const defaultCandidate = selected.find((candidate) => candidate.model.id === args.defaultModelId) ?? selected[0];
  const classifierCandidate = selected.find((candidate) => candidate.model.id === args.classifierModelId) ?? defaultCandidate;

  return {
    id: normalizeProfileIdInput(args.request.profileId),
    name: args.request.displayName.trim(),
    description: args.summary,
    models,
    defaultModel: defaultCandidate ? buildProfileModelKey(defaultCandidate.gatewayId, defaultCandidate.model.id) : undefined,
    classifierModel: classifierCandidate ? buildProfileModelKey(classifierCandidate.gatewayId, classifierCandidate.model.id) : undefined,
    routingInstructions: args.routingInstructions.trim(),
  };
}

function buildDeterministicPlan(shortlist: BuilderCandidate[], request: ProfileBuilderRequest): BuilderPlan {
  const selected = shortlist.slice(0, Math.min(4, shortlist.length));
  const classifierCandidate = selectClassifierCandidate(selected, shortlist);
  const recommendations = selected.map((candidate, index) => ({
    modelId: candidate.model.id,
    roleLabel:
      index === 0 ? "Primary default" :
      candidate.knowledge.contextBand === "ultra" ? "Long-context specialist" :
      candidate.knowledge.vision ? "Vision / multimodal" :
      candidate.knowledge.taskFamilies.includes("agentic_coding") ? "Agentic specialist" :
      "Specialist",
    rationale: candidate.model.whenToUse ?? candidate.knowledge.whenToUse,
  }));

  return {
    summary: `Balanced draft for ${request.displayName} based on ${shortlist.length} synced gateway candidates.`,
    routedModelIds: selected.map((candidate) => candidate.model.id),
    defaultModelId: selected[0]?.model.id ?? "",
    classifierModelId: classifierCandidate?.model.id ?? selected[0]?.model.id ?? "",
    recommendations,
    rejections: shortlist.slice(selected.length, selected.length + 3).map((candidate) => ({
      modelId: candidate.model.id,
      reason: "Strong candidate, but it overlapped with the selected pool or lost on cost/performance tradeoffs.",
    })),
    routingInstructions: buildDefaultRoutingInstructions(request, selected, selected[0]?.model.id ?? "", classifierCandidate?.model.id ?? selected[0]?.model.id ?? ""),
  };
}

function buildCandidatePool(gateway: BuilderGateway, request: ProfileBuilderRequest): { shortlist: BuilderCandidate[]; filteredOut: BuilderCandidate[] } {
  const mustUseTerms = splitTerms(request.mustUse);
  const avoidTerms = splitTerms(request.avoid);
  const allCandidates = gateway.models.map((model) => {
    const knowledge = findCandidateKnowledge(model, gateway.presetId);
    let score = scoreBuilderCandidate({
      knowledge,
      gatewayPresetId: gateway.presetId,
      request,
    });
    if (modelMatchesTerms(model, knowledge, mustUseTerms)) {
      score += 8;
    }
    return {
      gatewayId: gateway.id,
      gatewayName: gateway.name,
      gatewayPresetId: gateway.presetId,
      model,
      knowledge,
      score,
      liveVerified: false,
    } satisfies BuilderCandidate;
  });

  const filteredOut: BuilderCandidate[] = [];
  const baseEligible = allCandidates.filter((candidate) => {
    if (outputsGeneratedImage(candidate.model.modality ?? candidate.knowledge.modality)) {
      filteredOut.push(candidate);
      return false;
    }
    return true;
  });

  const eligible = baseEligible.filter((candidate) => {
    if (request.needsVision && !candidate.knowledge.vision) {
      filteredOut.push(candidate);
      return false;
    }
    if (request.needsLongContext && candidate.knowledge.contextBand === "standard") {
      filteredOut.push(candidate);
      return false;
    }
    if (avoidTerms.length > 0 && modelMatchesTerms(candidate.model, candidate.knowledge, avoidTerms)) {
      filteredOut.push(candidate);
      return false;
    }
    return true;
  });

  const shortlist = (eligible.length > 0 ? eligible : baseEligible)
    .sort((left, right) => right.score - left.score)
    .slice(0, 8);

  return {
    shortlist,
    filteredOut,
  };
}

async function resolveBuilderGateways(auth: AuthResult, bindings: RouterRuntimeBindings & { ROUTER_DB: NonNullable<RouterRuntimeBindings["ROUTER_DB"]> }): Promise<BuilderGateway[]> {
  const gatewayRows = await loadGatewaysWithMigration({
    db: bindings.ROUTER_DB,
    userId: auth.userId,
    upstreamBaseUrl: auth.upstreamBaseUrl ?? null,
    upstreamApiKeyEnc: auth.upstreamApiKeyEnc ?? null,
    customCatalogJson: auth.customCatalog ? JSON.stringify(auth.customCatalog) : null,
  });

  return gatewayRows
    .map((row) => ({
      name: row.name,
      ...gatewayRowToPublic(row),
      presetId: getGatewayPresetId(row.base_url),
    }))
    .filter((gateway): gateway is BuilderGateway => Boolean(gateway.presetId && SUPPORTED_GATEWAY_PRESET_IDS.has(gateway.presetId as ProfileBuilderGatewayPresetId)));
}

function chooseBuilderGateway(gateways: BuilderGateway[], preferredGatewayId?: string): BuilderGateway | null {
  if (preferredGatewayId) {
    return gateways.find((gateway) => gateway.id === preferredGatewayId && gateway.models.length > 0) ?? null;
  }

  const withModels = gateways.filter((gateway) => gateway.models.length > 0);
  withModels.sort((left, right) => {
    if (left.presetId === right.presetId) {
      return left.name.localeCompare(right.name);
    }
    return left.presetId === "openrouter" ? -1 : 1;
  });
  return withModels[0] ?? null;
}

async function runProfileBuilder(args: {
  auth: AuthResult;
  bindings: RouterRuntimeBindings & { ROUTER_DB: NonNullable<RouterRuntimeBindings["ROUTER_DB"]> };
  runId: string;
  request: ProfileBuilderRequest;
}): Promise<void> {
  const gateway = chooseBuilderGateway(await resolveBuilderGateways(args.auth, args.bindings), args.request.preferredGatewayId);
  if (!gateway) {
    await failProfileBuilderRun({
      db: args.bindings.ROUTER_DB,
      userId: args.auth.userId,
      runId: args.runId,
      error: "No supported gateway with synced models is available for agent-assisted profile creation.",
    });
    return;
  }

  const { shortlist, filteredOut } = buildCandidatePool(gateway, args.request);
  if (shortlist.length === 0) {
    await failProfileBuilderRun({
      db: args.bindings.ROUTER_DB,
      userId: args.auth.userId,
      runId: args.runId,
      error: "The selected gateway has no usable models for this profile request.",
    });
    return;
  }

  const executor = selectProfileBuilderExecutor(shortlist);
  if (!executor) {
    await failProfileBuilderRun({
      db: args.bindings.ROUTER_DB,
      userId: args.auth.userId,
      runId: args.runId,
      error: "No suitable executor model is available on the selected gateway.",
    });
    return;
  }

  const verification = await maybeLiveVerifyOpenRouter(shortlist);
  const verifiedShortlist = verification.candidates;

  let planned = buildDeterministicPlan(verifiedShortlist, args.request);
  try {
    const llmPlan = await callProfileBuilderExecutor({
      gateway,
      executor,
      request: args.request,
      shortlist: verifiedShortlist,
      bindings: args.bindings,
    });
    if (llmPlan) {
      planned = normalizePlan(llmPlan, verifiedShortlist, args.request);
    }
  } catch (error) {
    // Keep the deterministic fallback when the executor fails; the user still gets a draft.
    planned = {
      ...planned,
      summary: `Fallback draft for ${args.request.displayName}. The builder executor failed, so this recommendation was synthesized from the local knowledge base.`,
    };
  }

  const selected = verifiedShortlist.filter((candidate) => planned.routedModelIds.includes(candidate.model.id));
  const draftProfile = buildDraftProfile({
    request: args.request,
    selected,
    defaultModelId: planned.defaultModelId,
    classifierModelId: planned.classifierModelId,
    routingInstructions: planned.routingInstructions,
    summary: planned.summary,
  });

  const recommendations = planned.recommendations
    .map((entry) => {
      const candidate = verifiedShortlist.find((item) => item.model.id === entry.modelId);
      return candidate ? buildRecommendation(candidate, entry.roleLabel, entry.rationale) : null;
    })
    .filter((entry): entry is ProfileBuilderRecommendation => Boolean(entry));

  const rejections = planned.rejections
    .map((entry) => {
      const candidate = [...filteredOut, ...verifiedShortlist].find((item) => item.model.id === entry.modelId);
      return candidate ? buildRejection(candidate, entry.reason) : null;
    })
    .filter((entry): entry is ProfileBuilderRejection => Boolean(entry));

  const sourcePool = mergeProfileBuilderSources(
    selected.flatMap((candidate) => candidate.knowledge.sources),
    verification.usedLiveVerification
      ? [
          {
            label: "OpenRouter models API",
            url: "https://openrouter.ai/api/v1/models",
            verifiedAt: PROFILE_BUILDER_LAST_VERIFIED,
          } satisfies ProfileBuilderSource,
        ]
      : [],
  );

  await completeProfileBuilderRun({
    db: args.bindings.ROUTER_DB,
    userId: args.auth.userId,
    runId: args.runId,
    result: {
      draftProfile,
      recommendations,
      rejections,
      sources: sourcePool,
      researchMode: profileBuilderResearchModeFromVerification(verification.usedLiveVerification),
      summary: planned.summary,
    },
  });
}

export async function handleCreateProfileBuilderRun(
  request: Request,
  auth: AuthResult,
  bindings: RouterRuntimeBindings & { ROUTER_DB: NonNullable<RouterRuntimeBindings["ROUTER_DB"]> },
): Promise<Response> {
  const parsed = await parseJsonBody(request, profileBuilderRequestSchema, {
    invalidPayloadMessage: "Invalid profile builder request.",
  });
  if (parsed.response) {
    return parsed.response;
  }

  const profileId = normalizeProfileIdInput(parsed.data.profileId);
  const profileIdError = getProfileIdValidationError(profileId);
  if (profileIdError) {
    return json({ error: profileIdError }, 400);
  }

  const builderGateways = await resolveBuilderGateways(auth, bindings);
  const targetGateway = chooseBuilderGateway(builderGateways, parsed.data.preferredGatewayId);
  if (!targetGateway) {
    return json({ error: "No supported gateway with synced models is available. Sync OpenRouter or Vercel models first." }, 400);
  }

  const { shortlist } = buildCandidatePool(targetGateway, { ...parsed.data, profileId });
  const executor = selectProfileBuilderExecutor(shortlist);
  if (!executor) {
    return json({ error: "No suitable executor model is available on the selected gateway." }, 400);
  }

  const run = await insertProfileBuilderRun({
    db: bindings.ROUTER_DB,
    id: runId("profile_builder"),
    userId: auth.userId,
    request: {
      ...parsed.data,
      profileId,
      displayName: parsed.data.displayName.trim(),
      additionalContext: normalizeAdditionalContext(parsed.data.additionalContext),
    },
    executor: {
      gatewayId: targetGateway.id,
      gatewayName: targetGateway.name,
      gatewayPresetId: targetGateway.presetId,
      modelId: executor.model.id,
      modelName: executor.model.name ?? executor.knowledge.name,
    },
  });

  return json({ run }, 202);
}

export async function executeProfileBuilderRun(args: {
  auth: AuthResult;
  bindings: RouterRuntimeBindings & { ROUTER_DB: NonNullable<RouterRuntimeBindings["ROUTER_DB"]> };
  run: ProfileBuilderRun;
}): Promise<void> {
  try {
    await runProfileBuilder({
      auth: args.auth,
      bindings: args.bindings,
      runId: args.run.id,
      request: args.run.request,
    });
  } catch (error) {
    await failProfileBuilderRun({
      db: args.bindings.ROUTER_DB,
      userId: args.auth.userId,
      runId: args.run.id,
      error: error instanceof Error ? error.message : "Profile builder failed.",
    });
  }
}

export async function handleGetProfileBuilderRun(
  auth: AuthResult,
  bindings: RouterRuntimeBindings & { ROUTER_DB: NonNullable<RouterRuntimeBindings["ROUTER_DB"]> },
  runIdValue: string,
): Promise<Response> {
  const run = await getProfileBuilderRun({
    db: bindings.ROUTER_DB,
    userId: auth.userId,
    runId: runIdValue,
  });
  if (!run) {
    return json({ error: "Not found." }, 404);
  }
  return json({ run }, 200);
}

async function appendProfileToUser(args: {
  auth: AuthResult;
  bindings: RouterRuntimeBindings & { ROUTER_DB: NonNullable<RouterRuntimeBindings["ROUTER_DB"]> };
  profile: RouterProfile;
}): Promise<Response> {
  const existingProfiles = normalizeProfiles(args.auth.profiles ?? []);
  if (existingProfiles.some((entry) => entry.id === args.profile.id)) {
    return json({ error: `Profile ID "${args.profile.id}" already exists.` }, 409);
  }

  const gatewayRows = await loadGatewaysWithMigration({
    db: args.bindings.ROUTER_DB,
    userId: args.auth.userId,
    upstreamBaseUrl: args.auth.upstreamBaseUrl ?? null,
    upstreamApiKeyEnc: args.auth.upstreamApiKeyEnc ?? null,
    customCatalogJson: args.auth.customCatalog ? JSON.stringify(args.auth.customCatalog) : null,
  });
  const validGatewayModelKeys = new Set(
    gatewayRows.flatMap((row) => gatewayRowToPublic(row).models.map((model) => `${row.id}::${model.id}`)),
  );

  if (args.profile.defaultModel && !validGatewayModelKeys.has(args.profile.defaultModel)) {
    return json({ error: `Profile "${args.profile.id}" has an invalid fallback model selection.` }, 400);
  }
  if (args.profile.classifierModel && !validGatewayModelKeys.has(args.profile.classifierModel)) {
    return json({ error: `Profile "${args.profile.id}" has an invalid router model selection.` }, 400);
  }

  const nextProfiles = normalizeProfiles([...existingProfiles, args.profile]);
  const now = new Date().toISOString();
  await args.bindings.ROUTER_DB
    .prepare(
      `UPDATE users
       SET profiles = ?1,
           default_model = NULL,
           classifier_model = NULL,
           routing_instructions = NULL,
           blocklist = NULL,
           updated_at = ?2
       WHERE id = ?3`
    )
    .bind(JSON.stringify(nextProfiles), now, args.auth.userId)
    .run();

  return json({ ok: true, profile: args.profile }, 200);
}

export async function handleApplyProfileBuilderRun(args: {
  request: Request;
  auth: AuthResult;
  bindings: RouterRuntimeBindings & { ROUTER_DB: NonNullable<RouterRuntimeBindings["ROUTER_DB"]> };
  runId: string;
}): Promise<Response> {
  const run = await getProfileBuilderRun({
    db: args.bindings.ROUTER_DB,
    userId: args.auth.userId,
    runId: args.runId,
  });
  if (!run) {
    return json({ error: "Not found." }, 404);
  }
  if (run.status !== "completed" || !run.draftProfile) {
    return json({ error: "Run is not ready to apply yet." }, 409);
  }

  const parsed = await parseJsonBody(args.request, profileBuilderApplySchema, {
    invalidPayloadMessage: "Invalid profile builder apply request.",
  });
  if (parsed.response) {
    return parsed.response;
  }

  const profileId = normalizeProfileIdInput(parsed.data.profileId ?? run.draftProfile.id);
  const profileIdError = getProfileIdValidationError(profileId);
  if (profileIdError) {
    return json({ error: profileIdError }, 400);
  }

  const displayName = (parsed.data.displayName ?? run.draftProfile.name).trim();
  if (!displayName) {
    return json({ error: "Display name is required." }, 400);
  }

  const profile: RouterProfile = {
    ...run.draftProfile,
    id: profileId,
    name: displayName,
    description: parsed.data.description ?? run.draftProfile.description,
    routingInstructions: parsed.data.routingInstructions ?? run.draftProfile.routingInstructions,
  };

  return appendProfileToUser({
    auth: args.auth,
    bindings: args.bindings,
    profile,
  });
}
