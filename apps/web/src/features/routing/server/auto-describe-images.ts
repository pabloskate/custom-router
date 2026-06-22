import type { CatalogItem } from "@custom-router/core";

import type { StoredVisionSettings } from "@/src/lib/storage";
import { VISION } from "@/src/lib/constants";
import type { GatewayRowPublic } from "@/src/lib/storage";
import { modelSupportsVisionInput, normalizeVisionMode, type VisionMode } from "@/src/features/vision/contracts";
import {
  describeImagesViaVisionModel,
  getVisionImagesValidationFailure,
} from "@/src/features/vision/server/vision-service";

import type { RoutedRequestBody } from "./router-service-types";

const IMAGE_PART_TYPES = new Set(["image_url", "image", "input_image"]);

interface ImageReferenceCollection {
  imagePartCount: number;
  images: string[];
}

export interface LatestUserImageCandidate {
  images: string[];
  question?: string;
  hasOtherImages: boolean;
  rewrite: (description: string) => RoutedRequestBody;
}

export interface AutoDescribeImagesPlan {
  apiKey: string;
  baseUrl: string;
  gatewayId: string;
  images: string[];
  mode: VisionMode;
  modelId: string;
  question?: string;
  rewrite: (description: string) => RoutedRequestBody;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object";
}

function hasImagePartType(part: Record<string, unknown>): boolean {
  return IMAGE_PART_TYPES.has(String(part.type));
}

function isImagePart(part: unknown): part is Record<string, unknown> {
  return isRecord(part) && hasImagePartType(part);
}

function getImageReference(part: Record<string, unknown>): string | null {
  const imageUrl = part.image_url;
  if (typeof imageUrl === "string") {
    return imageUrl.trim();
  }

  if (isRecord(imageUrl) && typeof imageUrl.url === "string") {
    return imageUrl.url.trim();
  }

  if (typeof part.url === "string") {
    return part.url.trim();
  }

  return null;
}

function collectImageReferences(content: unknown): ImageReferenceCollection {
  const parts = Array.isArray(content) ? content : [content];
  const images: string[] = [];
  let imagePartCount = 0;

  for (const part of parts) {
    if (!isImagePart(part)) {
      continue;
    }

    imagePartCount += 1;
    const image = getImageReference(part);
    if (image) {
      images.push(image);
    }
  }

  return { imagePartCount, images };
}

function hasImageContent(content: unknown): boolean {
  return collectImageReferences(content).imagePartCount > 0;
}

function contentToText(content: unknown): string {
  if (typeof content === "string") {
    return content;
  }

  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === "string") {
          return part;
        }
        if (isRecord(part) && typeof part.text === "string") {
          return part.text;
        }
        return "";
      })
      .filter(Boolean)
      .join("\n");
  }

  if (isRecord(content) && typeof content.text === "string") {
    return content.text;
  }

  return "";
}

function truncateQuestion(text: string): string | undefined {
  const trimmed = text.trim();
  if (!trimmed) {
    return undefined;
  }
  return trimmed.slice(0, VISION.MAX_QUESTION_CHARS);
}

function formatDescriptionForModel(description: string): string {
  return [
    "Image description from the latest user request:",
    "",
    description.trim(),
    "",
    "The original image attachment was converted to text because the selected model does not support image input.",
  ].join("\n");
}

function inferTextPartType(content: unknown, fallback: "text" | "input_text"): "text" | "input_text" {
  if (!Array.isArray(content)) {
    return fallback;
  }

  return content.some((part) => isRecord(part) && part.type === "input_text") ? "input_text" : fallback;
}

function makeTextPart(type: "text" | "input_text", text: string): Record<string, string> {
  return { type, text };
}

function rewriteContentWithDescription(
  content: unknown,
  description: string,
  textPartType: "text" | "input_text",
): unknown {
  const descriptionPart = makeTextPart(textPartType, formatDescriptionForModel(description));

  if (Array.isArray(content)) {
    return [
      ...content.filter((part) => !isImagePart(part)),
      descriptionPart,
    ];
  }

  if (isImagePart(content)) {
    return [descriptionPart];
  }

  if (typeof content === "string") {
    return [
      { type: textPartType, text: content },
      descriptionPart,
    ];
  }

  return [
    ...(content === undefined ? [] : [content]),
    descriptionPart,
  ];
}

