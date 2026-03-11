// ─────────────────────────────────────────────────────────────────────────────
// frontier-router-classifier.ts
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

import type { LlmRoutingResult } from "@auto-router/core";
import { CLASSIFIER } from "./constants";
import { joinUpstreamUrl } from "./upstream";

type CatalogEntry = {
  id: string;
  thinking?: string;
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

  return `You are an advanced routing classifier for an LLM router, powered by GLM-5's deep reasoning.

Your job is to analyze the user's request with deep reasoning and select the optimal model from the catalog.

## Your Reasoning Process
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
- If user specifically requests a model that exists in catalog, use it
- For code tasks: prefer models with "coding" in their whenToUse
- For deep reasoning: select models optimized for thinking
- For vision/image tasks: only select models with vision:yes
- For long documents: prefer models with larger context windows${statusQuoBias}
- selectedModel MUST be an exact byte-for-byte match to one of the available model IDs

## Output Format
Return JSON with:
- selectedModel: exact model ID from the catalog
- confidence: 0-1 score reflecting certainty in this routing decision
- signals: array of reasoning factors (e.g., "task_type:coding", "complexity:high", "matched:glm-4")

Example: {"selectedModel":"anthropic/claude-3-opus","confidence":0.87,"signals":["task_type:coding","complexity:high","matched:claude-3-opus"]}

## User Request
${args.input}`;
}

export async function routeWithFrontierModel(args: {
  apiKey: string;
  baseUrl: string;
  input: string;
  catalog: CatalogEntry[];
  routingInstructions?: string;
  model?: string;
  currentModel?: string;
  fetchImpl?: typeof fetch;
}): Promise<LlmRoutingResult | null> {
  const fetchImpl = args.fetchImpl ?? fetch;

  const baseRequest = {
    model: args.model ?? CLASSIFIER.DEFAULT_MODEL,
    messages: [{ role: "user", content: buildPrompt(args) }],
    temperature: CLASSIFIER.TEMPERATURE,
    max_tokens: CLASSIFIER.MAX_TOKENS,
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
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown_parse_error";
    console.log(`[router-classifier] parse_failed model=${baseRequest.model} error=${message}`);
    return null;
  }
}
