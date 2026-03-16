import { recordEvent, guardrailKey } from "@/src/lib/routing/guardrail-manager";
import { callOpenAiCompatible } from "@/src/lib/upstream/upstream";

import type { RoutedApiPath } from "./router-service-types";

export async function executeRoutedAttempt(args: {
  apiPath: RoutedApiPath;
  payload: Record<string, unknown>;
  modelId: string;
  provider: string;
  baseUrl: string;
  apiKey: string;
  fallback: boolean;
}) {
  const startedAtMs = Date.now();
  const result = await callOpenAiCompatible({
    apiPath: args.apiPath,
    payload: args.payload,
    baseUrl: args.baseUrl,
    apiKey: args.apiKey,
  });
  const latencyMs = Date.now() - startedAtMs;

  recordEvent({
    key: guardrailKey(args.modelId, args.provider),
    nowMs: Date.now(),
    ok: result.ok,
    latencyMs,
    fallback: args.fallback,
  });

  return {
    latencyMs,
    result,
  };
}
