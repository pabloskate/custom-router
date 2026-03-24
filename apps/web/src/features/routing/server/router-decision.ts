import {
  RouterEngine,
  type CatalogItem,
  type RouteDecision,
  type RouterConfig,
  type RouterProfile,
  type RoutingExplanation,
} from "@custom-router/core";

import { routeWithFrontierModel } from "@/src/lib/routing/frontier-classifier";

export function createRouterEngine(args: {
  classifierApiKey: string;
  classifierBaseUrl: string;
  classifierModel: string;
  classifierSupportsReasoningEffort?: boolean;
  onClassifierInvoked?: () => void;
}): RouterEngine {
  return new RouterEngine({
    llmRouter: async (routerArgs) => {
      args.onClassifierInvoked?.();
      return routeWithFrontierModel({
        apiKey: args.classifierApiKey,
        baseUrl: args.classifierBaseUrl,
        model: routerArgs.classifierModel ?? args.classifierModel,
        input: routerArgs.prompt,
        catalog: routerArgs.catalog,
        routingInstructions: routerArgs.routingInstructions,
        currentModel: routerArgs.currentModel,
        supportsReasoningEffort: args.classifierSupportsReasoningEffort,
      });
    },
  });
}

export function findMatchedProfile(requestedModel: string, profiles?: RouterProfile[] | null): RouterProfile | undefined {
  return profiles?.find((profile) => profile.id === requestedModel);
}

export function isRoutedRequestModel(requestedModel: string, profiles?: RouterProfile[] | null): boolean {
  return Boolean(findMatchedProfile(requestedModel, profiles));
}

export function resolveEffectiveClassifierModel(args: {
  requestedModel: string;
  config: RouterConfig;
  profiles?: RouterProfile[] | null;
}): string | null {
  return args.config.classifierModel ?? null;
}

export function buildRoutingExplanation(args: {
  requestId: string;
  catalogVersion: string;
  requestedModel: string;
  message: string;
  profileId?: string;
  classifierModel?: string;
  classifierBaseUrl?: string;
  classifierGatewayId?: string;
}): RoutingExplanation {
  return {
    requestId: args.requestId,
    createdAt: new Date().toISOString(),
    requestedModel: args.requestedModel,
    catalogVersion: args.catalogVersion,
    classificationConfidence: 0,
    classificationSignals: [],
    threadKey: "unavailable",
    isContinuation: false,
    pinUsed: false,
    selectedModel: args.requestedModel,
    decisionReason: "fallback_default",
    fallbackChain: [],
    notes: [args.message],
    profileId: args.profileId,
    classifierInvoked: false,
    classifierModel: args.classifierModel,
    classifierBaseUrl: args.classifierBaseUrl,
    classifierGatewayId: args.classifierGatewayId,
  };
}

export function buildClassifierFailureMessage(decision: RouteDecision): string {
  return decision.routingError === "classifier_failed_without_fallback"
    ? "Classifier failed and no fallback model is configured."
    : decision.routingError === "classifier_returned_invalid_model_without_fallback"
      ? "Classifier returned an invalid model and no fallback model is configured."
      : decision.routingError === "classifier_missing_without_fallback"
        ? "No classifier is available and no fallback model is configured."
        : "Router could not select a model.";
}

export function getCatalogItem(catalog: CatalogItem[], modelId: string): CatalogItem | undefined {
  return catalog.find((item) => item.id === modelId);
}
