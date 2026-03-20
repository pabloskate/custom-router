import type {
  CatalogItem,
  ReasoningEffort,
  RouterProfile,
  RouterRequestLike,
  RoutingStepClassification,
  RoutingSwitchMode,
} from "@custom-router/core";

import type { GatewayRowPublic } from "@/src/lib/storage/gateway-store";

export interface RouteAndProxyResult {
  response: Response;
  requestId: string;
}

export interface RouteInspectResult {
  requestId: string;
  selectedModel: string;
  classificationConfidence?: number;
  selectedFamily?: string;
  previousFamily?: string;
  selectedEffort?: ReasoningEffort;
  stepClassification?: RoutingStepClassification;
  switchMode?: RoutingSwitchMode;
  switchReason?: string;
  familyStickinessApplied?: boolean;
  crossFamilySwitchBlocked?: boolean;
  fallbackModels: string[];
  decisionReason: string;
  classifierInvoked: boolean;
  classifierModel?: string;
  isContinuation: boolean;
  pinUsed: boolean;
  latencyMs: number;
  pinRerouteAfterTurns?: number;
  pinBudgetSource?: "classifier" | "default";
  pinConsumedUserTurns?: number;
  isAgentLoop?: boolean;
}

export interface UserRouterConfig {
  preferredModels?: string[] | null;
  customCatalog?: CatalogItem[] | null;
  profiles?: RouterProfile[] | null;
  gatewayRows?: GatewayRowPublic[];
  classifierBaseUrl?: string | null;
  classifierApiKeyEnc?: string | null;
  routeTriggerKeywords?: string[] | null;
  routingFrequency?: string | null;
  routingConfigRequiresReset?: boolean;
}

export type RoutedApiPath = "/chat/completions" | "/responses" | "/completions";

export interface AttemptTarget {
  modelId: string;
  provider: string;
}

export type RoutedRequestBody = RouterRequestLike & Record<string, unknown>;
