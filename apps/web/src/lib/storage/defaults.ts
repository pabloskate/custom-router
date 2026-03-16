// ─────────────────────────────────────────────────────────────────────────────
// defaults.ts
//
// Seeded routing configuration and model catalog based on the February 2026
// benchmark report (LMSYS Chatbot Arena, Artificial Analysis, Design Arena).
//
// These values are used as the hardcoded fallback when no config/catalog has
// been stored in the database yet. They can be overridden at any time via:
//   • Admin UI  → router config panel / catalog editor
//   • API       → PUT /api/v1/router/config
//
// Model IDs follow OpenRouter's naming convention:  provider/model-name
// ─────────────────────────────────────────────────────────────────────────────

import type { CatalogItem, RouterConfig } from "@custom-router/core";

// ── Default routing instructions ─────────────────────────────────────────────
//
// Plain-text prompt injected verbatim into the classifier's system context.
// The classifier reads this alongside the model catalog to make routing decisions.
//
// Keep instructions action-oriented and model-specific so the classifier can
// pattern-match cleanly. Avoid vague guidance like "use the best model".

export const DEFAULT_ROUTING_INSTRUCTIONS = `
Route every request to the single most appropriate model using the rules below.
Always respect the catalog's "whenToUse" hints first; use these rules as tiebreakers.

── TASK ROUTING RULES ────────────────────────────────────────────────────────

COMPLEX REASONING & PLANNING
  Triggers: architecture decisions, multi-step problem-solving, strategic analysis,
            mathematical proofs, agentic planning pipelines
  → anthropic/claude-opus-4-6:thinking

CODING — COMPLEX (large refactors, system design, cross-repo changes, tool-use agents)
  Triggers: "refactor entire codebase", "design the architecture", "build an agent"
  → anthropic/claude-opus-4-6

CODING — DAILY DEVELOPMENT (features, bug fixes, code review, PR descriptions)
  Triggers: standard implementation tasks, debugging, unit tests, code explanation
  → anthropic/claude-sonnet-4-6

CODING — CLI / TERMINAL / CYBERSECURITY
  Triggers: terminal scripts, shell commands, pen-testing, security audit, agentic debugging
  → openai/gpt-5.3-codex

SCIENTIFIC RESEARCH & LONG DOCUMENTS
  Triggers: research paper analysis, fact-checking, documents > 100K tokens,
            gap/inaccuracy detection in papers, scientific knowledge questions
  → google/gemini-2.5-pro-preview

FRONTEND & UI/UX DESIGN
  Triggers: React components, CSS/Tailwind, web page layout, design systems,
            UI mockups, CRM flows, multi-step design workflows
  → anthropic/claude-sonnet-4-6

IMAGE GENERATION — HIGH QUALITY
  Triggers: marketing assets, product mockups, images with text, photorealistic output
  → openai/gpt-image-1.5

IMAGE GENERATION — RAPID PROTOTYPING
  Triggers: quick visual concepts, iterative design edits, Google Workspace context
  → google/gemini-pro-image

PARALLEL WEB RESEARCH (50+ sources)
  Triggers: competitive intelligence, market analysis across many websites,
            "research X across the web", large-scale data extraction
  → moonshot/kimi-k2.5

QUICK CHAT & SIMPLE LOOKUPS
  Triggers: one-sentence answers, definitions, quick factual questions, casual conversation
  → google/gemini-flash-2.0

BUDGET / HIGH-VOLUME BACKGROUND TASKS
  Triggers: auto-documentation, mass unit test generation, CI/CD automation,
            customer support templates, batch processing
  → deepseek/deepseek-v3.2

── COST GUIDELINES ───────────────────────────────────────────────────────────

Tier     | Max output $/1M | Example models
---------|-----------------|------------------------------------------
Premium  | $25             | claude-opus-4-6, gemini-2.5-pro-preview
Mid      | $15             | claude-sonnet-4-6, gpt-5.3-codex
Efficient| $3.20           | glm-5, kimi-k2.5
Budget   | $0.55           | deepseek-v3.2, grok-4.1-fast

Only route to Premium when the task genuinely requires it.
Default to Mid for most coding and general tasks.
Default to Budget for simple, repetitive, or high-volume tasks.

── VISION OVERRIDE ───────────────────────────────────────────────────────────

If the conversation contains an image, you MUST pick a vision-capable model
(modality includes "image"). Never route an image-bearing request to a text-only model.
`.trim();

