import {
  buildThreadFingerprint,
  getRequestImageCapabilities,
  hasForceRouteRequest,
  isAgentLoop,
  isContinuationRequest,
} from "./threading";
import type {
  CatalogItem,
  PinStore,
  ReasoningEffort,
  RouteDecision,
  RouterConfig,
  RouterProfile,
  RouterRequestLike,
  RoutingStepClassification,
  ThreadPin,
} from "./types";
import { resolveClassifierSelection } from "./router-engine/classifier-resolution";
import {
  applyVisionCapabilityOverride,
  buildRouteDecision,
  createPassthroughDecision,
} from "./router-engine/fallback-and-explanation";
import { resolvePinPolicy } from "./router-engine/pin-policy";
import {
  DEFAULT_SMART_PIN_TURNS,
  getEffectiveReasoningPolicy,
  type ResolutionTelemetry,
} from "./router-engine/shared";
import type { LlmRouterFunction } from "./llm-router";

const ONE_HOUR_MS = 60 * 60 * 1000;

function parseModalityTokens(segment: string | undefined): string[] {
  if (!segment) {
    return [];
  }

  return segment
    .split(/[,+]/)
    .map((token) => token.trim().toLowerCase())
    .filter((token) => token.length > 0);
}

function getModelModalitySupport(model: CatalogItem): { input: string[]; output: string[] } {
  const raw = model.modality?.trim().toLowerCase();
  if (!raw) {
    return { input: [], output: [] };
  }

  const [inputSegment, outputSegment] = raw.split("->", 2);
  const input = parseModalityTokens(inputSegment);
  const output = parseModalityTokens(outputSegment ?? inputSegment);

  return { input, output };
}

function modelSupportsImageInput(model: CatalogItem): boolean {
  return getModelModalitySupport(model).input.includes("image");
}

function modelSupportsImageOutput(model: CatalogItem): boolean {
  return getModelModalitySupport(model).output.includes("image");
}

function getAllowedCatalog(
  catalog: CatalogItem[],
  imageCapabilities: { hasImageInput: boolean; requiresImageOutput: boolean },
): CatalogItem[] {
  if (!imageCapabilities.hasImageInput && !imageCapabilities.requiresImageOutput) {
    return catalog;
  }

  const compatibleModels = catalog.filter((model) => {
    if (imageCapabilities.hasImageInput && !modelSupportsImageInput(model)) {
      return false;
    }

    if (imageCapabilities.requiresImageOutput && !modelSupportsImageOutput(model)) {
      return false;
    }

    return true;
  });

  return compatibleModels.length > 0 ? compatibleModels : catalog;
}

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
    const matchedProfile = args.profiles?.find((profile) => profile.id === requestedModel);

    if (!matchedProfile) {
      const threadKey = buildThreadFingerprint({
        messages,
        tools,
        previousResponseId: args.request.previous_response_id,
      });
      const isContinuation = isContinuationRequest({
        messages,
        tools,
        previousResponseId: args.request.previous_response_id,
      });

      return createPassthroughDecision({
        requestId: args.requestId,
        requestedModel,
        catalogVersion: args.catalogVersion,
        threadKey,
        isContinuation,
        now,
      });
    }

    const hasProfiles = Boolean(args.profiles?.length);
    const effectiveConfig: RouterConfig = {
      ...args.config,
      routingInstructions: matchedProfile.routingInstructions ?? (!hasProfiles ? args.config.routingInstructions : undefined),
    };
    const reasoningPolicy = getEffectiveReasoningPolicy(matchedProfile);
    const threadKey = buildThreadFingerprint({
      messages,
      tools,
      previousResponseId: args.request.previous_response_id,
      profileId: matchedProfile.id,
    });
    const isContinuation = isContinuationRequest({
      messages,
      tools,
      previousResponseId: args.request.previous_response_id,
    });
    const routingFrequency = effectiveConfig.routingFrequency ?? "smart";
    const defaultSmartPinTurns = effectiveConfig.smartPinTurns ?? effectiveConfig.cooldownTurns ?? DEFAULT_SMART_PIN_TURNS;
    const forceRoute = hasForceRouteRequest({
      messages,
      input: args.request.input,
      triggerKeywords: effectiveConfig.routeTriggerKeywords,
    });
    const isLoop = isAgentLoop(messages);
    const imageCapabilities = getRequestImageCapabilities(args.request as RouterRequestLike & Record<string, unknown>);
    const allowedCatalog = getAllowedCatalog(args.catalog, imageCapabilities);

    const notes = [`Routed via profile: ${matchedProfile.id}`];
    const pinState = await resolvePinPolicy({
      routingFrequency,
      pinStore: args.pinStore,
      threadKey,
      isContinuation,
      forceRoute,
      isLoop,
      defaultSmartPinTurns,
      allowedCatalog,
      fullCatalog: args.catalog,
      hasImageInput: imageCapabilities.hasImageInput,
      requiresImageOutput: imageCapabilities.requiresImageOutput,
    });
    notes.push(...pinState.notes);

    let selection = pinState.selection;
    let telemetry: ResolutionTelemetry = {
      confidence: 0.5,
      classifierAccepted: false,
      signals: [],
      pinRerouteAfterTurns: pinState.pinRerouteAfterTurns,
      pinBudgetSource: pinState.pinBudgetSource,
      pinConsumedUserTurns: pinState.pinConsumedUserTurns,
      notes,
    };

    if (!selection) {
      const classifierResolution = await resolveClassifierSelection({
        llmRouter: this.llmRouter,
        request: args.request,
        allowedCatalog,
        routingInstructions: effectiveConfig.routingInstructions,
        classifierModel: effectiveConfig.classifierModel,
        defaultModel: effectiveConfig.defaultModel,
        policy: reasoningPolicy,
        activePin: pinState.activePin,
        activePinValid: pinState.activePinValid,
        previousFamily: pinState.previousFamily,
        isContinuation,
        forceRoute,
        defaultSmartPinTurns,
      });
      selection = classifierResolution.selection;
      notes.push(...classifierResolution.telemetry.notes);
      telemetry = {
        ...classifierResolution.telemetry,
        notes,
      };
    }

    const visionAdjusted = applyVisionCapabilityOverride({
      selection,
      allowedCatalog,
      hasImageInput: imageCapabilities.hasImageInput,
      requiresImageOutput: imageCapabilities.requiresImageOutput,
    });
    selection = visionAdjusted.selection;
    notes.push(...visionAdjusted.notes);
    telemetry = {
      ...telemetry,
      notes,
    };

    return buildRouteDecision({
      requestId: args.requestId,
      requestedModel,
      catalogVersion: args.catalogVersion,
      threadKey,
      isContinuation,
      isLoop,
      now,
      matchedProfileId: matchedProfile.id,
      routingFrequency,
      defaultSmartPinTurns,
      effectiveDefaultModel: effectiveConfig.defaultModel,
      pinState,
      selection,
      telemetry,
    });
  }

  createPin(args: {
    threadKey: string;
    modelId: string;
    requestId: string;
    turnCount?: number;
    rerouteAfterTurns?: number;
    budgetSource?: "classifier" | "default";
    familyId?: string;
    reasoningEffort?: ReasoningEffort;
    stepMode?: RoutingStepClassification["stepMode"];
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
      turnCount: args.turnCount ?? 0,
      rerouteAfterTurns: args.rerouteAfterTurns,
      budgetSource: args.budgetSource,
      familyId: args.familyId,
      reasoningEffort: args.reasoningEffort,
      stepMode: args.stepMode,
    };
  }
}
