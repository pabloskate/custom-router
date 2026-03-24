// ─────────────────────────────────────────────────────────────────────────────
// frontier-classifier.ts
//
// LLM-based routing classifier. Called by RouterEngine when it cannot make a
// confident routing decision from heuristics alone.
//
// How it works:
//   1. Builds a structured prompt from the user's request + catalog metadata
//   2. Calls a cheap, fast "frontier" model on OpenRouter with JSON mode
//   3. Parses the response into an LlmRoutingResult { selectedModel, confidence, signals }
//
// Status-quo bias: if the conversation is already using a model, the prompt
// heavily biases toward reusing it to preserve KV cache and reduce costs.
// The bias is overridden only when the task complexity shifts dramatically.
//
// Errors: returns null on any failure so the engine can fall back gracefully.
// ─────────────────────────────────────────────────────────────────────────────

import type { LlmRoutingResult } from "@custom-router/core";
import { CLASSIFIER, SMART_PIN } from "../constants";
import { isOpenRouterHost, joinUpstreamUrl } from "../upstream/upstream";

type CatalogEntry = {
  id: string;
  thinking?: string;
  reasoningPreset?: string;
  whenToUse?: string;
  description?: string;
  modality?: string;
};

const CLASSIFIER_OUTPUT_SCHEMA_NAME = "router_classifier_output";
function buildPrompt(args: {
  input: string;
  catalog: CatalogEntry[];
  routingInstructions?: string;
  currentModel?: string;
}): string {
  const modelList = args.catalog
    .map((m) => {
      const parts = [`- ${m.id}`];
      if (m.thinking) parts.push(`thinking:${m.thinking}`);
      if (m.reasoningPreset && m.reasoningPreset !== "none") parts.push(`reasoning:${m.reasoningPreset}`);
      if (m.modality?.includes("image")) parts.push("vision:yes");
      if (m.whenToUse) parts.push(`use:${m.whenToUse}`);
      if (m.description) parts.push(m.description);
      return parts.join(" | ");
    })
    .join("\n");

  // Status-quo bias: strongly prefer the current model to preserve KV cache.
  // Only override if the task type shifts so dramatically that the current
  // model physically cannot handle it (e.g., switching from text to vision).
  const statusQuoBias = args.currentModel
    ? `\nCRITICAL STATUS QUO BIAS:\nThe user is currently using the model '${args.currentModel}'. You MUST select this exact same model AGAIN, unless the user's latest message represents a massive shift in complexity or task type that this model physically cannot handle. We want to preserve their cache!\n`
    : "";

  return `You are a routing classifier for an LLM router.

Your job is to analyze the user's request and select the optimal model from the catalog.

## Your Decision Process
1. First, analyze the user's request to understand: the task type, complexity, required capabilities
2. Consider: coding tasks, reasoning depth, vision needs, long context requirements, output length
3. Match against available models' strengths and whenToUse hints
4. Make your selection${statusQuoBias}

## Custom Routing Instructions (follow closely if provided)
====================
${args.routingInstructions || "No explicit routing instructions provided."}
====================

## Available Models (select EXACTLY one)
${modelList}

## Decision Guidelines
- Output valid JSON only
- Return the smallest valid JSON object that satisfies the schema
- Do not output prose, markdown, or reasoning traces
- If user specifically requests a model that exists in catalog, use it
- For code tasks: prefer models with "coding" in their whenToUse
- For deep reasoning: prefer variants with higher reasoning presets and stronger thinking hints
- For simpler or cost-sensitive tasks: prefer base variants with lower reasoning presets
- If a model shows reasoning:provider_default or thinking:provider_default, that means the router can omit reasoning controls and let the provider choose its native/adaptive default
- For vision/image tasks: only select models with vision:yes
- For long documents: prefer models with larger context windows${statusQuoBias}
- selectedModel MUST be an exact byte-for-byte match to one of the available model IDs
- Also classify the current step so the router can decide whether to preserve family stickiness or change effort

## Output Format
Return JSON with:
- selectedModel: exact model ID from the catalog
- confidence: 0-1 score reflecting certainty in this routing decision
- signals: array of reasoning factors (e.g., "task_type:coding", "complexity:high", "matched:glm-4")
- stepClassification: object with
  - stepMode: tool | deliberate | synthesis
  - complexity: low | medium | high
  - stakes: low | medium | high | critical
  - latencySensitivity: low | medium | high
  - toolNeed: none | optional | required
  - expectedOutputSize: short | medium | long
  - interactionHorizon: one_shot | multi_step

Example: {"selectedModel":"anthropic/claude-3-opus","confidence":0.87,"signals":["task_type:coding","complexity:high","matched:claude-3-opus"]}

Also estimate how stable this routing decision is across the next few future user turns.
- rerouteAfterTurns MUST be an integer from ${SMART_PIN.MIN_USER_TURNS} to ${SMART_PIN.MAX_USER_TURNS}
- ${SMART_PIN.MIN_USER_TURNS} means the next future user turn should re-run routing
- Use shorter horizons for plan-then-implement or rapidly changing tasks
- Use longer horizons for stable advisory or discussion threads
- Internal assistant tool loops do not count toward this budget

## User Request
${args.input}`;
}

