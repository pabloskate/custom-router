import { CUSTOM_PRESET_ID, GATEWAY_PRESETS, type GatewayPreset } from "@/src/lib/gateway-presets";

export interface GatewayRecommendation {
  id: "openrouter" | "vercel" | "custom";
  name: string;
  badge: string;
  summary: string;
  /** Preset id from `GATEWAY_PRESETS` or `CUSTOM_PRESET_ID` for Other / Custom. */
  presetId: string;
}

export const QUICK_SETUP_GATEWAY_PRESET_IDS = ["openrouter", "vercel"] as const;

const QUICK_SETUP_GATEWAY_PRESET_ID_SET = new Set<string>(QUICK_SETUP_GATEWAY_PRESET_IDS);

const PRESETS_BY_ID = new Map(GATEWAY_PRESETS.map((preset) => [preset.id, preset] as const));

function requirePreset(id: string): GatewayPreset {
  const preset = PRESETS_BY_ID.get(id);
  if (!preset) {
    throw new Error(`Missing gateway preset: ${id}`);
  }
  return preset;
}

const OPENROUTER_PRESET = requirePreset("openrouter");
const VERCEL_PRESET = requirePreset("vercel");

/** Short tiles for the empty Gateways screen; each maps to a form preset. */
export const GATEWAY_RECOMMENDATIONS: readonly GatewayRecommendation[] = [
  {
    id: "openrouter",
    name: OPENROUTER_PRESET.name,
    badge: "Recommended",
    summary: "One key, many providers. Best default for routing profiles.",
    presetId: "openrouter",
  },
  {
    id: "vercel",
    name: VERCEL_PRESET.name,
    badge: "Vercel",
    summary: "If you already run AI traffic through Vercel.",
    presetId: "vercel",
  },
  {
    id: "custom",
    name: "Other / Custom",
    badge: "Advanced",
    summary: "Cloudflare AI Gateway, a direct provider, or any OpenAI-compatible base URL.",
    presetId: CUSTOM_PRESET_ID,
  },
];

export function isQuickSetupGatewayPreset(presetId?: string | null): presetId is (typeof QUICK_SETUP_GATEWAY_PRESET_IDS)[number] {
  return typeof presetId === "string" && QUICK_SETUP_GATEWAY_PRESET_ID_SET.has(presetId);
}

export function getRecommendedGatewayPresets(): GatewayPreset[] {
  return QUICK_SETUP_GATEWAY_PRESET_IDS.map((presetId) => requirePreset(presetId));
}

export function getDirectProviderPresets(): GatewayPreset[] {
  return GATEWAY_PRESETS.filter((preset) => !QUICK_SETUP_GATEWAY_PRESET_ID_SET.has(preset.id));
}

export function getGatewayFormHint(presetId?: string): string {
  if (!presetId) {
    return "Choose a gateway from the dropdown, or Other / Custom to enter your own base URL.";
  }

  if (presetId === "openrouter") {
    return "Recommended for the simplest multi-provider setup. Quick setup profiles work here today.";
  }

  if (presetId === "vercel") {
    return "Recommended if you already manage budgets and usage in Vercel. Quick setup profiles work here today.";
  }

  if (presetId === "__custom__") {
    return "Paste your OpenAI-compatible base URL (e.g. Cloudflare AI Gateway compat endpoint) and API key.";
  }

  return "Direct providers still work, but composite gateways are the best fit when you want cross-provider routing and upstream budget controls.";
}
