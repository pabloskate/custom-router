// ─────────────────────────────────────────────────────────────────────────────
// router-service.ts
//
// Orchestrates a single routed request end-to-end:
//   1. Loads config + catalog from the repository
//   2. Calls RouterEngine.decide() to pick a model
//   3. Builds a prioritised attempt list (primary → fallbacks), skipping models
//      that are currently disabled by guardrails
//   4. Tries each attempt in order, recording guardrail events after each call
//   5. Pins the thread on first success (if RouterEngine requested it)
//   6. Returns the upstream response with router metadata headers attached
//
// Guardrail logic lives in guardrail-manager.ts.
// ─────────────────────────────────────────────────────────────────────────────

import { RouterEngine } from "@custom-router/core";

import { decryptByokSecret, resolveByokEncryptionSecret } from "../auth/byok-crypto";
import { attachRouterHeaders, json } from "../infra/http";
import { requestId as makeRequestId } from "../infra/request-id";
import { getRuntimeBindings } from "../infra/runtime-bindings";
import {
  buildAttemptOrder,
  buildAttemptPayload,
  improveErrorMessage,
  resolveAttemptUpstream,
} from "@/src/features/routing/server/router-attempts";
import { resolveClassifierContext } from "@/src/features/routing/server/router-classifier-context";
import {
  buildRoutingExplanation,
  buildClassifierFailureMessage,
  createRouterEngine,
} from "@/src/features/routing/server/router-decision";
import { resolveUserRoutingContext } from "@/src/features/routing/server/router-context";
import { persistExplanation, pinSelectedModel } from "@/src/features/routing/server/router-persistence";
import type {
  RouteAndProxyResult,
  RouteInspectResult,
  RoutedApiPath,
  RoutedRequestBody,
  UserRouterConfig,
} from "@/src/features/routing/server/router-service-types";
import { executeRoutedAttempt } from "@/src/features/routing/server/router-upstream-execution";

export type {
  RouteAndProxyResult,
  RouteInspectResult,
  UserRouterConfig,
} from "@/src/features/routing/server/router-service-types";

function getClassifierConfidence(args: {
  classifierInvoked: boolean;
  classifierAccepted?: boolean;
  classificationConfidence: number;
  usedFallbackAttempt?: boolean;
}): number | undefined {
  if (!args.classifierInvoked || !args.classifierAccepted || args.usedFallbackAttempt) {
    return undefined;
  }

  return args.classificationConfidence;
}

// ── Main export ───────────────────────────────────────────────────────────────

