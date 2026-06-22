import type { AuthResult } from "@/src/lib/auth";
import { decryptByokSecret, resolveByokEncryptionSecret } from "@/src/lib/auth";
import { VISION } from "@/src/lib/constants";
import type { RouterRuntimeBindings } from "@/src/lib/infra";
import { json } from "@/src/lib/infra";
import { gatewayRowToInfo, getUserVisionSettings, loadGatewaysWithMigration } from "@/src/lib/storage";
import { callOpenAiCompatible } from "@/src/lib/upstream/upstream";

import {
  modelSupportsVisionInput,
  normalizeVisionMode,
  visionDescribeSchema,
  type VisionDescribeResponse,
} from "../contracts";
import { buildVisionSystemPrompt, buildVisionUserPrompt } from "./vision-prompts";

type VisionBindings = RouterRuntimeBindings & {
  ROUTER_DB: NonNullable<RouterRuntimeBindings["ROUTER_DB"]>;
};

function normalizeImages(body: {
  image?: string;
  images?: string[];
}): string[] {
  return body.images ?? (body.image ? [body.image] : []);
}

function isDataImageUrl(value: string): boolean {
  return /^data:image\/[a-z0-9.+-]+;base64,/i.test(value);
}

function isHttpsUrl(value: string): boolean {
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

export function getVisionImageValidationError(image: string): string | null {
  const trimmed = image.trim();
  if (trimmed.length === 0) {
    return "Image references cannot be empty.";
  }

  if (isDataImageUrl(trimmed)) {
    if (trimmed.length > VISION.MAX_DATA_URL_CHARS) {
      return "Image data URL is too large.";
    }
    return null;
  }

  if (isHttpsUrl(trimmed)) {
    return null;
  }

  return "Images must be HTTPS URLs or data:image/... base64 URLs. Local files must be read by the local MCP bridge first.";
}

export function getVisionImagesValidationFailure(images: string[]): {
  error: string;
  status: 400 | 413;
} | null {
  let totalDataUrlChars = 0;

  for (const image of images) {
    const trimmed = image.trim();
    const validationError = getVisionImageValidationError(trimmed);
    if (validationError) {
      return { error: validationError, status: 400 };
    }

    if (isDataImageUrl(trimmed)) {
      totalDataUrlChars += trimmed.length;
    }
  }

  if (totalDataUrlChars > VISION.MAX_TOTAL_DATA_URL_CHARS) {
    return {
      error: "Combined image data URLs are too large.",
      status: 413,
    };
  }

  return null;
}

function extractTextContent(content: unknown): string {
  if (typeof content === "string") {
    return content;
  }

  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === "string") {
          return part;
        }
        if (part && typeof part === "object") {
          const text = (part as { text?: unknown }).text;
          return typeof text === "string" ? text : "";
        }
        return "";
      })
      .filter((part) => part.length > 0)
      .join("\n");
  }

  return "";
}

export function extractVisionDescriptionFromChatCompletion(payload: unknown): string {
  if (!payload || typeof payload !== "object") {
    return "";
  }

  const choices = (payload as {
    choices?: Array<{ message?: { content?: unknown } }>;
  }).choices;

  return extractTextContent(choices?.[0]?.message?.content).trim();
}

export function buildVisionChatPayload(args: {
  context?: string;
  images: string[];
  mode: ReturnType<typeof normalizeVisionMode>;
  modelId: string;
  question?: string;
}): Record<string, unknown> {
  return {
    model: args.modelId,
    messages: [
      {
        role: "system",
        content: buildVisionSystemPrompt(args.mode),
      },
      {
        role: "user",
        content: [
          {
            type: "text",
            text: buildVisionUserPrompt({
              context: args.context,
              imageCount: args.images.length,
              mode: args.mode,
              question: args.question,
            }),
          },
          ...args.images.map((image) => ({
            type: "image_url",
            image_url: { url: image },
          })),
        ],
      },
    ],
    temperature: 0,
    max_tokens: VISION.MAX_OUTPUT_TOKENS,
    stream: false,
  };
}

