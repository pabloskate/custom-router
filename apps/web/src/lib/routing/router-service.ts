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
import { json } from "../infra/http";
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

// ── Main export ───────────────────────────────────────────────────────────────

export async function routeAndProxy(args: {
  body: RoutedRequestBody;
  apiPath: RoutedApiPath;
  userConfig?: UserRouterConfig;
  dryRun?: boolean;
}): Promise<RouteAndProxyResult> {
  let classifierInvoked = false;
  const requestId = makeRequestId("router");
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
    persistExplanation(repository, classifierResolution.failure.explanation);
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
  } = classifierResolution.context;

  const engine = routedRequest && classifierBaseUrl && classifierApiKey && effectiveClassifierModel
    ? createRouterEngine({
        classifierApiKey,
        classifierBaseUrl,
        classifierModel: effectiveClassifierModel,
        onClassifierInvoked: () => {
          classifierInvoked = true;
        },
      })
    : new RouterEngine();

  const decideStartMs = Date.now();
  const decision = await engine.decide({
    requestId,
    request: args.body,
    config: runtimeConfig,
    catalog,
    catalogVersion: "1.0", // TODO: wire up real version from catalog meta
    pinStore,
    profiles: args.userConfig?.profiles ?? undefined,
  });
  const decideLatencyMs = Date.now() - decideStartMs;

  if (decision.routingError || !decision.selectedModel) {
    persistExplanation(repository, {
      ...decision.explanation,
      classifierInvoked,
      classifierModel: effectiveClassifierModel ?? undefined,
      classifierBaseUrl,
      classifierGatewayId,
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
    persistExplanation(repository, {
      ...decision.explanation,
      classifierInvoked,
      classifierModel: effectiveClassifierModel ?? undefined,
      classifierBaseUrl,
      classifierGatewayId,
    });
    const inspectResult: RouteInspectResult = {
      requestId,
      selectedModel: decision.selectedModel,
      fallbackModels: decision.fallbackModels ?? [],
      decisionReason: decision.explanation.decisionReason,
      classifierInvoked,
      classifierModel: effectiveClassifierModel ?? undefined,
      isContinuation: decision.explanation.isContinuation,
      pinUsed: decision.explanation.pinUsed,
      latencyMs: decideLatencyMs,
    };
    return {
      requestId,
      response: json(inspectResult, 200, { "x-router-request-id": requestId }),
    };
  }

  const nowMs = Date.now();
  const attempts = buildAttemptOrder({ decision, nowMs });
  const errors: string[] = [];

  for (const [index, attempt] of attempts.entries()) {
    const attemptUpstream = resolveAttemptUpstream(
      attempt.modelId,
      catalog,
      gatewayMap,
      resolvedDefaultUpstream
    );
    const payload = buildAttemptPayload({
      body: args.body,
      selectedModelId: attempt.modelId,
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
      continue;
    }

    const explanation = {
      ...decision.explanation,
      selectedModel: attempt.modelId,
      decisionReason: index > 0 ? ("fallback_after_failure" as const) : decision.explanation.decisionReason,
      classifierInvoked,
      classifierModel: effectiveClassifierModel ?? undefined,
      classifierBaseUrl,
      classifierGatewayId,
      notes:
        index > 0
          ? [...decision.explanation.notes, "Fallback selected after previous model/provider failure."]
          : decision.explanation.notes,
    };

    await pinSelectedModel({
      engine,
      repository,
      shouldPin: decision.shouldPin,
      threadKey: decision.threadKey,
      requestId,
      selectedModel: attempt.modelId,
      pinTurnCount: decision.pinTurnCount,
    });
    persistExplanation(repository, explanation);

    return {
      requestId,
      response: result.response,
    };
  }

  // All attempts failed — store explanation and return 502
  persistExplanation(repository, {
    ...decision.explanation,
    selectedModel: decision.selectedModel,
    decisionReason: "fallback_default" as const,
    classifierInvoked,
    classifierModel: effectiveClassifierModel ?? undefined,
    classifierBaseUrl,
    classifierGatewayId,
    notes: [...decision.explanation.notes, ...errors],
  });

  const failureResponse = json(
    { error: "All candidate models/providers failed.", request_id: requestId, candidates: attempts, details: errors },
    502
  );

  return {
    requestId,
    response: failureResponse,
  };
}
