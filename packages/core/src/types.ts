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

export interface RouterProfile {
  id: string;                    // Client-facing model name, e.g. "auto-cheap"
  name: string;                  // Display name for UI
  description?: string;          // Shown in /v1/models and admin UI
  overrideModels?: boolean;      // When true, use profile defaultModel/classifierModel; otherwise inherit global
  defaultModel?: string;         // Fallback model override for this profile (used when overrideModels=true)
  classifierModel?: string;      // Override classifier LLM (used when overrideModels=true)
  routingInstructions?: string;  // Replaces global routing instructions
  blocklist?: string[];          // Additive with globalBlocklist
  catalogFilter?: string[];      // Allowlist: only route to these model IDs
}

export type RoutingFrequency = "every_message" | "smart" | "new_thread_only";

export interface RouterConfig {
  version: string;
  defaultModel?: string;
  classifierModel?: string; // The LLM to use for making routing decisions
  globalBlocklist: string[];
  routingInstructions?: string; // Markdown instructions for the LLM
  cooldownTurns?: number;
  phaseCompleteSignal?: string;
  routeTriggerKeywords?: string[];       // Custom keywords that trigger re-routing (additive with built-in $$route)
  routingFrequency?: RoutingFrequency;   // Controls when the classifier re-evaluates: every_message | smart | new_thread_only
}

export interface LlmRoutingResult {
  selectedModel: string;
  confidence: number;
  signals: string[];
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
  threadKey: string;
  isContinuation: boolean;
  pinUsed: boolean;
  selectedModel: string;
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
}

export interface RouteDecision {
  mode: "passthrough" | "routed";
  requestedModel: string;
  selectedModel: string;
  catalogVersion: string;
  threadKey: string;
  isContinuation: boolean;
  pinUsed: boolean;
  degraded: boolean;
  explanation: RoutingExplanation;
  fallbackModels: string[];
  shouldPin: boolean;
  pinTurnCount?: number;
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

export interface CatalogItem {
  id: string;
  name: string;
  modality?: string;
  thinking?: ReasoningPreset;
  reasoningPreset?: ReasoningPreset;
  upstreamModelId?: string;
  whenToUse?: string;
  description?: string;
  gatewayId?: string;  // injected at catalog-build time; not stored in gateway models_json
}

export const AUTO_MODELS = new Set(["auto", "router/auto"]);