export async function routeAndProxy(args: {
  body: RoutedRequestBody;
  apiPath: RoutedApiPath;
  userId: string;
  userConfig?: UserRouterConfig;
  dryRun?: boolean;
}): Promise<RouteAndProxyResult> {
  let classifierInvoked = false;
  const requestId = makeRequestId("router");
  const routeLoggingEnabled = args.userConfig?.routeLoggingEnabled === true;
  const bindings = getRuntimeBindings();
  const byokSecret = resolveByokEncryptionSecret({
    byokSecret: bindings.BYOK_ENCRYPTION_SECRET ?? null,
  });
  if (!byokSecret) {
    return {
      requestId,
      response: json({ error: "Server misconfigured: missing BYOK encryption secret.", request_id: requestId }, 500),
    };
  }

  // Require at least one gateway to be configured
  if (!args.userConfig?.gatewayRows?.length) {
    return {
      requestId,
      response: json(
        { error: "No gateways configured. Add a gateway in the admin console.", request_id: requestId },
        400
      ),
    };
  }

  // Decrypt all gateways and build an O(1) lookup Map.
  // The first successfully-decrypted gateway is the default upstream.
  const gatewayMap = new Map<string, { baseUrl: string; apiKey: string }>();
  let defaultUpstream: { baseUrl: string; apiKey: string } | null = null;

  for (const gw of args.userConfig.gatewayRows) {
    const key = await decryptByokSecret({ ciphertext: gw.apiKeyEnc, secret: byokSecret });
    if (key) {
      gatewayMap.set(gw.id, { baseUrl: gw.baseUrl, apiKey: key });
      if (!defaultUpstream) defaultUpstream = { baseUrl: gw.baseUrl, apiKey: key };
    }
  }

  if (!defaultUpstream) {
    return {
      requestId,
      response: json(
        { error: "Gateway keys cannot be decrypted. Re-save your gateways in the admin console.", request_id: requestId },
        500
      ),
    };
  }
  const resolvedDefaultUpstream = defaultUpstream;

  const {
    repository,
    runtimeConfig,
    catalog,
    requestedModel,
    matchedProfile,
    routedRequest,
  } = await resolveUserRoutingContext({
    body: args.body,
    userConfig: args.userConfig,
  });
  const pinStore = repository.getPinStore();

  if (routedRequest && catalog.length === 0) {
    const message = args.userConfig?.routingConfigRequiresReset
      ? "Legacy routing settings were detected. Rebuild your routing profiles in the admin console."
      : `Routing profile "${matchedProfile?.id ?? requestedModel}" has no resolved models configured.`;
    const explanation = buildRoutingExplanation({
      requestId,
      catalogVersion: "1.0",
      requestedModel,
      message,
      profileId: matchedProfile?.id,
    });
    persistExplanation({
      enabled: routeLoggingEnabled,
      repository,
      userId: args.userId,
      explanation,
    });
    return {
      requestId,
      response: json({ error: message, request_id: requestId }, 400, {
        "x-router-request-id": requestId,
      }),
    };
  }

  const classifierResolution = await resolveClassifierContext({
    requestId,
    requestedModel,
    routedRequest,
    runtimeConfig,
    profiles: args.userConfig?.profiles ?? null,
    matchedProfile,
    catalog,
    gatewayMap,
    userConfig: args.userConfig,
    byokSecret,
  });
  if (classifierResolution.failure) {
    persistExplanation({
      enabled: routeLoggingEnabled,
      repository,
      userId: args.userId,
      explanation: classifierResolution.failure.explanation,
    });
    return {
      requestId,
      response: classifierResolution.failure.response,
    };
  }

  const {
    effectiveClassifierModel,
    classifierBaseUrl,
    classifierApiKey,
    classifierGatewayId,
    classifierSupportsReasoningEffort,
  } = classifierResolution.context;

  const engine = routedRequest && classifierBaseUrl && classifierApiKey && effectiveClassifierModel
    ? createRouterEngine({
        classifierApiKey,
        classifierBaseUrl,
        classifierModel: effectiveClassifierModel,
        classifierSupportsReasoningEffort,
        onClassifierInvoked: () => {
          classifierInvoked = true;
        },
      })
    : new RouterEngine();

  const decideRoute = async (options?: {
    catalog?: typeof catalog;
    config?: typeof runtimeConfig;
    forceRoute?: boolean;
    forceRouteNote?: string;
  }) => {
    const decideStartMs = Date.now();
    const decision = await engine.decide({
      requestId,
      request: args.body,
      config: options?.config ?? runtimeConfig,
      catalog: options?.catalog ?? catalog,
      catalogVersion: "1.0", // TODO: wire up real version from catalog meta
      pinStore,
      profiles: args.userConfig?.profiles ?? undefined,
      forceRoute: options?.forceRoute,
      forceRouteNote: options?.forceRouteNote,
    });

    return {
      decision,
      latencyMs: Date.now() - decideStartMs,
    };
  };

  let activeCatalog = catalog;
  let activeRuntimeConfig = runtimeConfig;
  let { decision, latencyMs: decideLatencyMs } = await decideRoute();

  if (decision.routingError || !decision.selectedModel) {
    persistExplanation({
      enabled: routeLoggingEnabled,
      repository,
      userId: args.userId,
      explanation: {
        ...decision.explanation,
        classifierInvoked,
        classifierModel: effectiveClassifierModel ?? undefined,
        classifierBaseUrl,
        classifierGatewayId,
      },
    });

    return {
      requestId,
      response: json({ error: buildClassifierFailureMessage(decision), request_id: requestId }, 502, {
        "x-router-request-id": requestId,
      }),
    };
  }

  // Dry-run mode: return routing decision without proxying to the upstream model.
  if (args.dryRun) {
    persistExplanation({
      enabled: routeLoggingEnabled,
      repository,
      userId: args.userId,
      explanation: {
        ...decision.explanation,
        classifierInvoked,
        classifierModel: effectiveClassifierModel ?? undefined,
        classifierBaseUrl,
        classifierGatewayId,
      },
    });
    const inspectResult: RouteInspectResult = {
      requestId,
      selectedModel: decision.selectedModel,
      classificationConfidence: getClassifierConfidence({
        classifierInvoked,
        classifierAccepted: decision.classifierAccepted,
        classificationConfidence: decision.explanation.classificationConfidence,
      }),
      selectedFamily: decision.selectedFamily,
      previousFamily: decision.previousFamily,
      selectedEffort: decision.selectedEffort,
      stepClassification: decision.stepClassification,
      switchMode: decision.switchMode,
      switchReason: decision.switchReason,
      familyStickinessApplied: decision.familyStickinessApplied,
      crossFamilySwitchBlocked: decision.crossFamilySwitchBlocked,
      fallbackModels: decision.fallbackModels ?? [],
      decisionReason: decision.explanation.decisionReason,
      classifierInvoked,
      classifierModel: effectiveClassifierModel ?? undefined,
      isContinuation: decision.explanation.isContinuation,
      pinUsed: decision.explanation.pinUsed,
      latencyMs: decideLatencyMs,
      pinRerouteAfterTurns: decision.explanation.pinRerouteAfterTurns,
      pinBudgetSource: decision.explanation.pinBudgetSource,
      pinConsumedUserTurns: decision.explanation.pinConsumedUserTurns,
      isAgentLoop: decision.explanation.isAgentLoop,
    };
    return {
      requestId,
      response: json(inspectResult, 200, { "x-router-request-id": requestId }),
    };
  }

  const errors: string[] = [];
  const rerouteNotes: string[] = [];
  let degradedByPinnedRateLimitRetry = false;
  let reroutedAfterPinnedRateLimit = false;
  let lastAttempts: ReturnType<typeof buildAttemptOrder> = [];

  while (true) {
    const attempts = buildAttemptOrder({ decision, nowMs: Date.now() });
    lastAttempts = attempts;
    let restartedAfterPinnedRateLimit = false;

    for (const [index, attempt] of attempts.entries()) {
      const attemptUpstream = resolveAttemptUpstream(
        attempt.modelId,
        activeCatalog,
        gatewayMap,
        resolvedDefaultUpstream
      );
      const payload = buildAttemptPayload({
        body: args.body,
        selectedModelId: attempt.modelId,
        selectedEffort: decision.selectedEffort,
        catalog: activeCatalog,
        baseUrl: attemptUpstream.baseUrl,
        apiPath: args.apiPath,
      });

      const { result } = await executeRoutedAttempt({
        apiPath: args.apiPath,
        payload,
        modelId: attempt.modelId,
        provider: attempt.provider,
        baseUrl: attemptUpstream.baseUrl,
        apiKey: attemptUpstream.apiKey,
        fallback: index > 0,
      });

      if (!result.ok) {
        errors.push(
          `model=${attempt.modelId} provider=${attempt.provider} status=${result.status} ${improveErrorMessage(attempt.modelId, result.errorBody)}`
        );

        const shouldRetryWithoutPin =
          !reroutedAfterPinnedRateLimit
          && result.status === 429
          && decision.mode === "routed"
          && decision.pinUsed
          && index === 0
          && attempts.length === 1
          && activeCatalog.length > 1;

        if (shouldRetryWithoutPin) {
          await pinStore.clear(decision.threadKey);
          const rerouteCatalog = activeCatalog.filter((item) => item.id !== attempt.modelId);
          const rerouteConfig = activeRuntimeConfig.defaultModel === attempt.modelId
            ? { ...activeRuntimeConfig, defaultModel: undefined }
            : activeRuntimeConfig;

          if (rerouteCatalog.length > 0) {
            const rerouteOutcome = await decideRoute({
              catalog: rerouteCatalog,
              config: rerouteConfig,
              forceRoute: true,
              forceRouteNote: `Pinned model ${attempt.modelId} returned 429. Bypassing the existing thread pin for this turn.`,
            });

            if (
              rerouteOutcome.decision.mode === "routed"
              && rerouteOutcome.decision.selectedModel
              && !rerouteOutcome.decision.routingError
            ) {
              activeCatalog = rerouteCatalog;
              activeRuntimeConfig = rerouteConfig;
              decision = rerouteOutcome.decision;
              reroutedAfterPinnedRateLimit = true;
              degradedByPinnedRateLimitRetry = true;
              rerouteNotes.push(
                `Pinned model ${attempt.modelId} returned 429. Cleared the thread pin and re-ran routing for this turn.`
              );
              restartedAfterPinnedRateLimit = true;
              break;
            }
          }
        }

        continue;
      }

      const noteParts = [...decision.explanation.notes, ...rerouteNotes];
      if (index > 0) {
        noteParts.push("Fallback selected after previous model/provider failure.");
      }

      const explanation = {
        ...decision.explanation,
        selectedModel: attempt.modelId,
        decisionReason: index > 0 ? ("fallback_after_failure" as const) : decision.explanation.decisionReason,
        classifierInvoked,
        classifierModel: effectiveClassifierModel ?? undefined,
        classifierBaseUrl,
        classifierGatewayId,
        notes: noteParts,
      };

      await pinSelectedModel({
        engine,
        repository,
        shouldPin: decision.shouldPin,
        threadKey: decision.threadKey,
        requestId,
        selectedModel: attempt.modelId,
        selectedFamily: decision.selectedFamily,
        selectedEffort: decision.selectedEffort,
        stepClassification: decision.stepClassification,
        pinTurnCount: decision.pinTurnCount,
        pinRerouteAfterTurns: decision.pinRerouteAfterTurns,
        pinBudgetSource: decision.pinBudgetSource,
      });
      persistExplanation({
        enabled: routeLoggingEnabled,
        repository,
        userId: args.userId,
        explanation,
      });

      const response = decision.mode === "routed"
        ? attachRouterHeaders(result.response, {
            model: attempt.modelId,
            catalogVersion: decision.catalogVersion,
            requestId,
            degraded: decision.degraded || index > 0 || degradedByPinnedRateLimitRetry,
            confidence: getClassifierConfidence({
              classifierInvoked,
              classifierAccepted: decision.classifierAccepted,
              classificationConfidence: decision.explanation.classificationConfidence,
              usedFallbackAttempt: index > 0 || degradedByPinnedRateLimitRetry,
            }),
          })
        : result.response;

      return {
        requestId,
        response,
      };
    }

    if (!restartedAfterPinnedRateLimit) {
      break;
    }
  }

  // All attempts failed — store explanation and return 502
  persistExplanation({
    enabled: routeLoggingEnabled,
    repository,
    userId: args.userId,
    explanation: {
      ...decision.explanation,
      selectedModel: decision.selectedModel,
      decisionReason: "fallback_default" as const,
      classifierInvoked,
      classifierModel: effectiveClassifierModel ?? undefined,
      classifierBaseUrl,
      classifierGatewayId,
      notes: [...decision.explanation.notes, ...rerouteNotes, ...errors],
    },
  });

  const failureResponse = json(
    { error: "All candidate models/providers failed.", request_id: requestId, candidates: lastAttempts, details: errors },
    502
  );

  return {
    requestId,
    response: failureResponse,
  };
}
