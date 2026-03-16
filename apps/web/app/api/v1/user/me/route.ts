import {
  encryptByokSecret,
  getUserUpstreamCredentials,
  resolveByokEncryptionSecret,
  upsertUserUpstreamCredentials,
  withCsrf,
  withSessionAuth,
} from "@/src/lib/auth";
import { json } from "@/src/lib/infra";
import {
  getProfileIdValidationError,
  normalizeProfiles,
  normalizeProfile,
  normalizeProfileModel,
} from "@/src/lib/routing/profile-config";
import { routerProfileSchema } from "@/src/lib/schemas";
import { normalizeAndValidateUpstreamBaseUrl } from "@/src/lib/upstream";
import { gatewayRowToInfo, loadGatewaysWithMigration } from "@/src/lib/storage";
import { z } from "zod";

const LEGACY_ROUTING_RESET_MESSAGE =
  "Legacy routing settings were detected. Rebuild your routing profiles from scratch to continue.";

function hasOwn(body: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(body, key);
}

function sanitizeOptionalString(value: string | null | undefined): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function sanitizeRouterProfile(profile: z.infer<typeof routerProfileSchema>): z.infer<typeof routerProfileSchema> {
  const normalized = normalizeProfile(profile);

  return {
    ...normalized,
    models: (normalized.models ?? []).map((model) => ({
      ...normalizeProfileModel(model),
      modelId: sanitizeOptionalString(model.modelId) ?? "",
      gatewayId: sanitizeOptionalString(model.gatewayId),
      name: sanitizeOptionalString(model.name),
      modality: sanitizeOptionalString(model.modality),
      whenToUse: sanitizeOptionalString(model.whenToUse),
      description: sanitizeOptionalString(model.description),
    })),
  };
}

function hasMeaningfulLegacyRoutingField(body: Record<string, unknown>): boolean {
  if (typeof body.default_model === "string" && body.default_model.trim().length > 0) {
    return true;
  }

  if (typeof body.classifier_model === "string" && body.classifier_model.trim().length > 0) {
    return true;
  }

  if (typeof body.routing_instructions === "string" && body.routing_instructions.trim().length > 0) {
    return true;
  }

  if (Array.isArray(body.blocklist)) {
    return body.blocklist.some((value) => typeof value === "string" && value.trim().length > 0);
  }

  return false;
}

export async function GET(request: Request): Promise<Response> {
  return withSessionAuth(request, async (auth) => {
    return json({
      user: {
        id: auth.userId,
        name: auth.userName,
        preferredModels: auth.preferredModels,
        customCatalog: auth.customCatalog,
        profiles: auth.profiles,
        routeTriggerKeywords: auth.routeTriggerKeywords,
        routingFrequency: auth.routingFrequency,
        routingConfigRequiresReset: auth.routingConfigRequiresReset,
        routingConfigResetMessage: auth.routingConfigRequiresReset ? LEGACY_ROUTING_RESET_MESSAGE : null,
      },
    });
  });
}

