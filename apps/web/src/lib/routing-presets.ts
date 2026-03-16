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
import { GATEWAY_PRESETS } from "./gateway-presets";

export interface RoutingPreset {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  /** ID from GATEWAY_PRESETS — only show this preset on matching gateways. */
  readonly gatewayPresetId: string;
  readonly models: readonly GatewayModel[];
  readonly classifierModel: string;
  readonly defaultModel: string;
  readonly routingInstructions: string;
}

/**
 * Derives the GATEWAY_PRESETS id (e.g. "openrouter") from a gateway's baseUrl.
 * Returns undefined for custom / unrecognized providers.
 */
export function getGatewayPresetId(baseUrl: string): string | undefined {
  const normalized = baseUrl.replace(/\/$/, "").toLowerCase();
  return GATEWAY_PRESETS.find(
    (p) => normalized.startsWith(p.baseUrl.replace(/\/$/, "").toLowerCase())
  )?.id;
}

// ── Presets ───────────────────────────────────────────────────────────────────

export const ROUTING_PRESETS: readonly RoutingPreset[] = [
  // ── 1. Balanced General-Purpose ─────────────────────────────────────────────
  {
    id: "general-balanced",
    name: "Balanced General-Purpose",
    description: "Practical daily driver: Claude for quality, Mercury 2 for speed, Gemini for long docs, Seed for images",
    gatewayPresetId: "openrouter",
    classifierModel: "google/gemini-3.1-flash-lite-preview",
    defaultModel: "anthropic/claude-sonnet-4.6",
    models: [
      {
        id: "anthropic/claude-sonnet-4.6",
        name: "Claude Sonnet 4.6",
        modality: "text,image->text",
        thinking: "none",
        reasoningPreset: "none",
        whenToUse:
          "Complex reasoning, creative writing, nuanced Q&A, professional emails, summarization. $3/$15 per M tokens.",
      },
      {
        id: "inception/mercury-2",
        name: "Mercury 2",
        modality: "text->text",
        thinking: "none",
        reasoningPreset: "none",
        whenToUse:
          "Short conversational replies, quick factual lookups, casual chat. 1000+ T/s. $0.25/$0.75 per M tokens.",
      },
      {
        id: "google/gemini-3.1-pro-preview",
        name: "Gemini 3.1 Pro",
        modality: "text,image->text",
        thinking: "none",
        reasoningPreset: "none",
        whenToUse:
          "Long document analysis, large pastes (>50K tokens), research synthesis, 1M context window. $2/$12 per M tokens.",
      },
      {
        id: "bytedance-seed/seed-1.6-flash",
        name: "Seed 1.6 Flash",
        modality: "text,image->text",
        thinking: "none",
        reasoningPreset: "none",
        whenToUse:
          "Image inputs, screenshots, visual content analysis. Multimodal, ultra-cheap. $0.075/$0.30 per M tokens.",
      },
      {
        id: "deepseek/deepseek-v3.2",
        name: "DeepSeek V3.2",
        modality: "text->text",
        thinking: "none",
        reasoningPreset: "none",
        whenToUse:
          "Budget-first mode when cost is the primary concern. Strong output quality. $0.26/$0.38 per M tokens.",
      },
    ],
    routingInstructions: `
Route every request to the single best model. Pricing is shown per million tokens (input/output).

MODEL REFERENCE
  anthropic/claude-sonnet-4.6    — $3/$15    — vision, 1M ctx
  inception/mercury-2            — $0.25/$0.75 — text only, 128K ctx, 1000+ T/s
  google/gemini-3.1-pro-preview  — $2/$12    — vision, 1M ctx
  bytedance-seed/seed-1.6-flash  — $0.075/$0.30 — vision, 256K ctx
  deepseek/deepseek-v3.2         — $0.26/$0.38 — text only, 163K ctx

ROUTING RULES (apply in order)

IMAGE INPUT (message contains an image or screenshot)
  → bytedance-seed/seed-1.6-flash  [cheapest vision; escalate to claude-sonnet-4.6 only if high-quality output explicitly needed]

WEB SEARCH / CURRENT INFO (user asks about "latest", "current", "today", "news", "recent", or requests a web lookup)
  → anthropic/claude-sonnet-4.6:online

LONG DOCUMENTS / ANALYSIS (large paste, PDF, "summarize this", context >50K tokens)
  → google/gemini-3.1-pro-preview

COMPLEX REASONING / CREATIVE / NUANCED Q&A
  → anthropic/claude-sonnet-4.6

QUICK CHAT / SHORT FACTUAL LOOKUPS / CONVERSATIONAL REPLIES
  → inception/mercury-2

BUDGET MODE (user says "cheap", "quick", or cost is the explicit priority)
  → deepseek/deepseek-v3.2

Default to Claude Sonnet 4.6 when the task is unclear.
`.trim(),
  },

  // ── 2. Speed-First / Low Latency ────────────────────────────────────────────
  {
    id: "speed-first",
    name: "Speed-First",
    description: "Minimum latency at all costs: Mercury 2 default (1000+ T/s), Seed for images, Grok for web search and tool calls",
    gatewayPresetId: "openrouter",
    classifierModel: "google/gemini-3.1-flash-lite-preview",
    defaultModel: "inception/mercury-2",
    models: [
      {
        id: "inception/mercury-2",
        name: "Mercury 2",
        modality: "text->text",
        thinking: "none",
        reasoningPreset: "none",
        whenToUse:
          "Default for everything. 1000+ T/s reasoning diffusion model, native tool use, 128K ctx. $0.25/$0.75 per M tokens.",
      },
      {
        id: "bytedance-seed/seed-1.6-flash",
        name: "Seed 1.6 Flash",
        modality: "text,image->text",
        thinking: "none",
        reasoningPreset: "none",
        whenToUse:
          "Image inputs, screenshots, visual content. Also the cheapest fast path for ultra-high-volume text. 256K ctx. $0.075/$0.30 per M tokens.",
      },
      {
        id: "x-ai/grok-4.1-fast",
        name: "Grok 4.1 Fast",
        modality: "text,image->text",
        thinking: "none",
        reasoningPreset: "none",
        whenToUse:
          "Tool calls / function calling, web search, long context (>128K tokens), 2M ctx window. 115.6 T/s. $0.20/$0.50 per M tokens.",
      },
      {
        id: "google/gemini-3.1-flash-lite-preview:nitro",
        name: "Gemini 3.1 Flash Lite (Nitro)",
        modality: "text,image->text",
        thinking: "none",
        reasoningPreset: "none",
        whenToUse:
          "Context >128K tokens when tool use is not needed. 1M ctx, throughput-optimized via :nitro. $0.25/$1.50 per M tokens.",
      },
      {
        id: "meta-llama/llama-3.3-70b-instruct:nitro",
        name: "Llama 3.3 70B (Nitro)",
        modality: "text->text",
        thinking: "none",
        reasoningPreset: "none",
        whenToUse:
          "Open-source preference, cost-optimized workloads. Routed to Groq via :nitro for fastest inference. $0.10/$0.32 per M tokens.",
      },
    ],
    routingInstructions: `
Route every request to the fastest appropriate model. Pricing shown per million tokens (input/output).

MODEL REFERENCE
  inception/mercury-2                         — $0.25/$0.75  — text only, 128K ctx, 1000+ T/s
  bytedance-seed/seed-1.6-flash               — $0.075/$0.30 — vision, 256K ctx
  x-ai/grok-4.1-fast                          — $0.20/$0.50  — vision, 2M ctx, native web search
  google/gemini-3.1-flash-lite-preview:nitro  — $0.25/$1.50  — vision, 1M ctx, throughput-sorted
  meta-llama/llama-3.3-70b-instruct:nitro     — $0.10/$0.32  — text only, 131K ctx, Groq-fast

ROUTING RULES (apply in order — speed is the primary objective)

IMAGE INPUT (message contains an image or screenshot)
  → bytedance-seed/seed-1.6-flash

WEB SEARCH / CURRENT INFO (user asks about "latest", "current", "today", "news", "recent")
  → x-ai/grok-4.1-fast  [has native web search + X search at $5/K calls]

TOOL USE / FUNCTION CALLING / AGENTIC
  → x-ai/grok-4.1-fast  [best tool-call throughput with 2M context]

CONTEXT > 128K TOKENS (no tool use needed)
  → google/gemini-3.1-flash-lite-preview:nitro

OPEN-SOURCE / COST-OPTIMIZED
  → meta-llama/llama-3.3-70b-instruct:nitro

EVERYTHING ELSE
  → inception/mercury-2  [default — fastest generation at 1000+ T/s]

Never use a slower model when a faster one can handle the task.
`.trim(),
  },

  // ── 3. Fast Coding ──────────────────────────────────────────────────────────
  {
    id: "coding-fast",
    name: "Fast Coding",
    description: "Near-frontier coding quality at a fraction of the cost: MiniMax M2.5 (80.2% SWE-bench) as the workhorse",
    gatewayPresetId: "openrouter",
    classifierModel: "google/gemini-3.1-flash-lite-preview",
    defaultModel: "minimax/minimax-m2.5",
    models: [
      {
        id: "minimax/minimax-m2.5",
        name: "MiniMax M2.5",
        modality: "text->text",
        thinking: "none",
        reasoningPreset: "none",
        whenToUse:
          "Most coding tasks: features, bug fixes, code review, refactors. 80.2% SWE-bench (near Claude Opus level at 1/20 the output cost). $0.25/$1.20 per M tokens.",
      },
      {
        id: "qwen/qwen3-coder",
        name: "Qwen3-Coder",
        modality: "text->text",
        thinking: "none",
        reasoningPreset: "none",
        whenToUse:
          "Large codebases, multi-file navigation, tool-heavy agentic coding. 480B total / 35B active MoE, 262K ctx. $0.22/$1 per M tokens.",
      },
      {
        id: "deepseek/deepseek-v3.2",
        name: "DeepSeek V3.2",
        modality: "text->text",
        thinking: "none",
        reasoningPreset: "none",
        whenToUse:
          "Scripts, data transforms, standalone logic-heavy functions. 73% SWE-bench, cheapest strong output. $0.26/$0.38 per M tokens.",
      },
      {
        id: "moonshotai/kimi-k2.5",
        name: "Kimi K2.5",
        modality: "text,image->text",
        thinking: "none",
        reasoningPreset: "none",
        whenToUse:
          "UI/frontend coding, CSS, visual layout, image inputs (only vision-capable model here). 76.8% SWE-bench, 262K ctx. $0.45/$2.20 per M tokens.",
      },
      {
        id: "qwen/qwen3.5-9b",
        name: "Qwen 3.5 9B",
        modality: "text->text",
        thinking: "none",
        reasoningPreset: "none",
        whenToUse:
          "Trivial completions, fill-in-the-blank boilerplate, autocomplete-style tasks where cost matters most. $0.05/$0.15 per M tokens.",
      },
    ],
    routingInstructions: `
Route every request to the best coding model for the task. Pricing shown per million tokens (input/output).

MODEL REFERENCE
  minimax/minimax-m2.5    — $0.25/$1.20  — text only, 80.2% SWE-bench, 196K ctx
  qwen/qwen3-coder        — $0.22/$1     — text only, 480B/35B active MoE, 262K ctx
  deepseek/deepseek-v3.2  — $0.26/$0.38  — text only, 73% SWE-bench, 163K ctx
  moonshotai/kimi-k2.5    — $0.45/$2.20  — VISION, 76.8% SWE-bench, 262K ctx
  qwen/qwen3.5-9b         — $0.05/$0.15  — text only, ultra-cheap

ROUTING RULES (apply in order)

IMAGE INPUT (screenshot, UI mockup, diagram, code in an image)
  → moonshotai/kimi-k2.5  [only vision-capable model in this catalog]

WEB SEARCH / CURRENT DOCS (user asks about latest library version, API changes, "look up X")
  → minimax/minimax-m2.5:online  [append :online for Exa web search, ~$0.02/request]

AGENTIC / MULTI-FILE (codebase navigation, tool loops, multi-step execution)
  → qwen/qwen3-coder

SCRIPTS / DATA / STANDALONE FUNCTIONS (isolated logic, data transforms, one-file tasks)
  → deepseek/deepseek-v3.2  [cheapest strong output at $0.38/M]

UI / FRONTEND / CSS / VISUAL LAYOUT (text only, no image)
  → moonshotai/kimi-k2.5  [specialized for visual coding even without an image]

TRIVIAL BOILERPLATE / AUTOCOMPLETE (getters, setters, simple loops, obvious completions)
  → qwen/qwen3.5-9b

ALL OTHER CODING (features, bugs, reviews, refactors, tests)
  → minimax/minimax-m2.5  [default — 80.2% SWE-bench at $1.20/M output]

Only escalate to a more expensive model when the cheaper one genuinely cannot handle the task.
`.trim(),
  },

  // ── 4. Deep Premium Agentic Coding ──────────────────────────────────────────
  {
    id: "coding-agentic-premium",
    name: "Deep Premium Agentic",
    description: "Best-in-class agentic coding: Claude Opus for top tasks, MiniMax M2.5 as the smart-cheap workhorse (80.2% SWE-bench at 1/20 Opus cost)",
    gatewayPresetId: "openrouter",
    classifierModel: "google/gemini-3.1-flash-lite-preview",
    defaultModel: "minimax/minimax-m2.5",
    models: [
      {
        id: "anthropic/claude-opus-4.6",
        name: "Claude Opus 4.6",
        modality: "text,image->text",
        thinking: "none",
        reasoningPreset: "none",
        whenToUse:
          "Highest-stakes tasks: production architecture, security-critical refactors, complex multi-agent orchestration. 80.8% SWE-bench. $5/$25 per M tokens.",
      },
      {
        id: "openai/gpt-5.4",
        name: "GPT-5.4",
        modality: "text,image->text",
        thinking: "none",
        reasoningPreset: "none",
        whenToUse:
          "Computer use, browser automation, OS-level tool orchestration, image-in-code tasks. Built-in computer use, 57.7% SWE-Bench Pro, 1M ctx. $2.50/$15 per M tokens.",
      },
      {
        id: "minimax/minimax-m2.5",
        name: "MiniMax M2.5",
        modality: "text->text",
        thinking: "none",
        reasoningPreset: "none",
        whenToUse:
          "Standard agentic coding: features, bug fixes, PR reviews, most multi-file work. 80.2% SWE-bench at 1/20th Opus output cost. $0.25/$1.20 per M tokens.",
      },
      {
        id: "z-ai/glm-5",
        name: "GLM-5",
        modality: "text->text",
        thinking: "none",
        reasoningPreset: "none",
        whenToUse:
          "Long sequential agent loops, complex instruction decomposition, execution chains, self-correction cycles. 77.8% SWE-bench, optimized for persistent multi-turn agents. $0.72/$2.30 per M tokens.",
      },
      {
        id: "google/gemini-3.1-pro-preview",
        name: "Gemini 3.1 Pro",
        modality: "text,image->text",
        thinking: "none",
        reasoningPreset: "none",
        whenToUse:
          "Full codebase analysis, 100K+ token repos, architectural Q&A requiring entire-repo context. 1M ctx, cheapest frontier model. $2/$12 per M tokens.",
      },
    ],
    routingInstructions: `
Route every request to the best model for production-grade agentic coding. Pricing shown per million tokens (input/output).

MODEL REFERENCE
  anthropic/claude-opus-4.6     — $5/$25    — VISION, 80.8% SWE-bench, 1M ctx
  openai/gpt-5.4                — $2.50/$15  — VISION, 57.7% SWE-bench Pro, 1M ctx, computer use
  minimax/minimax-m2.5          — $0.25/$1.20 — text only, 80.2% SWE-bench, 196K ctx
  z-ai/glm-5                    — $0.72/$2.30 — text only, 77.8% SWE-bench, 202K ctx, agent-optimized
  google/gemini-3.1-pro-preview — $2/$12     — VISION, 1M ctx, cheapest frontier

ROUTING RULES (apply in order)

IMAGE INPUT (screenshots, diagrams, UI mockups, code in an image)
  → openai/gpt-5.4  [best vision + coding combination in this catalog]

WEB SEARCH / CURRENT DOCS / API LOOKUPS (user asks about latest versions, changelogs, real-time info)
  → openai/gpt-5.4:online  [or anthropic/claude-opus-4.6:online for highest-quality research]

COMPUTER USE / BROWSER AUTOMATION / OS-LEVEL TOOLING
  → openai/gpt-5.4

HIGHEST-STAKES: PRODUCTION ARCHITECTURE / SECURITY-CRITICAL / COMPLEX MULTI-AGENT
  → anthropic/claude-opus-4.6  [only when genuine complexity justifies the cost]

LONG AGENT LOOPS / EXECUTION CHAINS / SELF-CORRECTION CYCLES
  → z-ai/glm-5  [built for persistent step-by-step multi-turn agents]

ENTIRE REPO ANALYSIS / 100K+ TOKEN CONTEXT WINDOW REQUIRED
  → google/gemini-3.1-pro-preview  [1M context at $12/M output — far cheaper than Opus for read-heavy tasks]

ALL OTHER AGENTIC CODING (features, bugs, PRs, refactors, most multi-file work)
  → minimax/minimax-m2.5  [default — 80.2% SWE-bench at 1/20th Opus output cost]

Reserve Claude Opus 4.6 for tasks where the extra cost is genuinely justified by complexity.
Prefer MiniMax M2.5 by default — it matches Opus-class benchmark scores at a fraction of the price.
`.trim(),
  },
];
