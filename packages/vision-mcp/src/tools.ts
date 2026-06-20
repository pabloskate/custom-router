import { loadConfig, normalizeMode } from "./config.js";
import { describeWithCustomRouter } from "./customrouter-client.js";
import { captureScreenshot, imageSourceToRequestImage, readClipboardImage } from "./local-images.js";

type ToolResult = {
  content: Array<{ type: "text"; text: string }>;
  isError?: boolean;
};

function getString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function getObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function textResult(text: string, isError = false): ToolResult {
  return {
    content: [{ type: "text", text }],
    ...(isError ? { isError: true } : {}),
  };
}

function formatResult(args: {
  description: string;
  gatewayId?: string;
  mode?: string;
  model?: string;
}): string {
  const metadata = [
    args.model ? `model=${args.model}` : null,
    args.gatewayId ? `gateway=${args.gatewayId}` : null,
    args.mode ? `mode=${args.mode}` : null,
  ].filter(Boolean).join(" ");

  return metadata ? `${args.description}\n\n---\n${metadata}` : args.description;
}

async function describeImages(args: {
  context?: string;
  images: string[];
  mode?: unknown;
  question?: string;
}): Promise<ToolResult> {
  const config = loadConfig();
  const images = await Promise.all(args.images.map((source) => imageSourceToRequestImage(source, config.maxImageBytes)));
  const result = await describeWithCustomRouter(config, {
    context: args.context,
    images,
    mode: normalizeMode(args.mode),
    question: args.question,
  });
  return textResult(formatResult(result));
}

export async function callTool(name: string, rawArguments: unknown): Promise<ToolResult> {
  const args = getObject(rawArguments);

  try {
    if (name === "describe_image") {
      const source = getString(args.source);
      if (!source) {
        throw new Error("source is required.");
      }

      return await describeImages({
        context: getString(args.context),
        images: [source],
        mode: args.mode,
        question: getString(args.question),
      });
    }

    if (name === "describe_clipboard") {
      const config = loadConfig();
      const image = await readClipboardImage(config.maxImageBytes);
      const result = await describeWithCustomRouter(config, {
        context: getString(args.context),
        images: [image],
        mode: normalizeMode(args.mode),
        question: getString(args.question),
      });
      return textResult(formatResult(result));
    }

    if (name === "capture_screenshot") {
      const config = loadConfig();
      const image = await captureScreenshot(config.maxImageBytes);
      const result = await describeWithCustomRouter(config, {
        context: getString(args.context),
        images: [image],
        mode: normalizeMode(args.mode),
        question: getString(args.question),
      });
      return textResult(formatResult(result));
    }

    if (name === "compare_images") {
      const sourceA = getString(args.source_a);
      const sourceB = getString(args.source_b);
      if (!sourceA || !sourceB) {
        throw new Error("source_a and source_b are required.");
      }

      return await describeImages({
        context: getString(args.context),
        images: [sourceA, sourceB],
        mode: args.mode,
        question: getString(args.task) ?? "Compare these images and describe important similarities, differences, and visible text.",
      });
    }

    if (name === "vision_status") {
      const config = loadConfig();
      return textResult(JSON.stringify({
        baseUrl: config.baseUrl,
        hasApiKey: config.apiKey.length > 0,
        maxImageBytes: config.maxImageBytes,
        tools: ["describe_image", "describe_clipboard", "capture_screenshot", "compare_images"],
      }, null, 2));
    }

    if (name === "vision_rules") {
      return textResult([
        "When the user references an image, screenshot, diagram, visual UI issue, or asks what something looks like, call the CustomRouter vision MCP tool before answering.",
        "If a local file path is provided, call describe_image.",
        "If no file path is provided and the user references a recent screenshot, call describe_clipboard.",
        "If the user asks to inspect the current screen, call capture_screenshot.",
        "Do not claim that images cannot be viewed until the vision tool has failed.",
      ].join("\n"));
    }

    throw new Error(`Unknown tool: ${name}`);
  } catch (error) {
    return textResult(error instanceof Error ? error.message : String(error), true);
  }
}

export const TOOL_DEFINITIONS = [
  {
    name: "describe_image",
    description: "Describe a local image file, file:// URL, HTTPS URL, or data URL using the configured CustomRouter vision model.",
    inputSchema: {
      type: "object",
      properties: {
        source: { type: "string", description: "Local path, file:// URL, HTTPS URL, or data:image/... URL." },
        mode: { type: "string", enum: ["general", "ui", "ocr", "diagram"], default: "ui" },
        question: { type: "string" },
        context: { type: "string" },
      },
      required: ["source"],
      additionalProperties: false,
    },
  },
  {
    name: "describe_clipboard",
    description: "Describe the current clipboard image using the configured CustomRouter vision model.",
    inputSchema: {
      type: "object",
      properties: {
        mode: { type: "string", enum: ["general", "ui", "ocr", "diagram"], default: "ui" },
        question: { type: "string" },
        context: { type: "string" },
      },
      additionalProperties: false,
    },
  },
  {
    name: "capture_screenshot",
    description: "Capture the current screen locally and describe it using the configured CustomRouter vision model.",
    inputSchema: {
      type: "object",
      properties: {
        mode: { type: "string", enum: ["general", "ui", "ocr", "diagram"], default: "ui" },
        question: { type: "string" },
        context: { type: "string" },
      },
      additionalProperties: false,
    },
  },
  {
    name: "compare_images",
    description: "Compare two local image files, HTTPS URLs, or data URLs using the configured CustomRouter vision model.",
    inputSchema: {
      type: "object",
      properties: {
        source_a: { type: "string" },
        source_b: { type: "string" },
        mode: { type: "string", enum: ["general", "ui", "ocr", "diagram"], default: "ui" },
        task: { type: "string" },
        context: { type: "string" },
      },
      required: ["source_a", "source_b"],
      additionalProperties: false,
    },
  },
  {
    name: "vision_status",
    description: "Return local CustomRouter vision bridge configuration status.",
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
  },
  {
    name: "vision_rules",
    description: "Return generic agent instructions for when to call the vision tools.",
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
  },
];
