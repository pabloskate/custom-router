import type { ReasoningEffort } from "@custom-router/core";

export const REASONING_PRESET_SELECT_OPTIONS: ReadonlyArray<{
  value: ReasoningEffort;
  label: string;
}> = [
  { value: "provider_default", label: "Provider default (omit reasoning param)" },
  { value: "none", label: "Explicit off (reasoning.effort = none)" },
  { value: "minimal", label: "Minimal (explicit)" },
  { value: "low", label: "Low (explicit)" },
  { value: "medium", label: "Medium (explicit)" },
  { value: "high", label: "High (explicit)" },
  { value: "xhigh", label: "Extra high (explicit)" },
] as const;

export const REASONING_PRESET_FIELD_HINT =
  'Provider default omits the reasoning parameter. "Explicit off" sends reasoning.effort = "none".';

const REASONING_PRESET_BADGE_LABELS: Record<ReasoningEffort, string> = {
  provider_default: "Provider default",
  none: "No reasoning",
  minimal: "Minimal",
  low: "Low",
  medium: "Medium",
  high: "High",
  xhigh: "Extra high",
};

export function getReasoningPresetBadgeLabel(value?: string | null): string {
  if (!value) {
    return REASONING_PRESET_BADGE_LABELS.provider_default;
  }

  return REASONING_PRESET_BADGE_LABELS[value as ReasoningEffort]
    ?? REASONING_PRESET_BADGE_LABELS.provider_default;
}
