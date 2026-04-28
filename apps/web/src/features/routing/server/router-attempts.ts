import type { CatalogItem, RouteDecision, RouterRequestLike } from "@custom-router/core";

import { guardrailKey, isDisabled } from "@/src/lib/routing/guardrail-manager";
import { resolveGatewayCapabilityForBaseUrl } from "./gateway-capabilities";

import type { AttemptTarget, RoutedApiPath } from "./router-service-types";

export function improveErrorMessage(modelId: string, errorBody: string): string {
  if (errorBody.includes("does not support image input") || errorBody.includes("image_url")) {
    return `model=${modelId} reason=image_input_not_supported`;
  }
  if (errorBody.includes("Cannot read")) {
    return `model=${modelId} reason=unsupported_input`;
  }
  return `model=${modelId} reason=upstream_error_details_redacted`;
}

export function buildAttemptOrder(args: {
  decision: RouteDecision;
  nowMs: number;
}): AttemptTarget[] {
  const modelOrder =
    args.decision.mode === "passthrough"
      ? [args.decision.selectedModel]
      : Array.from(new Set([args.decision.selectedModel, ...args.decision.fallbackModels]));

  const attempts: AttemptTarget[] = modelOrder
    .filter((modelId) => !isDisabled(guardrailKey(modelId, "default"), args.nowMs))
    .map((modelId) => ({ modelId, provider: "default" }));

  if (attempts.length === 0 && modelOrder.length > 0) {
    attempts.push({ modelId: modelOrder[0] as string, provider: "default" });
  }

  return attempts;
}

export function resolveAttemptUpstream(
  modelId: string,
  catalog: CatalogItem[],
  gatewayMap: Map<string, { baseUrl: string; apiKey: string }>,
  defaultUpstream: { baseUrl: string; apiKey: string }
): { baseUrl: string; apiKey: string } {
  const item = catalog.find((catalogItem) => catalogItem.id === modelId);
  if (item?.gatewayId) {
    const gateway = gatewayMap.get(item.gatewayId);
    if (gateway) {
      return gateway;
    }
  }

  return defaultUpstream;
}

export function buildAttemptPayload(args: {
  body: RouterRequestLike & Record<string, unknown>;
  selectedModelId: string;
  selectedEffort?: RouteDecision["selectedEffort"];
  catalog: CatalogItem[];
  baseUrl: string;
  apiPath: RoutedApiPath;
}): Record<string, unknown> {
  const selectedItem = args.catalog.find((item) => item.id === args.selectedModelId);
  const capability = resolveGatewayCapabilityForBaseUrl(args.baseUrl);
  const userReasoning = args.body.reasoning;
  const hasExplicitReasoningEffort =
    userReasoning
    && typeof userReasoning === "object"
    && !Array.isArray(userReasoning)
    && typeof (userReasoning as { effort?: unknown }).effort === "string";

  const payload: Record<string, unknown> = {
    ...args.body,
    model: args.selectedModelId,
  };

  if (
    !hasExplicitReasoningEffort
    && args.selectedEffort
    && capability.supportsFamilyIdentity
    && capability.supportsAdaptiveInFamilyShift
    && selectedItem?.upstreamModelId
  ) {
    payload.model = selectedItem.upstreamModelId;
  }

  if (!capability.supportsReasoningEffort) {
    delete payload.reasoning;
    return payload;
  }

  if (
    hasExplicitReasoningEffort
    || !args.selectedEffort
    || args.selectedEffort === "provider_default"
  ) {
    return payload;
  }

  payload.reasoning = {
    ...(userReasoning && typeof userReasoning === "object" && !Array.isArray(userReasoning)
      ? userReasoning as Record<string, unknown>
      : {}),
    effort: args.selectedEffort,
  };

  return payload;
}
