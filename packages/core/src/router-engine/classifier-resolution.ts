import { buildPromptWindow, type LlmRouterFunction } from "../llm-router";
import { getFamilyIdForModel, resolveNearestFamilyModel } from "../routing-policy";
import type { CatalogItem, RouterRequestLike, ThreadPin } from "../types";
import { buildFallbackSelection } from "./fallback-and-explanation";
import {
  deriveReasoningEffort,
  normalizeStepClassification,
  shouldHoldExactVariant,
  type EffectiveReasoningPolicy,
  type ResolutionTelemetry,
  type ResolvedSelection,
} from "./shared";

function buildEmptySelection(previousFamily?: string): ResolvedSelection {
  return {
    selectedModel: "",
    previousFamily,
    familyStickinessApplied: false,
    crossFamilySwitchBlocked: false,
  };
}

function buildFallbackResult(args: {
  defaultModel?: string;
  allowedCatalog: CatalogItem[];
  request: RouterRequestLike;
  policy: EffectiveReasoningPolicy;
  previousFamily?: string;
  switchReason: string;
  note: string;
  routingError: string;
  defaultSmartPinTurns: number;
}): { selection: ResolvedSelection; telemetry: ResolutionTelemetry } {
  if (!args.defaultModel) {
    return {
      selection: buildEmptySelection(args.previousFamily),
      telemetry: {
        confidence: 0.5,
        classifierAccepted: false,
        signals: [],
        pinRerouteAfterTurns: undefined,
        pinBudgetSource: undefined,
        pinConsumedUserTurns: 0,
        notes: [args.note],
        routingError: args.routingError,
      },
    };
  }

  return {
    selection: buildFallbackSelection({
      defaultModel: args.defaultModel,
      allowedCatalog: args.allowedCatalog,
      request: args.request,
      policy: args.policy,
      previousFamily: args.previousFamily,
      switchReason: args.switchReason,
    }),
    telemetry: {
      confidence: 0.5,
      classifierAccepted: false,
      signals: [],
      pinRerouteAfterTurns: args.defaultSmartPinTurns,
      pinBudgetSource: "default",
      pinConsumedUserTurns: 0,
      notes: [args.note],
    },
  };
}

