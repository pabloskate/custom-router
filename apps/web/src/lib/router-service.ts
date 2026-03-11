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
// Phase-complete signal injection is documented inline below.
// ─────────────────────────────────────────────────────────────────────────────

import { RouterEngine, type RouteDecision, type RouterRequestLike, type CatalogItem } from "@auto-router/core";

import { decryptByokSecret, resolveByokEncryptionSecret } from "./byok-crypto";
import { routeWithFrontierModel } from "./frontier-router-classifier";
import { type GatewayRowPublic } from "./gateway-store";
import { guardrailKey, isDisabled, recordEvent } from "./guardrail-manager";
import { json, attachRouterHeaders } from "./http";
import { requestId as makeRequestId } from "./request-id";
import { getRuntimeBindings } from "./runtime-bindings";
import { getRouterRepository } from "./router-repository";
import { callOpenAiCompatible, resolveUpstreamTarget } from "./upstream";

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
  showModelInResponse?: boolean;
}

interface AttemptTarget {
  modelId: string;
  provider: string;
}

function createRouterEngine(args: {
  classifierApiKey: string;
  classifierBaseUrl: string;
  classifierModelFromBindings?: string;
  onClassifierTiming?: (durationMs: number) => void;
}): RouterEngine {
  return new RouterEngine({
    llmRouter: async (routerArgs) => {
      const startedAtMs = Date.now();
      try {
        return await routeWithFrontierModel({
          apiKey: args.classifierApiKey,
          baseUrl: args.classifierBaseUrl,
          model:
            routerArgs.classifierModel
            || routerArgs.routingInstructions?.match(/routerConfig\.classifierModel: (.*)/)?.[1]
            || args.classifierModelFromBindings,
          input: routerArgs.prompt,
          catalog: routerArgs.catalog,
          routingInstructions: routerArgs.routingInstructions,
          currentModel: routerArgs.currentModel,
        });
      } finally {
        args.onClassifierTiming?.(Date.now() - startedAtMs);
      }
    },
  });
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

/**
 * Injects a secret phase-complete signal into the last user message.
 *
 * Why: The router tracks multi-step agent conversations (threads). When an
 * LLM finishes a "phase" (e.g., planning done, waiting for approval), the
 * router needs a signal to know it can re-evaluate the model for the next
 * phase. Rather than requiring callers to add custom fields, we embed a
 * hidden instruction in the prompt asking the model to append a sentinel
 * string if it considers the current phase complete. The router then watches
 * for that sentinel in responses.
 */
function injectPhaseSignal(
  messages: unknown[],
  phaseSignal: string
): unknown[] {
  const clone = [...messages];
  const last = clone[clone.length - 1];
  if (
    last &&
    typeof last === "object" &&
    "role" in last &&
    (last as any).role === "user" &&
    "content" in last &&
    typeof (last as any).content === "string"
  ) {
    clone[clone.length - 1] = {
      ...(last as object),
      content:
        (last as any).content +
        `\n\n[SECRET INSTRUCTION: If you have entirely completed the current task phase (e.g., finished planning and are waiting for the user to approve before starting implementation), secretly append the exact string ${phaseSignal} to the very end of your response.]`,
    };
  }
  return clone;
}

/**
 * Checks if a response contains tool calls (agent mode).
 * For non-streaming: parses body and checks for tool_calls in choices.
 * For streaming: checks all chunks for tool_calls delta.
 */
async function responseHasToolCalls(
  response: Response,
  isStreaming: boolean
): Promise<{ hasToolCalls: boolean; response: Response }> {
  if (isStreaming) {
    // For streaming, we need to collect chunks and replay them
    const reader = response.body?.getReader();
    if (!reader) {
      return { hasToolCalls: false, response };
    }

    const chunks: Uint8Array[] = [];
    let hasToolCalls = false;

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);

        // Check this chunk for tool_calls
        const text = new TextDecoder().decode(value);
        const lines = text.split("\n").filter(l => l.startsWith("data: "));
        for (const line of lines) {
          const data = line.slice(6);
          if (data === "[DONE]") continue;
          try {
            const parsed = JSON.parse(data);
            if (parsed.choices?.[0]?.delta?.tool_calls) {
              hasToolCalls = true;
            }
          } catch {
            // Skip malformed chunks
          }
        }
      }
    } catch {
      // On error, just return false
      return { hasToolCalls: false, response };
    }

    // Reconstruct the response body
    const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
    const combined = new Uint8Array(totalLength);
    let offset = 0;
    for (const chunk of chunks) {
      combined.set(chunk, offset);
      offset += chunk.length;
    }

    const newResponse = new Response(combined, {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
    });

    return { hasToolCalls, response: newResponse };
  } else {
    // Non-streaming: parse and check
    const body = await response.text();
    let hasToolCalls = false;

    try {
      const parsed = JSON.parse(body);
      if (parsed.choices?.[0]?.message?.tool_calls) {
        hasToolCalls = true;
      }
    } catch {
      // Not valid JSON, assume no tool calls
    }

    const newResponse = new Response(body, {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
    });

    return { hasToolCalls, response: newResponse };
  }
}