export async function PUT(request: Request): Promise<Response> {
  return withSessionAuth(request, async (auth, bindings) => {
    return withCsrf(request, async () => {
      let body: Record<string, unknown>;
      try {
        body = (await request.json()) as Record<string, unknown>;
      } catch {
        return json({ error: "Invalid JSON body." }, 400);
      }

      if (hasMeaningfulLegacyRoutingField(body)) {
        return json(
          { error: "Legacy routing fields are no longer supported. Rebuild routing profiles from the Routing tab." },
          400,
        );
      }

      const preferredModels = Array.isArray(body.preferred_models) ? body.preferred_models : [];
      const routeTriggerKeywords = Array.isArray(body.route_trigger_keywords)
        ? (body.route_trigger_keywords as unknown[]).filter((value): value is string => typeof value === "string" && value.trim().length > 0)
        : null;
      const validFrequencies = ["every_message", "smart", "new_thread_only"];
      const routingFrequency = typeof body.routing_frequency === "string" && validFrequencies.includes(body.routing_frequency)
        ? body.routing_frequency
        : null;
      const clearClassifierApiKey = body.clear_classifier_api_key === true;

      const profilesParsed = Array.isArray(body.profiles)
        ? z.array(routerProfileSchema).safeParse(body.profiles)
        : null;

      if (!profilesParsed?.success) {
        return json({ error: "Invalid profiles payload.", issues: profilesParsed?.error.issues ?? [] }, 400);
      }

      const profiles = normalizeProfiles(profilesParsed.data.map(sanitizeRouterProfile));
      const seenProfileIds = new Set<string>();
      for (const profile of profiles) {
        const profileIdError = getProfileIdValidationError(profile.id);
        if (profileIdError) {
          return json({ error: `Profile "${profile.id || "<empty>"}" is invalid. ${profileIdError}` }, 400);
        }
        if (seenProfileIds.has(profile.id)) {
          return json({ error: `Duplicate profile id "${profile.id}" is not allowed.` }, 400);
        }
        seenProfileIds.add(profile.id);
      }

      const gatewayRows = await loadGatewaysWithMigration({
        db: bindings.ROUTER_DB,
        userId: auth.userId,
        upstreamBaseUrl: auth.upstreamBaseUrl ?? null,
        upstreamApiKeyEnc: auth.upstreamApiKeyEnc ?? null,
        customCatalogJson: auth.customCatalog ? JSON.stringify(auth.customCatalog) : null,
      });
      const validGatewayModelKeys = new Set(
        gatewayRows.flatMap((row) =>
          gatewayRowToInfo(row).models.map((model) => `${row.id}::${model.id}`),
        ),
      );

      for (const profile of profiles) {
        const defaultModel = sanitizeOptionalString(profile.defaultModel);
        const classifierModel = sanitizeOptionalString(profile.classifierModel);
        const resolvedKeys = new Set(
          (profile.models ?? [])
            .filter((model) => sanitizeOptionalString(model.gatewayId) && sanitizeOptionalString(model.modelId))
            .map((model) => `${model.gatewayId}::${model.modelId}`),
        );

        if (defaultModel && !resolvedKeys.has(defaultModel)) {
          return json({ error: `Profile "${profile.id}" has an invalid fallback model selection.` }, 400);
        }

        if (classifierModel && !validGatewayModelKeys.has(classifierModel)) {
          return json({ error: `Profile "${profile.id}" has an invalid router model selection.` }, 400);
        }
      }

      const byokSecret = resolveByokEncryptionSecret({
        byokSecret: bindings.BYOK_ENCRYPTION_SECRET ?? null,
      });
      const classifierApiKeyRaw =
        hasOwn(body, "classifier_api_key") && typeof body.classifier_api_key === "string"
          ? body.classifier_api_key.trim()
          : null;
      if (classifierApiKeyRaw && classifierApiKeyRaw.length > 0 && !byokSecret) {
        return json({ error: "Server misconfigured: missing BYOK encryption secret." }, 500);
      }
      const encryptionSecret = byokSecret ?? "";

      const existingCredentials = await getUserUpstreamCredentials(bindings.ROUTER_DB, auth.userId);

      let classifierBaseUrl = existingCredentials?.classifier_base_url ?? null;
      if (hasOwn(body, "classifier_base_url")) {
        if (body.classifier_base_url !== null && typeof body.classifier_base_url !== "string") {
          return json({ error: "Invalid classifier_base_url." }, 400);
        }

        const candidate = typeof body.classifier_base_url === "string" ? body.classifier_base_url.trim() : "";
        if (candidate.length === 0) {
          classifierBaseUrl = null;
        } else {
          const normalized = normalizeAndValidateUpstreamBaseUrl(candidate);
          if (!normalized) {
            return json(
              { error: "Invalid classifier_base_url. Use an https URL without query/hash/embedded credentials." },
              400,
            );
          }
          classifierBaseUrl = normalized;
        }
      }

      let classifierApiKeyEnc = existingCredentials?.classifier_api_key_enc ?? null;
      if (clearClassifierApiKey) {
        classifierApiKeyEnc = null;
      }
      if (hasOwn(body, "classifier_api_key")) {
        if (body.classifier_api_key !== null && typeof body.classifier_api_key !== "string") {
          return json({ error: "Invalid classifier_api_key." }, 400);
        }
        if (typeof body.classifier_api_key === "string") {
          const candidate = body.classifier_api_key.trim();
          if (candidate.length > 0) {
            classifierApiKeyEnc = await encryptByokSecret({
              plaintext: candidate,
              secret: encryptionSecret,
            });
          }
        } else if (body.classifier_api_key === null) {
          classifierApiKeyEnc = null;
        }
      }

      const now = new Date().toISOString();
      const updateSql = `UPDATE users
             SET preferred_models = ?1,
                 blocklist = NULL,
                 default_model = NULL,
                 classifier_model = NULL,
                 routing_instructions = NULL,
                 profiles = ?2,
                 route_trigger_keywords = ?3,
                 routing_frequency = ?4,
                 updated_at = ?5
             WHERE id = ?6`;
      const updateStatement = bindings.ROUTER_DB.prepare(updateSql);

      await updateStatement
        .bind(
          preferredModels.length > 0 ? JSON.stringify(preferredModels) : null,
          JSON.stringify(profiles),
          routeTriggerKeywords && routeTriggerKeywords.length > 0 ? JSON.stringify(routeTriggerKeywords) : null,
          routingFrequency,
          now,
          auth.userId,
        )
        .run();

      await upsertUserUpstreamCredentials({
        db: bindings.ROUTER_DB,
        userId: auth.userId,
        upstreamBaseUrl: existingCredentials?.upstream_base_url ?? null,
        upstreamApiKeyEnc: existingCredentials?.upstream_api_key_enc ?? null,
        classifierBaseUrl,
        classifierApiKeyEnc,
      });

      return json({ ok: true }, 200);
    });
  });
}
