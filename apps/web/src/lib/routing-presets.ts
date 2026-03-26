// ─────────────────────────────────────────────────────────────────────────────
// routing-presets.ts
//
// Hard-coded routing presets that auto-populate a gateway's model list and
// the global routing configuration (classifier, fallback, instructions) in
// one click. Each preset is a self-contained setup for a specific use case.
//
// To add a new preset, append an entry to the ROUTING_PRESETS array below.
// Model IDs use provider/model-name identifiers compatible with the target gateway.
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
    description: "Practical daily driver: Claude for quality, Mercury 2 for speed, Gemini for long docs and multimodal work, Sonar Pro for live web lookups",
    gatewayPresetId: "openrouter",
    classifierModel: "nvidia/nemotron-3-super-120b-a12b",
    defaultModel: "anthropic/claude-sonnet-4.6",
    models: [
      {
        id: "anthropic/claude-sonnet-4.6",
        name: "Claude Sonnet 4.6",
        modality: "text,image->text",
        thinking: "none",
        reasoningPreset: "none",
        whenToUse:
          "Default for nuanced reasoning, polished writing, summarization, and other ambiguous high-judgment work.",
      },
      {
        id: "inception/mercury-2",
        name: "Mercury 2",
        modality: "text->text",
        thinking: "none",
        reasoningPreset: "none",
        whenToUse:
          "Shortest-turn conversational replies, quick factual questions, and latency-sensitive text-only requests.",
      },
      {
        id: "google/gemini-3.1-pro-preview",
        name: "Gemini 3.1 Pro",
        modality: "text,image->text",
        thinking: "none",
        reasoningPreset: "none",
        whenToUse:
          "Long document analysis, large pastes, research synthesis, and file-heavy work with very high context headroom.",
      },
      {
        id: "google/gemini-3-flash-preview",
        name: "Gemini 3 Flash",
        modality: "text,image,file,audio,video->text",
        thinking: "none",
        reasoningPreset: "none",
        whenToUse:
          "Fast multimodal tasks, screenshots, image-heavy prompts, and general work that benefits from lower latency than the Pro tier.",
      },
      {
        id: "perplexity/sonar-pro-search",
        name: "Sonar Pro Search",
        modality: "text->text",
        thinking: "none",
        reasoningPreset: "none",
        whenToUse:
          "Web-grounded current-info questions, source comparison, and live lookups where freshness matters.",
      },
    ],
    routingInstructions: `
Route every request to the single best model.

MODEL REFERENCE
  anthropic/claude-sonnet-4.6    — high-judgment default
  inception/mercury-2            — fastest text-only short-turn path
  google/gemini-3.1-pro-preview  — long-context analysis and large attachments
  google/gemini-3-flash-preview  — fast multimodal and screenshot handling
  perplexity/sonar-pro-search    — live web lookup and current-info lane

ROUTING RULES (apply in order)

IMAGE INPUT (message contains an image or screenshot)
  → google/gemini-3-flash-preview

WEB SEARCH / CURRENT INFO (user asks about "latest", "current", "today", "news", "recent", or requests a web lookup)
  → perplexity/sonar-pro-search

LONG DOCUMENTS / ANALYSIS (large paste, PDF, "summarize this", context >50K tokens)
  → google/gemini-3.1-pro-preview

COMPLEX REASONING / CREATIVE / NUANCED Q&A
  → anthropic/claude-sonnet-4.6

QUICK CHAT / SHORT FACTUAL LOOKUPS / CONVERSATIONAL REPLIES (text only)
  → inception/mercury-2

EVERYTHING ELSE
  → anthropic/claude-sonnet-4.6
`.trim(),
  },

  // ── 2. Speed-First / Low Latency ────────────────────────────────────────────
  {
    id: "speed-first",
    name: "Speed-First",
    description: "Lowest-latency OpenRouter setup: Mercury 2 default, Gemini 3 Flash for fast multimodal work, Grok Fast for tools/search, Gemini 3.1 Flash Lite for long-context overflow, Nemotron for cheap structured text",
    gatewayPresetId: "openrouter",
    classifierModel: "nvidia/nemotron-3-super-120b-a12b",
    defaultModel: "inception/mercury-2",
    models: [
      {
        id: "inception/mercury-2",
        name: "Mercury 2",
        modality: "text->text",
        thinking: "none",
        reasoningPreset: "none",
        whenToUse:
          "Default for the shortest-turn text workflows when raw latency matters more than anything else.",
      },
      {
        id: "google/gemini-3-flash-preview",
        name: "Gemini 3 Flash",
        modality: "text,image,file,audio,video->text",
        thinking: "none",
        reasoningPreset: "none",
        whenToUse:
          "Fast multimodal tasks, screenshots, and lightweight general requests that still need vision or richer inputs.",
      },
      {
        id: "x-ai/grok-4.1-fast",
        name: "Grok 4.1 Fast",
        modality: "text,image->text",
        thinking: "none",
        reasoningPreset: "none",
        whenToUse:
          "Tool calls, web search, long-context operational requests, and live lookups where you still want very fast execution.",
      },
      {
        id: "google/gemini-3.1-flash-lite-preview",
        name: "Gemini 3.1 Flash Lite Preview",
        modality: "text,image,file,audio,video->text",
        thinking: "none",
        reasoningPreset: "none",
        whenToUse:
          "Long-context overflow, fast multimodal routing, and cheap large-prompt handling when tool use is not the main need.",
      },
      {
        id: "nvidia/nemotron-3-super-120b-a12b",
        name: "NVIDIA Nemotron 3 Super",
        modality: "text->text",
        thinking: "none",
        reasoningPreset: "none",
        whenToUse:
          "Cheap structured extraction, classification, and other hot-path text tasks where you want strong speed per dollar.",
      },
    ],
    routingInstructions: `
Route every request to the fastest appropriate model.

MODEL REFERENCE
  inception/mercury-2                      — fastest text-only short-turn path
  google/gemini-3-flash-preview           — fast multimodal lane
  x-ai/grok-4.1-fast                      — tools, search, and 2M-context lane
  google/gemini-3.1-flash-lite-preview    — cheap long-context overflow
  nvidia/nemotron-3-super-120b-a12b       — cheap structured text and classification

ROUTING RULES (apply in order — speed is the primary objective)

IMAGE INPUT (message contains an image or screenshot)
  → google/gemini-3-flash-preview

WEB SEARCH / CURRENT INFO (user asks about "latest", "current", "today", "news", "recent")
  → x-ai/grok-4.1-fast

TOOL USE / FUNCTION CALLING / AGENTIC
  → x-ai/grok-4.1-fast

CONTEXT > 128K TOKENS (no tool use needed)
  → google/gemini-3.1-flash-lite-preview

STRICT CLASSIFICATION / EXTRACTION / HOT-PATH STRUCTURED TEXT
  → nvidia/nemotron-3-super-120b-a12b

EVERYTHING ELSE
  → inception/mercury-2
`.trim(),
  },

  // ── 3. Fast Coding ──────────────────────────────────────────────────────────
  {
    id: "coding-fast",
    name: "Fast Coding",
    description: "Fast coding pool with MiniMax M2.7 as the default, Qwen 3.5 397B for deeper agentic work, GLM 5 for architecture, Kimi for frontend/vision, and Grok Fast for current docs and tool-heavy workflows",
    gatewayPresetId: "openrouter",
    classifierModel: "nvidia/nemotron-3-super-120b-a12b",
    defaultModel: "minimax/minimax-m2.7",
    models: [
      {
        id: "minimax/minimax-m2.7",
        name: "MiniMax M2.7",
        modality: "text->text",
        thinking: "none",
        reasoningPreset: "none",
        whenToUse:
          "Default for everyday implementation, refactors, bug fixes, and ordinary coding where speed and price-performance matter most.",
      },
      {
        id: "qwen/qwen3.5-397b-a17b",
        name: "Qwen 3.5 397B A17B",
        modality: "text,image,video->text",
        thinking: "none",
        reasoningPreset: "none",
        whenToUse:
          "Large codebases, multi-file navigation, and heavier agentic coding where you want more depth than the default fast lane.",
      },
      {
        id: "z-ai/glm-5",
        name: "GLM 5",
        modality: "text->text",
        thinking: "none",
        reasoningPreset: "none",
        whenToUse:
          "Architecture decisions, complex implementation planning, and long multi-step engineering reasoning.",
      },
      {
        id: "moonshotai/kimi-k2.5",
        name: "Kimi K2.5",
        modality: "text,image->text",
        thinking: "none",
        reasoningPreset: "none",
        whenToUse:
          "UI/frontend coding, CSS, visual layout work, and screenshot-driven implementation tasks.",
      },
      {
        id: "x-ai/grok-4.1-fast",
        name: "Grok 4.1 Fast",
        modality: "text,image->text",
        thinking: "none",
        reasoningPreset: "none",
        whenToUse:
          "Current-docs lookups, tool-heavy execution, and coding tasks that benefit from a live-search or operational lane.",
      },
    ],
    routingInstructions: `
Route every request to the best coding model for the task.

MODEL REFERENCE
  minimax/minimax-m2.7       — default fast implementation lane
  qwen/qwen3.5-397b-a17b     — deeper multi-file and agentic coding
  z-ai/glm-5                 — architecture and harder reasoning
  moonshotai/kimi-k2.5       — UI/frontend and screenshot work
  x-ai/grok-4.1-fast         — tools, current docs, and operational coding

ROUTING RULES (apply in order)

IMAGE INPUT (screenshot, UI mockup, diagram, code in an image)
  → moonshotai/kimi-k2.5

WEB SEARCH / CURRENT DOCS (user asks about latest library version, API changes, "look up X")
  → x-ai/grok-4.1-fast

AGENTIC / MULTI-FILE (codebase navigation, tool loops, multi-step execution)
  → qwen/qwen3.5-397b-a17b

ARCHITECTURE / SYSTEM DESIGN / HARDER ENGINEERING REASONING
  → z-ai/glm-5

UI / FRONTEND / CSS / VISUAL LAYOUT
  → moonshotai/kimi-k2.5

ALL OTHER CODING (features, bugs, reviews, refactors, tests)
  → minimax/minimax-m2.7
`.trim(),
  },

  // ── 4. Deep Premium Agentic Coding ──────────────────────────────────────────
  {
    id: "coding-agentic-premium",
    name: "Deep Premium Agentic",
    description: "Premium agentic coding pool with Claude Sonnet as the main workhorse, Claude Opus for the highest-stakes work, GPT-5.4 for tool-heavy multimodal execution, GLM 5 for long agent loops, and Gemini 3.1 Pro for whole-repo reads",
    gatewayPresetId: "openrouter",
    classifierModel: "nvidia/nemotron-3-super-120b-a12b",
    defaultModel: "anthropic/claude-sonnet-4.6",
    models: [
      {
        id: "anthropic/claude-sonnet-4.6",
        name: "Claude Sonnet 4.6",
        modality: "text,image->text",
        thinking: "none",
        reasoningPreset: "none",
        whenToUse:
          "Default premium workhorse for serious implementation, refactors, code review, and broad agentic coding.",
      },
      {
        id: "anthropic/claude-opus-4.6",
        name: "Claude Opus 4.6",
        modality: "text,image->text",
        thinking: "none",
        reasoningPreset: "none",
        whenToUse:
          "Highest-stakes tasks: production architecture, security-critical refactors, and the hardest engineering decisions where extra cost is justified.",
      },
      {
        id: "openai/gpt-5.4",
        name: "GPT-5.4",
        modality: "text,image->text",
        thinking: "none",
        reasoningPreset: "none",
        whenToUse:
          "Computer use, browser automation, multimodal engineering tasks, and tool-heavy structured execution.",
      },
      {
        id: "z-ai/glm-5",
        name: "GLM-5",
        modality: "text->text",
        thinking: "none",
        reasoningPreset: "none",
        whenToUse:
          "Long sequential agent loops, complex instruction decomposition, execution chains, and self-correction-heavy workflows.",
      },
      {
        id: "google/gemini-3.1-pro-preview",
        name: "Gemini 3.1 Pro",
        modality: "text,image->text",
        thinking: "none",
        reasoningPreset: "none",
        whenToUse:
          "Full codebase analysis, read-heavy repository work, and architectural Q&A requiring very large context.",
      },
    ],
    routingInstructions: `
Route every request to the best model for production-grade agentic coding.

MODEL REFERENCE
  anthropic/claude-sonnet-4.6   — premium default workhorse
  anthropic/claude-opus-4.6     — highest-stakes reasoning and architecture
  openai/gpt-5.4                — computer use and multimodal tool-heavy execution
  z-ai/glm-5                    — long agent loops and instruction decomposition
  google/gemini-3.1-pro-preview — whole-repo reads and very large context

ROUTING RULES (apply in order)

IMAGE INPUT / COMPUTER USE / BROWSER AUTOMATION / OS-LEVEL TOOLING
  → openai/gpt-5.4

HIGHEST-STAKES: PRODUCTION ARCHITECTURE / SECURITY-CRITICAL / COMPLEX MULTI-AGENT
  → anthropic/claude-opus-4.6

LONG AGENT LOOPS / EXECUTION CHAINS / SELF-CORRECTION CYCLES
  → z-ai/glm-5

ENTIRE REPO ANALYSIS / 100K+ TOKEN CONTEXT WINDOW REQUIRED
  → google/gemini-3.1-pro-preview

ALL OTHER AGENTIC CODING (features, bugs, PRs, refactors, most multi-file work)
  → anthropic/claude-sonnet-4.6
`.trim(),
  },

  // ── 5. Frontend UI Builder ──────────────────────────────────────────────────
  {
    id: "frontend-ui-builder",
    name: "Frontend UI Builder",
    description: "Frontend-specialized pool: Claude Sonnet for most product UI work, Claude Opus for highest-stakes design-system changes, GLM 5 for debugging, Kimi for screenshot-driven implementation, and Mercury 2 for very fast small edits",
    gatewayPresetId: "openrouter",
    classifierModel: "nvidia/nemotron-3-super-120b-a12b",
    defaultModel: "anthropic/claude-sonnet-4.6",
    models: [
      {
        id: "anthropic/claude-sonnet-4.6",
        name: "Claude Sonnet 4.6",
        modality: "text,image->text",
        thinking: "none",
        reasoningPreset: "none",
        whenToUse:
          "Default for most frontend implementation: components, layout work, UX-sensitive changes, polished copy changes, and day-to-day product UI work.",
      },
      {
        id: "anthropic/claude-opus-4.6",
        name: "Claude Opus 4.6",
        modality: "text,image->text",
        thinking: "none",
        reasoningPreset: "none",
        whenToUse:
          "Highest-stakes frontend architecture, design-system work, difficult interaction design, and polished UI changes where judgment matters most.",
      },
      {
        id: "z-ai/glm-5",
        name: "GLM 5",
        modality: "text->text",
        thinking: "none",
        reasoningPreset: "none",
        whenToUse:
          "Tricky UI bugs, hydration/state issues, debugging complex regressions, and harder reasoning-heavy frontend fixes.",
      },
      {
        id: "moonshotai/kimi-k2.5",
        name: "Kimi K2.5",
        modality: "text,image->text",
        thinking: "none",
        reasoningPreset: "none",
        whenToUse:
          "Screenshot-driven implementation, mock-to-code work, visual QA, CSS tuning, and image-heavy frontend tasks.",
      },
      {
        id: "inception/mercury-2",
        name: "Mercury 2",
        modality: "text->text",
        thinking: "none",
        reasoningPreset: "none",
        whenToUse:
          "Quick easy edits: copy tweaks, spacing fixes, small JSX/CSS changes, and fast low-risk iteration where throughput matters most.",
      },
    ],
    routingInstructions: `
Route every frontend request to the best specialized model. Optimize for UI quality first, then debugging accuracy, then quick-edit speed.

MODEL REFERENCE
  anthropic/claude-sonnet-4.6  — default frontend implementation lane
  anthropic/claude-opus-4.6    — highest-stakes frontend architecture and polish
  z-ai/glm-5                   — debugging and hard reasoning lane
  moonshotai/kimi-k2.5         — screenshot, mockup, and visual UI lane
  inception/mercury-2          — quick-edit and low-risk fast lane

ROUTING RULES (apply in order)

IMAGE INPUT / SCREENSHOT / MOCKUP / "MAKE THIS MATCH" / VISUAL QA
  → moonshotai/kimi-k2.5

DEBUGGING / HYDRATION / STATE BUG / WEIRD LAYOUT REGRESSION / BROWSER-SPECIFIC ISSUE
  → z-ai/glm-5

DESIGN SYSTEM / SHARED COMPONENT API / HIGHEST-STAKES UI REFACTOR / PIXEL-PERFECT POLISH
  → anthropic/claude-opus-4.6

SMALL SAFE EDITS / COPY TWEAK / SPACING / CLASSNAME CHANGE / MINOR JSX OR CSS UPDATE
  → inception/mercury-2

ALL OTHER FRONTEND IMPLEMENTATION (components, pages, forms, responsiveness, interaction polish)
  → anthropic/claude-sonnet-4.6
`.trim(),
  },

  // ── 6. Open-Source Sovereign ───────────────────────────────────────────────
  {
    id: "open-source-sovereign",
    name: "Open-Source Sovereign",
    description: "Open-weight-first routing pool: GLM 5 as the flagship default, Qwen 3.5 397B for long-context multimodal work, Kimi for open visual/UI tasks, DeepSeek for budget volume, and Nemotron for fast cheap routing and extraction",
    gatewayPresetId: "openrouter",
    classifierModel: "nvidia/nemotron-3-super-120b-a12b",
    defaultModel: "z-ai/glm-5",
    models: [
      {
        id: "z-ai/glm-5",
        name: "GLM 5",
        modality: "text->text",
        thinking: "none",
        reasoningPreset: "none",
        whenToUse:
          "Default open-weight flagship for coding, agentic work, product reasoning, and high-judgment text tasks where you want strong capability without a closed frontier vendor.",
      },
      {
        id: "qwen/qwen3.5-397b-a17b",
        name: "Qwen3.5 397B A17B",
        modality: "text,image,video->text",
        thinking: "none",
        reasoningPreset: "none",
        whenToUse:
          "Open-weight multimodal, long-context, repo-scale, and harder reasoning work when you want the strongest Qwen 3.5 option in the pool.",
      },
      {
        id: "moonshotai/kimi-k2.5",
        name: "Kimi K2.5",
        modality: "text,image->text",
        thinking: "none",
        reasoningPreset: "none",
        whenToUse:
          "Open-weight visual/UI work, screenshot tasks, and multimodal workflows where GLM 5's text-only deployable ID is limiting.",
      },
      {
        id: "deepseek/deepseek-v3.2",
        name: "DeepSeek V3.2",
        modality: "text->text",
        thinking: "none",
        reasoningPreset: "none",
        whenToUse:
          "Budget-first open-weight text volume, background jobs, FAQ-style tasks, and cheap queue coverage.",
      },
      {
        id: "nvidia/nemotron-3-super-120b-a12b",
        name: "NVIDIA Nemotron 3 Super",
        modality: "text->text",
        thinking: "none",
        reasoningPreset: "none",
        whenToUse:
          "Fast cheap open-weight routing, extraction, classification, and operational text tasks where speed per dollar matters most.",
      },
    ],
    routingInstructions: `
Route every request to the best open-weight model in the pool. Prefer open-source deployable models even when proprietary frontier models might benchmark higher.

MODEL REFERENCE
  z-ai/glm-5                         — open-weight flagship default
  qwen/qwen3.5-397b-a17b            — long-context multimodal and harder reasoning
  moonshotai/kimi-k2.5              — visual/UI and open multimodal lane
  deepseek/deepseek-v3.2            — cheapest open text volume lane
  nvidia/nemotron-3-super-120b-a12b — classifier, extraction, and fast operational lane

ROUTING RULES (apply in order)

IMAGE INPUT / SCREENSHOT / VISUAL TASK / OPEN MULTIMODAL WORK
  → moonshotai/kimi-k2.5

LONG CONTEXT / LARGE REPO / BIG PASTE / HEAVIER MULTIMODAL OR MULTI-FILE WORK
  → qwen/qwen3.5-397b-a17b

CLASSIFICATION / EXTRACTION / HOT-PATH ROUTING / CHEAP STRUCTURED TEXT
  → nvidia/nemotron-3-super-120b-a12b

BUDGET-FIRST TEXT VOLUME / BACKGROUND TASK / FAQ / LOW-STAKES HIGH-THROUGHPUT
  → deepseek/deepseek-v3.2

EVERYTHING ELSE
  → z-ai/glm-5
`.trim(),
  },

  // ── 7. Customer Support ─────────────────────────────────────────────────────
  {
    id: "customer-support",
    name: "Customer Support",
    description: "Nuanced support replies by default, with dedicated paths for long ticket history, screenshots, tool-driven lookups, and budget-scale FAQ volume",
    gatewayPresetId: "openrouter",
    classifierModel: "nvidia/nemotron-3-super-120b-a12b",
    defaultModel: "anthropic/claude-sonnet-4.6",
    models: [
      {
        id: "anthropic/claude-sonnet-4.6",
        name: "Claude Sonnet 4.6",
        modality: "text,image->text",
        thinking: "none",
        reasoningPreset: "none",
        whenToUse:
          "Default for nuanced customer replies, de-escalation, policy explanations, retention conversations, and other high-empathy cases.",
      },
      {
        id: "google/gemini-3.1-pro-preview",
        name: "Gemini 3.1 Pro",
        modality: "text,image->text",
        thinking: "none",
        reasoningPreset: "none",
        whenToUse:
          "Long ticket threads, full account histories, policy manuals, help-center synthesis, and large transcript summarization.",
      },
      {
        id: "x-ai/grok-4.1-fast",
        name: "Grok 4.1 Fast",
        modality: "text,image->text",
        thinking: "none",
        reasoningPreset: "none",
        whenToUse:
          "Tool-driven support triage, order/account lookups, current-status checks, function calling, and fast operational answers.",
      },
      {
        id: "google/gemini-3-flash-preview",
        name: "Gemini 3 Flash",
        modality: "text,image,file,audio,video->text",
        thinking: "none",
        reasoningPreset: "none",
        whenToUse:
          "Screenshot troubleshooting, UI walkthroughs, and image-based support issues that benefit from a fast multimodal model.",
      },
      {
        id: "deepseek/deepseek-v3.2",
        name: "DeepSeek V3.2",
        modality: "text->text",
        thinking: "none",
        reasoningPreset: "none",
        whenToUse:
          "High-volume FAQ handling, repetitive support macros, low-stakes deflection, and budget-sensitive queue coverage.",
      },
    ],
    routingInstructions: `
Route every request to the single best support model. Optimize for accurate, empathetic resolution with minimal follow-up.

MODEL REFERENCE
  anthropic/claude-sonnet-4.6    — nuanced response and empathy default
  google/gemini-3.1-pro-preview  — long case history and large policy context
  x-ai/grok-4.1-fast             — tools, live lookup, and operational support
  google/gemini-3-flash-preview  — screenshot and multimodal troubleshooting
  deepseek/deepseek-v3.2         — cheap high-volume FAQ and macro lane

ROUTING RULES (apply in order)

IMAGE INPUT / SCREENSHOT TROUBLESHOOTING
  → google/gemini-3-flash-preview

TOOL USE / FUNCTION CALLING / ACCOUNT LOOKUPS / ORDER STATUS / CURRENT INFO
  → x-ai/grok-4.1-fast

VERY LONG THREADS / FULL CASE HISTORY / LARGE POLICY OR HELP-CENTER PASTES / CONTEXT >50K TOKENS
  → google/gemini-3.1-pro-preview

UPSET CUSTOMER / CANCELLATION / RETENTION / BILLING DISPUTE / HIGH-EMPATHY OR HIGH-JUDGMENT RESPONSE
  → anthropic/claude-sonnet-4.6

FAQ / MACRO-LIKE REPLIES / HIGH-VOLUME LOW-STAKES SUPPORT WHERE COST IS THE PRIORITY
  → deepseek/deepseek-v3.2

EVERYTHING ELSE
  → anthropic/claude-sonnet-4.6

Default to Claude Sonnet 4.6 when the task is ambiguous.
`.trim(),
  },

  // ── 8. Vercel Balanced General-Purpose ─────────────────────────────────────
  {
    id: "vercel-balanced",
    name: "Vercel Balanced",
    description: "Balanced Vercel setup: Claude default, Gemini 3.1 Pro for long context, Gemini 3 Flash for speed and multimodal work, GPT-5.4 Mini for structured/tool-heavy flows, DeepSeek for budget text",
    gatewayPresetId: "vercel",
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
          "Default for nuanced reasoning, polished writing, and ambiguous tasks where quality matters most. $3/$15 per M tokens.",
      },
      {
        id: "google/gemini-3.1-pro-preview",
        name: "Gemini 3.1 Pro Preview",
        modality: "text,image,file,audio,video->text",
        thinking: "none",
        reasoningPreset: "none",
        whenToUse:
          "Large documents, long transcripts, file-heavy analysis, and read-heavy work with very large context.",
      },
      {
        id: "google/gemini-3-flash",
        name: "Gemini 3 Flash",
        modality: "text,image->text",
        thinking: "none",
        reasoningPreset: "none",
        whenToUse:
          "Fast replies, lightweight multimodal tasks, and lower-latency general chat.",
      },
      {
        id: "openai/gpt-5.4-mini",
        name: "GPT-5.4 Mini",
        modality: "text,image->text",
        thinking: "none",
        reasoningPreset: "none",
        whenToUse:
          "Structured outputs, tool-heavy tasks, and reliable instruction-following when you want tighter behavior than the Gemini fast lane.",
      },
      {
        id: "deepseek/deepseek-v3.2",
        name: "DeepSeek V3.2",
        modality: "text->text",
        thinking: "none",
        reasoningPreset: "none",
        whenToUse:
          "Budget-sensitive text workloads, repetitive tasks, and cheap high-volume throughput. $0.26/$0.38 per M tokens.",
      },
    ],
    routingInstructions: `
Route every request to the best Vercel AI Gateway model for the task. Prefer quality first, then speed and cost.

MODEL REFERENCE
  anthropic/claude-sonnet-4.6     — quality-first default
  google/gemini-3.1-pro-preview   — long-context and file-heavy analysis
  google/gemini-3-flash           — fast multimodal lane
  openai/gpt-5.4-mini             — structured output and tool-heavy lane
  deepseek/deepseek-v3.2          — budget text fallback

ROUTING RULES (apply in order)

LONG DOCUMENTS / FILE INPUT / TRANSCRIPTS / CONTEXT >50K TOKENS
  → google/gemini-3.1-pro-preview

STRICT JSON / STRUCTURED OUTPUT / TOOL-HEAVY WORKFLOWS
  → openai/gpt-5.4-mini

QUICK GENERAL CHAT / LIGHTWEIGHT MULTIMODAL / LOWER-LATENCY REQUESTS
  → google/gemini-3-flash

BUDGET-FIRST TEXT TASKS
  → deepseek/deepseek-v3.2

EVERYTHING ELSE
  → anthropic/claude-sonnet-4.6

Default to Claude Sonnet 4.6 when the task is ambiguous.
`.trim(),
  },

  // ── 9. Vercel Speed-First ──────────────────────────────────────────────────
  {
    id: "vercel-speed-first",
    name: "Vercel Speed-First",
    description: "Low-latency Vercel setup with Gemini 3.1 Flash Lite default, Gemini 3 Flash for fast multimodal work, Grok Fast for long-context text, Claude Haiku for stricter structured replies, and DeepSeek for cheap text volume",
    gatewayPresetId: "vercel",
    classifierModel: "google/gemini-3.1-flash-lite-preview",
    defaultModel: "google/gemini-3.1-flash-lite-preview",
    models: [
      {
        id: "google/gemini-3.1-flash-lite-preview",
        name: "Gemini 3.1 Flash Lite Preview",
        modality: "text,image->text",
        thinking: "none",
        reasoningPreset: "none",
        whenToUse:
          "Default for the fastest low-cost responses on Vercel with multimodal support.",
      },
      {
        id: "google/gemini-3-flash",
        name: "Gemini 3 Flash",
        modality: "text,image->text",
        thinking: "none",
        reasoningPreset: "none",
        whenToUse:
          "Fast multimodal tasks that need more headroom than Flash Lite.",
      },
      {
        id: "xai/grok-4.1-fast-non-reasoning",
        name: "Grok 4.1 Fast Non-Reasoning",
        modality: "text->text",
        thinking: "none",
        reasoningPreset: "none",
        whenToUse:
          "Long-context tool use, operational lookups, and fast text workflows with 2M context.",
      },
      {
        id: "anthropic/claude-haiku-4.5",
        name: "Claude Haiku 4.5",
        modality: "text,image->text",
        thinking: "none",
        reasoningPreset: "none",
        whenToUse:
          "Fast structured outputs and stricter instruction following when Flash Lite is too loose.",
      },
      {
        id: "deepseek/deepseek-v3.2",
        name: "DeepSeek V3.2",
        modality: "text->text",
        thinking: "none",
        reasoningPreset: "none",
        whenToUse:
          "Cheapest high-volume text path when quality needs are modest. $0.26/$0.38 per M tokens.",
      },
    ],
    routingInstructions: `
Route every request to the fastest acceptable model on Vercel AI Gateway. Minimize latency and cost before quality.

MODEL REFERENCE
  google/gemini-3.1-flash-lite-preview  — fastest cheap multimodal default
  google/gemini-3-flash                 — higher-headroom multimodal speed lane
  xai/grok-4.1-fast-non-reasoning       — long-context text and operational lane
  anthropic/claude-haiku-4.5            — stricter structured output lane
  deepseek/deepseek-v3.2                — cheap text volume fallback

ROUTING RULES (apply in order)

LONG CONTEXT / TOOL-HEAVY TEXT WORKFLOWS
  → xai/grok-4.1-fast-non-reasoning

STRICT JSON / STRUCTURED OUTPUT
  → anthropic/claude-haiku-4.5

IMAGE INPUT / SCREENSHOTS / FAST MULTIMODAL
  → google/gemini-3-flash

CHEAPEST TEXT VOLUME
  → deepseek/deepseek-v3.2

EVERYTHING ELSE
  → google/gemini-3.1-flash-lite-preview

Default to Gemini 3.1 Flash Lite Preview when the task is simple or ambiguous.
`.trim(),
  },

  // ── 10. Cheap Frontier Coding ──────────────────────────────────────────────
  {
    id: "coding-cheap-frontier",
    name: "Cheap Frontier Coding",
    description:
      "OpenRouter coding preset with MiniMax M2.7 as the cheap implementation default, GLM 5 for architecture and complex builds, Kimi K2.5 for UI and multimodal work, Mercury 2 for quick edits, and Gemini 3.1 Flash Lite Preview for long-context overflow",
    gatewayPresetId: "openrouter",
    classifierModel: "nvidia/nemotron-3-super-120b-a12b",
    defaultModel: "minimax/minimax-m2.7",
    models: [
      {
        id: "minimax/minimax-m2.7",
        name: "MiniMax M2.7",
        modality: "text->text",
        thinking: "none",
        reasoningPreset: "none",
        whenToUse:
          "Default for everyday implementation, refactors, bug fixes, and general coding where price-performance matters most. 204.8K ctx. $0.30/$1.20 per M tokens.",
      },
      {
        id: "z-ai/glm-5",
        name: "GLM 5",
        modality: "text->text",
        thinking: "none",
        reasoningPreset: "none",
        whenToUse:
          "Architecture decisions, complex implementations, and harder engineering tasks that need a stronger text-only reasoning model. 80K ctx. $0.72/$2.30 per M tokens.",
      },
      {
        id: "moonshotai/kimi-k2.5",
        name: "Kimi K2.5",
        modality: "text,image->text",
        thinking: "none",
        reasoningPreset: "none",
        whenToUse:
          "UI design, screenshot-driven debugging, multimodal implementation work, and fast frontend iteration. 262K ctx. $0.45/$2.20 per M tokens.",
      },
      {
        id: "inception/mercury-2",
        name: "Mercury 2",
        modality: "text->text",
        thinking: "none",
        reasoningPreset: "none",
        whenToUse:
          "Quick text-only edits, tiny diffs, low-stakes patches, and cheap fast-turn coding. 128K ctx. $0.25/$0.75 per M tokens.",
      },
      {
        id: "google/gemini-3.1-flash-lite-preview",
        name: "Gemini 3.1 Flash Lite Preview",
        modality: "text,image,file,audio,video->text",
        thinking: "none",
        reasoningPreset: "none",
        whenToUse:
          "Long-context overflow, repo-wide quick edits, large attachments, and multimodal coding tasks when the prompt size gets too large for the cheaper text-only fast-edit path. 1M ctx. $0.25/$1.50 per M tokens.",
      },
    ],
    routingInstructions: `
Route every request to the best OpenRouter model for cheap frontier coding. Optimize for coding quality per dollar first, then latency.

MODEL REFERENCE
  minimax/minimax-m2.7                    — $0.30/$1.20 — text only, 204.8K ctx
  z-ai/glm-5                              — $0.72/$2.30 — text only, 80K ctx
  moonshotai/kimi-k2.5                    — $0.45/$2.20 — vision, 262K ctx
  inception/mercury-2                     — $0.25/$0.75 — text only, 128K ctx
  google/gemini-3.1-flash-lite-preview    — $0.25/$1.50 — multimodal, 1M ctx

ROUTING RULES (apply in order)

UI DESIGN / SCREENSHOTS / IMAGE INPUT / FRONTEND POLISH / MULTIMODAL DEBUGGING
  → moonshotai/kimi-k2.5

ARCHITECTURE / SYSTEM DESIGN / COMPLEX IMPLEMENTATION / MULTI-STEP REFACTOR / HIGHER-DEPTH ENGINEERING
  → z-ai/glm-5

LONG CONTEXT / LARGE REPO READS / BIG PASTES / ATTACHMENTS / QUICK EDITS WITH CONTEXT OVERFLOW
  → google/gemini-3.1-flash-lite-preview

TINY PATCH / SINGLE-FILE TWEAK / LOW-STAKES QUICK EDIT / BUDGET-FIRST SHORT TURN
  → inception/mercury-2

EVERYTHING ELSE
  → minimax/minimax-m2.7

Default to MiniMax M2.7 when the task is ordinary implementation work and the route is ambiguous.
`.trim(),
  },

  // ── 11. Vercel Customer Support ────────────────────────────────────────────
  {
    id: "vercel-customer-support",
    name: "Vercel Customer Support",
    description: "Customer-support routing for Vercel AI Gateway: Claude default, Gemini 3.1 Pro for long case history, Gemini 3 Flash for screenshots, GPT-5.4 Mini for strict handoffs, DeepSeek for budget FAQs",
    gatewayPresetId: "vercel",
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
          "Default for empathetic replies, de-escalation, policy explanations, and high-judgment support work. $3/$15 per M tokens.",
      },
      {
        id: "google/gemini-3.1-pro-preview",
        name: "Gemini 3.1 Pro Preview",
        modality: "text,image,file,audio,video->text",
        thinking: "none",
        reasoningPreset: "none",
        whenToUse:
          "Long ticket histories, full account timelines, large policy docs, and case-summary synthesis.",
      },
      {
        id: "google/gemini-3-flash",
        name: "Gemini 3 Flash",
        modality: "text,image->text",
        thinking: "none",
        reasoningPreset: "none",
        whenToUse:
          "Screenshot troubleshooting, quick support replies, and lower-latency multimodal support flows.",
      },
      {
        id: "openai/gpt-5.4-mini",
        name: "GPT-5.4 Mini",
        modality: "text,image->text",
        thinking: "none",
        reasoningPreset: "none",
        whenToUse:
          "Strict JSON handoffs, CRM/tool workflows, and support automations with exact instruction following.",
      },
      {
        id: "deepseek/deepseek-v3.2",
        name: "DeepSeek V3.2",
        modality: "text->text",
        thinking: "none",
        reasoningPreset: "none",
        whenToUse:
          "High-volume FAQ replies, low-stakes support macros, and cost-sensitive support queues. $0.26/$0.38 per M tokens.",
      },
    ],
    routingInstructions: `
Route every request to the single best Vercel AI Gateway model for customer support. Optimize for accurate, empathetic resolution with minimal follow-up.

MODEL REFERENCE
  anthropic/claude-sonnet-4.6     — empathetic default and high-judgment lane
  google/gemini-3.1-pro-preview   — long case history and large-policy lane
  google/gemini-3-flash           — screenshot and fast multimodal lane
  openai/gpt-5.4-mini             — strict handoffs and support automation
  deepseek/deepseek-v3.2          — cheap FAQ volume fallback

ROUTING RULES (apply in order)

LONG CASE HISTORY / LARGE POLICY PASTE / MULTI-THREAD SUMMARY / CONTEXT >50K TOKENS
  → google/gemini-3.1-pro-preview

IMAGE INPUT / SCREENSHOT TROUBLESHOOTING / UI WALKTHROUGH
  → google/gemini-3-flash

STRICT STRUCTURED HANDOFF / TOOL-DRIVEN SUPPORT AUTOMATION
  → openai/gpt-5.4-mini

FAQ / MACRO-LIKE REPLIES / LOW-STAKES HIGH-VOLUME SUPPORT WHERE COST MATTERS MOST
  → deepseek/deepseek-v3.2

EVERYTHING ELSE
  → anthropic/claude-sonnet-4.6

Default to Claude Sonnet 4.6 when the support task is ambiguous or emotionally sensitive.
`.trim(),
  },

  // ── 12. Vercel Fast Coding ─────────────────────────────────────────────────
  {
    id: "vercel-coding-fast",
    name: "Vercel Fast Coding",
    description: "Comparable to the OpenRouter fast-coding preset, but built from Vercel models: Grok Code Fast as the cheap code-first default, GLM 5 for harder implementation work, Claude for review quality, Gemini 3.1 Pro for repo-wide reads, and DeepSeek for cheap scripts",
    gatewayPresetId: "vercel",
    classifierModel: "google/gemini-3.1-flash-lite-preview",
    defaultModel: "xai/grok-code-fast-1",
    models: [
      {
        id: "xai/grok-code-fast-1",
        name: "Grok Code Fast 1",
        modality: "text->text",
        thinking: "none",
        reasoningPreset: "none",
        whenToUse:
          "Default for everyday coding with a speed and cost bias: implementations, refactors, bug fixes, and interactive iteration. Code-specialized, 256K ctx. $0.20/$1.50 per M tokens.",
      },
      {
        id: "zai/glm-5",
        name: "GLM 5",
        modality: "text->text",
        thinking: "none",
        reasoningPreset: "none",
        whenToUse:
          "Harder implementation work, multi-step fixes, and stronger reasoning-heavy code generation.",
      },
      {
        id: "anthropic/claude-sonnet-4.6",
        name: "Claude Sonnet 4.6",
        modality: "text,image->text",
        thinking: "none",
        reasoningPreset: "none",
        whenToUse:
          "Code review, architectural tradeoffs, nuanced explanations, and ambiguous engineering tasks where judgment matters. 1M ctx. $3/$15 per M tokens.",
      },
      {
        id: "google/gemini-3.1-pro-preview",
        name: "Gemini 3.1 Pro Preview",
        modality: "text,image,file,audio,video->text",
        thinking: "none",
        reasoningPreset: "none",
        whenToUse:
          "Full-repo analysis, long transcripts, giant docs, and read-heavy coding tasks that need very large context.",
      },
      {
        id: "deepseek/deepseek-v3.2",
        name: "DeepSeek V3.2",
        modality: "text->text",
        thinking: "none",
        reasoningPreset: "none",
        whenToUse:
          "Cheap scripts, small utilities, data transforms, and budget-first text coding tasks. $0.26/$0.38 per M tokens.",
      },
    ],
    routingInstructions: `
Route every request to the best Vercel AI Gateway coding model for the task. Optimize for coding quality per dollar, then speed.

MODEL REFERENCE
  xai/grok-code-fast-1            — cheap code-first default
  zai/glm-5                       — harder implementation and deeper reasoning
  anthropic/claude-sonnet-4.6     — review quality and tradeoff analysis
  google/gemini-3.1-pro-preview   — large repo/context lane
  deepseek/deepseek-v3.2          — cheap scripts and utilities

ROUTING RULES (apply in order)

FULL REPO ANALYSIS / LARGE CODEBASE READS / CONTEXT >100K TOKENS
  → google/gemini-3.1-pro-preview

COMPLEX IMPLEMENTATION / MULTI-STEP BUG FIX / PRECISE CODE EDITS / HIGHER CONFIDENCE NEEDED
  → zai/glm-5

CODE REVIEW / DESIGN DISCUSSION / TRADEOFF ANALYSIS / AMBIGUOUS ENGINEERING QUESTIONS
  → anthropic/claude-sonnet-4.6

CHEAP SCRIPTS / SMALL UTILITIES / BUDGET-FIRST CODING
  → deepseek/deepseek-v3.2

EVERYTHING ELSE
  → xai/grok-code-fast-1

Default to Grok Code Fast 1 when the task is ordinary coding and the route is ambiguous.
`.trim(),
  },

  // ── 13. Vercel Deep Premium Agentic ────────────────────────────────────────
  {
    id: "vercel-coding-agentic-premium",
    name: "Vercel Deep Premium Agentic",
    description: "Comparable to the OpenRouter premium-agentic coding preset, built from Vercel models: Claude Sonnet as the premium workhorse, Claude Opus for highest-stakes work, GPT-5.4 Mini for tool-heavy execution, GLM 5 for long agent loops, and Gemini 3.1 Pro for whole-repo reads",
    gatewayPresetId: "vercel",
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
          "Default premium workhorse for serious implementation, refactors, code review, and broad agentic coding. 1M ctx. $3/$15 per M tokens.",
      },
      {
        id: "anthropic/claude-opus-4.6",
        name: "Claude Opus 4.6",
        modality: "text,image->text",
        thinking: "none",
        reasoningPreset: "none",
        whenToUse:
          "Highest-stakes architecture, security-sensitive changes, and the hardest engineering tasks where cost is justified. 1M ctx. $5/$25 per M tokens.",
      },
      {
        id: "openai/gpt-5.4-mini",
        name: "GPT 5.4 Mini",
        modality: "text,image->text",
        thinking: "none",
        reasoningPreset: "none",
        whenToUse:
          "Tool-heavy planning, structured execution, multimodal engineering tasks, and fast frontier-grade reasoning.",
      },
      {
        id: "zai/glm-5",
        name: "GLM 5",
        modality: "text->text",
        thinking: "none",
        reasoningPreset: "none",
        whenToUse:
          "Long agent loops, instruction decomposition, and reasoning-heavy implementation work.",
      },
      {
        id: "google/gemini-3.1-pro-preview",
        name: "Gemini 3.1 Pro Preview",
        modality: "text,image,file,audio,video->text",
        thinking: "none",
        reasoningPreset: "none",
        whenToUse:
          "Read-heavy whole-repo analysis, giant documents, and repository-scale architecture Q&A.",
      },
    ],
    routingInstructions: `
Route every request to the best Vercel AI Gateway model for premium agentic coding. Optimize for capability first and cost second.

MODEL REFERENCE
  anthropic/claude-sonnet-4.6     — premium default workhorse
  anthropic/claude-opus-4.6       — highest-stakes architecture lane
  openai/gpt-5.4-mini             — tool-heavy multimodal execution
  zai/glm-5                       — long agent loops and reasoning-heavy execution
  google/gemini-3.1-pro-preview   — whole-repo reads and long-context synthesis

ROUTING RULES (apply in order)

HIGHEST-STAKES ARCHITECTURE / SECURITY-SENSITIVE / VERY HARD ENGINEERING DECISIONS
  → anthropic/claude-opus-4.6

MULTIMODAL ENGINEERING / TOOL-HEAVY STRUCTURED EXECUTION / DEEP REASONING
  → openai/gpt-5.4-mini

PRECISE IMPLEMENTATION / EXACT CODE EDITS / CODE-FIRST AGENT LOOPS
  → zai/glm-5

WHOLE-REPO READS / LONG DOCUMENTS / LARGE CONTEXT SYNTHESIS
  → google/gemini-3.1-pro-preview

EVERYTHING ELSE
  → anthropic/claude-sonnet-4.6

Default to Claude Sonnet 4.6 when the task is premium coding work but the route is ambiguous.
`.trim(),
  },
  {
    id: "research-affordable",
    name: "Affordable Deep Research",
    description: "Cost-aware research pool: GLM 5 handles synthesis by default, Grok 4.20 handles live web research, and Gemini 3 Flash covers long-context attachments and multimodal inputs",
    gatewayPresetId: "openrouter",
    classifierModel: "google/gemini-3.1-flash-lite-preview",
    defaultModel: "z-ai/glm-5",
    models: [
      {
        id: "z-ai/glm-5",
        name: "GLM 5",
        modality: "text->text",
        thinking: "none",
        reasoningPreset: "none",
        whenToUse:
          "Default for synthesis, report writing, comparing gathered evidence, and deliberate text-first research reasoning when cost matters.",
      },
      {
        id: "x-ai/grok-4.20-beta",
        name: "Grok 4.20 Beta",
        modality: "text,image->text",
        thinking: "none",
        reasoningPreset: "none",
        whenToUse:
          "Live web research, current-info lookups, source gathering, and search-heavy investigation where freshness matters.",
      },
      {
        id: "google/gemini-3-flash-preview",
        name: "Gemini 3 Flash Preview",
        modality: "text,image,file,audio,video->text",
        thinking: "none",
        reasoningPreset: "none",
        whenToUse:
          "Large attachments, long-context research packs, screenshots, PDFs, and multimodal evidence review when GLM 5 is too narrow.",
      },
    ],
    routingInstructions: `
Route every request to the best affordable research model. Optimize for research quality per dollar, not premium-max capability at any price.

MODEL REFERENCE
  z-ai/glm-5                   — affordable synthesis and report-writing default
  x-ai/grok-4.20-beta          — live web and current-info research lane
  google/gemini-3-flash-preview — long-context attachments and multimodal evidence lane

ROUTING RULES (apply in order)

IMAGE INPUT / SCREENSHOT / PDF / FILE INPUT / AUDIO / VIDEO / LARGE ATTACHMENTS
  → google/gemini-3-flash-preview

WEB SEARCH / CURRENT INFO / "LATEST" / NEWS / LIVE LOOKUP / SOURCE GATHERING
  → x-ai/grok-4.20-beta

LONG CONTEXT / LARGE PASTE / MULTIPLE SOURCES IN THE PROMPT / CONTEXT >60K TOKENS
  → google/gemini-3-flash-preview

SYNTHESIS / REPORT WRITING / COMPARING EVIDENCE / SUMMARIZING GATHERED FINDINGS / TRADEOFF ANALYSIS
  → z-ai/glm-5

WHEN THE USER SHIFTS FROM LOOKUP TO WRITE-UP OR DECISION-MAKING
  → z-ai/glm-5

EVERYTHING ELSE
  → z-ai/glm-5

Default to GLM 5 when the task is ambiguous but not clearly live-web or multimodal.
`.trim(),
  },
  {
    id: "vercel-research-affordable",
    name: "Vercel Affordable Deep Research",
    description: "Cost-aware Vercel research pool: GLM 5 handles synthesis by default, Grok 4.20 handles live web research, and Gemini 3 Flash covers long-context attachments and multimodal inputs",
    gatewayPresetId: "vercel",
    classifierModel: "google/gemini-3.1-flash-lite-preview",
    defaultModel: "zai/glm-5",
    models: [
      {
        id: "zai/glm-5",
        name: "GLM 5",
        modality: "text->text",
        thinking: "none",
        reasoningPreset: "none",
        whenToUse:
          "Default for synthesis, report writing, comparing gathered evidence, and deliberate text-first research reasoning when cost matters.",
      },
      {
        id: "xai/grok-4.20-reasoning-beta",
        name: "Grok 4.20 Beta Reasoning",
        modality: "text,image->text",
        thinking: "none",
        reasoningPreset: "none",
        whenToUse:
          "Live web research, current-info lookups, source gathering, and search-heavy investigation where freshness matters.",
      },
      {
        id: "google/gemini-3-flash",
        name: "Gemini 3 Flash",
        modality: "text,image->text",
        thinking: "none",
        reasoningPreset: "none",
        whenToUse:
          "Large attachments, long-context research packs, screenshots, and multimodal evidence review when GLM 5 is too narrow.",
      },
    ],
    routingInstructions: `
Route every request to the best affordable Vercel AI Gateway research model. Optimize for research quality per dollar, not premium-max capability at any price.

MODEL REFERENCE
  zai/glm-5                     — affordable synthesis and report-writing default
  xai/grok-4.20-reasoning-beta  — live web and current-info research lane
  google/gemini-3-flash         — long-context attachments and multimodal evidence lane

ROUTING RULES (apply in order)

IMAGE INPUT / SCREENSHOT / PDF / FILE INPUT / AUDIO / VIDEO / LARGE ATTACHMENTS
  → google/gemini-3-flash

WEB SEARCH / CURRENT INFO / "LATEST" / NEWS / LIVE LOOKUP / SOURCE GATHERING
  → xai/grok-4.20-reasoning-beta

LONG CONTEXT / LARGE PASTE / MULTIPLE SOURCES IN THE PROMPT / CONTEXT >60K TOKENS
  → google/gemini-3-flash

SYNTHESIS / REPORT WRITING / COMPARING EVIDENCE / SUMMARIZING GATHERED FINDINGS / TRADEOFF ANALYSIS
  → zai/glm-5

WHEN THE USER SHIFTS FROM LOOKUP TO WRITE-UP OR DECISION-MAKING
  → zai/glm-5

EVERYTHING ELSE
  → zai/glm-5

Default to GLM 5 when the task is ambiguous but not clearly live-web or multimodal.
`.trim(),
  },
];