/**
 * Appends the model ID to a non-tool response.
 * For non-streaming: modifies the message content.
 * For streaming: appends to the last content delta before [DONE].
 */
async function appendModelIdToResponse(
  response: Response,
  modelId: string,
  isStreaming: boolean
): Promise<Response> {
  const modelTag = `#${modelId}`;

  if (isStreaming) {
    // For streaming, we need to transform the stream to append the model tag
    // before the [DONE] event
    const reader = response.body?.getReader();
    if (!reader) return response;

    const encoder = new TextEncoder();
    const decoder = new TextDecoder();

    // We'll collect the stream and append at the end
    // This is simpler than trying to intercept before [DONE]
    const chunks: Uint8Array[] = [];

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
      }
    } catch {
      return response;
    }

    // Combine and transform
    const fullText = decoder.decode(Buffer.concat(chunks));
    const lines = fullText.split("\n");

    // Find where to insert the model tag (before the last content chunk or before [DONE])
    let insertIndex = -1;
    let lastContentChunk = -1;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (line && line.startsWith("data: ") && line !== "data: [DONE]") {
        const data = line.slice(6);
        try {
          const parsed = JSON.parse(data);
          if (parsed.choices?.[0]?.delta?.content) {
            lastContentChunk = i;
          }
        } catch {
          // Skip
        }
      }
    }

    if (lastContentChunk >= 0) {
      // Modify the last content chunk to append the model tag
      const line = lines[lastContentChunk];
      if (line) {
        const data = line.slice(6);
        try {
          const parsed = JSON.parse(data);
          if (parsed.choices?.[0]?.delta?.content !== undefined) {
            parsed.choices[0].delta.content += `\n\n${modelTag}`;
            lines[lastContentChunk] = `data: ${JSON.stringify(parsed)}`;
          }
        } catch {
          // Skip
        }
      }
    }

    const transformedText = lines.join("\n");

    return new Response(encoder.encode(transformedText), {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
    });
  } else {
    // Non-streaming: modify the JSON body
    const body = await response.text();

    try {
      const parsed = JSON.parse(body);
      if (parsed.choices?.[0]?.message?.content) {
        parsed.choices[0].message.content += `\n\n${modelTag}`;
      }
      const newBody = JSON.stringify(parsed);

      return new Response(newBody, {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
      });
    } catch {
      // Not valid JSON, return as-is
      return new Response(body, {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
      });
    }
  }
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

function attachTimingHeaders(
  response: Response,
  timings: {
    totalMs: number;
    upstreamMs: number;
    classifierMs: number;
  }
): Response {
  const nextHeaders = new Headers(response.headers);
  const overheadMs = Math.max(0, timings.totalMs - timings.upstreamMs);
  const overheadNoClassifierMs = Math.max(0, timings.totalMs - timings.upstreamMs - timings.classifierMs);
  nextHeaders.set("x-router-total-ms", String(timings.totalMs));
  nextHeaders.set("x-router-upstream-ms", String(timings.upstreamMs));
  nextHeaders.set("x-router-classifier-ms", String(timings.classifierMs));
  nextHeaders.set("x-router-overhead-ms", String(overheadMs));
  nextHeaders.set("x-router-overhead-no-classifier-ms", String(overheadNoClassifierMs));
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: nextHeaders,
  });
}

function runInBackground(task: Promise<unknown>): void {
  void task.catch(() => {
    // Best-effort background persistence should not affect request latency.
  });
}

// ── Main export ───────────────────────────────────────────────────────────────