export async function resolveClassifierSelection(args: {
  llmRouter?: LlmRouterFunction;
  request: RouterRequestLike;
  allowedCatalog: CatalogItem[];
  routingInstructions?: string;
  classifierModel?: string;
  defaultModel?: string;
  policy: EffectiveReasoningPolicy;
  activePin: ThreadPin | null;
  activePinValid: boolean;
  previousFamily?: string;
  isContinuation: boolean;
  forceRoute: boolean;
  defaultSmartPinTurns: number;
}): Promise<{ selection: ResolvedSelection; telemetry: ResolutionTelemetry }> {
  if (!args.llmRouter) {
    return buildFallbackResult({
      defaultModel: args.defaultModel,
      allowedCatalog: args.allowedCatalog,
      request: args.request,
      policy: args.policy,
      previousFamily: args.previousFamily,
      switchReason: "missing_classifier_fallback",
      note: args.defaultModel
        ? "No LLM router configured. Using configured fallback model."
        : "No LLM router configured and no fallback model is configured.",
      routingError: "classifier_missing_without_fallback",
      defaultSmartPinTurns: args.defaultSmartPinTurns,
    });
  }

  const prompt = buildPromptWindow({
    messages: args.request.messages ?? [],
    input: args.request.input,
  });

  try {
    const result = await args.llmRouter({
      prompt,
      catalog: args.allowedCatalog,
      routingInstructions: args.routingInstructions,
      classifierModel: args.classifierModel,
      currentModel: args.activePin?.modelId,
    });

    if (!result?.selectedModel) {
      return buildFallbackResult({
        defaultModel: args.defaultModel,
        allowedCatalog: args.allowedCatalog,
        request: args.request,
        policy: args.policy,
        previousFamily: args.previousFamily,
        switchReason: "classifier_result_missing_fallback",
        note: args.defaultModel
          ? "LLM router failed or returned no result. Using configured fallback."
          : "LLM router failed or returned no result and no fallback model is configured.",
        routingError: "classifier_failed_without_fallback",
        defaultSmartPinTurns: args.defaultSmartPinTurns,
      });
    }

    const valid = args.allowedCatalog.some((model) => model.id === result.selectedModel);
    if (!valid) {
      const fallback = buildFallbackResult({
        defaultModel: args.defaultModel,
        allowedCatalog: args.allowedCatalog,
        request: args.request,
        policy: args.policy,
        previousFamily: args.previousFamily,
        switchReason: "invalid_classifier_model_fallback",
        note: `LLM router returned invalid model: ${result.selectedModel}`,
        routingError: "classifier_returned_invalid_model_without_fallback",
        defaultSmartPinTurns: args.defaultSmartPinTurns,
      });
      return {
        selection: fallback.selection,
        telemetry: {
          ...fallback.telemetry,
          notes: [
            ...fallback.telemetry.notes,
          ],
        },
      };
    }

    const stepClassification = normalizeStepClassification({
      classification: result.stepClassification,
      request: args.request,
      policy: args.policy,
    });
    let selectedEffort = deriveReasoningEffort({
      policy: args.policy,
      stepClassification,
    });

    const candidateFamily = getFamilyIdForModel(args.allowedCatalog, result.selectedModel) ?? result.selectedModel;
    let resolvedFamily = candidateFamily;
    let candidateModelId = result.selectedModel;
    let familyStickinessApplied = false;
    let crossFamilySwitchBlocked = false;
    let switchReason: string | undefined;
    const notes = [`LLM router selected: ${result.selectedModel}`];

    if (
      args.previousFamily
      && args.isContinuation
      && !args.forceRoute
      && args.activePinValid
      && args.policy.preferSameFamily
      && args.previousFamily !== candidateFamily
      && args.policy.crossFamilySwitchMode === "conservative"
    ) {
      resolvedFamily = args.previousFamily;
      familyStickinessApplied = true;
      crossFamilySwitchBlocked = true;
      switchReason = "cross_family_switch_blocked_by_policy";
      notes.unshift(`Classifier suggested family ${candidateFamily}, but policy kept previous family ${args.previousFamily}.`);
    }

    const familyModel = resolveNearestFamilyModel({
      catalog: args.allowedCatalog,
      familyId: resolvedFamily,
      targetEffort: selectedEffort,
      fallbackModelId: resolvedFamily === args.previousFamily ? args.activePin?.modelId : candidateModelId,
    });
    if (familyModel) {
      candidateModelId = familyModel.id;
    }

    if (
      args.previousFamily
      && resolvedFamily === args.previousFamily
      && args.activePin
      && candidateModelId !== args.activePin.modelId
      && shouldHoldExactVariant({
        policy: args.policy,
        activePin: args.activePin,
        targetEffort: selectedEffort,
        stepClassification,
      })
    ) {
      candidateModelId = args.activePin.modelId;
      selectedEffort = args.activePin.reasoningEffort ?? selectedEffort;
      switchReason = "in_family_hysteresis";
      notes.push(`Held pinned variant ${args.activePin.modelId} to avoid in-family oscillation.`);
    }

    const selectedFamily = getFamilyIdForModel(args.allowedCatalog, candidateModelId) ?? resolvedFamily;
    const switchMode =
      args.activePin?.modelId === candidateModelId
        ? "stay_exact"
        : args.previousFamily && selectedFamily === args.previousFamily
          ? "shift_within_family"
          : args.previousFamily
            ? "switch_family"
            : candidateModelId === result.selectedModel
              ? "stay_exact"
              : "shift_within_family";

    return {
      selection: {
        selectedModel: candidateModelId,
        selectedFamily,
        previousFamily: args.previousFamily,
        selectedEffort,
        stepClassification,
        switchMode,
        switchReason: switchReason
          ?? (
            switchMode === "switch_family"
              ? "classifier_selected_new_family"
              : switchMode === "shift_within_family"
                ? "adaptive_effort_shift"
                : "classifier_selected_exact_model"
          ),
        familyStickinessApplied,
        crossFamilySwitchBlocked,
      },
      telemetry: {
        confidence: result.confidence,
        classifierAccepted: true,
        signals: result.signals,
        pinRerouteAfterTurns: result.rerouteAfterTurns ?? args.defaultSmartPinTurns,
        pinBudgetSource: result.rerouteAfterTurns ? "classifier" : "default",
        pinConsumedUserTurns: 0,
        notes,
      },
    };
  } catch (error) {
    return buildFallbackResult({
      defaultModel: args.defaultModel,
      allowedCatalog: args.allowedCatalog,
      request: args.request,
      policy: args.policy,
      previousFamily: args.previousFamily,
      switchReason: "classifier_exception_fallback",
      note: args.defaultModel
        ? `LLM router exploded: ${(error as Error).message}. Using configured fallback.`
        : `LLM router exploded: ${(error as Error).message}. No fallback model is configured.`,
      routingError: "classifier_failed_without_fallback",
      defaultSmartPinTurns: args.defaultSmartPinTurns,
    });
  }
}