export async function describeImagesViaVisionModel(args: {
  apiKey: string;
  baseUrl: string;
  context?: string;
  images: string[];
  mode: ReturnType<typeof normalizeVisionMode>;
  modelId: string;
  question?: string;
}): Promise<
  | { ok: true; description: string }
  | { ok: false; status: number; error: string }
> {
  const upstream = await callOpenAiCompatible({
    apiPath: "/chat/completions",
    baseUrl: args.baseUrl,
    apiKey: args.apiKey,
    payload: buildVisionChatPayload({
      context: args.context,
      images: args.images,
      mode: args.mode,
      modelId: args.modelId,
      question: args.question,
    }),
  });

  if (!upstream.ok) {
    return {
      ok: false,
      status: upstream.status,
      error: "Vision model request failed.",
    };
  }

  const upstreamPayload = await upstream.response.json().catch(() => null);
  const description = extractVisionDescriptionFromChatCompletion(upstreamPayload);
  if (!description) {
    return {
      ok: false,
      status: 502,
      error: "Vision model returned an empty description.",
    };
  }

  return { ok: true, description };
}

export async function handleDescribeVisionRequest(args: {
  auth: AuthResult;
  bindings: VisionBindings;
  request: Request;
}): Promise<Response> {
  let body: unknown;
  try {
    body = await args.request.json();
  } catch {
    return json({ error: "Invalid JSON body." }, 400);
  }

  const parsed = visionDescribeSchema.safeParse(body);
  if (!parsed.success) {
    return json({ error: "Invalid payload.", issues: parsed.error.issues }, 400);
  }

  const settings = await getUserVisionSettings(args.bindings.ROUTER_DB, args.auth.userId);
  if (!settings) {
    return json({ error: "No vision model configured. Open CustomRouter Vision and select a gateway model." }, 400);
  }

  const images = normalizeImages(parsed.data).map((image) => image.trim());
  const validationFailure = getVisionImagesValidationFailure(images);
  if (validationFailure) {
    return json({ error: validationFailure.error }, validationFailure.status);
  }

  const gatewayRows = await loadGatewaysWithMigration({
    db: args.bindings.ROUTER_DB,
    userId: args.auth.userId,
    upstreamBaseUrl: args.auth.upstreamBaseUrl ?? null,
    upstreamApiKeyEnc: args.auth.upstreamApiKeyEnc ?? null,
    customCatalogJson: args.auth.customCatalog ? JSON.stringify(args.auth.customCatalog) : null,
  });
  const gateway = gatewayRows.find((row) => row.id === settings.gatewayId);
  if (!gateway) {
    return json({ error: "Configured vision gateway no longer exists." }, 400);
  }

  const models = gatewayRowToInfo(gateway).models;
  const selectedModel = models.find((model) => model.id === settings.modelId);
  if (!selectedModel || !modelSupportsVisionInput(selectedModel)) {
    return json({ error: "Configured vision model is missing or does not advertise image input support." }, 400);
  }

  const byokSecret = resolveByokEncryptionSecret({
    byokSecret: args.bindings.BYOK_ENCRYPTION_SECRET ?? null,
  });
  if (!byokSecret) {
    return json({ error: "Server misconfigured: missing BYOK encryption secret." }, 500);
  }

  const apiKey = await decryptByokSecret({
    ciphertext: gateway.api_key_enc,
    secret: byokSecret,
  });
  if (!apiKey) {
    return json({ error: "Vision gateway credentials could not be decrypted." }, 500);
  }

  const mode = parsed.data.mode ?? settings.defaultMode;
  const descriptionResult = await describeImagesViaVisionModel({
    baseUrl: gateway.base_url,
    apiKey,
    context: parsed.data.context,
    images,
    mode,
    modelId: settings.modelId,
    question: parsed.data.question,
  });

  if (!descriptionResult.ok) {
    return json({
      error: descriptionResult.error,
      status: descriptionResult.status,
    }, descriptionResult.status === 400 ? 400 : 502);
  }

  const response: VisionDescribeResponse = {
    description: descriptionResult.description,
    mode,
    model: settings.modelId,
    gatewayId: settings.gatewayId,
  };
  return json(response);
}
