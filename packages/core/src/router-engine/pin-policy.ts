import { getCatalogItemReasoningEffort, getFamilyIdForModel } from "../routing-policy";
import type { CatalogItem, PinStore, ThreadPin } from "../types";
import type { PinEvaluation, ResolvedSelection } from "./shared";

function buildPinSelection(args: {
  activePin: ThreadPin;
  allowedCatalog: CatalogItem[];
  previousFamily?: string;
}): ResolvedSelection {
  return {
    selectedModel: args.activePin.modelId,
    selectedFamily: args.previousFamily ?? getFamilyIdForModel(args.allowedCatalog, args.activePin.modelId),
    previousFamily: args.previousFamily,
    selectedEffort: args.activePin.reasoningEffort ?? getCatalogItemReasoningEffort(
      args.allowedCatalog.find((item) => item.id === args.activePin.modelId),
    ),
    switchMode: "stay_exact",
    switchReason: "active_pin_reuse",
    familyStickinessApplied: false,
    crossFamilySwitchBlocked: false,
  };
}

function describeInvalidPin(args: {
  activePin: ThreadPin;
  hasImageInput: boolean;
  requiresImageOutput: boolean;
  allowedCatalog: CatalogItem[];
  fullCatalog: CatalogItem[];
}): { note: string; bypassReason: string } {
  if (
    (args.hasImageInput || args.requiresImageOutput)
    && !args.allowedCatalog.some((model) => model.id === args.activePin.modelId)
    && args.fullCatalog.some((model) => model.id === args.activePin.modelId)
  ) {
    const requestNeed = args.requiresImageOutput
      ? (args.hasImageInput ? "image input/output" : "image output")
      : "image input";
    return {
      note: `Request needs ${requestNeed}, but pinned model (${args.activePin.modelId}) is not compatible. Breaking cache lock.`,
      bypassReason: "pin_invalid_image",
    };
  }

  return {
    note: `Pinned model invalid (not in catalog): ${args.activePin.modelId}`,
    bypassReason: "pin_invalid",
  };
}

export async function resolvePinPolicy(args: {
  routingFrequency: "smart" | "every_message" | "new_thread_only";
  pinStore: PinStore;
  threadKey: string;
  isContinuation: boolean;
  forceRoute: boolean;
  forceRouteNote?: string;
  isLoop: boolean;
  defaultSmartPinTurns: number;
  allowedCatalog: CatalogItem[];
  fullCatalog: CatalogItem[];
  hasImageInput: boolean;
  requiresImageOutput: boolean;
}): Promise<PinEvaluation> {
  const notes: string[] = [];
  let activePin: ThreadPin | null = null;
  let activePinValid = false;
  let pinUsed = false;
  let shouldPin = true;
  let decisionReason: PinEvaluation["decisionReason"] = "initial_route";
  let pinBypassReason: string | undefined;
  let pinTurnCount: number | undefined;
  let pinRerouteAfterTurns: number | undefined;
  let pinBudgetSource: "classifier" | "default" | undefined;
  let pinConsumedUserTurns = 0;

  if (args.routingFrequency !== "every_message" && args.isContinuation) {
    activePin = await args.pinStore.get(args.threadKey);
    if (activePin) {
      const pinnedModelId = activePin.modelId;
      activePinValid = args.allowedCatalog.some((model) => model.id === pinnedModelId);
    }
  }

  if (args.routingFrequency === "every_message") {
    shouldPin = false;
    pinBypassReason = "routing_frequency_every_message";
    if (args.forceRoute) {
      notes.push(args.forceRouteNote ?? "Force route requested, but routing frequency is 'every message' — classifier runs every turn regardless.");
    }
  } else if (args.routingFrequency === "new_thread_only") {
    if (args.forceRoute) {
      notes.push(args.forceRouteNote ?? "Force route requested. Bypassing thread pin even though routing frequency is 'new thread only'.");
      pinBypassReason = "force_route";
    } else if (args.isContinuation) {
      if (activePin) {
        if (activePinValid) {
          pinUsed = true;
          decisionReason = "thread_pin";
          pinTurnCount = args.isLoop ? activePin.turnCount : activePin.turnCount + 1;
          pinConsumedUserTurns = pinTurnCount;
          notes.push(
            `Reused pinned model from thread: ${activePin.modelId}. User-turn count: ${activePin.turnCount} -> ${pinTurnCount}${args.isLoop ? " (Agent Loop detected; count unchanged)" : ""}`,
          );
        } else {
          decisionReason = "pin_invalid";
          const invalid = describeInvalidPin({
            activePin,
            hasImageInput: args.hasImageInput,
            requiresImageOutput: args.requiresImageOutput,
            allowedCatalog: args.allowedCatalog,
            fullCatalog: args.fullCatalog,
          });
          notes.push(invalid.note);
          pinBypassReason = invalid.bypassReason;
        }
      } else {
        pinBypassReason = "pin_missing_or_expired";
      }
    } else {
      pinBypassReason = "new_thread";
    }
  } else {
    if (args.forceRoute) {
      notes.push(args.forceRouteNote ?? "Force route requested. Bypassing thread pin for this turn.");
      pinBypassReason = "force_route";
    }

    if (args.isContinuation && !args.forceRoute) {
      if (activePin) {
        if (activePinValid) {
          const activeBudget = activePin.rerouteAfterTurns ?? args.defaultSmartPinTurns;
          pinRerouteAfterTurns = activeBudget;
          pinBudgetSource = activePin.budgetSource ?? "default";
          if (args.isLoop || activePin.turnCount + 1 < activeBudget) {
            pinUsed = true;
            decisionReason = "thread_pin";
            pinTurnCount = args.isLoop ? activePin.turnCount : activePin.turnCount + 1;
            pinConsumedUserTurns = pinTurnCount;
            notes.push(
              `Reused pinned model from thread: ${activePin.modelId}. User-turn count: ${activePin.turnCount} -> ${pinTurnCount}${args.isLoop ? " (Agent Loop detected; count unchanged)" : ""}`,
            );
          } else {
            notes.push(`Smart pin limit reached (${activePin.turnCount + 1} would reach ${activeBudget}). Re-evaluating router.`);
            pinBypassReason = "smart_pin_turn_limit";
          }
        } else {
          decisionReason = "pin_invalid";
          const invalid = describeInvalidPin({
            activePin,
            hasImageInput: args.hasImageInput,
            requiresImageOutput: args.requiresImageOutput,
            allowedCatalog: args.allowedCatalog,
            fullCatalog: args.fullCatalog,
          });
          notes.push(invalid.note);
          pinBypassReason = invalid.bypassReason;
        }
      } else {
        pinBypassReason = "pin_missing_or_expired";
      }
    } else if (!args.isContinuation) {
      pinBypassReason = "new_thread";
    }
  }

  const previousFamily = activePin?.familyId ?? (activePin ? getFamilyIdForModel(args.fullCatalog, activePin.modelId) : undefined);

  return {
    activePin,
    activePinValid,
    previousFamily,
    pinUsed,
    shouldPin,
    decisionReason,
    pinBypassReason,
    pinTurnCount,
    pinRerouteAfterTurns,
    pinBudgetSource,
    pinConsumedUserTurns,
    notes,
    selection: pinUsed && activePin
      ? buildPinSelection({
          activePin,
          allowedCatalog: args.allowedCatalog,
          previousFamily,
        })
      : undefined,
  };
}
