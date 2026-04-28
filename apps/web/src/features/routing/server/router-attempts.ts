import type { CatalogItem, RouteDecision, RouterRequestLike } from "@custom-router/core";

import { guardrailKey, isDisabled } from "@/src/lib/routing/guardrail-manager";
import { resolveGatewayCapabilityForBaseUrl } from "./gateway-capabilities";

import type { AttemptTarget, RoutedApiPath } from "./router-service-types";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function getImageUrlValue(part: Record<string, unknown>): string | undefined {
  if (typeof part.image_url === "string") {
    return part.image_url;
  }

  if (isRecord(part.image_url) && typeof part.image_url.url === "string") {
    return part.image_url.url;
  }

  if (typeof part.url === "string") {
    return part.url;
  }

  if (typeof part.image === "string") {
    return part.image;
  }

  const source = part.source;
  if (
    isRecord(source)
    && source.type === "base64"
    && typeof source.media_type === "string"
    && typeof source.data === "string"
  ) {
    return `data:${source.media_type};base64,${source.data}`;
  }

  return undefined;
}

function normalizeChatContentPart(part: unknown): unknown {
  if (!isRecord(part)) {
    return part;
  }

  if (part.type === "input_text") {
    return {
      ...part,
      type: "text",
    };
  }

  if (part.type !== "input_image" && part.type !== "image") {
    return part;
  }

  const imageUrl = getImageUrlValue(part);
  if (!imageUrl) {
    return part;
  }

  const normalized: Record<string, unknown> = {
    ...part,
    type: "image_url",
    image_url: { url: imageUrl },
  };
  delete normalized.url;
  delete normalized.image;
  delete normalized.source;
  return normalized;
}

function normalizeResponsesContentPart(part: unknown): unknown {
  if (!isRecord(part)) {
    return part;
  }

  if (part.type === "text") {
    return {
      ...part,
      type: "input_text",
    };
  }

  if (part.type !== "image_url" && part.type !== "image") {
    return part;
  }

  const imageUrl = getImageUrlValue(part);
  if (!imageUrl) {
    return part;
  }

  const normalized: Record<string, unknown> = {
    ...part,
    type: "input_image",
    image_url: imageUrl,
  };
  delete normalized.url;
  delete normalized.image;
  delete normalized.source;
  return normalized;
}

function normalizeMessageContentForApi(content: unknown, apiPath: RoutedApiPath): unknown {
  if (!Array.isArray(content)) {
    return content;
  }

  if (apiPath === "/responses") {
    return content.map(normalizeResponsesContentPart);
  }

  if (apiPath === "/chat/completions") {
    return content.map(normalizeChatContentPart);
  }

  return content;
}

function normalizeMessagesForApi(messages: unknown, apiPath: RoutedApiPath): unknown {
  if (!Array.isArray(messages)) {
    return messages;
  }

  return messages.map((message) => {
    if (!isRecord(message) || !("content" in message)) {
      return message;
    }

    return {
      ...message,
      content: normalizeMessageContentForApi(message.content, apiPath),
    };
  });
}

function normalizeResponsesInputForApi(input: unknown): unknown {
  if (!Array.isArray(input)) {
    return input;
  }

  return input.map((item) => {
    if (!isRecord(item)) {
      return item;
    }

    if (Array.isArray(item.content)) {
      return {
        ...item,
        content: item.content.map(normalizeResponsesContentPart),
      };
    }

    return normalizeResponsesContentPart(item);
  });
}

function normalizePayloadForApi(payload: Record<string, unknown>, apiPath: RoutedApiPath): Record<string, unknown> {
  if (apiPath === "/responses") {
    return {
      ...payload,
      input: normalizeResponsesInputForApi(payload.input),
    };
  }

  if (apiPath === "/chat/completions") {
    return {
      ...payload,
      messages: normalizeMessagesForApi(payload.messages, apiPath),
    };
  }

  return payload;
}

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
  const normalizedPayload = normalizePayloadForApi(payload, args.apiPath);

  if (
    !hasExplicitReasoningEffort
    && args.selectedEffort
    && capability.supportsFamilyIdentity
    && capability.supportsAdaptiveInFamilyShift
    && selectedItem?.upstreamModelId
  ) {
    normalizedPayload.model = selectedItem.upstreamModelId;
  }

  if (!capability.supportsReasoningEffort) {
    delete normalizedPayload.reasoning;
    return normalizedPayload;
  }

  if (
    hasExplicitReasoningEffort
    || !args.selectedEffort
    || args.selectedEffort === "provider_default"
  ) {
    return normalizedPayload;
  }

  normalizedPayload.reasoning = {
    ...(userReasoning && typeof userReasoning === "object" && !Array.isArray(userReasoning)
      ? userReasoning as Record<string, unknown>
      : {}),
    effort: args.selectedEffort,
  };

  return normalizedPayload;
}