function inputItemHasImages(item: unknown): boolean {
  if (!isRecord(item)) {
    return false;
  }

  if (hasImagePartType(item)) {
    return true;
  }

  return hasImageContent(item.content);
}

function hasImagesInInput(input: unknown): boolean {
  if (Array.isArray(input)) {
    return input.some(inputItemHasImages);
  }

  return inputItemHasImages(input);
}

function requestRequiresImageOutput(body: RoutedRequestBody): boolean {
  const modalities = body.modalities;
  return Array.isArray(modalities)
    && modalities.some((modality) => typeof modality === "string" && modality.toLowerCase() === "image");
}

function getChatCandidate(body: RoutedRequestBody): LatestUserImageCandidate | null {
  const messages = body.messages;
  if (!Array.isArray(messages)) {
    return null;
  }

  let latestUserIndex = -1;
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (messages[index]?.role === "user") {
      latestUserIndex = index;
      break;
    }
  }

  if (latestUserIndex < 0) {
    return null;
  }

  const latestUserMessage = messages[latestUserIndex];
  const latestImages = collectImageReferences(latestUserMessage?.content);
  if (latestImages.imagePartCount === 0 || latestImages.images.length !== latestImages.imagePartCount) {
    return null;
  }

  const hasOtherImages =
    messages.some((message, index) => index !== latestUserIndex && hasImageContent(message.content))
    || hasImagesInInput(body.input)
    || hasImagesInInput(body.prompt);

  return {
    images: latestImages.images,
    question: truncateQuestion(contentToText(latestUserMessage?.content)),
    hasOtherImages,
    rewrite: (description) => ({
      ...body,
      messages: messages.map((message, index) => index === latestUserIndex
        ? {
            ...message,
            content: rewriteContentWithDescription(
              message.content,
              description,
              inferTextPartType(message.content, "text"),
            ),
          }
        : message),
    }),
  };
}

function getResponsesMessageCandidate(body: RoutedRequestBody, input: unknown[]): LatestUserImageCandidate | null {
  let latestUserIndex = -1;
  for (let index = input.length - 1; index >= 0; index -= 1) {
    const item = input[index];
    if (isRecord(item) && item.type === "message" && item.role === "user") {
      latestUserIndex = index;
      break;
    }
  }

  if (latestUserIndex < 0) {
    return null;
  }

  const latestUserItem = input[latestUserIndex] as Record<string, unknown>;
  const latestImages = collectImageReferences(latestUserItem.content);
  if (latestImages.imagePartCount === 0 || latestImages.images.length !== latestImages.imagePartCount) {
    return null;
  }

  const hasOtherImages =
    input.some((item, index) => index !== latestUserIndex && inputItemHasImages(item))
    || (body.messages ?? []).some((message) => hasImageContent(message.content));

  return {
    images: latestImages.images,
    question: truncateQuestion(contentToText(latestUserItem.content)),
    hasOtherImages,
    rewrite: (description) => ({
      ...body,
      input: input.map((item, index) => index === latestUserIndex && isRecord(item)
        ? {
            ...item,
            content: rewriteContentWithDescription(item.content, description, "input_text"),
          }
        : item),
    }),
  };
}

function getResponsesTopLevelCandidate(body: RoutedRequestBody, input: unknown[]): LatestUserImageCandidate | null {
  const latestImages = collectImageReferences(input);
  if (latestImages.imagePartCount === 0 || latestImages.images.length !== latestImages.imagePartCount) {
    return null;
  }

  const hasOtherImages =
    input.some((item) => isRecord(item) && !hasImagePartType(item) && hasImageContent(item.content))
    || (body.messages ?? []).some((message) => hasImageContent(message.content));

  return {
    images: latestImages.images,
    question: truncateQuestion(contentToText(input)),
    hasOtherImages,
    rewrite: (description) => ({
      ...body,
      input: [
        ...input.filter((item) => !isImagePart(item)),
        makeTextPart("input_text", formatDescriptionForModel(description)),
      ],
    }),
  };
}

