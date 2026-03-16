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
  pinTurnCount?: number;
}) {
  if (!args.shouldPin) {
    return;
  }

  const pin = args.engine.createPin({
    threadKey: args.threadKey,
    modelId: args.selectedModel,
    requestId: args.requestId,
    turnCount: args.pinTurnCount ?? 1,
  });
  await args.repository.getPinStore().set(pin);
}

export function persistExplanation(repository: RouterRepository, explanation: RoutingExplanation): void {
  runInBackground(repository.putExplanation(explanation));
}
