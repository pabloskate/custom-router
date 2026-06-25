import type { CatalogItem, RouterConfig, RouterProfile } from "@custom-router/core";

import { parseProfileModelKey, profileModelToCatalogItem } from "@/src/lib/routing/profile-config";
import { getRouterRepository, type RouterRepository } from "@/src/lib/storage/repository";

import { findMatchedProfile, isRoutedRequestModel } from "./router-decision";
import { resolveGatewayCapabilityForBaseUrl } from "./gateway-capabilities";
import type { RoutedRequestBody, UserRouterConfig } from "./router-service-types";

export interface ResolvedRoutingContext {
  repository: RouterRepository;
  runtimeConfig: RouterConfig;
  catalog: CatalogItem[];
  requestedModel: string;
  effectiveRequestModel: string;
  directGatewayId?: string;
  matchedProfile?: RouterProfile;
  routedRequest: boolean;
}

function normalizeGatewayAlias(value: string | null | undefined): string {
  return (value ?? "").toLowerCase().replace(/\s+/g, "");
}

function resolveGatewayQualifiedModel(args: {
  requestedModel: string;
  gatewayRows: NonNullable<UserRouterConfig["gatewayRows"]>;
}): { gatewayId: string; modelId: string } | null {
  const separatorIndex = args.requestedModel.indexOf("/");
  if (separatorIndex <= 0 || separatorIndex >= args.requestedModel.length - 1) {
    return null;
  }

  const gatewayAlias = normalizeGatewayAlias(args.requestedModel.slice(0, separatorIndex));
  const modelId = args.requestedModel.slice(separatorIndex + 1);
  if (!gatewayAlias || !modelId) {
    return null;
  }

  const matches = args.gatewayRows.filter((gateway) => {
    const aliases = new Set([
      normalizeGatewayAlias(gateway.id),
      normalizeGatewayAlias(gateway.name),
    ]);
    return aliases.has(gatewayAlias) && gateway.models.some((model) => model.id === modelId);
  });

  if (matches.length !== 1) {
    return null;
  }

  return {
    gatewayId: matches[0]!.id,
    modelId,
  };
}

export async function resolveUserRoutingContext(args: {
  body: RoutedRequestBody;
  userConfig?: UserRouterConfig;
}): Promise<ResolvedRoutingContext> {
  const repository = getRouterRepository();
  const [systemConfig, systemCatalog] = await Promise.all([
    repository.getConfig(),
    repository.getCatalog(),
  ]);

  const runtimeConfig: RouterConfig = { ...systemConfig };
  if (args.userConfig) {
    if (args.userConfig.routeTriggerKeywords) runtimeConfig.routeTriggerKeywords = args.userConfig.routeTriggerKeywords;
    if (args.userConfig.routingFrequency) {
      runtimeConfig.routingFrequency = args.userConfig.routingFrequency as RouterConfig["routingFrequency"];
    }
  }

  const gatewayCapabilityById = new Map(
    (args.userConfig?.gatewayRows ?? []).map((gateway) => [
      gateway.id,
      resolveGatewayCapabilityForBaseUrl(gateway.baseUrl),
    ] as const),
  );
  const gatewayInventoryItems: CatalogItem[] = (args.userConfig?.gatewayRows ?? []).flatMap((gateway) => {
    const capability = gatewayCapabilityById.get(gateway.id);
    return gateway.models.map((model) => ({
      ...model,
      upstreamModelId: capability?.supportsFamilyIdentity ? model.upstreamModelId : undefined,
      gatewayId: gateway.id,
    }));
  });

  const requestedModel = typeof args.body.model === "string" ? args.body.model : "";
  const matchedProfile = findMatchedProfile(requestedModel, args.userConfig?.profiles);
  const routedRequest = isRoutedRequestModel(requestedModel, args.userConfig?.profiles);
  const activeProfile = routedRequest ? matchedProfile : undefined;
  const directGatewayModel = !routedRequest && args.userConfig?.gatewayRows
    ? resolveGatewayQualifiedModel({
        requestedModel,
        gatewayRows: args.userConfig.gatewayRows,
      })
    : null;

  const profileInventory = (activeProfile?.models ?? [])
    .map(profileModelToCatalogItem)
    .filter((item): item is CatalogItem => Boolean(item))
    .map((item) => {
      const capability = item.gatewayId ? gatewayCapabilityById.get(item.gatewayId) : undefined;
      return {
        ...item,
        upstreamModelId: capability?.supportsFamilyIdentity ? item.upstreamModelId : undefined,
      };
    });
  const resolvedCatalog =
    routedRequest
      ? profileInventory
      : directGatewayModel
        ? gatewayInventoryItems.filter(
            (item) => item.gatewayId === directGatewayModel.gatewayId && item.id === directGatewayModel.modelId
          )
      : gatewayInventoryItems.length > 0
        ? gatewayInventoryItems
        : args.userConfig?.customCatalog && args.userConfig.customCatalog.length > 0
          ? args.userConfig.customCatalog
          : systemCatalog;

  if (activeProfile) {
    const selectedProfileModels = new Map(
      (activeProfile.models ?? [])
        .filter((model) => model.gatewayId && model.modelId)
        .map((model) => [`${model.gatewayId}::${model.modelId}`, model] as const),
    );
    const gatewayModels = new Map(
      gatewayInventoryItems
        .filter((model) => model.gatewayId)
        .map((model) => [`${model.gatewayId}::${model.id}`, model] as const),
    );

    const defaultBinding = parseProfileModelKey(activeProfile.defaultModel);
    const classifierBinding = parseProfileModelKey(activeProfile.classifierModel);
    const defaultProfileModel = defaultBinding
      ? selectedProfileModels.get(`${defaultBinding.gatewayId}::${defaultBinding.modelId}`)
      : undefined;
    const classifierGatewayModel = classifierBinding
      ? gatewayModels.get(`${classifierBinding.gatewayId}::${classifierBinding.modelId}`)
      : undefined;

    runtimeConfig.defaultModel = defaultProfileModel?.modelId;
    runtimeConfig.classifierModel = classifierGatewayModel?.id;
    runtimeConfig.routingInstructions = activeProfile.routingInstructions;
  } else if (routedRequest) {
    runtimeConfig.defaultModel = undefined;
    runtimeConfig.classifierModel = undefined;
    runtimeConfig.routingInstructions = undefined;
  }

  return {
    repository,
    runtimeConfig,
    catalog: resolvedCatalog,
    requestedModel,
    effectiveRequestModel: directGatewayModel?.modelId ?? requestedModel,
    directGatewayId: directGatewayModel?.gatewayId,
    matchedProfile,
    routedRequest,
  };
}
