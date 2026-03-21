// ─────────────────────────────────────────────────────────────────────────────
// defaults.ts
//
// Seeded routing configuration defaults used when no persisted router config
// has been stored yet. Execution model inventories are resolved from synced
// gateway models or stored system catalogs; they are not hard-coded here.
// ─────────────────────────────────────────────────────────────────────────────

import type { RouterConfig } from "@custom-router/core";

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

// ── Default RouterConfig ──────────────────────────────────────────────────────

export const DEFAULT_ROUTER_CONFIG: RouterConfig = {
  version: "1",
  globalBlocklist: [],
  routingInstructions: DEFAULT_ROUTING_INSTRUCTIONS,
  cooldownTurns: 3,
  smartPinTurns: 3
};
