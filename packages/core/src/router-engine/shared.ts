import { compareReasoningPresets, resolveFixedPolicyEffort, toComparableReasoningPreset } from "../routing-policy";
import type {
  ReasoningEffort,
  ReasoningPolicy,
  ReasoningPreset,
  RouteDecision,
  RouterProfile,
  RouterRequestLike,
  RoutingStepClassification,
  RoutingSwitchMode,
  ThreadPin,
} from "../types";

export const DEFAULT_SMART_PIN_TURNS = 3;

export type EffectiveReasoningPolicy = Required<
  Pick<
    ReasoningPolicy,
    | "mode"
    | "latencySensitivity"
    | "toolStepBias"
    | "allowDowngradeAfterPlan"
    | "preferSameFamily"
    | "crossFamilySwitchMode"
    | "inFamilyShiftHysteresis"
  >
> & Pick<ReasoningPolicy, "shortOutputThreshold" | "longOutputThreshold">;

const DEFAULT_REASONING_POLICY: Required<
  Pick<
    ReasoningPolicy,
    | "mode"
    | "latencySensitivity"
    | "toolStepBias"
    | "allowDowngradeAfterPlan"
    | "preferSameFamily"
    | "crossFamilySwitchMode"
    | "inFamilyShiftHysteresis"
  >
> = {
  mode: "adaptive",
  latencySensitivity: "medium",
  toolStepBias: "prefer_reflex",
  allowDowngradeAfterPlan: true,
  preferSameFamily: true,
  crossFamilySwitchMode: "conservative",
  inFamilyShiftHysteresis: "sticky",
};

const DEFAULT_STEP_CLASSIFICATION: RoutingStepClassification = {
  stepMode: "deliberate",
  complexity: "medium",
  stakes: "medium",
  latencySensitivity: "medium",
  toolNeed: "optional",
  expectedOutputSize: "medium",
  interactionHorizon: "one_shot",
};

export interface ResolvedSelection {
  selectedModel: string;
  selectedFamily?: string;
  previousFamily?: string;
  selectedEffort?: ReasoningEffort;
  stepClassification?: RoutingStepClassification;
  switchMode?: RoutingSwitchMode;
  switchReason?: string;
  familyStickinessApplied: boolean;
  crossFamilySwitchBlocked: boolean;
}

export interface PinEvaluation {
  activePin: ThreadPin | null;
  activePinValid: boolean;
  previousFamily?: string;
  pinUsed: boolean;
  shouldPin: boolean;
  decisionReason: RouteDecision["explanation"]["decisionReason"];
  pinBypassReason?: string;
  pinTurnCount?: number;
  pinRerouteAfterTurns?: number;
  pinBudgetSource?: "classifier" | "default";
  pinConsumedUserTurns: number;
  notes: string[];
  selection?: ResolvedSelection;
}

export interface ResolutionTelemetry {
  confidence: number;
  classifierAccepted: boolean;
  signals: string[];
  pinRerouteAfterTurns?: number;
  pinBudgetSource?: "classifier" | "default";
  pinConsumedUserTurns: number;
  notes: string[];
  routingError?: string;
}

export function getEffectiveReasoningPolicy(profile: RouterProfile | undefined): EffectiveReasoningPolicy {
  return {
    ...DEFAULT_REASONING_POLICY,
    ...profile?.reasoningPolicy,
  };
}

export function normalizeStepClassification(args: {
  classification?: RoutingStepClassification;
  request: RouterRequestLike;
  policy?: Pick<ReasoningPolicy, "shortOutputThreshold" | "longOutputThreshold">;
}): RoutingStepClassification {
  const requestWithTokenHints = args.request as RouterRequestLike & {
    max_tokens?: number;
    max_completion_tokens?: number;
  };
  const requestedMaxTokens = typeof requestWithTokenHints.max_tokens === "number"
    ? requestWithTokenHints.max_tokens
    : typeof requestWithTokenHints.max_completion_tokens === "number"
      ? requestWithTokenHints.max_completion_tokens
      : undefined;
  const hasTools = Array.isArray(args.request.tools) && args.request.tools.length > 0;
  const base = args.classification ?? DEFAULT_STEP_CLASSIFICATION;
  let expectedOutputSize = base.expectedOutputSize ?? "medium";

  if (typeof requestedMaxTokens === "number") {
    if (
      typeof args.policy?.shortOutputThreshold === "number"
      && requestedMaxTokens <= args.policy.shortOutputThreshold
    ) {
      expectedOutputSize = "short";
    } else if (
      typeof args.policy?.longOutputThreshold === "number"
      && requestedMaxTokens >= args.policy.longOutputThreshold
    ) {
      expectedOutputSize = "long";
    }
  }

  return {
    stepMode: base.stepMode ?? (hasTools ? "tool" : "deliberate"),
    complexity: base.complexity ?? "medium",
    stakes: base.stakes ?? "medium",
    latencySensitivity: base.latencySensitivity ?? "medium",
    toolNeed: base.toolNeed ?? (hasTools ? "required" : "optional"),
    expectedOutputSize,
    interactionHorizon: base.interactionHorizon ?? "one_shot",
  };
}

