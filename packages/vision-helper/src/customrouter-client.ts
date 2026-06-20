import type { BridgeConfig, VisionMode } from "./config.js";

export interface DescribeVisionArgs {
  context?: string;
  images: string[];
  mode: VisionMode;
  question?: string;
}

export interface DescribeVisionResult {
  description: string;
  gatewayId?: string;
  mode?: string;
  model?: string;
}

export async function describeWithCustomRouter(
  config: BridgeConfig,
  args: DescribeVisionArgs,
): Promise<DescribeVisionResult> {
  const response = await fetch(`${config.baseUrl}/api/v1/vision/describe`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      images: args.images,
      mode: args.mode,
      question: args.question,
      context: args.context,
    }),
  });

  const payload = await response.json().catch(() => null) as {
    description?: unknown;
    error?: unknown;
    gatewayId?: unknown;
    mode?: unknown;
    model?: unknown;
  } | null;

  if (!response.ok) {
    const message = typeof payload?.error === "string" ? payload.error : `CustomRouter vision request failed (${response.status}).`;
    throw new Error(message);
  }

  if (typeof payload?.description !== "string" || payload.description.trim().length === 0) {
    throw new Error("CustomRouter returned an empty vision description.");
  }

  return {
    description: payload.description,
    gatewayId: typeof payload.gatewayId === "string" ? payload.gatewayId : undefined,
    mode: typeof payload.mode === "string" ? payload.mode : undefined,
    model: typeof payload.model === "string" ? payload.model : undefined,
  };
}
