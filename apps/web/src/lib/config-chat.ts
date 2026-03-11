// ─────────────────────────────────────────────────────────────────────────────
// config-chat.ts
//
// Conversational config editor.  Users type $$config in a chat message to enter
// an interactive session where they can view and modify their routing config
// (routing instructions, model catalog, default model, blocklist, etc.).
//
// The session is "sticky" — once entered, every subsequent message in the same
// thread is handled by this service until the orchestrator LLM emits
// #endconfig.  Detection is stateless: we scan the messages array for the most
// recent $$config (user) vs #endconfig (assistant).
//
// Internally we call a tool-use LLM (the "orchestrator") which has access to:
//   - get_current_config   → read the user's config
//   - search_models        → search OpenRouter's model catalog
//   - web_search           → call an online model for latest model info
//   - update_routing_instructions / update_default_model / update_classifier_model
//   - update_blocklist / add_to_catalog / remove_from_catalog / replace_catalog
//
// All model-write tools validate the model ID against the OpenRouter API
// before persisting.
// ─────────────────────────────────────────────────────────────────────────────

import type { D1Database } from "./cloudflare-types";
import type { AuthResult } from "./auth";
import type { RouterRuntimeBindings } from "./runtime";
import type { GatewayRowPublic } from "./gateway-store";
import { CONFIG_CHAT, UPSTREAM } from "./constants";
import { json } from "./http";
import { decryptByokSecret, resolveByokEncryptionSecret } from "./byok-crypto";
import { validateModelId, searchModels } from "./openrouter-models";
import { callOpenAiCompatible } from "./upstream";
import { requestId as makeRequestId } from "./request-id";

// ── Config-mode detection ────────────────────────────────────────────────────

interface ChatMessage {
  role: string;
  content?: unknown;
  [key: string]: unknown;
}

interface EffectiveCatalogItem {
  id: string;
  name?: string;
  modality?: string;
  thinking?: string;
  whenToUse?: string;
  gatewayId?: string;
}

function extractText(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .filter((p: any) => p?.type === "text" && typeof p.text === "string")
      .map((p: any) => p.text as string)
      .join("\n");
  }
  return "";
}

export function isConfigMode(messages: ChatMessage[]): boolean {
  let lastConfigIdx = -1;
  let lastEndConfigIdx = -1;

  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i]!;
    const text = extractText(msg.content);
    if (msg.role === "user" && text.includes(CONFIG_CHAT.TRIGGER_KEYWORD)) {
      lastConfigIdx = i;
    }
    if (msg.role === "assistant" && text.includes(CONFIG_CHAT.END_KEYWORD)) {
      lastEndConfigIdx = i;
    }
  }

  return lastConfigIdx > lastEndConfigIdx;
}

function buildEffectiveCatalog(auth: AuthResult, gatewayRows: GatewayRowPublic[]): EffectiveCatalogItem[] {
  const fromGateways = gatewayRows.flatMap((gw) =>
    gw.models.map((m) => ({
      ...m,
      gatewayId: gw.id,
    }))
  );
  if (fromGateways.length > 0) {
    return fromGateways;
  }
  return (auth.customCatalog as EffectiveCatalogItem[] | null) ?? [];
}

function isGatewayModelId(modelId: string, gatewayRows: GatewayRowPublic[]): boolean {
  for (const gw of gatewayRows) {
    if (gw.models.some((m) => m.id === modelId)) {
      return true;
    }
  }
  return false;
}

function isEffectiveCatalogModelId(modelId: string, auth: AuthResult, gatewayRows: GatewayRowPublic[]): boolean {
  return buildEffectiveCatalog(auth, gatewayRows).some((m) => m.id === modelId);
}

// ── Tool definitions (OpenAI function-calling format) ────────────────────────

