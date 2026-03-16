// ─────────────────────────────────────────────────────────────────────────────
// routing-presets.ts
//
// Hard-coded routing presets that auto-populate a gateway's model list and
// the global routing configuration (classifier, fallback, instructions) in
// one click. Each preset is a self-contained setup for a specific use case.
//
// To add a new preset, append an entry to the ROUTING_PRESETS array below.
// Model IDs use OpenRouter naming convention: provider/model-name
// ─────────────────────────────────────────────────────────────────────────────

import type { GatewayModel } from "@/src/features/gateways/contracts";

export interface RoutingPreset {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly models: readonly GatewayModel[];
  readonly classifierModel: string;
  readonly defaultModel: string;
  readonly routingInstructions: string;
}

// ── Presets ───────────────────────────────────────────────────────────────────

export const ROUTING_PRESETS: readonly RoutingPreset[] = [
  {
    id: "coding-power",
    name: "Coding (Full Power)",
    description: "Premium coding setup with deep reasoning, daily dev, and CLI models",
    classifierModel: "google/gemini-flash-2.0",
    defaultModel: "anthropic/claude-sonnet-4-6",
    models: [
      {
        id: "anthropic/claude-opus-4-6:thinking",
        name: "Claude Opus 4.6 Thinking",
        modality: "text->text",
        thinking: "xhigh",
        reasoningPreset: "xhigh",
        whenToUse:
          "Complex multi-step reasoning, architecture planning, strategic analysis, long agentic pipelines.",
      },
      {
        id: "anthropic/claude-opus-4-6",
        name: "Claude Opus 4.6",
        modality: "text,image->text",
        thinking: "none",
        reasoningPreset: "none",
        whenToUse:
          "Complex software architecture, large-scale refactoring, tool-augmented coding, high-end creative writing.",
      },
      {
        id: "anthropic/claude-sonnet-4-6",
        name: "Claude Sonnet 4.6",
        modality: "text,image->text",
        thinking: "low",
        reasoningPreset: "low",
        whenToUse:
          "Daily development, bug fixes, code review, frontend/UI design, CRM workflows.",
      },
      {
        id: "openai/gpt-5.3-codex",
        name: "GPT-5.3 Codex",
        modality: "text->text",
        thinking: "medium",
        reasoningPreset: "medium",
        whenToUse:
          "CLI-heavy workflows, terminal operations, multi-file agentic execution, autonomous debugging.",
      },
      {
        id: "google/gemini-2.5-pro-preview",
        name: "Gemini 2.5 Pro",
        modality: "text,image->text",
        thinking: "high",
        reasoningPreset: "high",
        whenToUse:
          "Scientific research analysis, very long documents (1M context), fact-checking.",
      },
      {
        id: "google/gemini-flash-2.0",
        name: "Gemini Flash 2.0",
        modality: "text,image->text",
        thinking: "none",
        reasoningPreset: "none",
        whenToUse:
          "Quick answers, simple lookups, casual chat, cost-optimized reflex responses.",
      },
    ],
    routingInstructions: `
Route every request to the single most appropriate model using the rules below.
Always respect the catalog's "whenToUse" hints first; use these rules as tiebreakers.

COMPLEX REASONING & PLANNING
  → anthropic/claude-opus-4-6:thinking

CODING — COMPLEX (large refactors, system design, cross-repo changes)
  → anthropic/claude-opus-4-6

CODING — DAILY DEVELOPMENT (features, bug fixes, code review, frontend)
  → anthropic/claude-sonnet-4-6

CODING — CLI / TERMINAL / CYBERSECURITY
  → openai/gpt-5.3-codex

SCIENTIFIC RESEARCH & LONG DOCUMENTS
  → google/gemini-2.5-pro-preview

QUICK CHAT & SIMPLE LOOKUPS
  → google/gemini-flash-2.0

Default to Mid tier for most coding tasks. Only use Premium for genuinely complex reasoning.
If the conversation contains an image, pick a vision-capable model.
`.trim(),
  },
];