// ── Default model catalog ─────────────────────────────────────────────────────
//
// Curated list of frontier models as of February 2026.
// Sources: LMSYS Chatbot Arena, Artificial Analysis, Design Arena, SWE-bench.
//
// This catalog is used when no system catalog has been ingested from OpenRouter
// (i.e., the KV store is empty) AND the user has not set a custom catalog.
//
// The "whenToUse" field is the primary signal for the LLM classifier —
// keep it concise and task-oriented.

export const DEFAULT_CATALOG: CatalogItem[] = [
  // ── PREMIUM TIER ──────────────────────────────────────────────────────────

  {
    id: "anthropic/claude-opus-4-6:thinking",
    name: "Claude Opus 4.6 Thinking",
    modality: "text->text",
    thinking: "xhigh",
    whenToUse:
      "Complex multi-step reasoning, architecture planning, strategic analysis, long agentic pipelines. Highest Arena Elo (1506) and best thinking/planning. Use for tasks that genuinely require deep reasoning."
  },
  {
    id: "anthropic/claude-opus-4-6",
    name: "Claude Opus 4.6",
    modality: "text,image->text",
    thinking: "none",
    whenToUse:
      "Complex software architecture, large-scale refactoring, tool-augmented coding (53.1% HLE with tools), high-end creative writing. Top Code Arena Elo (1561) and SWE-bench (80.8%). Best for tasks requiring a 'senior engineer'."
  },
  {
    id: "google/gemini-2.5-pro-preview",
    name: "Gemini 3.1 Pro Preview",
    modality: "text,image->text",
    thinking: "high",
    whenToUse:
      "Scientific research analysis, research paper gap/inaccuracy detection, novel reasoning (ARC-AGI-2: 77.1%), very long documents (1M context). Highest intelligence index (57/100). Differentiate from Claude by routing 'fact-checking' here and 'strategic planning' to Claude."
  },
  {
    id: "openai/gpt-5.2-pro",
    name: "GPT-5.2 Pro",
    modality: "text,image->text",
    thinking: "xhigh",
    whenToUse:
      "Highest-stakes tasks requiring extended thinking time. Only use when cost is not a constraint ($21/$168 per 1M). For API-heavy integrations and interactive components."
  },

  // ── MID TIER ──────────────────────────────────────────────────────────────

  {
    id: "anthropic/claude-sonnet-4-6",
    name: "Claude Sonnet 4.6",
    modality: "text,image->text",
    thinking: "low",
    whenToUse:
      "Daily development, bug fixes, code review, frontend/UI design (reported 'perfect design taste'), CRM workflows, branched multi-step design tasks. Best cost-quality ratio for coding (SWE-bench 77.8%) and the primary target for professional-grade frontend work."
  },
  {
    id: "openai/gpt-5.3-codex",
    name: "GPT-5.3 Codex",
    modality: "text->text",
    thinking: "medium",
    whenToUse:
      "CLI-heavy workflows, terminal operations, multi-file agentic execution, autonomous debugging. Industry-leading Terminal-Bench 2.0 (77.3%). First model classified as 'High Capability' for offensive/defensive cybersecurity. 25% faster than its predecessor."
  },
  {
    id: "anthropic/claude-opus-4-5:thinking",
    name: "Claude Opus 4.5 Thinking",
    modality: "text,image->text",
    thinking: "high",
    whenToUse:
      "Frontend architecture and complex UI generation with 'senior architect-level taste'. Top WebDev Arena score (1512). Use for full website or app design tasks where visual quality is paramount."
  },
  {
    id: "openai/gpt-5.2",
    name: "GPT-5.2",
    modality: "text,image->text",
    thinking: "none",
    whenToUse:
      "General-purpose high-quality responses. Strong SWE-bench (54.2% ARC-AGI-2), good tool-use integration. Fast (187 tokens/sec). Good fallback when Claude or Gemini are unavailable."
  },
  {
    id: "x-ai/grok-4.1",
    name: "Grok 4.1",
    modality: "text->text",
    thinking: "none",
    whenToUse:
      "Real-time information access, conversational tasks, large context (2M tokens). Strong performance at moderate cost."
  },

  // ── RESEARCH / SWARM ──────────────────────────────────────────────────────

  {
    id: "moonshot/kimi-k2.5",
    name: "Kimi K2.5",
    modality: "text,image->text",
    thinking: "medium",
    whenToUse:
      "Parallel web research using Agent Swarm (up to 100 sub-agents, 4.5x faster than single-agent). Use for market analysis across 50+ websites, large-scale competitive intelligence, or massive data extraction tasks."
  },

  // ── EFFICIENT TIER ────────────────────────────────────────────────────────

  {
    id: "zhipuai/glm-5",
    name: "GLM-5",
    modality: "text->text",
    thinking: "none",
    whenToUse:
      "Open-weight coding that matches Claude Opus on SWE-bench (77.8%) at significantly lower cost. 98% frontend build success rate — excellent for React/Tailwind/complex UI component generation and systems engineering."
  },
  {
    id: "deepseek/deepseek-v3.2",
    name: "DeepSeek V3.2",
    modality: "text->text",
    thinking: "none",
    whenToUse:
      "High-volume background tasks: automated documentation, mass unit test generation, CI/CD pipelines, customer support automation. ~94% cheaper than GPT-5.2 with comparable general performance. The only economically rational choice for batch workloads."
  },

  // ── FAST / REFLEX TIER ────────────────────────────────────────────────────

  {
    id: "google/gemini-flash-2.0",
    name: "Gemini 3 Flash",
    modality: "text,image->text",
    thinking: "none",
    whenToUse:
      "Quick answers, simple lookups, casual chat, cost-optimized reflex responses. Best speed-to-intelligence ratio. Use when response quality requirements are low and speed/cost matter most."
  },
  {
    id: "x-ai/grok-4.1-fast",
    name: "Grok 4.1 Fast",
    modality: "text->text",
    thinking: "none",
    whenToUse:
      "Fastest available responses (213 tokens/sec), real-time information, 2M token context. Lowest cost ($0.20/$0.50 per 1M). Use for simple high-volume tasks where latency is the primary constraint."
  },
  {
    id: "openai/gpt-5-mini",
    name: "GPT-5 Mini",
    modality: "text->text",
    thinking: "none",
    whenToUse:
      "Cheapest capable model ($0.25/$2.00 per 1M). Extremely fast (>250 tokens/sec). Use for simple classification, summarisation, or routing pre-processing tasks."
  },

  // ── IMAGE GENERATION ──────────────────────────────────────────────────────

  {
    id: "openai/gpt-image-1.5",
    name: "GPT Image 1.5",
    modality: "text->image",
    thinking: "none",
    whenToUse:
      "Professional marketing materials, product mockups, images requiring precise typography/text rendering. Gold standard for image generation (Arena score 1265). Natively integrated reasoning about layout before generating."
  },
  {
    id: "google/gemini-pro-image",
    name: "Gemini 3 Pro Image",
    modality: "text->image",
    thinking: "none",
    whenToUse:
      "Rapid image prototyping, conversational image editing (3–5 second generation). Deep Google Workspace integration. Use when iterative editing or speed matters more than peak quality."
  }
];

// ── Default RouterConfig ──────────────────────────────────────────────────────

export const DEFAULT_ROUTER_CONFIG: RouterConfig = {
  version: "1",
  globalBlocklist: [],
  routingInstructions: DEFAULT_ROUTING_INSTRUCTIONS,
  cooldownTurns: 3,
  smartPinTurns: 3
};
