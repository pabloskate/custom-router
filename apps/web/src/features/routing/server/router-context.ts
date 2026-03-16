import type { CatalogItem, RouterConfig, RouterProfile } from "@custom-router/core";

import { getRouterRepository, type RouterRepository } from "@/src/lib/storage/repository";

import { findMatchedProfile, isRoutedRequestModel } from "./router-decision";
import type { RoutedRequestBody, UserRouterConfig } from "./router-service-types";

export interface ResolvedRoutingContext {
  repository: RouterRepository;
  runtimeConfig: RouterConfig;
  catalog: CatalogItem[];
  requestedModel: string;
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
    if (args.userConfig.defaultModel) runtimeConfig.defaultModel = args.userConfig.defaultModel;
    if (args.userConfig.classifierModel) runtimeConfig.classifierModel = args.userConfig.classifierModel;
    if (args.userConfig.routingInstructions && !(args.userConfig.profiles && args.userConfig.profiles.length > 0)) {
      runtimeConfig.routingInstructions = args.userConfig.routingInstructions;
    }
    if (args.userConfig.blocklist) runtimeConfig.globalBlocklist = args.userConfig.blocklist;
    if (args.userConfig.routeTriggerKeywords) runtimeConfig.routeTriggerKeywords = args.userConfig.routeTriggerKeywords;
    if (args.userConfig.routingFrequency) {
      runtimeConfig.routingFrequency = args.userConfig.routingFrequency as RouterConfig["routingFrequency"];
    }
  }

  const gatewayCatalogItems: CatalogItem[] = (args.userConfig?.gatewayRows ?? []).flatMap((gateway) =>
    gateway.models.map((model) => ({ ...model, gatewayId: gateway.id }))
  );
  const catalog =
    gatewayCatalogItems.length > 0
      ? gatewayCatalogItems
      : args.userConfig?.customCatalog && args.userConfig.customCatalog.length > 0
        ? args.userConfig.customCatalog
        : fullCatalog;

  const requestedModel = typeof args.body.model === "string" ? args.body.model : "";
  const matchedProfile = findMatchedProfile(requestedModel, args.userConfig?.profiles);
  const routedRequest = isRoutedRequestModel(requestedModel, args.userConfig?.profiles);

  return {
    repository,
    runtimeConfig,
    catalog,
    requestedModel,
    matchedProfile,
    routedRequest,
  };
}
