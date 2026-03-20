import { getCatalogItemReasoningEffort, getFamilyIdForModel } from "../routing-policy";
import type { CatalogItem, RouteDecision, RouterRequestLike } from "../types";
import { normalizeStepClassification, type EffectiveReasoningPolicy, type PinEvaluation, type ResolutionTelemetry, type ResolvedSelection } from "./shared";

export function createPassthroughDecision(args: {
  requestId: string;
  requestedModel: string;
  catalogVersion: string;
  threadKey: string;
  isContinuation: boolean;
  now: Date;
}): RouteDecision {
  return {
    mode: "passthrough",
    requestedModel: args.requestedModel,
    selectedModel: args.requestedModel,
    catalogVersion: args.catalogVersion,
    threadKey: args.threadKey,
    isContinuation: args.isContinuation,
    pinUsed: false,
    degraded: false,
    classifierAccepted: false,
    fallbackModels: [],
    shouldPin: false,
    explanation: {
      requestId: args.requestId,
      createdAt: args.now.toISOString(),
      catalogVersion: args.catalogVersion,
      classificationConfidence: 1,
      classificationSignals: ["passthrough:explicit_model"],
      threadKey: args.threadKey,
      isContinuation: args.isContinuation,
      pinUsed: false,
      selectedModel: args.requestedModel,
      decisionReason: "passthrough",
      fallbackChain: [],
      notes: ["Router bypassed because request specified an explicit model."],
    },
  };
}

export function buildFallbackSelection(args: {
  defaultModel: string;
  allowedCatalog: CatalogItem[];
  request: RouterRequestLike;
  policy: EffectiveReasoningPolicy;
  previousFamily?: string;
  switchReason: string;
}): ResolvedSelection {
  const selectedFamily = getFamilyIdForModel(args.allowedCatalog, args.defaultModel);

  return {
    selectedModel: args.defaultModel,
    selectedFamily,
    previousFamily: args.previousFamily,
    selectedEffort: getCatalogItemReasoningEffort(
      args.allowedCatalog.find((item) => item.id === args.defaultModel),
    ),
    stepClassification: normalizeStepClassification({
      request: args.request,
      policy: args.policy,
    }),
    switchMode: args.previousFamily && args.previousFamily === selectedFamily ? "stay_exact" : "switch_family",
    switchReason: args.switchReason,
    familyStickinessApplied: false,
    crossFamilySwitchBlocked: false,
  };
}

export function applyVisionCapabilityOverride(args: {
  selection: ResolvedSelection;
  allowedCatalog: CatalogItem[];
  threadHasImage: boolean;
}): { selection: ResolvedSelection; notes: string[] } {
  if (!args.threadHasImage || !args.selection.selectedModel || args.allowedCatalog.some((item) => item.id === args.selection.selectedModel)) {
    return { selection: args.selection, notes: [] };
  }

  if (args.allowedCatalog.length === 0) {
    return {
      selection: args.selection,
      notes: ["Warning: Thread contains image but no vision models found in catalog."],
    };
  }

  const selectedModel = args.allowedCatalog[0]!.id;
  const selectedFamily = getFamilyIdForModel(args.allowedCatalog, selectedModel);

  return {
    selection: {
      ...args.selection,
      selectedModel,
      selectedFamily,
      selectedEffort: args.selection.selectedEffort ?? getCatalogItemReasoningEffort(
        args.allowedCatalog.find((item) => item.id === selectedModel),
      ),
      switchMode: args.selection.previousFamily && args.selection.previousFamily === selectedFamily
        ? "shift_within_family"
        : "switch_family",
      switchReason: "vision_capability_override",
    },
    notes: [`Thread has an image but selected model doesn't support vision. Forcing vision model: ${selectedModel}`],
  };
}

export function buildRouteDecision(args: {
  requestId: string;
  requestedModel: string;
  catalogVersion: string;
  threadKey: string;
  isContinuation: boolean;
  isLoop: boolean;
  now: Date;
  matchedProfileId?: string;
  routingFrequency: "smart" | "every_message" | "new_thread_only";
  defaultSmartPinTurns: number;
  effectiveDefaultModel?: string;
  pinState: PinEvaluation;
  selection: ResolvedSelection;
  telemetry: ResolutionTelemetry;
}): RouteDecision {
  const fallbackModels =
    args.effectiveDefaultModel
    && args.selection.selectedModel
    && args.selection.selectedModel !== args.effectiveDefaultModel
      ? [args.effectiveDefaultModel]
      : [];

  return {
    mode: "routed",
    requestedModel: args.requestedModel,
    selectedModel: args.selection.selectedModel,
    selectedFamily: args.selection.selectedFamily,
    previousFamily: args.selection.previousFamily,
    selectedEffort: args.selection.selectedEffort,
    stepClassification: args.selection.stepClassification,
    switchMode: args.selection.switchMode,
    switchReason: args.selection.switchReason,
    familyStickinessApplied: args.selection.familyStickinessApplied,
    crossFamilySwitchBlocked: args.selection.crossFamilySwitchBlocked,
    catalogVersion: args.catalogVersion,
    threadKey: args.threadKey,
    isContinuation: args.isContinuation,
    pinUsed: args.pinState.pinUsed,
    degraded: false,
    classifierAccepted: args.telemetry.classifierAccepted,
    fallbackModels,
    shouldPin: args.pinState.shouldPin,
    pinTurnCount: args.pinState.pinTurnCount,
    pinRerouteAfterTurns: args.routingFrequency === "smart"
      ? args.telemetry.pinRerouteAfterTurns ?? args.defaultSmartPinTurns
      : undefined,
    pinBudgetSource: args.routingFrequency === "smart"
      ? args.telemetry.pinBudgetSource ?? "default"
      : undefined,
    explanation: {
      requestId: args.requestId,
      createdAt: args.now.toISOString(),
      catalogVersion: args.catalogVersion,
      classificationConfidence: args.telemetry.confidence,
      classificationSignals: args.telemetry.signals,
      stepClassification: args.selection.stepClassification,
      threadKey: args.threadKey,
      isContinuation: args.isContinuation,
      pinUsed: args.pinState.pinUsed,
      isAgentLoop: args.isLoop,
      selectedModel: args.selection.selectedModel,
      selectedFamily: args.selection.selectedFamily,
      previousFamily: args.selection.previousFamily,
      selectedEffort: args.selection.selectedEffort,
      switchMode: args.selection.switchMode,
      switchReason: args.selection.switchReason,
      familyStickinessApplied: args.selection.familyStickinessApplied,
      crossFamilySwitchBlocked: args.selection.crossFamilySwitchBlocked,
      decisionReason: args.pinState.decisionReason,
      fallbackChain: fallbackModels,
      notes: args.telemetry.notes,
      profileId: args.matchedProfileId,
      pinBypassReason: args.pinState.pinBypassReason,
      pinRerouteAfterTurns: args.routingFrequency === "smart"
        ? args.telemetry.pinRerouteAfterTurns ?? args.defaultSmartPinTurns
        : undefined,
      pinBudgetSource: args.routingFrequency === "smart"
        ? args.telemetry.pinBudgetSource ?? "default"
        : undefined,
      pinConsumedUserTurns: args.routingFrequency === "smart"
        ? args.telemetry.pinConsumedUserTurns
        : undefined,
    },
    routingError: args.telemetry.routingError,
  };
}