function getResponsesObjectCandidate(body: RoutedRequestBody, input: Record<string, unknown>): LatestUserImageCandidate | null {
  const role = input.role;
  if (role && role !== "user") {
    return null;
  }

  const inputIsImagePart = hasImagePartType(input);
  const imageSource = inputIsImagePart ? input : input.content;
  const latestImages = collectImageReferences(imageSource);
  if (latestImages.imagePartCount === 0 || latestImages.images.length !== latestImages.imagePartCount) {
    return null;
  }

  const hasOtherImages = (body.messages ?? []).some((message) => hasImageContent(message.content));

  return {
    images: latestImages.images,
    question: truncateQuestion(contentToText(input.content ?? input.text)),
    hasOtherImages,
    rewrite: (description) => ({
      ...body,
      input: inputIsImagePart
        ? makeTextPart("input_text", formatDescriptionForModel(description))
        : {
            ...input,
            content: rewriteContentWithDescription(input.content, description, "input_text"),
          },
    }),
  };
}

export function getLatestUserImageCandidate(body: RoutedRequestBody): LatestUserImageCandidate | null {
  const chatCandidate = getChatCandidate(body);
  if (chatCandidate) {
    return chatCandidate;
  }

  if (Array.isArray(body.input)) {
    return getResponsesMessageCandidate(body, body.input) ?? getResponsesTopLevelCandidate(body, body.input);
  }

  if (isRecord(body.input)) {
    return getResponsesObjectCandidate(body, body.input);
  }

  return null;
}

export function resolveAutoDescribeImagesPlan(args: {
  body: RoutedRequestBody;
  gatewayMap: Map<string, { baseUrl: string; apiKey: string }>;
  gatewayRows?: GatewayRowPublic[];
  settings?: StoredVisionSettings | null;
}): AutoDescribeImagesPlan | null {
  if (!args.settings?.autoDescribeImagesEnabled || requestRequiresImageOutput(args.body)) {
    return null;
  }

  const candidate = getLatestUserImageCandidate(args.body);
  if (!candidate || candidate.hasOtherImages || candidate.images.length > VISION.MAX_IMAGES) {
    return null;
  }

  if (getVisionImagesValidationFailure(candidate.images)) {
    return null;
  }

  const gateway = args.gatewayRows?.find((row) => row.id === args.settings?.gatewayId);
  const selectedVisionModel = gateway?.models.find((model) => model.id === args.settings?.modelId);
  if (!selectedVisionModel || !modelSupportsVisionInput(selectedVisionModel)) {
    return null;
  }

  const upstream = args.gatewayMap.get(args.settings.gatewayId);
  if (!upstream) {
    return null;
  }

  return {
    apiKey: upstream.apiKey,
    baseUrl: upstream.baseUrl,
    gatewayId: args.settings.gatewayId,
    images: candidate.images,
    mode: normalizeVisionMode(args.settings.defaultMode),
    modelId: args.settings.modelId,
    question: candidate.question,
    rewrite: candidate.rewrite,
  };
}

export function modelSupportsImageInput(args: {
  catalog: CatalogItem[];
  modelId: string;
}): boolean {
  const model = args.catalog.find((item) => item.id === args.modelId);
  return Boolean(model && modelSupportsVisionInput(model));
}

export function shouldAutoDescribeAttempt(args: {
  catalog: CatalogItem[];
  modelId: string;
  plan: AutoDescribeImagesPlan | null;
}): boolean {
  if (!args.plan) {
    return false;
  }

  const model = args.catalog.find((item) => item.id === args.modelId);
  return Boolean(model && !modelSupportsVisionInput(model));
}

export async function buildAutoDescribedRequestBody(args: {
  plan: AutoDescribeImagesPlan;
}): Promise<
  | {
      ok: true;
      body: RoutedRequestBody;
      description: string;
    }
  | {
      ok: false;
      error: string;
      status: number;
    }
> {
  const description = await describeImagesViaVisionModel({
    apiKey: args.plan.apiKey,
    baseUrl: args.plan.baseUrl,
    images: args.plan.images,
    mode: args.plan.mode,
    modelId: args.plan.modelId,
    question: args.plan.question,
    context: "Automatic CustomRouter conversion for a text-only downstream model.",
  });

  if (!description.ok) {
    return description;
  }

  return {
    ok: true,
    body: args.plan.rewrite(description.description),
    description: description.description,
  };
}
