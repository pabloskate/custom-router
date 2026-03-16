import type { CatalogItem, RouterProfile, RouterRequestLike } from "@custom-router/core";

import type { GatewayRowPublic } from "@/src/lib/storage/gateway-store";

export interface RouteAndProxyResult {
  response: Response;
  requestId: string;
}

export interface RouteInspectResult {
  requestId: string;
  selectedModel: string;
  fallbackModels: string[];
  decisionReason: string;
  classifierInvoked: boolean;
  classifierModel?: string;
  isContinuation: boolean;
  pinUsed: boolean;
  latencyMs: number;
}

export interface UserRouterConfig {
  preferredModels?: string[] | null;
  customCatalog?: CatalogItem[] | null;
  defaultModel?: string | null;
  classifierModel?: string | null;
  routingInstructions?: string | null;
  blocklist?: string[] | null;
  profiles?: RouterProfile[] | null;
  gatewayRows?: GatewayRowPublic[];
  classifierBaseUrl?: string | null;
  classifierApiKeyEnc?: string | null;
  routeTriggerKeywords?: string[] | null;
  routingFrequency?: string | null;
}

export type RoutedApiPath = "/chat/completions" | "/responses" | "/completions";

export interface AttemptTarget {
  modelId: string;
  provider: string;
}

export type RoutedRequestBody = RouterRequestLike & Record<string, unknown>;
