import type { CatalogItem } from "@custom-router/core";
import { z } from "zod";

import { VISION } from "@/src/lib/constants";

export type VisionMode = (typeof VISION.MODES)[number];

export interface VisionSettings {
  gatewayId: string;
  modelId: string;
  defaultMode: VisionMode;
  updatedAt: string;
}

export interface VisionModelOption {
  gatewayId: string;
  gatewayName: string;
  model: CatalogItem;
}

export interface VisionDescribeResponse {
  description: string;
  mode: VisionMode;
  model: string;
  gatewayId: string;
}

export interface VisionSettingsPayload {
  gateway_id: string;
  model_id: string;
  default_mode: VisionMode;
  updated_at: string;
}

export interface VisionModelOptionPayload {
  gateway_id: string;
  gateway_name: string;
  model_id: string;
  name?: string;
  modality?: string;
}

export interface VisionSettingsResponse {
  settings: VisionSettingsPayload | null;
  vision_models: VisionModelOptionPayload[];
}

export const visionModeSchema = z.enum(VISION.MODES);

export const visionSettingsUpdateSchema = z.object({
  gateway_id: z.string().min(1),
  model_id: z.string().min(1),
  default_mode: visionModeSchema.optional(),
});

const imageReferenceSchema = z.string().min(1);

export const visionDescribeSchema = z.object({
  image: imageReferenceSchema.optional(),
  images: z.array(imageReferenceSchema).min(1).max(VISION.MAX_IMAGES).optional(),
  mode: visionModeSchema.optional(),
  question: z.string().max(VISION.MAX_QUESTION_CHARS).optional(),
  context: z.string().max(VISION.MAX_CONTEXT_CHARS).optional(),
}).superRefine((body, ctx) => {
  if (!body.image && !body.images) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Provide image or images.",
      path: ["image"],
    });
  }
  if (body.image && body.images) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Provide either image or images, not both.",
      path: ["images"],
    });
  }
});

function parseModalitySegment(segment: string | undefined): string[] {
  return (segment ?? "")
    .split(/[,+]/)
    .map((token) => token.trim().toLowerCase())
    .filter((token) => token.length > 0);
}

export function modelSupportsVisionInput(model: Pick<CatalogItem, "modality">): boolean {
  const raw = model.modality?.trim().toLowerCase();
  if (!raw) {
    return false;
  }
  const [inputSegment] = raw.split("->", 2);
  return parseModalitySegment(inputSegment).includes("image");
}

export function collectVisionModelOptions(gateways: Array<{
  id: string;
  name: string;
  models: CatalogItem[];
}>): VisionModelOption[] {
  return gateways.flatMap((gateway) =>
    gateway.models
      .filter(modelSupportsVisionInput)
      .map((model) => ({
        gatewayId: gateway.id,
        gatewayName: gateway.name,
        model,
      })),
  );
}

export function normalizeVisionMode(value: string | null | undefined): VisionMode {
  return VISION.MODES.includes(value as VisionMode) ? value as VisionMode : VISION.DEFAULT_MODE;
}
