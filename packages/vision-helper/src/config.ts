export type VisionMode = "general" | "ui" | "ocr" | "diagram";

export const VISION_MODES: readonly VisionMode[] = ["general", "ui", "ocr", "diagram"];

export interface BridgeConfig {
  apiKey: string;
  baseUrl: string;
  maxImageBytes: number;
}

const DEFAULT_MAX_IMAGE_BYTES = 8 * 1024 * 1024;

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is required.`);
  }
  return value;
}

function parseMaxImageBytes(): number {
  const raw = process.env.CUSTOMROUTER_MAX_IMAGE_BYTES?.trim();
  if (!raw) {
    return DEFAULT_MAX_IMAGE_BYTES;
  }

  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_MAX_IMAGE_BYTES;
}

export function normalizeBaseUrl(value: string): string {
  return value
    .trim()
    .replace(/\/+$/, "")
    .replace(/\/api\/v1$/i, "")
    .replace(/\/api$/i, "");
}

export function loadConfig(): BridgeConfig {
  return {
    apiKey: requireEnv("CUSTOMROUTER_API_KEY"),
    baseUrl: normalizeBaseUrl(requireEnv("CUSTOMROUTER_BASE_URL")),
    maxImageBytes: parseMaxImageBytes(),
  };
}

export function normalizeMode(value: unknown): VisionMode {
  return VISION_MODES.includes(value as VisionMode) ? value as VisionMode : "ui";
}
