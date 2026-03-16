import type { CatalogItem, RouterConfig, RouterProfile, RoutingExplanation } from "@custom-router/core";

import { decryptByokSecret } from "@/src/lib/auth/byok-crypto";
import { json } from "@/src/lib/infra";

import { buildRoutingExplanation, resolveEffectiveClassifierModel } from "./router-decision";
import type { UserRouterConfig } from "./router-service-types";

interface ClassifierFailure {
  explanation: RoutingExplanation;
  response: Response;
}

export interface ResolvedClassifierContext {
  effectiveClassifierModel: string | null;
  classifierBaseUrl?: string;
  classifierApiKey?: string;
  classifierGatewayId?: string;
}

export async function resolveClassifierContext(args: {
  requestId: string;
  requestedModel: string;
  routedRequest: boolean;
  runtimeConfig: RouterConfig;
  profiles?: RouterProfile[] | null;
  matchedProfile?: RouterProfile;
  catalog: CatalogItem[];
  gatewayMap: Map<string, { baseUrl: string; apiKey: string }>;
  userConfig?: UserRouterConfig;
  byokSecret: string;
}): Promise<{ context: ResolvedClassifierContext; failure?: never } | { context?: never; failure: ClassifierFailure }> {
  const effectiveClassifierModel = args.routedRequest
    ? resolveEffectiveClassifierModel({
        requestedModel: args.requestedModel,
        config: args.runtimeConfig,
        profiles: args.profiles,
      })
    : null;

  if (!args.routedRequest) {
    return { context: { effectiveClassifierModel } };
  }

  if (!effectiveClassifierModel) {
    return {
      failure: {
        explanation: buildRoutingExplanation({
          requestId: args.requestId,
          catalogVersion: "1.0",
          requestedModel: args.requestedModel,
          message: "Routed request requires an explicit classifier model.",
          profileId: args.matchedProfile?.id,
        }),
        response: json(
          { error: "Routed requests require an explicit classifier model.", request_id: args.requestId },
          400
        ),
      },
    };
  }

  let classifierApiKeyOverride: string | null = null;
  if (args.userConfig?.classifierApiKeyEnc) {
    classifierApiKeyOverride = await decryptByokSecret({
      ciphertext: args.userConfig.classifierApiKeyEnc,
      secret: args.byokSecret,
    });
    if (!classifierApiKeyOverride) {
      return {
        failure: {
          explanation: buildRoutingExplanation({
            requestId: args.requestId,
            catalogVersion: "1.0",
            requestedModel: args.requestedModel,
            message: "Classifier key cannot be decrypted. Re-save it in the admin console.",
            profileId: args.matchedProfile?.id,
            classifierModel: effectiveClassifierModel,
          }),
          response: json(
            { error: "Classifier key cannot be decrypted. Re-save it in the admin console.", request_id: args.requestId },
            500
          ),
        },
      };
    }
  }

  const hasClassifierBase = Boolean(args.userConfig?.classifierBaseUrl);
  const hasClassifierKey = Boolean(classifierApiKeyOverride);

  if (hasClassifierBase !== hasClassifierKey) {
    return {
      failure: {
        explanation: buildRoutingExplanation({
          requestId: args.requestId,
          catalogVersion: "1.0",
          requestedModel: args.requestedModel,
          message: "Dedicated classifier settings must include both base URL and API key.",
          profileId: args.matchedProfile?.id,
          classifierModel: effectiveClassifierModel,
        }),
        response: json(
          { error: "Dedicated classifier settings must include both base URL and API key.", request_id: args.requestId },
          400
        ),
      },
    };
  }

  if (hasClassifierBase && hasClassifierKey) {
    return {
      context: {
        effectiveClassifierModel,
        classifierBaseUrl: args.userConfig?.classifierBaseUrl ?? undefined,
        classifierApiKey: classifierApiKeyOverride ?? undefined,
      },
    };
  }

  const classifierCatalogItem = args.catalog.find((item) => item.id === effectiveClassifierModel);
  const gatewayId = classifierCatalogItem?.gatewayId;
  if (!gatewayId) {
    return {
      failure: {
        explanation: buildRoutingExplanation({
          requestId: args.requestId,
          catalogVersion: "1.0",
          requestedModel: args.requestedModel,
          message: `Classifier model ${effectiveClassifierModel} is not available from any configured gateway.`,
          profileId: args.matchedProfile?.id,
          classifierModel: effectiveClassifierModel,
        }),
        response: json(
          {
            error: `Classifier model ${effectiveClassifierModel} is not available from any configured gateway.`,
            request_id: args.requestId,
          },
          400
        ),
      },
    };
  }

  const classifierGateway = args.gatewayMap.get(gatewayId);
  if (!classifierGateway) {
    return {
      failure: {
        explanation: buildRoutingExplanation({
          requestId: args.requestId,
          catalogVersion: "1.0",
          requestedModel: args.requestedModel,
          message: `Classifier gateway ${gatewayId} could not be resolved.`,
          profileId: args.matchedProfile?.id,
          classifierModel: effectiveClassifierModel,
          classifierGatewayId: gatewayId,
        }),
        response: json(
          { error: `Classifier gateway ${gatewayId} could not be resolved.`, request_id: args.requestId },
          500
        ),
      },
    };
  }

  return {
    context: {
      effectiveClassifierModel,
      classifierBaseUrl: classifierGateway.baseUrl,
      classifierApiKey: classifierGateway.apiKey,
      classifierGatewayId: gatewayId,
    },
  };
}
