import { buildPromptWindow, type LlmRouterFunction } from "./llm-router";
import {
  buildThreadFingerprint,
  isContinuationRequest,
  isAgentLoop,
  hasPhaseCompleteSignal,
  hasImagePayload,
  hasForceRouteRequest
} from "./threading";
import {
  AUTO_MODELS,
  type PinStore,
  type RouteDecision,
  type RouterConfig,
  type RouterProfile,
  type RouterRequestLike,
  type ThreadPin,
  type CatalogItem
} from "./types";

const ONE_HOUR_MS = 60 * 60 * 1000;

export interface RouterEngineOptions {
  pinTtlMs?: number;
  llmRouter?: LlmRouterFunction;
}

export class RouterEngine {
  private readonly pinTtlMs: number;
  private readonly llmRouter?: LlmRouterFunction;

  constructor(options: RouterEngineOptions = {}) {
    this.pinTtlMs = options.pinTtlMs ?? ONE_HOUR_MS;
    this.llmRouter = options.llmRouter;
  }

  async decide(args: {
    requestId: string;
    request: RouterRequestLike;
    config: RouterConfig;
    catalog: CatalogItem[];
    catalogVersion: string;
    pinStore: PinStore;
    profiles?: RouterProfile[];
    now?: Date;
  }): Promise<RouteDecision> {
    const now = args.now ?? new Date();
    const requestedModel = args.request.model;
    const messages = args.request.messages ?? [];
    const tools = args.request.tools ?? [];

    // Check if request.model matches a named user profile
    const matchedProfile = args.profiles?.find(p => p.id === requestedModel);

    // Passthrough if not "auto" and not a known profile
    if (!AUTO_MODELS.has(requestedModel) && !matchedProfile) {
      const threadKey = buildThreadFingerprint({
        messages,
        tools,
        previousResponseId: args.request.previous_response_id
      });

      const isContinuation = isContinuationRequest({
        messages,
        tools,
        previousResponseId: args.request.previous_response_id
      });

      return {
        mode: "passthrough",
        requestedModel,
        selectedModel: requestedModel,
        catalogVersion: args.catalogVersion,
        threadKey,
        isContinuation,
        pinUsed: false,
        degraded: false,
        fallbackModels: [],
        shouldPin: false,
        explanation: {
          requestId: args.requestId,
          createdAt: now.toISOString(),
          catalogVersion: args.catalogVersion,
          classificationConfidence: 1,
          classificationSignals: ["passthrough:explicit_model"],
          threadKey,
          isContinuation,
          pinUsed: false,
          selectedModel: requestedModel,
          decisionReason: "passthrough",
          fallbackChain: [],
          notes: ["Router bypassed because request specified an explicit model."]
        }
      };
    }

    // Build effective config: profile overrides take precedence over global config
    const effectiveConfig: RouterConfig = matchedProfile ? {
      ...args.config,
      defaultModel: matchedProfile.defaultModel ?? args.config.defaultModel,
      classifierModel: matchedProfile.classifierModel ?? args.config.classifierModel,
      routingInstructions: matchedProfile.routingInstructions ?? args.config.routingInstructions,
      globalBlocklist: [...args.config.globalBlocklist, ...(matchedProfile.blocklist ?? [])],
    } : args.config;

    const threadKey = buildThreadFingerprint({
      messages,
      tools,
      previousResponseId: args.request.previous_response_id,
      profileId: matchedProfile?.id,
    });

    const isContinuation = isContinuationRequest({
      messages,
      tools,
      previousResponseId: args.request.previous_response_id
    });
    const forceRoute = hasForceRouteRequest({
      messages,
      input: args.request.input
    });

    const threadHasImage = hasImagePayload(messages);
    let allowedCatalog = args.catalog;

    // Filter to vision-capable models if the thread contains an image
    if (threadHasImage) {
      const visionModels = args.catalog.filter(m => m.modality?.includes("image"));
      if (visionModels.length > 0) {
        allowedCatalog = visionModels;
      }
    }

    // Apply profile catalogFilter (allowlist of model IDs)
    if (matchedProfile?.catalogFilter && matchedProfile.catalogFilter.length > 0) {
      const filterSet = new Set(matchedProfile.catalogFilter);
      const filtered = allowedCatalog.filter(m => filterSet.has(m.id));
      if (filtered.length > 0) {
        allowedCatalog = filtered;
      }
    }

    // Apply globalBlocklist (including any profile-specific blocklist entries)
    if (effectiveConfig.globalBlocklist.length > 0) {
      const blockSet = new Set(effectiveConfig.globalBlocklist);
      const unblocked = allowedCatalog.filter(m => !blockSet.has(m.id));
      if (unblocked.length > 0) {
        allowedCatalog = unblocked;
      }
    }

    let selectedModel = effectiveConfig.defaultModel;
    let pinUsed = false;
    let decisionReason: RouteDecision["explanation"]["decisionReason"] = "initial_route";
    const notes: string[] = [];
    let signals: string[] = [];
    let confidence = 0.5;

    if (matchedProfile) {
      notes.push(`Routed via named profile: ${matchedProfile.id}`);
    }
    if (forceRoute) {
      notes.push("Force route directive detected in latest user message (#route). Bypassing thread pin for this turn.");
    }

    let activePin: ThreadPin | null = null;
    let pinTurnCount: number | undefined;

    if (isContinuation && !forceRoute) {
      activePin = await args.pinStore.get(threadKey);

      if (activePin) {
        const phaseSignal = effectiveConfig.phaseCompleteSignal || "[PHASE_COMPLETE_SIGNAL]";
        const shouldBreakLock = hasPhaseCompleteSignal(messages, phaseSignal);
        const isLoop = isAgentLoop(messages);

        if (shouldBreakLock && !isLoop) {
          decisionReason = "initial_route"; // Breaking lock
          notes.push(`Phase complete signal detected. Breaking cache lock for routing.`);
        } else {
          // Verify the pinned model exists in the allowed catalog
          const exists = allowedCatalog.some(m => m.id === activePin!.modelId);
          if (exists) {
            const cooldownTurns = effectiveConfig.cooldownTurns ?? 3;
            if (isLoop || activePin.turnCount < cooldownTurns) {
              selectedModel = activePin.modelId;
              pinUsed = true;
              decisionReason = "thread_pin";
              pinTurnCount = activePin.turnCount + 1;
              notes.push(
                `Reused pinned model from thread: ${activePin.modelId}. Turn count: ${activePin.turnCount} -> ${pinTurnCount}${isLoop ? " (Agent Loop detected)" : ""
                }`
              );
            } else {
              notes.push(`Pin cooldown expired (${activePin.turnCount} >= ${cooldownTurns}). Re-evaluating router.`);
            }
          } else {
            decisionReason = "pin_invalid";
            if (threadHasImage && !allowedCatalog.some(m => m.id === activePin!.modelId) && args.catalog.some(m => m.id === activePin!.modelId)) {
              notes.push(`Image detected but pinned model (${activePin!.modelId}) does not support vision. Breaking cache lock.`);
            } else {
              notes.push(`Pinned model invalid (not in catalog): ${activePin!.modelId}`);
            }
          }
        }
      }
    }

    if (!pinUsed) {
      if (this.llmRouter) {
        const prompt = buildPromptWindow({
          messages,
          input: args.request.input,
        });
        try {
          const result = await this.llmRouter({
            prompt,
            catalog: allowedCatalog,
            routingInstructions: effectiveConfig.routingInstructions,
            classifierModel: effectiveConfig.classifierModel
          });

          if (result && result.selectedModel) {
            // Verify model actually exists in catalog
            const valid = allowedCatalog.some(m => m.id === result.selectedModel);
            if (valid) {
              selectedModel = result.selectedModel;
              confidence = result.confidence;
              signals = result.signals;
              notes.push(`LLM router selected: ${result.selectedModel}`);
            } else {
              notes.push(`LLM router returned invalid model: ${result.selectedModel}`);
              selectedModel = effectiveConfig.defaultModel;
            }
          } else {
            notes.push(`LLM router failed or returned no result. Using default.`);
          }
        } catch (error) {
          notes.push(`LLM router exploded: ${(error as Error).message}. Using default.`);
        }
      } else {
        notes.push(`No LLM router configured. Using default model.`);
      }
    }

    if (threadHasImage && !allowedCatalog.some(m => m.id === selectedModel)) {
      if (allowedCatalog.length > 0) {
        selectedModel = allowedCatalog[0]!.id; // Fallback to a vision model if default model isn't one
        notes.push(`Thread has an image but selected model doesn't support vision. Forcing vision model: ${selectedModel}`);
      } else {
        notes.push(`Warning: Thread contains image but no vision models found in catalog.`);
      }
    }

    // Determine fallbacks (simplified: just the effective default model if not already selected)
    const fallbackModels = selectedModel !== effectiveConfig.defaultModel ? [effectiveConfig.defaultModel] : [];

    return {
      mode: "routed",
      requestedModel,
      selectedModel,
      catalogVersion: args.catalogVersion,
      threadKey,
      isContinuation,
      pinUsed,
      degraded: false,
      fallbackModels,
      shouldPin: true,
      pinTurnCount,
      explanation: {
        requestId: args.requestId,
        createdAt: now.toISOString(),
        catalogVersion: args.catalogVersion,
        classificationConfidence: confidence,
        classificationSignals: signals,
        threadKey,
        isContinuation,
        pinUsed,
        selectedModel,
        decisionReason,
        fallbackChain: fallbackModels,
        notes,
        profileId: matchedProfile?.id,
      }
    };
  }

  createPin(args: {
    threadKey: string;
    modelId: string;
    requestId: string;
    turnCount?: number;
    now?: Date;
  }): ThreadPin {
    const now = args.now ?? new Date();
    const expiresAt = new Date(now.getTime() + this.pinTtlMs);

    return {
      threadKey: args.threadKey,
      modelId: args.modelId,
      requestId: args.requestId,
      pinnedAt: now.toISOString(),
      expiresAt: expiresAt.toISOString(),
      turnCount: args.turnCount ?? 1
    };
  }
}
