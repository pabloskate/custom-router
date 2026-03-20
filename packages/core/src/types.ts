export const QUERY_CATEGORIES = [
  "coding",
  "math",
  "general",
  "long_context",
  "creative"
] as const;

export type QueryCategory = (typeof QUERY_CATEGORIES)[number];

export const QUERY_PROFILES = [
  "planning_backend",
  "implementation_backend",
  "debugging_backend",
  "review_backend",
  "planning_frontend_design",
  "implementation_frontend",
  "debugging_frontend",
  "review_frontend_design"
] as const;

export type QueryProfile = (typeof QUERY_PROFILES)[number];

export const PROFILE_TO_CATEGORY: Record<QueryProfile, QueryCategory> = {
  planning_backend: "general",
  implementation_backend: "coding",
  debugging_backend: "coding",
  review_backend: "general",
  planning_frontend_design: "creative",
  implementation_frontend: "coding",
  debugging_frontend: "coding",
  review_frontend_design: "creative"
};

export interface CategoryWeights {
  quality: number;
  speed: number;
  cost: number;
}

export interface ProfileWeights {
  quality: number;
  speed: number;
  costEfficiency: number;
  reliability: number;
}

export type RoutingStepMode = "tool" | "deliberate" | "synthesis";
export type RoutingComplexity = "low" | "medium" | "high";
export type RoutingStakes = "low" | "medium" | "high" | "critical";
export type RoutingLatencySensitivity = "low" | "medium" | "high";
export type RoutingToolNeed = "none" | "optional" | "required";
export type RoutingExpectedOutputSize = "short" | "medium" | "long";
export type RoutingInteractionHorizon = "one_shot" | "multi_step";

export interface RoutingStepClassification {
  stepMode: RoutingStepMode;
  complexity: RoutingComplexity;
  stakes: RoutingStakes;
  latencySensitivity: RoutingLatencySensitivity;
  toolNeed: RoutingToolNeed;
  expectedOutputSize: RoutingExpectedOutputSize;
  interactionHorizon: RoutingInteractionHorizon;
}

export type ReasoningPolicyMode =
  | "off"
  | "adaptive"
  | "fixed_provider_default"
  | "fixed_none"
  | "fixed_minimal"
  | "fixed_low"
  | "fixed_medium"
  | "fixed_high"
  | "fixed_xhigh";

export type ToolStepBias = "off" | "prefer_reflex" | "strong_reflex";
export type CrossFamilySwitchMode = "conservative" | "permissive";
export type InFamilyShiftHysteresis = "off" | "sticky";

export interface ReasoningPolicy {
  mode?: ReasoningPolicyMode;
  latencySensitivity?: RoutingLatencySensitivity;
  toolStepBias?: ToolStepBias;
  shortOutputThreshold?: number;
  longOutputThreshold?: number;
  allowDowngradeAfterPlan?: boolean;
  preferSameFamily?: boolean;
  crossFamilySwitchMode?: CrossFamilySwitchMode;
  inFamilyShiftHysteresis?: InFamilyShiftHysteresis;
}

export type RoutingSwitchMode = "stay_exact" | "shift_within_family" | "switch_family";

export interface RouterProfileModel {
  gatewayId?: string;           // Selected gateway owner. Missing means the draft is unresolved.
  modelId: string;              // Upstream model ID, e.g. "anthropic/claude-sonnet-4.6"
  upstreamModelId?: string;
  name?: string;                // Optional profile-local label override
  modality?: string;
  thinking?: ReasoningEffort;
  reasoningPreset?: ReasoningEffort;
  whenToUse?: string;
  description?: string;
}

export interface RouterProfile {
  id: string;                    // Client-facing routed model name, e.g. "cost-optimized"
  name: string;                  // Display name for UI
  description?: string;          // Shown in /v1/models and admin UI
  defaultModel?: string;         // Gateway-bound fallback selection key for this profile
  classifierModel?: string;      // Gateway-bound classifier selection key; may point outside this profile's routed pool
  routingInstructions?: string;  // Classifier instructions scoped to this profile
  reasoningPolicy?: ReasoningPolicy;
  models?: RouterProfileModel[]; // Authoritative routed pool for this profile
}

export type RoutingFrequency = "every_message" | "smart" | "new_thread_only";

export interface RouterConfig {
  version: string;
  defaultModel?: string;
  classifierModel?: string; // The LLM to use for making routing decisions
  globalBlocklist: string[];
  routingInstructions?: string; // Legacy fallback when no profile-scoped instructions exist
  cooldownTurns?: number;
  smartPinTurns?: number;
  phaseCompleteSignal?: string;
  routeTriggerKeywords?: string[];       // Custom keywords that trigger re-routing (additive with built-in $$route)
  routingFrequency?: RoutingFrequency;   // Controls when the classifier re-evaluates: every_message | smart | new_thread_only
}

