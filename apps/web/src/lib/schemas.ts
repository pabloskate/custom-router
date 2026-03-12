import { z } from "zod";

const reasoningPresetSchema = z.enum(["none", "minimal", "low", "medium", "high", "xhigh"]);

export const routerProfileSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  defaultModel: z.string().optional(),
  classifierModel: z.string().optional(),
  routingInstructions: z.string().optional(),
  blocklist: z.array(z.string()).optional(),
  catalogFilter: z.array(z.string()).optional(),
});

const categoryWeightsSchema = z.object({
  quality: z.number().min(0).max(1),
  speed: z.number().min(0).max(1),
  cost: z.number().min(0).max(1)
});

const profileWeightsSchema = z.object({
  quality: z.number().min(0).max(1),
  speed: z.number().min(0).max(1),
  costEfficiency: z.number().min(0).max(1),
  reliability: z.number().min(0).max(1)
});

const categoryPolicySchema = z.object({
  allowlist: z.array(z.string()).optional(),
  fallbackPool: z.array(z.string()).optional(),
  weights: categoryWeightsSchema.optional()
});

const profilePolicySchema = z.object({
  allowlist: z.array(z.string()).optional(),
  fallbackPool: z.array(z.string()).optional(),
  weights: profileWeightsSchema.optional()
});

export const routerConfigSchema = z.object({
  version: z.string().min(1),
  defaultModel: z.string().min(1),
  classifierModel: z.string().optional(),
  globalBlocklist: z.array(z.string()),
  routingInstructions: z.string().optional(),
});

export const chatCompletionSchema = z.object({
  model: z.string().min(1),
  messages: z
    .array(
      z.object({
        role: z.enum(["system", "user", "assistant", "tool", "developer"]),
        content: z.unknown().optional(),
        tool_call_id: z.string().optional()
      }).passthrough()
    )
    .optional(),
  tools: z
    .array(
      z.object({
        type: z.string().optional(),
        function: z
          .object({
            name: z.string().optional(),
            description: z.string().optional()
          }).passthrough()
          .optional()
      }).passthrough()
    )
    .optional(),
  stream: z.boolean().optional()
}).passthrough();

export const responsesSchema = z.object({
  model: z.string().min(1),
  input: z.unknown().optional(),
  tools: chatCompletionSchema.shape.tools.optional(),
  previous_response_id: z.string().optional(),
  stream: z.boolean().optional()
}).passthrough();

export const completionsSchema = z.object({
  model: z.string().min(1),
  prompt: z.unknown().optional(),
  stream: z.boolean().optional()
}).passthrough();

const catalogItemSchema = z.object({
  id:          z.string().min(1),
  name:        z.string().min(1),
  upstreamModelId: z.string().min(1).optional(),
  whenToUse:   z.string().optional(),
  description: z.string().optional(),
  modality:    z.string().optional(),
  thinking:    reasoningPresetSchema.optional(),
  reasoningPreset: reasoningPresetSchema.optional(),
});

export const createGatewaySchema = z.object({
  name:    z.string().min(1).max(100),
  baseUrl: z.string().url(),
  apiKey:  z.string().min(1),
});

export const updateGatewaySchema = z.object({
  name:    z.string().min(1).max(100).optional(),
  baseUrl: z.string().url().optional(),
  apiKey:  z.string().min(1).optional(),
  models:  z.array(catalogItemSchema).optional(),
}).superRefine((data, ctx) => {
  if (Object.keys(data).length === 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "At least one field is required.",
    });
  }

  if (Array.isArray(data.models)) {
    const seen = new Set<string>();
    for (const [index, model] of data.models.entries()) {
      if (seen.has(model.id)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Duplicate model id "${model.id}" is not allowed.`,
          path: ["models", index, "id"],
        });
      }
      seen.add(model.id);
    }
  }
});
