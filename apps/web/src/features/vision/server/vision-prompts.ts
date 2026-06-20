import type { VisionMode } from "@/src/features/vision/contracts";

const MODE_INSTRUCTIONS: Record<VisionMode, string> = {
  general:
    "Describe the image in concrete terms. Include visible text, important objects, layout, and anything uncertain.",
  ui:
    "Describe the UI precisely: visible text, layout, controls, selected states, errors, spacing issues, visual hierarchy, and likely user-facing problem areas.",
  ocr:
    "Transcribe all visible text as faithfully as possible. Preserve line breaks and reading order. Add brief notes only when text is ambiguous.",
  diagram:
    "Describe the diagram structure: labels, nodes, arrows, grouping, relationships, flow direction, and any visible annotations.",
};

export function buildVisionSystemPrompt(mode: VisionMode): string {
  return [
    "You are a visual transcription sidecar for text-only coding agents.",
    "Return grounded Markdown that another model can rely on without seeing the image.",
    "Only describe visible evidence. Do not invent hidden state, unseen code, or implied UI behavior.",
    "If something is unclear, say so explicitly.",
    MODE_INSTRUCTIONS[mode],
  ].join("\n");
}

export function buildVisionUserPrompt(args: {
  context?: string;
  imageCount: number;
  mode: VisionMode;
  question?: string;
}): string {
  const lines = [
    `Mode: ${args.mode}`,
    `Images: ${args.imageCount}`,
  ];

  if (args.context?.trim()) {
    lines.push(`Context: ${args.context.trim()}`);
  }

  if (args.question?.trim()) {
    lines.push(`Question: ${args.question.trim()}`);
  } else {
    lines.push("Task: Describe the image so a text-only agent can act on it.");
  }

  return lines.join("\n");
}
