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

import {
  AUTO_MODELS,
  RouterEngine,
  type RouteDecision,
  type RouterRequestLike,
  type CatalogItem,
  type RouterConfig,
  type RouterProfile,
  type RoutingExplanation,
} from "@custom-router/core";

import { decryptByokSecret, resolveByokEncryptionSecret } from "../auth/byok-crypto";
import { json } from "../infra/http";
import { requestId as makeRequestId } from "../infra/request-id";
import { getRuntimeBindings } from "../infra/runtime-bindings";
import { type GatewayRowPublic } from "../storage/gateway-store";
import { getRouterRepository } from "../storage/repository";
import { callOpenAiCompatible } from "../upstream/upstream";
import { routeWithFrontierModel } from "./frontier-classifier";
import { guardrailKey, isDisabled, recordEvent } from "./guardrail-manager";

function improveErrorMessage(modelId: string, errorBody: string): string {
  if (errorBody.includes("does not support image input") || errorBody.includes("image_url")) {
    return `model=${modelId} reason=image_input_not_supported`;
  }
  if (errorBody.includes("Cannot read")) {
    return `model=${modelId} reason=unsupported_input`;
  }
  return `model=${modelId} reason=upstream_error_details_redacted`;
}

// ── Types ─────────────────────────────────────────────────────────────────────

export interface RouteAndProxyResult {
  response: Response;
  requestId: string;
}

export interface UserRouterConfig {
  preferredModels?: string[] | null;
  customCatalog?: any[] | null;
  defaultModel?: string | null;
  classifierModel?: string | null;
  routingInstructions?: string | null;
  blocklist?: string[] | null;
  profiles?: any[] | null;  // RouterProfile[] — named routing configurations
  gatewayRows?: GatewayRowPublic[];  // per-user gateways; first entry is the default upstream
  classifierBaseUrl?: string | null;
  classifierApiKeyEnc?: string | null;
  routeTriggerKeywords?: string[] | null;
  routingFrequency?: string | null;
}

type RoutedApiPath = "/chat/completions" | "/responses" | "/completions";

interface AttemptTarget {
  modelId: string;
  provider: string;
}

function createRouterEngine(args: {
  classifierApiKey: string;
  classifierBaseUrl: string;
  classifierModel: string;
  onClassifierInvoked?: () => void;
}): RouterEngine {
  return new RouterEngine({
    llmRouter: async (routerArgs) => {
      args.onClassifierInvoked?.();
      return await routeWithFrontierModel({
        apiKey: args.classifierApiKey,
        baseUrl: args.classifierBaseUrl,
        model: routerArgs.classifierModel ?? args.classifierModel,
        input: routerArgs.prompt,
        catalog: routerArgs.catalog,
        routingInstructions: routerArgs.routingInstructions,
        currentModel: routerArgs.currentModel,
      });
    },
  });
}

function findMatchedProfile(requestedModel: string, profiles?: RouterProfile[] | null): RouterProfile | undefined {
  return profiles?.find((profile) => profile.id === requestedModel);
}

function isRoutedRequestModel(requestedModel: string, profiles?: RouterProfile[] | null): boolean {
  return AUTO_MODELS.has(requestedModel) || Boolean(findMatchedProfile(requestedModel, profiles));
}

function resolveEffectiveClassifierModel(args: {
  requestedModel: string;
  config: RouterConfig;
  profiles?: RouterProfile[] | null;
}): string | null {
  const matchedProfile = findMatchedProfile(args.requestedModel, args.profiles);
  if (!matchedProfile) {
    return args.config.classifierModel ?? null;
  }

  const useProfileModels = matchedProfile.overrideModels !== false;
  if (useProfileModels && matchedProfile.classifierModel) {
    return matchedProfile.classifierModel;
  }

  return args.config.classifierModel ?? null;
}