export async function routeWithFrontierModel(args: {
  apiKey: string;
  baseUrl: string;
  input: string;
  catalog: CatalogEntry[];
  routingInstructions?: string;
  model: string;
  currentModel?: string;
  supportsReasoningEffort?: boolean;
  fetchImpl?: typeof fetch;
}): Promise<LlmRoutingResult | null> {
  const fetchImpl = args.fetchImpl ?? fetch;
  const reasoning = args.supportsReasoningEffort
    ? {
        effort: "none" as const,
        ...(isOpenRouterHost(args.baseUrl) ? { exclude: true } : {}),
      }
    : undefined;

  const baseRequest = {
    model: args.model,
    messages: [{ role: "user", content: buildPrompt(args) }],
    temperature: CLASSIFIER.TEMPERATURE,
    ...(reasoning ? { reasoning } : {}),
  };

  const schemaResponse = await fetchImpl(joinUpstreamUrl(args.baseUrl, "/chat/completions"), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${args.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      ...baseRequest,
      response_format: {
        type: "json_schema",
        json_schema: {
          name: CLASSIFIER_OUTPUT_SCHEMA_NAME,
          strict: true,
          schema: {
            type: "object",
            properties: {
              selectedModel: {
                type: "string",
                enum: args.catalog.map((m) => m.id),
              },
              confidence: {
                type: "number",
                minimum: 0,
                maximum: 1,
              },
              signals: {
                type: "array",
                items: { type: "string" },
              },
              stepClassification: {
                type: "object",
                properties: {
                  stepMode: { type: "string", enum: ["tool", "deliberate", "synthesis"] },
                  complexity: { type: "string", enum: ["low", "medium", "high"] },
                  stakes: { type: "string", enum: ["low", "medium", "high", "critical"] },
                  latencySensitivity: { type: "string", enum: ["low", "medium", "high"] },
                  toolNeed: { type: "string", enum: ["none", "optional", "required"] },
                  expectedOutputSize: { type: "string", enum: ["short", "medium", "long"] },
                  interactionHorizon: { type: "string", enum: ["one_shot", "multi_step"] },
                },
                additionalProperties: false,
              },
              rerouteAfterTurns: {
                type: "integer",
                minimum: SMART_PIN.MIN_USER_TURNS,
                maximum: SMART_PIN.MAX_USER_TURNS,
              },
            },
            required: ["selectedModel"],
            additionalProperties: false,
          },
        },
      },
    }),
  });
  if (!schemaResponse.ok) {
    console.log(
      `[router-classifier] schema_request_failed status=${schemaResponse.status} model=${baseRequest.model}`
    );
  }

  // Some classifier models/providers may not support json_schema.
  // Fall back to plain json_object mode so routing remains available.
  const response = schemaResponse.ok
    ? schemaResponse
    : await fetchImpl(joinUpstreamUrl(args.baseUrl, "/chat/completions"), {
        method: "POST",
        headers: {
          Authorization: `Bearer ${args.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ...baseRequest,
          response_format: { type: "json_object" },
        }),
      });

  if (!response.ok) {
    console.log(
      `[router-classifier] request_failed status=${response.status} model=${baseRequest.model}`
    );
    return null;
  }

  const payload = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };

  const content = payload.choices?.[0]?.message?.content;
  if (!content) {
    console.log(`[router-classifier] empty_content model=${baseRequest.model}`);
    return null;
  }

  try {
    const parsed = JSON.parse(content) as {
      selectedModel?: string;
      confidence?: number;
      signals?: string[];
      stepClassification?: {
        stepMode?: "tool" | "deliberate" | "synthesis";
        complexity?: "low" | "medium" | "high";
        stakes?: "low" | "medium" | "high" | "critical";
        latencySensitivity?: "low" | "medium" | "high";
        toolNeed?: "none" | "optional" | "required";
        expectedOutputSize?: "short" | "medium" | "long";
        interactionHorizon?: "one_shot" | "multi_step";
      };
      rerouteAfterTurns?: number;
    };

    if (!parsed.selectedModel || typeof parsed.selectedModel !== "string") {
      console.log(`[router-classifier] parsed_missing_selected_model model=${baseRequest.model}`);
      return null;
    }
    if (!args.catalog.some((m) => m.id === parsed.selectedModel)) {
      console.log(
        `[router-classifier] parsed_invalid_model model=${baseRequest.model} selectedModel=${parsed.selectedModel}`
      );
      return null;
    }

    return {
      selectedModel: parsed.selectedModel,
      confidence: typeof parsed.confidence === "number" ? parsed.confidence : 0.7,
      signals: Array.isArray(parsed.signals)
        ? parsed.signals.filter((s): s is string => typeof s === "string")
        : ["frontier_classification"],
      stepClassification: parsed.stepClassification
        ? {
            stepMode: parsed.stepClassification.stepMode ?? "deliberate",
            complexity: parsed.stepClassification.complexity ?? "medium",
            stakes: parsed.stepClassification.stakes ?? "medium",
            latencySensitivity: parsed.stepClassification.latencySensitivity ?? "medium",
            toolNeed: parsed.stepClassification.toolNeed ?? "optional",
            expectedOutputSize: parsed.stepClassification.expectedOutputSize ?? "medium",
            interactionHorizon: parsed.stepClassification.interactionHorizon ?? "one_shot",
          }
        : undefined,
      rerouteAfterTurns:
        typeof parsed.rerouteAfterTurns === "number" && Number.isInteger(parsed.rerouteAfterTurns)
          ? Math.max(SMART_PIN.MIN_USER_TURNS, Math.min(SMART_PIN.MAX_USER_TURNS, parsed.rerouteAfterTurns))
          : SMART_PIN.DEFAULT_USER_TURNS,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown_parse_error";
    console.log(`[router-classifier] parse_failed model=${baseRequest.model} error=${message}`);
    return null;
  }
}
