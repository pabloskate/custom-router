import type { CatalogItem, RouterConfig, RouterProfile } from "@custom-router/core";

import { parseProfileModelKey, profileModelToCatalogItem } from "@/src/lib/routing/profile-config";
import { getRouterRepository, type RouterRepository } from "@/src/lib/storage/repository";

import { findMatchedProfile, isDeprecatedRoutingAlias, isRoutedRequestModel } from "./router-decision";
import type { RoutedRequestBody, UserRouterConfig } from "./router-service-types";

export interface ResolvedRoutingContext {
  repository: RouterRepository;
  runtimeConfig: RouterConfig;
  catalog: CatalogItem[];
  requestedModel: string;
  deprecatedAliasRequested: boolean;
  matchedProfile?: RouterProfile;
  routedRequest: boolean;
}

export async function resolveUserRoutingContext(args: {
  body: RoutedRequestBody;
  userConfig?: UserRouterConfig;
}): Promise<ResolvedRoutingContext> {
  const repository = getRouterRepository();
  const [systemConfig, fullCatalog] = await Promise.all([
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

  const gatewayCatalogItems: CatalogItem[] = (args.userConfig?.gatewayRows ?? []).flatMap((gateway) =>
    gateway.models.map((model) => ({ ...model, gatewayId: gateway.id }))
  );

  const requestedModel = typeof args.body.model === "string" ? args.body.model : "";
  const deprecatedAliasRequested = isDeprecatedRoutingAlias(requestedModel);
  const matchedProfile = findMatchedProfile(requestedModel, args.userConfig?.profiles);
  const routedRequest = isRoutedRequestModel(requestedModel, args.userConfig?.profiles);
  const activeProfile = routedRequest ? matchedProfile : undefined;

  const profileCatalog = (activeProfile?.models ?? [])
    .map(profileModelToCatalogItem)
    .filter((item): item is CatalogItem => Boolean(item));
  const catalog =
    routedRequest
      ? profileCatalog
      : gatewayCatalogItems.length > 0
        ? gatewayCatalogItems
        : args.userConfig?.customCatalog && args.userConfig.customCatalog.length > 0
          ? args.userConfig.customCatalog
          : fullCatalog;

  if (activeProfile) {
    const selectedProfileModels = new Map(
      (activeProfile.models ?? [])
        .filter((model) => model.gatewayId && model.modelId)
        .map((model) => [`${model.gatewayId}::${model.modelId}`, model] as const),
    );
    const gatewayModels = new Map(
      gatewayCatalogItems
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
    catalog,
    requestedModel,
    deprecatedAliasRequested,
    matchedProfile,
    routedRequest,
  };
}
