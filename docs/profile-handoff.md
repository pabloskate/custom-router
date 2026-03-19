# External Profile JSON Handoff

Use this when asking an external agent to generate routing profile JSON without access to the codebase.

## Goal

Generate valid profile JSON that can be pasted into this project as user profile configuration.

The external agent should not need repo access. It only needs:

- this document
- the available gateway models you provide
- the behavior you want each profile to have

## Output requirement

The external agent should return:

- JSON only
- no Markdown
- no explanation unless explicitly requested
- either a single profile object or an array of profile objects, depending on your prompt

Preferred default:

```json
[
  {
    "id": "example-profile",
    "name": "Example Profile",
    "description": "Short summary of what this profile is for.",
    "routingInstructions": "Choose the best model for the request using the rules below...",
    "defaultModel": "gw_openrouter::anthropic/claude-sonnet-4.6",
    "classifierModel": "gw_openrouter::google/gemini-3.1-flash-lite-preview",
    "models": [
      {
        "gatewayId": "gw_openrouter",
        "modelId": "anthropic/claude-sonnet-4.6",
        "name": "Claude Sonnet 4.6",
        "modality": "text,image->text",
        "reasoningPreset": "none",
        "thinking": "none",
        "whenToUse": "Complex reasoning and planning",
        "description": "High quality general-purpose model"
      }
    ]
  }
]
```

## Profile schema

Each profile uses this shape:

```ts
type ReasoningEffort =
  | "provider_default"
  | "none"
  | "minimal"
  | "low"
  | "medium"
  | "high"
  | "xhigh";

type RouterProfileModel = {
  gatewayId?: string;
  modelId: string;
  upstreamModelId?: string;
  name?: string;
  modality?: string;
  thinking?: ReasoningEffort;
  reasoningPreset?: ReasoningEffort;
  whenToUse?: string;
  description?: string;
};

type ReasoningPolicy = {
  mode?:
    | "off"
    | "adaptive"
    | "fixed_provider_default"
    | "fixed_none"
    | "fixed_minimal"
    | "fixed_low"
    | "fixed_medium"
    | "fixed_high"
    | "fixed_xhigh";
  latencySensitivity?: "low" | "medium" | "high";
  toolStepBias?: "off" | "prefer_reflex" | "strong_reflex";
  shortOutputThreshold?: number;
  longOutputThreshold?: number;
  allowDowngradeAfterPlan?: boolean;
  preferSameFamily?: boolean;
  crossFamilySwitchMode?: "conservative" | "permissive";
  inFamilyShiftHysteresis?: "off" | "sticky";
};

type RouterProfile = {
  id: string;
  name: string;
  description?: string;
  defaultModel?: string;
  classifierModel?: string;
  routingInstructions?: string;
  reasoningPolicy?: ReasoningPolicy;
  models?: RouterProfileModel[];
};
```

## Required rules

### Profile ID

- `id` is required.
- It is API-facing.
- It must use only lowercase letters, numbers, and hyphens.
- Valid pattern: `^[a-z0-9]+(?:-[a-z0-9]+)*$`
- Examples:
  - `planning-backend`
  - `customer-support`
  - `fast-coding`
- `auto` is allowed but optional. It is not reserved.

### Name

- `name` is required.
- It is a display name only.
- Keep it short and human-readable.

### Description

- Optional.
- Short summary of the profile's purpose.

### Routing instructions

- Strongly recommended.
- This is the main routing prompt for the classifier.
- It should tell the classifier how to choose among the profile's models.
- Best results come from explicit decision rules, not vague goals.

### Models

- `models` is the routed pool for that profile.
- Each entry should represent a model the router is allowed to choose.
- For generated profiles, treat `gatewayId` and `modelId` as required unless you intentionally want an unresolved draft.
- Do not duplicate the same `modelId` within one profile.

### Fallback model

- `defaultModel` is optional but recommended.
- Format must be:

```text
<gatewayId>::<modelId>
```

- It must point to one of the models inside that same profile.

Example:

```json
"defaultModel": "gw_openrouter::anthropic/claude-sonnet-4.6"
```

### Classifier model

- `classifierModel` is optional but recommended.
- Format must also be:

```text
<gatewayId>::<modelId>
```

- It does not have to be part of the profile's routed `models` pool.
- It does need to exist in the gateway models you provide to the external agent.

## Important distinction

There are two different model identifier formats:

