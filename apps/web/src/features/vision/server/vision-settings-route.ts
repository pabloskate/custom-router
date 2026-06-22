import type { AuthResult } from "@/src/lib/auth";
import { json, type RouterRuntimeBindings } from "@/src/lib/infra";
import {
  gatewayRowToInfo,
  getUserVisionSettings,
  loadGatewaysWithMigration,
  upsertUserVisionSettings,
} from "@/src/lib/storage";

import {
  collectVisionModelOptions,
  modelSupportsVisionInput,
  normalizeVisionMode,
  type VisionSettingsResponse,
  visionSettingsUpdateSchema,
} from "../contracts";

type VisionSettingsBindings = RouterRuntimeBindings & {
  ROUTER_DB: NonNullable<RouterRuntimeBindings["ROUTER_DB"]>;
};

async function loadGatewayInfos(args: {
  auth: AuthResult;
  bindings: VisionSettingsBindings;
}) {
  const rows = await loadGatewaysWithMigration({
    db: args.bindings.ROUTER_DB,
    userId: args.auth.userId,
    upstreamBaseUrl: args.auth.upstreamBaseUrl ?? null,
    upstreamApiKeyEnc: args.auth.upstreamApiKeyEnc ?? null,
    customCatalogJson: args.auth.customCatalog ? JSON.stringify(args.auth.customCatalog) : null,
  });
  return rows.map(gatewayRowToInfo);
}

export async function handleGetVisionSettings(args: {
  auth: AuthResult;
  bindings: VisionSettingsBindings;
}): Promise<Response> {
  const [settings, gateways] = await Promise.all([
    getUserVisionSettings(args.bindings.ROUTER_DB, args.auth.userId),
    loadGatewayInfos(args),
  ]);

  const response: VisionSettingsResponse = {
    settings: settings
      ? {
          gateway_id: settings.gatewayId,
          model_id: settings.modelId,
          default_mode: settings.defaultMode,
          updated_at: settings.updatedAt,
        }
      : null,
    vision_models: collectVisionModelOptions(gateways).map((option) => ({
      gateway_id: option.gatewayId,
      gateway_name: option.gatewayName,
      model_id: option.model.id,
      name: option.model.name,
      modality: option.model.modality,
    })),
  };

  return json(response);
}

export async function handleUpdateVisionSettings(args: {
  auth: AuthResult;
  bindings: VisionSettingsBindings;
  request: Request;
}): Promise<Response> {
  let body: unknown;
  try {
    body = await args.request.json();
  } catch {
    return json({ error: "Invalid JSON body." }, 400);
  }

  const parsed = visionSettingsUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return json({ error: "Invalid payload.", issues: parsed.error.issues }, 400);
  }

  const gateways = await loadGatewayInfos(args);
  const gateway = gateways.find((entry) => entry.id === parsed.data.gateway_id);
  if (!gateway) {
    return json({ error: "Gateway not found." }, 404);
  }

  const model = gateway.models.find((entry) => entry.id === parsed.data.model_id);
  if (!model) {
    return json({ error: "Model not found in selected gateway." }, 400);
  }

  if (!modelSupportsVisionInput(model)) {
    return json({ error: "Selected model does not advertise image input support." }, 400);
  }

  const settings = await upsertUserVisionSettings({
    db: args.bindings.ROUTER_DB,
    userId: args.auth.userId,
    gatewayId: parsed.data.gateway_id,
    modelId: parsed.data.model_id,
    defaultMode: normalizeVisionMode(parsed.data.default_mode),
  });

  const response: VisionSettingsResponse = {
    settings: {
      gateway_id: settings.gatewayId,
      model_id: settings.modelId,
      default_mode: settings.defaultMode,
      updated_at: settings.updatedAt,
    },
    vision_models: collectVisionModelOptions(gateways).map((option) => ({
      gateway_id: option.gatewayId,
      gateway_name: option.gatewayName,
      model_id: option.model.id,
      name: option.model.name,
      modality: option.model.modality,
    })),
  };

  return json(response);
}