const TOOLS = [
  {
    type: "function" as const,
    function: {
      name: "get_current_config",
      description:
        "Returns the user's current CustomRouter configuration including routing instructions, default model, classifier model, blocklist, custom model catalog, and profiles.",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "search_models",
      description:
        "Search the public OpenRouter model catalog by name or ID substring. Returns matching models with their ID, name, context length, pricing, and modality. Use this for model discovery and legacy catalog edits.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "Search query (model name or ID substring, e.g. 'gpt-4', 'claude', 'gemini')",
          },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "web_search",
      description:
        "Search the web for information about LLM models, their capabilities, latest releases, or recommendations. Uses the user's configured config-agent search model. Use this when the user asks about newest models or needs recommendations.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "The search query (e.g. 'latest Claude model 2025', 'best model for code generation')",
          },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "update_routing_instructions",
      description:
        "Set (overwrite) the user's routing instructions. These are markdown instructions that the LLM classifier reads when deciding which model to route a request to.",
      parameters: {
        type: "object",
        properties: {
          instructions: {
            type: "string",
            description: "The new routing instructions (markdown text)",
          },
        },
        required: ["instructions"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "update_default_model",
      description:
        "Set the user's default (fallback) model. This is the model used when the classifier cannot decide or when routing is not needed. If gateways are configured, the model must be one of the effective gateway catalog models.",
      parameters: {
        type: "object",
        properties: {
          model_id: {
            type: "string",
            description: "OpenRouter model ID (e.g. 'openai/gpt-4.1', 'anthropic/claude-sonnet-4')",
          },
        },
        required: ["model_id"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "update_classifier_model",
      description:
        "Set the LLM used for routing decisions (the classifier). Must be a capable, fast model. If gateways are configured, the model must be one of the effective gateway catalog models.",
      parameters: {
        type: "object",
        properties: {
          model_id: {
            type: "string",
            description: "OpenRouter model ID for the classifier",
          },
        },
        required: ["model_id"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "update_blocklist",
      description:
        "Set the user's model blocklist. Models on this list will never be selected by the router.",
      parameters: {
        type: "object",
        properties: {
          blocklist: {
            type: "array",
            items: { type: "string" },
            description: "Array of OpenRouter model IDs to block",
          },
        },
        required: ["blocklist"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "update_show_model_in_response",
      description:
        "Toggle whether the router appends the selected model ID to non-tool responses. When enabled, responses will include the model ID at the end (e.g., '#anthropic/claude-sonnet-4').",
      parameters: {
        type: "object",
        properties: {
          enabled: {
            type: "boolean",
            description: "Whether to show the model ID in responses",
          },
        },
        required: ["enabled"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "add_to_catalog",
      description:
        "Add a model to the user's custom catalog. The custom catalog defines which models the router can choose from and how they should be used. The model ID is validated against OpenRouter before saving.",
      parameters: {
        type: "object",
        properties: {
          id: { type: "string", description: "OpenRouter model ID" },
          name: { type: "string", description: "Display name for the model" },
          modality: {
            type: "string",
            description: "Model modality (e.g. 'text->text', 'text,image->text')",
          },
          thinking: {
            type: "string",
            enum: ["none", "minimal", "low", "medium", "high", "xhigh"],
            description: "Thinking/reasoning capability level",
          },
          whenToUse: {
            type: "string",
            description: "Guidance for the classifier on when to choose this model",
          },
        },
        required: ["id", "name"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "remove_from_catalog",
      description: "Remove a model from the user's custom catalog by its ID.",
      parameters: {
        type: "object",
        properties: {
          model_id: {
            type: "string",
            description: "The model ID to remove from the catalog",
          },
        },
        required: ["model_id"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "replace_catalog",
      description:
        "Replace the user's entire custom catalog with a new one. All model IDs are validated against OpenRouter before saving. Use this for bulk edits.",
      parameters: {
        type: "object",
        properties: {
          catalog: {
            type: "array",
            items: {
              type: "object",
              properties: {
                id: { type: "string" },
                name: { type: "string" },
                modality: { type: "string" },
                thinking: {
                  type: "string",
                  enum: ["none", "minimal", "low", "medium", "high", "xhigh"],
                },
                whenToUse: { type: "string" },
              },
              required: ["id", "name"],
            },
            description: "The new catalog array",
          },
        },
        required: ["catalog"],
      },
    },
  },
] as const;

// ── System prompt ────────────────────────────────────────────────────────────

function buildSystemPrompt(auth: AuthResult, gatewayRows: GatewayRowPublic[]): string {
  const catalog = buildEffectiveCatalog(auth, gatewayRows);
  const catalogSource =
    gatewayRows.length > 0
      ? "all configured gateways"
      : "legacy custom_catalog (fallback)";
  const catalogStr =
    catalog.length > 0
      ? JSON.stringify(catalog, null, 2)
      : "(empty — system catalog is used as fallback)";

  return `You are CustomRouter's configuration assistant. The user has entered config mode by typing ${CONFIG_CHAT.TRIGGER_KEYWORD}. Help them view and modify their router configuration.

## What CustomRouter Does
CustomRouter is an LLM routing proxy that automatically selects the best model for each request. It uses a classifier LLM to read the user's prompt and pick from a catalog of available models.

## User's Current Configuration

**Default Model:** ${auth.defaultModel ?? "(not set — system default used)"}
**Classifier Model:** ${auth.classifierModel ?? "(not set — system default used)"}
**Blocklist:** ${auth.blocklist && auth.blocklist.length > 0 ? auth.blocklist.join(", ") : "(empty)"}
**Show Model in Response:** ${auth.showModelInResponse ? "Enabled" : "Disabled"}

**Routing Instructions:**
${auth.routingInstructions ?? "(not set)"}

**Effective Model Catalog (source: ${catalogSource}):**
${catalogStr}

## Available Tools

You have tools to read and modify the configuration:
- **get_current_config**: Returns the full config as JSON (use if the user asks to see it)
- **search_models**: Search the public OpenRouter model catalog for model discovery and legacy catalog edits
- **web_search**: Search the web for latest model info and recommendations (uses the configured config-agent search model)
- **update_routing_instructions**: Set new routing instructions
- **update_default_model**: Change the fallback model (gateway-catalog constrained when gateways are configured)
- **update_classifier_model**: Change the classifier model (gateway-catalog constrained when gateways are configured)
- **update_blocklist**: Set the model blocklist
- **update_show_model_in_response**: Toggle whether model IDs are shown in responses
- **add_to_catalog**: Add a model to the custom catalog (validated)
- **remove_from_catalog**: Remove a model from the catalog
- **replace_catalog**: Replace the entire catalog (all models validated)

## Important Rules

1. **When gateways are configured**, default/classifier model IDs must come from the Effective Model Catalog above (gateway models only). Do not set gateway-incompatible models.
2. **When no gateways are configured**, model-write tools still validate against OpenRouter. Use search_models to find canonical model IDs.
3. **Use web_search** when the user asks about the latest or newest models, or needs recommendations, since your training data may be outdated.
4. **Confirm changes** after applying them — summarize what was changed.
5. **Ending the session**: ONLY append ${CONFIG_CHAT.END_KEYWORD} at the very end of your response when the user has **explicitly** said they are finished (e.g., "that's all", "done", "exit", "quit", "I'm done", "no more changes"). NEVER emit ${CONFIG_CHAT.END_KEYWORD} on your own initiative — not when presenting a summary, not when asking a follow-up question, not after making a change. If there is any doubt, ask the user if they need anything else and wait for their reply.
6. Keep responses concise and focused on configuration.`;
}

// ── Tool executor ────────────────────────────────────────────────────────────

interface ToolCallResult {
  content: string;
  isError?: boolean;
}

interface ModelTarget {
  model: string;
  apiKey: string;
  baseUrl: string;
}

async function executeTool(
  name: string,
  args: Record<string, unknown>,
  auth: AuthResult,
  gatewayRows: GatewayRowPublic[],
  db: D1Database,
  webSearchTarget: ModelTarget,
): Promise<ToolCallResult> {
  switch (name) {
    case "get_current_config": {
      return {
        content: JSON.stringify(
          {
            defaultModel: auth.defaultModel,
            classifierModel: auth.classifierModel,
            routingInstructions: auth.routingInstructions,
            blocklist: auth.blocklist,
            customCatalog: auth.customCatalog,
            effectiveCatalog: buildEffectiveCatalog(auth, gatewayRows),
            profiles: auth.profiles,
            showModelInResponse: auth.showModelInResponse,
          },
          null,
          2
        ),
      };
    }

    case "search_models": {
      const query = args.query as string;
      try {
        const results = await searchModels(query);
        if (results.length === 0) {
          return { content: `No models found matching "${query}".` };
        }
        return { content: JSON.stringify(results, null, 2) };
      } catch (err: any) {
        return { content: `Error searching models: ${err.message}`, isError: true };
      }
    }

    case "web_search": {
      const query = args.query as string;
      try {
        const result = await callOpenAiCompatible({
          apiPath: "/chat/completions",
          payload: {
            model: webSearchTarget.model,
            messages: [
              {
                role: "user",
                content: query,
              },
            ],
            max_tokens: 1024,
          },
          apiKey: webSearchTarget.apiKey,
          requestId: makeRequestId("config-web-search"),
          baseUrl: webSearchTarget.baseUrl,
        });

        if (!result.ok) {
          return {
            content: `Web search failed (${result.status}): ${result.errorBody}`,
            isError: true,
          };
        }

        const body = (await result.response.json()) as any;
        const answer =
          body?.choices?.[0]?.message?.content ?? "No response from search.";
        return { content: answer };
      } catch (err: any) {
        return { content: `Web search error: ${err.message}`, isError: true };
      }
    }

    case "update_routing_instructions": {
      const instructions = args.instructions as string;
      await updateUserField(db, auth.userId, { routing_instructions: instructions });
      auth.routingInstructions = instructions;
      return { content: "Routing instructions updated successfully." };
    }

    case "update_default_model": {
      const modelId = args.model_id as string;
      const hasGatewayCatalog = gatewayRows.length > 0;
      const fromGateway = isGatewayModelId(modelId, gatewayRows);
      if (hasGatewayCatalog && !isEffectiveCatalogModelId(modelId, auth, gatewayRows)) {
        return {
          content: `Model "${modelId}" is not available in your configured gateways. Choose a model from your Effective Model Catalog.`,
          isError: true,
        };
      }
      const valid = hasGatewayCatalog ? null : await validateModelId(modelId);
      if (!hasGatewayCatalog && !valid) {
        return {
          content: `Model "${modelId}" was not found on OpenRouter. Use search_models to find valid IDs.`,
          isError: true,
        };
      }
      await updateUserField(db, auth.userId, { default_model: modelId });
      auth.defaultModel = modelId;
      if (hasGatewayCatalog && fromGateway) {
        return { content: `Default model set to "${modelId}" (found in your gateway models).` };
      }
      if (hasGatewayCatalog) {
        return { content: `Default model set to "${modelId}" (available in your effective gateway catalog).` };
      }
      return { content: `Default model set to "${modelId}" (${valid!.name}).` };
    }

    case "update_classifier_model": {
      const modelId = args.model_id as string;
      const hasGatewayCatalog = gatewayRows.length > 0;
      const fromGateway = isGatewayModelId(modelId, gatewayRows);
      if (hasGatewayCatalog && !isEffectiveCatalogModelId(modelId, auth, gatewayRows)) {
        return {
          content: `Model "${modelId}" is not available in your configured gateways. Choose a model from your Effective Model Catalog.`,
          isError: true,
        };
      }
      const valid = hasGatewayCatalog ? null : await validateModelId(modelId);
      if (!hasGatewayCatalog && !valid) {
        return {
          content: `Model "${modelId}" was not found on OpenRouter. Use search_models to find valid IDs.`,
          isError: true,
        };
      }
      await updateUserField(db, auth.userId, { classifier_model: modelId });
      auth.classifierModel = modelId;
      if (hasGatewayCatalog && fromGateway) {
        return { content: `Classifier model set to "${modelId}" (found in your gateway models).` };
      }
      if (hasGatewayCatalog) {
        return { content: `Classifier model set to "${modelId}" (available in your effective gateway catalog).` };
      }
      return { content: `Classifier model set to "${modelId}" (${valid!.name}).` };
    }

    case "update_blocklist": {
      const blocklist = args.blocklist as string[];
      await updateUserField(db, auth.userId, {
        blocklist: blocklist.length > 0 ? JSON.stringify(blocklist) : null,
      });
      auth.blocklist = blocklist;
      return {
        content:
          blocklist.length > 0
            ? `Blocklist updated: ${blocklist.join(", ")}`
            : "Blocklist cleared.",
      };
    }

    case "update_show_model_in_response": {
      const enabled = args.enabled as boolean;
      await updateUserField(db, auth.userId, { show_model_in_response: enabled ? 1 : 0 });
      auth.showModelInResponse = enabled;
      return {
        content: enabled
          ? "Model ID will now be appended to non-tool responses (e.g., '#anthropic/claude-sonnet-4')."
          : "Model ID will no longer be shown in responses.",
      };
    }

    case "add_to_catalog": {
      const id = args.id as string;
      const valid = await validateModelId(id);
      if (!valid) {
        return {
          content: `Model "${id}" was not found on OpenRouter. Use search_models to find valid IDs.`,
          isError: true,
        };
      }

      const entry = {
        id,
        name: (args.name as string) || valid.name,
        modality: args.modality as string | undefined,
        thinking: args.thinking as string | undefined,
        whenToUse: args.whenToUse as string | undefined,
      };

      const catalog = Array.isArray(auth.customCatalog) ? [...auth.customCatalog] : [];
      const existingIdx = catalog.findIndex((c: any) => c.id === id);
      if (existingIdx >= 0) {
        catalog[existingIdx] = { ...catalog[existingIdx], ...entry };
      } else {
        catalog.push(entry);
      }

      await updateUserField(db, auth.userId, {
        custom_catalog: JSON.stringify(catalog),
      });
      auth.customCatalog = catalog;
      return {
        content: `${existingIdx >= 0 ? "Updated" : "Added"} "${id}" (${valid.name}) in the catalog.`,
      };
    }

    case "remove_from_catalog": {
      const modelId = args.model_id as string;
      const catalog = Array.isArray(auth.customCatalog) ? [...auth.customCatalog] : [];
      const before = catalog.length;
      const filtered = catalog.filter((c: any) => c.id !== modelId);

      if (filtered.length === before) {
        return { content: `Model "${modelId}" was not found in your catalog.`, isError: true };
      }

      await updateUserField(db, auth.userId, {
        custom_catalog: filtered.length > 0 ? JSON.stringify(filtered) : null,
      });
      auth.customCatalog = filtered.length > 0 ? filtered : null;
      return { content: `Removed "${modelId}" from the catalog.` };
    }

    case "replace_catalog": {
      const newCatalog = args.catalog as any[];
      const invalid: string[] = [];

      for (const entry of newCatalog) {
        const valid = await validateModelId(entry.id);
        if (!valid) {
          invalid.push(entry.id);
        }
      }

      if (invalid.length > 0) {
        return {
          content: `The following model IDs were not found on OpenRouter: ${invalid.join(", ")}. Fix them and try again.`,
          isError: true,
        };
      }

      await updateUserField(db, auth.userId, {
        custom_catalog: newCatalog.length > 0 ? JSON.stringify(newCatalog) : null,
      });
      auth.customCatalog = newCatalog.length > 0 ? newCatalog : null;
      return {
        content: `Catalog replaced with ${newCatalog.length} model(s).`,
      };
    }

    default:
      return { content: `Unknown tool: ${name}`, isError: true };
  }
}

// ── D1 helpers ───────────────────────────────────────────────────────────────

async function updateUserField(
  db: D1Database,
  userId: string,
  fields: Record<string, string | number | null>
): Promise<void> {
  const setClauses: string[] = [];
  const values: (string | number | null)[] = [];
  let idx = 1;

  for (const [col, val] of Object.entries(fields)) {
    setClauses.push(`${col} = ?${idx}`);
    values.push(val);
    idx++;
  }

  setClauses.push(`updated_at = ?${idx}`);
  values.push(new Date().toISOString());
  idx++;

  values.push(userId);

  await db
    .prepare(`UPDATE users SET ${setClauses.join(", ")} WHERE id = ?${idx}`)
    .bind(...values)
    .run();
}

// ── Resolve API key ──────────────────────────────────────────────────────────

async function resolveApiKey(
  auth: AuthResult,
  bindings: RouterRuntimeBindings
): Promise<{ apiKey: string; baseUrl: string } | { error: string }> {
  const byokSecret = resolveByokEncryptionSecret({
    byokSecret: bindings.BYOK_ENCRYPTION_SECRET ?? null,
  });

  if (auth.upstreamApiKeyEnc && byokSecret) {
    const decrypted = await decryptByokSecret({
      ciphertext: auth.upstreamApiKeyEnc,
      secret: byokSecret,
    });
    if (decrypted) {
      const baseUrl = auth.upstreamBaseUrl ?? UPSTREAM.DEFAULT_BASE_URL;
      return { apiKey: decrypted, baseUrl };
    }
  }

  if (bindings.OPENROUTER_API_KEY) {
    return {
      apiKey: bindings.OPENROUTER_API_KEY,
      baseUrl: bindings.OPENAI_COMPAT_BASE_URL ?? UPSTREAM.DEFAULT_BASE_URL,
    };
  }

  return { error: "No API key available. Configure a BYOK key or set OPENROUTER_API_KEY." };
}

function findGatewayForModel(
  modelId: string,
  gatewayRows: GatewayRowPublic[]
): GatewayRowPublic | null {
  for (const gateway of gatewayRows) {
    if (gateway.models.some((model) => model.id === modelId)) {
      return gateway;
    }
  }
  return null;
}

async function resolveModelTarget(args: {
  auth: AuthResult;
  bindings: RouterRuntimeBindings;
  gatewayRows: GatewayRowPublic[];
  model: string;
}): Promise<ModelTarget | { error: string }> {
  if (args.gatewayRows.length > 0) {
    const gateway = findGatewayForModel(args.model, args.gatewayRows);
    if (!gateway) {
      return {
        error: `Configured model "${args.model}" is not available in your gateway catalog.`,
      };
    }

    const byokSecret = resolveByokEncryptionSecret({
      byokSecret: args.bindings.BYOK_ENCRYPTION_SECRET ?? null,
    });
    if (!byokSecret) {
      return {
        error:
          "Server misconfigured: missing BYOK encryption secret for gateway credentials.",
      };
    }

    const decryptedGatewayKey = await decryptByokSecret({
      ciphertext: gateway.apiKeyEnc,
      secret: byokSecret,
    });
    if (!decryptedGatewayKey) {
      return {
        error:
          "Failed to decrypt gateway API key for config mode. Re-save the gateway key and try again.",
      };
    }

    return {
      model: args.model,
      apiKey: decryptedGatewayKey,
      baseUrl: gateway.baseUrl,
    };
  }

  const fallback = await resolveApiKey(args.auth, args.bindings);
  if ("error" in fallback) {
    return { error: fallback.error };
  }

  return {
    model: args.model,
    apiKey: fallback.apiKey,
    baseUrl: fallback.baseUrl,
  };
}

// ── Main entry point ─────────────────────────────────────────────────────────

export async function handleConfigChat(
  messages: ChatMessage[],
  auth: AuthResult,
  bindings: RouterRuntimeBindings,
  gatewayRows: GatewayRowPublic[] = [],
  stream = false
): Promise<Response> {
  if (!bindings.ROUTER_DB) {
    return json({ error: "Server misconfigured: missing database." }, 500);
  }

  if (!auth.configAgentEnabled) {
    return json(
      {
        error:
          "Config agent is disabled. Enable 'Config Agent (Optional)' in Routing settings to use $$config.",
      },
      400
    );
  }

  const orchestratorModel = auth.configAgentOrchestratorModel?.trim() ?? "";
  const webSearchModel = auth.configAgentSearchModel?.trim() ?? "";
  if (!orchestratorModel || !webSearchModel) {
    return json(
      {
        error:
          "Config agent setup is incomplete. Set both Config Orchestrator Model and Config Web-Search Model in Routing settings.",
      },
      400
    );
  }

  const orchestratorTarget = await resolveModelTarget({
    auth,
    bindings,
    gatewayRows,
    model: orchestratorModel,
  });
  if ("error" in orchestratorTarget) {
    return json({ error: orchestratorTarget.error }, 500);
  }

  const webSearchTarget = await resolveModelTarget({
    auth,
    bindings,
    gatewayRows,
    model: webSearchModel,
  });
  if ("error" in webSearchTarget) {
    return json({ error: webSearchTarget.error }, 500);
  }

  const db = bindings.ROUTER_DB;

  const systemMessage = {
    role: "system" as const,
    content: buildSystemPrompt(auth, gatewayRows),
  };

  // Strip the $$config prefix from the first triggering message so the LLM
  // sees clean user intent.
  const cleanedMessages = messages.map((m) => {
    if (m.role === "user") {
      const text = extractText(m.content);
      if (text.includes(CONFIG_CHAT.TRIGGER_KEYWORD)) {
        const cleaned = text.replace(CONFIG_CHAT.TRIGGER_KEYWORD, "").trim();
        return { ...m, content: cleaned || "Show me my current configuration." };
      }
    }
    return m;
  });

  // Filter to only include user and assistant messages (drop any existing system messages)
  const conversationMessages = cleanedMessages.filter(
    (m) => m.role === "user" || m.role === "assistant"
  );

  let llmMessages: any[] = [systemMessage, ...conversationMessages];

  for (let round = 0; round < CONFIG_CHAT.MAX_TOOL_ROUNDS; round++) {
    const result = await callOpenAiCompatible({
      apiPath: "/chat/completions",
      payload: {
        model: orchestratorTarget.model,
        messages: llmMessages,
        tools: TOOLS,
        temperature: CONFIG_CHAT.TEMPERATURE,
        max_tokens: CONFIG_CHAT.MAX_TOKENS,
      },
      apiKey: orchestratorTarget.apiKey,
      requestId: makeRequestId("config-chat"),
      baseUrl: orchestratorTarget.baseUrl,
    });

    if (!result.ok) {
      return json(
        {
          error: "Config chat LLM call failed.",
          detail: result.errorBody,
        },
        502
      );
    }

    const body = (await result.response.json()) as any;
    const choice = body?.choices?.[0];
    if (!choice) {
      return json({ error: "No response from config chat LLM." }, 502);
    }

    const assistantMessage = choice.message;

    if (
      !assistantMessage.tool_calls ||
      assistantMessage.tool_calls.length === 0
    ) {
      const content = assistantMessage.content ?? "";
      return stream
        ? buildStreamingResponse(content, body, orchestratorTarget.model)
        : buildChatCompletionResponse(content, body, orchestratorTarget.model);
    }

    // Process tool calls
    llmMessages.push(assistantMessage);

    for (const toolCall of assistantMessage.tool_calls) {
      let toolArgs: Record<string, unknown> = {};
      try {
        toolArgs =
          typeof toolCall.function.arguments === "string"
            ? JSON.parse(toolCall.function.arguments)
            : toolCall.function.arguments ?? {};
      } catch {
        toolArgs = {};
      }

      const toolResult = await executeTool(
        toolCall.function.name,
        toolArgs,
        auth,
        gatewayRows,
        db,
        webSearchTarget,
      );

      llmMessages.push({
        role: "tool",
        tool_call_id: toolCall.id,
        content: toolResult.content,
      });
    }
  }

  // Max rounds reached — return whatever we have
  return json(
    {
      error:
        "Config chat reached maximum tool-call rounds. Please simplify your request.",
    },
    500
  );
}

// ── Response builder ─────────────────────────────────────────────────────────

function buildChatCompletionResponse(content: string, raw: any, model: string): Response {
  const response = {
    id: raw?.id ?? `chatcmpl-config-${Date.now()}`,
    object: "chat.completion",
    created: raw?.created ?? Math.floor(Date.now() / 1000),
    model: raw?.model ?? model,
    choices: [
      {
        index: 0,
        message: {
          role: "assistant",
          content,
        },
        finish_reason: "stop",
      },
    ],
    usage: raw?.usage ?? null,
  };

  return json(response, 200, {
    "x-router-config-mode": "true",
  });
}

function buildStreamingResponse(content: string, raw: any, model: string): Response {
  const id = raw?.id ?? `chatcmpl-config-${Date.now()}`;
  const created = raw?.created ?? Math.floor(Date.now() / 1000);
  const resolvedModel = raw?.model ?? model;

  const roleChunk = {
    id,
    object: "chat.completion.chunk",
    created,
    model: resolvedModel,
    choices: [{ index: 0, delta: { role: "assistant", content: "" }, finish_reason: null }],
  };

  const contentChunk = {
    id,
    object: "chat.completion.chunk",
    created,
    model: resolvedModel,
    choices: [{ index: 0, delta: { content }, finish_reason: null }],
  };

  const stopChunk = {
    id,
    object: "chat.completion.chunk",
    created,
    model: resolvedModel,
    choices: [{ index: 0, delta: {}, finish_reason: "stop" }],
  };

  const body = [
    `data: ${JSON.stringify(roleChunk)}\n\n`,
    `data: ${JSON.stringify(contentChunk)}\n\n`,
    `data: ${JSON.stringify(stopChunk)}\n\n`,
    `data: [DONE]\n\n`,
  ].join("");

  return new Response(body, {
    status: 200,
    headers: {
      "content-type": "text/event-stream",
      "cache-control": "no-cache",
      connection: "keep-alive",
      "x-router-config-mode": "true",
    },
  });
}
