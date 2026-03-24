import type { RouterEngine, RoutingExplanation } from "@custom-router/core";

import type { RouterRepository } from "@/src/lib/storage/repository";

export function runInBackground(task: Promise<unknown>): void {
  void task.catch(() => {
    // Best-effort background persistence should not affect request latency.
  });
}

export async function pinSelectedModel(args: {
  engine: RouterEngine;
  repository: RouterRepository;
  shouldPin: boolean;
  threadKey: string;
  requestId: string;
  selectedModel: string;
  selectedFamily?: string;
  selectedEffort?: RoutingExplanation["selectedEffort"];
  stepClassification?: RoutingExplanation["stepClassification"];
  pinTurnCount?: number;
  pinRerouteAfterTurns?: number;
  pinBudgetSource?: "classifier" | "default";
}) {
  if (!args.shouldPin) {
    return;
  }

  const pin = args.engine.createPin({
    threadKey: args.threadKey,
    modelId: args.selectedModel,
    requestId: args.requestId,
    turnCount: args.pinTurnCount ?? 0,
    rerouteAfterTurns: args.pinRerouteAfterTurns,
    budgetSource: args.pinBudgetSource,
    familyId: args.selectedFamily,
    reasoningEffort: args.selectedEffort,
    stepMode: args.stepClassification?.stepMode,
  });
  await args.repository.getPinStore().set(pin);
}

export function persistExplanation(args: {
  enabled?: boolean;
  repository: RouterRepository;
  userId: string;
  explanation: RoutingExplanation;
}): void {
  if (!args.enabled) {
    return;
  }

  runInBackground(args.repository.putExplanation({
    userId: args.userId,
    explanation: args.explanation,
  }));
}