1. Inside `models[]`, each model uses:

```json
{
  "gatewayId": "gw_openrouter",
  "modelId": "anthropic/claude-sonnet-4.6"
}
```

2. `defaultModel` and `classifierModel` use the bound key format:

```json
"gw_openrouter::anthropic/claude-sonnet-4.6"
```

## Practical guidance for the external agent

When generating profile JSON:

- Do not invent gateway IDs.
- Do not invent model IDs.
- Use only models from the gateway models list provided in the prompt.
- Keep profile IDs stable and descriptive.
- Prefer 2 to 5 routed models per profile unless asked otherwise.
- Include a fallback model whenever possible.
- Include a classifier model whenever possible.
- Make routing instructions concrete and ordered.
- If a task is ambiguous, default to the highest-quality general model in the profile.

## Routing semantics the external agent should know

- Routing only happens when the client uses a `model` value that exactly matches a saved profile `id`.
- Any unmatched `model` value is treated as a direct passthrough model name instead of a routed profile.
- If the same conversation is run under two different profile IDs, they are treated as separate routing contexts.

## Recommended structure for routing instructions

Good routing instructions usually contain:

1. A one-line goal.
2. A model reference list.
3. Ordered decision rules.
4. A default fallback rule.

Example pattern:

```text
Route every request to the single best model in this profile.

MODEL REFERENCE
  anthropic/claude-sonnet-4.6 — best for nuanced reasoning and writing
  google/gemini-3.1-pro-preview — best for very long context and document analysis
  deepseek/deepseek-v3.2 — budget-first choice

ROUTING RULES
1. If the request includes images or screenshots, choose the vision-capable model.
2. If the request is a large document, summarization job, or long-context analysis, choose the long-context model.
3. If cost is the explicit priority, choose the budget model.
4. Otherwise choose the highest-quality general model.
```

## Minimal valid example

```json
[
  {
    "id": "planning-backend",
    "name": "Planning Backend",
    "routingInstructions": "Route planning, architecture, and migration work to the best model in this profile. Use the strongest reasoning model by default.",
    "defaultModel": "gw_openrouter::anthropic/claude-sonnet-4.6",
    "classifierModel": "gw_openrouter::google/gemini-3.1-flash-lite-preview",
    "models": [
      {
        "gatewayId": "gw_openrouter",
        "modelId": "anthropic/claude-sonnet-4.6",
        "name": "Claude Sonnet 4.6"
      },
      {
        "gatewayId": "gw_openrouter",
        "modelId": "google/gemini-3.1-pro-preview",
        "name": "Gemini 3.1 Pro"
      }
    ]
  }
]
```

## Prompt template for an external agent

Paste something like this:

```text
You are generating routing profile JSON.

Return JSON only. No Markdown. No explanation.

Generate [one profile / an array of profiles] using this schema:

- id: lowercase letters, numbers, hyphens only
- name: required
- description: optional
- routingInstructions: recommended
- defaultModel: "<gatewayId>::<modelId>", and it must point to a model inside that profile
- classifierModel: "<gatewayId>::<modelId>", and it may point to any model in the provided gateway models list
- models: array of model objects with gatewayId and modelId

Do not invent gateway IDs or model IDs. Use only the models below.

Available gateway models:
[PASTE MODELS HERE]

Goal for the profile(s):
[PASTE GOAL HERE]

Preferred style for routingInstructions:
- explicit
- ordered rules
- default rule at the end
```

## Optional gateway models format to give the external agent

This format works well:

```json
{
  "gateways": [
    {
      "id": "gw_openrouter",
      "name": "OpenRouter",
      "models": [
        { "id": "anthropic/claude-sonnet-4.6", "name": "Claude Sonnet 4.6", "modality": "text,image->text" },
        { "id": "google/gemini-3.1-flash-lite-preview", "name": "Gemini 3.1 Flash Lite Preview", "modality": "text,image->text" },
        { "id": "google/gemini-3.1-pro-preview", "name": "Gemini 3.1 Pro", "modality": "text,image->text" }
      ]
    }
  ]
}
```

## Final checklist

Before using generated JSON, verify:

- every profile `id` is unique
- every profile `id` is a valid slug
- every profile has a `name`
- no profile duplicates the same `modelId` internally
- every `defaultModel` points to a model inside that same profile
- every `classifierModel` exists in your real gateway models
- the external agent returned raw JSON, not Markdown