function buildRoutingExplanation(args: {
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

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Builds the ordered list of models to try, filtering out any that are
 * currently disabled by guardrails. Always guarantees at least one attempt
 * by falling back to the primary model even if it is disabled.
 */
function buildAttemptOrder(args: {
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

  // Guardrails blocked everything — use the primary anyway so the request
  // doesn't fail silently.
  if (attempts.length === 0 && modelOrder.length > 0) {
    attempts.push({ modelId: modelOrder[0] as string, provider: "default" });
  }

  return attempts;
}

// ── Per-attempt gateway resolution ────────────────────────────────────────────

/**
 * Resolves the upstream target (base URL + API key) for a specific model.
 * Looks up the model's gatewayId in the catalog, then finds the matching
 * gateway from the pre-built Map. Falls back to the default upstream if:
 *   - the model has no gatewayId
 *   - the gatewayId references a deleted/undecryptable gateway
 */
function resolveAttemptUpstream(
  modelId: string,
  catalog: CatalogItem[],
  gatewayMap: Map<string, { baseUrl: string; apiKey: string }>,
  defaultUpstream: { baseUrl: string; apiKey: string }
): { baseUrl: string; apiKey: string } {
  const item = catalog.find((c) => c.id === modelId);
  if (item?.gatewayId) {
    const gw = gatewayMap.get(item.gatewayId);
    if (gw) return gw;
  }
  return defaultUpstream;
}

function getCatalogItem(catalog: CatalogItem[], modelId: string): CatalogItem | undefined {
  return catalog.find((item) => item.id === modelId);
}

function buildAttemptPayload(args: {
  body: RouterRequestLike & Record<string, unknown>;
  selectedModelId: string;
  apiPath: "/chat/completions" | "/responses" | "/completions";
}): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    ...args.body,
    model: args.selectedModelId,
  };

  return payload;
}

function runInBackground(task: Promise<unknown>): void {
  void task.catch(() => {
    // Best-effort background persistence should not affect request latency.
  });
}

// ── Main export ───────────────────────────────────────────────────────────────

export async function routeAndProxy(args: {
  body: RouterRequestLike & Record<string, unknown>;
  apiPath: RoutedApiPath;
  userConfig?: UserRouterConfig;
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

  const repository = getRouterRepository();
  const [systemConfig, fullCatalog] = await Promise.all([
    repository.getConfig(),
    repository.getCatalog(),
  ]);
  const pinStore = repository.getPinStore();

  // Merge system config with per-user overrides
  const runtimeConfig = { ...systemConfig };
  if (args.userConfig) {
    if (args.userConfig.defaultModel) runtimeConfig.defaultModel = args.userConfig.defaultModel;
    if (args.userConfig.classifierModel) runtimeConfig.classifierModel = args.userConfig.classifierModel;
    if (args.userConfig.routingInstructions) runtimeConfig.routingInstructions = args.userConfig.routingInstructions;
    if (args.userConfig.blocklist) runtimeConfig.globalBlocklist = args.userConfig.blocklist;
    if (args.userConfig.routeTriggerKeywords) runtimeConfig.routeTriggerKeywords = args.userConfig.routeTriggerKeywords;
    if (args.userConfig.routingFrequency) runtimeConfig.routingFrequency = args.userConfig.routingFrequency as RouterConfig["routingFrequency"];
  }

  // Build flat catalog from gateway models (with injected gatewayId), falling back
  // to legacy customCatalog or the system catalog for users without gateways configured.
  const gatewayCatalogItems: CatalogItem[] = (args.userConfig?.gatewayRows ?? []).flatMap((gw) =>
    gw.models.map((m) => ({ ...m, gatewayId: gw.id }))
  );
  const catalog =
    gatewayCatalogItems.length > 0
      ? gatewayCatalogItems
      : args.userConfig?.customCatalog && args.userConfig.customCatalog.length > 0
        ? args.userConfig.customCatalog
        : fullCatalog;

  const requestedModel = typeof args.body.model === "string" ? args.body.model : "";
  const matchedProfile = findMatchedProfile(requestedModel, args.userConfig?.profiles as RouterProfile[] | null | undefined);
  const routedRequest = isRoutedRequestModel(requestedModel, args.userConfig?.profiles as RouterProfile[] | null | undefined);

  let classifierApiKeyOverride: string | null = null;
  if (args.userConfig?.classifierApiKeyEnc) {
    classifierApiKeyOverride = await decryptByokSecret({
      ciphertext: args.userConfig.classifierApiKeyEnc,
      secret: byokSecret,
    });
    if (!classifierApiKeyOverride) {
      return {
        requestId,
        response: json(
          { error: "Classifier key cannot be decrypted. Re-save it in the admin console.", request_id: requestId },
          500
        ),
      };
    }
  }

  const effectiveClassifierModel = routedRequest
    ? resolveEffectiveClassifierModel({
        requestedModel,
        config: runtimeConfig,
        profiles: args.userConfig?.profiles as RouterProfile[] | null | undefined,
      })
    : null;

  let classifierBaseUrl: string | undefined;
  let classifierApiKey: string | undefined;
  let classifierGatewayId: string | undefined;

  if (routedRequest) {
    if (!effectiveClassifierModel) {
      runInBackground(repository.putExplanation(buildRoutingExplanation({
        requestId,
        catalogVersion: "1.0",
        requestedModel,
        message: "Routed request requires an explicit classifier model.",
        profileId: matchedProfile?.id,
      })));
      return {
        requestId,
        response: json(
          { error: "Routed requests require an explicit classifier model.", request_id: requestId },
          400
        ),
      };
    }

    const hasClassifierBase = Boolean(args.userConfig?.classifierBaseUrl);
    const hasClassifierKey = Boolean(classifierApiKeyOverride);

    if (hasClassifierBase !== hasClassifierKey) {
      runInBackground(repository.putExplanation(buildRoutingExplanation({
        requestId,
        catalogVersion: "1.0",
        requestedModel,
        message: "Dedicated classifier settings must include both base URL and API key.",
        profileId: matchedProfile?.id,
        classifierModel: effectiveClassifierModel,
      })));
      return {
        requestId,
        response: json(
          { error: "Dedicated classifier settings must include both base URL and API key.", request_id: requestId },
          400
        ),
      };
    }

    if (hasClassifierBase && hasClassifierKey) {
      classifierBaseUrl = args.userConfig?.classifierBaseUrl ?? undefined;
      classifierApiKey = classifierApiKeyOverride ?? undefined;
    } else {
      const classifierCatalogItem = catalog.find((item) => item.id === effectiveClassifierModel);
      const gatewayId = classifierCatalogItem?.gatewayId;
      if (!gatewayId) {
        runInBackground(repository.putExplanation(buildRoutingExplanation({
          requestId,
          catalogVersion: "1.0",
          requestedModel,
          message: `Classifier model ${effectiveClassifierModel} is not available from any configured gateway.`,
          profileId: matchedProfile?.id,
          classifierModel: effectiveClassifierModel,
        })));
        return {
          requestId,
          response: json(
            {
              error: `Classifier model ${effectiveClassifierModel} is not available from any configured gateway.`,
              request_id: requestId,
            },
            400
          ),
        };
      }

      const classifierGateway = gatewayMap.get(gatewayId);
      if (!classifierGateway) {
        runInBackground(repository.putExplanation(buildRoutingExplanation({
          requestId,
          catalogVersion: "1.0",
          requestedModel,
          message: `Classifier gateway ${gatewayId} could not be resolved.`,
          profileId: matchedProfile?.id,
          classifierModel: effectiveClassifierModel,
          classifierGatewayId: gatewayId,
        })));
        return {
          requestId,
          response: json(
            { error: `Classifier gateway ${gatewayId} could not be resolved.`, request_id: requestId },
            500
          ),
        };
      }

      classifierBaseUrl = classifierGateway.baseUrl;
      classifierApiKey = classifierGateway.apiKey;
      classifierGatewayId = gatewayId;
    }
  }

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

  const decision = await engine.decide({
    requestId,
    request: args.body,
    config: runtimeConfig,
    catalog,
    catalogVersion: "1.0", // TODO: wire up real version from catalog meta
    pinStore,
    profiles: args.userConfig?.profiles ?? undefined,
  });

  if (decision.routingError || !decision.selectedModel) {
    const errorMessage =
      decision.routingError === "classifier_failed_without_fallback"
        ? "Classifier failed and no fallback model is configured."
        : decision.routingError === "classifier_returned_invalid_model_without_fallback"
          ? "Classifier returned an invalid model and no fallback model is configured."
          : decision.routingError === "classifier_missing_without_fallback"
            ? "No classifier is available and no fallback model is configured."
            : "Router could not select a model.";

    runInBackground(repository.putExplanation({
      ...decision.explanation,
      classifierInvoked,
      classifierModel: effectiveClassifierModel ?? undefined,
      classifierBaseUrl,
      classifierGatewayId,
    }));

    return {
      requestId,
      response: json({ error: errorMessage, request_id: requestId }, 502, {
        "x-router-request-id": requestId,
      }),
    };
  }

  const nowMs = Date.now();
  const attempts = buildAttemptOrder({ decision, nowMs });
  const errors: string[] = [];

  for (const [index, attempt] of attempts.entries()) {
    const catalogItem = getCatalogItem(catalog, attempt.modelId);

    const attemptUpstream = resolveAttemptUpstream(
      attempt.modelId,
      catalog,
      gatewayMap,
      defaultUpstream
    );
    const payload = buildAttemptPayload({
      body: args.body,
      selectedModelId: attempt.modelId,
      apiPath: args.apiPath,
    });

    const startedAtMs = Date.now();
    const result = await callOpenAiCompatible({
      apiPath: args.apiPath,
      payload,
      baseUrl: attemptUpstream.baseUrl,
      apiKey: attemptUpstream.apiKey,
    });
    const latencyMs = Date.now() - startedAtMs;

    const key = guardrailKey(attempt.modelId, attempt.provider);
    recordEvent({ key, nowMs: Date.now(), ok: result.ok, latencyMs, fallback: index > 0 });

    if (!result.ok) {
      errors.push(
        `model=${attempt.modelId} provider=${attempt.provider} status=${result.status} ${improveErrorMessage(attempt.modelId, result.errorBody)}`
      );
      continue;
    }

    // Build the explanation (updated to reflect which model actually served)
    const degraded = decision.degraded || index > 0;
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

    if (decision.shouldPin) {
      const pin = engine.createPin({
        threadKey: decision.threadKey,
        modelId: attempt.modelId,
        requestId,
        turnCount: decision.pinTurnCount ?? 1,
      });
      await pinStore.set(pin);
    }

    runInBackground(repository.putExplanation(explanation));

    return {
      requestId,
      response: result.response,
    };
  }

  // All attempts failed — store explanation and return 502
  runInBackground(repository.putExplanation({
    ...decision.explanation,
    selectedModel: decision.selectedModel,
    decisionReason: "fallback_default" as const,
    classifierInvoked,
    classifierModel: effectiveClassifierModel ?? undefined,
    classifierBaseUrl,
    classifierGatewayId,
    notes: [...decision.explanation.notes, ...errors],
  }));

  const failureResponse = json(
    { error: "All candidate models/providers failed.", request_id: requestId, candidates: attempts, details: errors },
    502
  );

  return {
    requestId,
    response: failureResponse,
  };
}