export interface LlmRoutingResult {
  selectedModel: string;
  confidence: number;
  signals: string[];
  rerouteAfterTurns?: number;
  stepClassification?: RoutingStepClassification;
}

export interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool" | "developer";
  content?: unknown;
  tool_call_id?: string;
  tool_calls?: unknown[];
}

export interface RouterTool {
  type?: string;
  function?: {
    name?: string;
    description?: string;
  };
}

export interface RouterRequestLike {
  model: string;
  messages?: ChatMessage[];
  input?: unknown;
  prompt?: unknown;
  tools?: RouterTool[];
  previous_response_id?: string;
}

export interface ThreadFingerprintInput {
  messages?: ChatMessage[];
  input?: unknown;
  prompt?: unknown;
  tools?: RouterTool[];
  previousResponseId?: string;
  profileId?: string;  // Isolates pins per named profile
}

export interface ThreadPin {
  threadKey: string;
  modelId: string;
  requestId: string;
  pinnedAt: string;
  expiresAt: string;
  turnCount: number;
  rerouteAfterTurns?: number;
  budgetSource?: "classifier" | "default";
  familyId?: string;
  reasoningEffort?: ReasoningEffort;
  stepMode?: RoutingStepMode;
}

export interface PinStore {
  get(threadKey: string): Promise<ThreadPin | null>;
  set(pin: ThreadPin): Promise<void>;
  clear(threadKey: string): Promise<void>;
}

export interface RoutingExplanation {
  requestId: string;
  createdAt: string;
  catalogVersion: string;
  classificationConfidence: number;
  classificationSignals: string[];
  stepClassification?: RoutingStepClassification;
  threadKey: string;
  isContinuation: boolean;
  pinUsed: boolean;
  selectedModel: string;
  selectedFamily?: string;
  previousFamily?: string;
  selectedEffort?: ReasoningEffort;
  switchMode?: RoutingSwitchMode;
  switchReason?: string;
  familyStickinessApplied?: boolean;
  crossFamilySwitchBlocked?: boolean;
  decisionReason:
  | "passthrough"
  | "initial_route"
  | "thread_pin"
  | "pin_invalid"
  | "fallback_after_failure"
  | "fallback_default";
  fallbackChain: string[];
  notes: string[];
  profileId?: string;  // Set when request was matched to a named profile
  classifierInvoked?: boolean;
  classifierModel?: string;
  classifierBaseUrl?: string;
  classifierGatewayId?: string;
  pinBypassReason?: string;
  pinRerouteAfterTurns?: number;
  pinBudgetSource?: "classifier" | "default";
  pinConsumedUserTurns?: number;
  isAgentLoop?: boolean;
}

export interface RouteDecision {
  mode: "passthrough" | "routed";
  requestedModel: string;
  selectedModel: string;
  selectedFamily?: string;
  previousFamily?: string;
  selectedEffort?: ReasoningEffort;
  stepClassification?: RoutingStepClassification;
  switchMode?: RoutingSwitchMode;
  switchReason?: string;
  familyStickinessApplied?: boolean;
  crossFamilySwitchBlocked?: boolean;
  catalogVersion: string;
  threadKey: string;
  isContinuation: boolean;
  pinUsed: boolean;
  degraded: boolean;
  classifierAccepted?: boolean;
  explanation: RoutingExplanation;
  fallbackModels: string[];
  shouldPin: boolean;
  pinTurnCount?: number;
  pinRerouteAfterTurns?: number;
  pinBudgetSource?: "classifier" | "default";
  routingError?: string;
}

export const REASONING_PRESETS = [
  "none",
  "minimal",
  "low",
  "medium",
  "high",
  "xhigh",
] as const;

export type ReasoningPreset = (typeof REASONING_PRESETS)[number];

export const REASONING_EFFORTS = [
  "provider_default",
  ...REASONING_PRESETS,
] as const;

export type ReasoningEffort = (typeof REASONING_EFFORTS)[number];

export interface CatalogItem {
  id: string;
  name: string;
  modality?: string;
  thinking?: ReasoningEffort;
  reasoningPreset?: ReasoningEffort;
  upstreamModelId?: string;
  whenToUse?: string;
  description?: string;
  gatewayId?: string;  // injected at catalog-build time; not stored in gateway models_json
}