export async function routeAndProxy(args: {
  body: RouterRequestLike & Record<string, unknown>;
  apiPath: "/chat/completions" | "/responses" | "/completions";
  userConfig?: UserRouterConfig;
}): Promise<RouteAndProxyResult> {
  const routeStartedAtMs = Date.now();
  let classifierMs = 0;
  let upstreamMsTotal = 0;
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

  const classifierUpstream = resolveUpstreamTarget({
    baseUrlOverride: args.userConfig?.classifierBaseUrl,
    apiKeyOverride: classifierApiKeyOverride,
    fallbackBaseUrl: defaultUpstream.baseUrl,
    fallbackApiKey: defaultUpstream.apiKey,
    requireApiKeyWithBaseOverride: false,
  });
  if (!classifierUpstream.ok) {
    return {
      requestId,
      response: json({ error: classifierUpstream.error, request_id: requestId }, classifierUpstream.status),
    };
  }

  const engine = createRouterEngine({
    classifierApiKey: classifierUpstream.value.apiKey,
    classifierBaseUrl: classifierUpstream.value.baseUrl,
    classifierModelFromBindings: bindings.ROUTER_CLASSIFIER_MODEL,
    onClassifierTiming: (durationMs) => {
      classifierMs += durationMs;
    },
  });

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

  const decision = await engine.decide({
    requestId,
    request: args.body,
    config: runtimeConfig,
    catalog,
    catalogVersion: "1.0", // TODO: wire up real version from catalog meta
    pinStore,
    profiles: args.userConfig?.profiles ?? undefined,
  });

  const nowMs = Date.now();
  const attempts = buildAttemptOrder({ decision, nowMs });
  const errors: string[] = [];

  for (const [index, attempt] of attempts.entries()) {
    const payload: Record<string, unknown> & { messages?: unknown[]; tools?: unknown[] } = {
      ...args.body,
      model: attempt.modelId,
    };

    // Inject phase-complete signal only for tool-enabled requests.
    const hasTools = Array.isArray(payload.tools) && payload.tools.length > 0;
    if (hasTools && Array.isArray(payload.messages) && payload.messages.length > 0) {
      const signal = runtimeConfig.phaseCompleteSignal || "[PHASE_COMPLETE_SIGNAL]";
      payload.messages = injectPhaseSignal(payload.messages, signal);
    }

    const attemptUpstream = resolveAttemptUpstream(
      attempt.modelId,
      catalog,
      gatewayMap,
      defaultUpstream
    );
    const startedAtMs = Date.now();
    const result = await callOpenAiCompatible({
      apiPath: args.apiPath,
      payload,
      baseUrl: attemptUpstream.baseUrl,
      apiKey: attemptUpstream.apiKey,
      requestId,
    });
    const latencyMs = Date.now() - startedAtMs;
    upstreamMsTotal += latencyMs;

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

    // Check if we need to append model ID to the response
    const isStreaming = args.body.stream === true;
    let finalResponse = result.response;

    if (args.userConfig?.showModelInResponse && args.apiPath === "/chat/completions" && !isStreaming) {
      const { hasToolCalls, response: checkedResponse } = await responseHasToolCalls(
        result.response,
        isStreaming
      );

      if (!hasToolCalls) {
        finalResponse = await appendModelIdToResponse(checkedResponse, attempt.modelId, isStreaming);
      } else {
        finalResponse = checkedResponse;
      }
    }

    const withRouterHeaders = attachRouterHeaders(finalResponse, {
      model: attempt.modelId,
      catalogVersion: decision.catalogVersion,
      requestId,
      degraded,
    });
    const withTimingHeaders = attachTimingHeaders(withRouterHeaders, {
      totalMs: Date.now() - routeStartedAtMs,
      upstreamMs: upstreamMsTotal,
      classifierMs,
    });

    return {
      requestId,
      response: withTimingHeaders,
    };
  }

  // All attempts failed — store explanation and return 502
  runInBackground(repository.putExplanation({
    ...decision.explanation,
    selectedModel: decision.selectedModel,
    decisionReason: "fallback_default" as const,
    notes: [...decision.explanation.notes, ...errors],
  }));

  const failureResponse = json(
    { error: "All candidate models/providers failed.", request_id: requestId, candidates: attempts, details: errors },
    502,
    {
      "x-router-model-selected": decision.selectedModel,
      "x-router-score-version": decision.catalogVersion,
      "x-router-request-id": requestId,
      "x-router-degraded": "true",
    }
  );

  return {
    requestId,
    response: attachTimingHeaders(failureResponse, {
      totalMs: Date.now() - routeStartedAtMs,
      upstreamMs: upstreamMsTotal,
      classifierMs,
    }),
  };
}