function minReasoningPreset(left: ReasoningPreset, right: ReasoningPreset): ReasoningPreset {
  return compareReasoningPresets(left, right) <= 0 ? left : right;
}

function maxReasoningPreset(left: ReasoningPreset, right: ReasoningPreset): ReasoningPreset {
  return compareReasoningPresets(left, right) >= 0 ? left : right;
}

export function deriveReasoningEffort(args: {
  policy: EffectiveReasoningPolicy;
  stepClassification: RoutingStepClassification;
}): ReasoningEffort {
  const fixedEffort = resolveFixedPolicyEffort(args.policy.mode);
  if (fixedEffort) {
    return fixedEffort;
  }
  if (args.policy.mode === "off") {
    return "none";
  }

  let effort: ReasoningPreset =
    args.stepClassification.stepMode === "tool"
      ? args.policy.toolStepBias === "strong_reflex"
        ? "none"
        : "low"
      : args.stepClassification.stepMode === "synthesis"
        ? args.stepClassification.expectedOutputSize === "long"
          ? "medium"
          : "low"
        : args.stepClassification.complexity === "high" || args.stepClassification.interactionHorizon === "multi_step"
          ? "high"
          : "medium";

  if (args.stepClassification.toolNeed === "required" && args.stepClassification.stepMode !== "tool") {
    effort = maxReasoningPreset(effort, "medium");
  }
  if (args.stepClassification.stakes === "high") {
    effort = maxReasoningPreset(effort, "high");
  }
  if (args.stepClassification.stakes === "critical") {
    effort = "xhigh";
  }

  const effectiveLatencySensitivity =
    args.policy.latencySensitivity === "high" || args.stepClassification.latencySensitivity === "high"
      ? "high"
      : args.policy.latencySensitivity === "low" && args.stepClassification.latencySensitivity === "low"
        ? "low"
        : "medium";

  if (effectiveLatencySensitivity === "high" && args.stepClassification.stakes === "low") {
    effort =
      args.stepClassification.stepMode === "tool"
        ? minReasoningPreset(effort, "low")
        : minReasoningPreset(effort, "medium");
  }

  if (
    args.stepClassification.stepMode === "tool"
    && args.stepClassification.expectedOutputSize === "short"
    && args.stepClassification.stakes === "low"
    && args.policy.toolStepBias === "strong_reflex"
  ) {
    effort = "none";
  }

  return effort;
}

export function shouldHoldExactVariant(args: {
  policy: EffectiveReasoningPolicy;
  activePin: ThreadPin | null;
  targetEffort: ReasoningEffort;
  stepClassification: RoutingStepClassification;
}): boolean {
  if (!args.activePin || args.policy.inFamilyShiftHysteresis === "off") {
    return false;
  }

  const currentEffort = args.activePin.reasoningEffort ?? "provider_default";
  if (currentEffort === args.targetEffort) {
    return false;
  }

  const comparableTarget = toComparableReasoningPreset(args.targetEffort);
  const comparableCurrent = toComparableReasoningPreset(currentEffort);
  const upgrading = compareReasoningPresets(comparableTarget, comparableCurrent) > 0;
  const downgrading = compareReasoningPresets(comparableTarget, comparableCurrent) < 0;
  const isDowngradeAfterPlan =
    downgrading
    && args.policy.allowDowngradeAfterPlan
    && args.activePin.stepMode
    && args.activePin.stepMode !== "tool"
    && args.stepClassification.stepMode === "tool";
  const requiresUrgentUpgrade =
    upgrading
    && (
      args.stepClassification.stakes === "high"
      || args.stepClassification.stakes === "critical"
      || args.stepClassification.stepMode === "deliberate"
    );

  return !isDowngradeAfterPlan && !requiresUrgentUpgrade;
}
