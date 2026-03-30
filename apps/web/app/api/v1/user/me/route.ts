import {
  encryptByokSecret,
  getUserUpstreamCredentials,
  hasUsersRouteLoggingEnabledColumn,
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
const STALE_SETTINGS_MESSAGE =
  "These settings changed in another tab or session. Reload the latest settings and try again.";

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
      upstreamModelId: sanitizeOptionalString(model.upstreamModelId),
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
        updatedAt: auth.updatedAt,
        preferredModels: auth.preferredModels,
        customCatalog: auth.customCatalog,
        profiles: auth.profiles,
        routeTriggerKeywords: auth.routeTriggerKeywords,
        routingFrequency: auth.routingFrequency,
        routeLoggingEnabled: auth.routeLoggingEnabled,
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

      const expectedUpdatedAt = typeof body.expected_updated_at === "string" ? body.expected_updated_at.trim() : "";
      if (expectedUpdatedAt.length === 0) {
        return json({ error: "Missing expected_updated_at." }, 400);
      }

      if (expectedUpdatedAt !== auth.updatedAt) {
        return json({ error: STALE_SETTINGS_MESSAGE }, 409);
      }

      let preferredModels: unknown[] | undefined;
      if (hasOwn(body, "preferred_models")) {
        if (!Array.isArray(body.preferred_models)) {
          return json({ error: "Invalid preferred_models payload." }, 400);
        }
        preferredModels = body.preferred_models;
      }

      let routeTriggerKeywords: string[] | null | undefined;
      if (hasOwn(body, "route_trigger_keywords")) {
        if (body.route_trigger_keywords !== null && !Array.isArray(body.route_trigger_keywords)) {
          return json({ error: "Invalid route_trigger_keywords payload." }, 400);
        }
        routeTriggerKeywords = Array.isArray(body.route_trigger_keywords)
          ? (body.route_trigger_keywords as unknown[]).filter((value): value is string => typeof value === "string" && value.trim().length > 0)
          : null;
      }
      const validFrequencies = ["every_message", "smart", "new_thread_only"];
      let routingFrequency: string | null | undefined;
      if (hasOwn(body, "routing_frequency")) {
        if (body.routing_frequency !== null && typeof body.routing_frequency !== "string") {
          return json({ error: "Invalid routing_frequency payload." }, 400);
        }
        if (typeof body.routing_frequency === "string" && !validFrequencies.includes(body.routing_frequency)) {
          return json({ error: "Invalid routing_frequency payload." }, 400);
        }
        routingFrequency = typeof body.routing_frequency === "string" ? body.routing_frequency : null;
      }
      let routeLoggingEnabled: boolean | undefined;
      if (hasOwn(body, "route_logging_enabled")) {
        if (typeof body.route_logging_enabled !== "boolean") {
          return json({ error: "Invalid route_logging_enabled payload." }, 400);
        }
        routeLoggingEnabled = body.route_logging_enabled;
      }
      const clearClassifierApiKey = body.clear_classifier_api_key === true;
      const profilesProvided = hasOwn(body, "profiles");

      const profilesParsed = profilesProvided
        ? z.array(routerProfileSchema).safeParse(body.profiles)
        : null;

      if (profilesProvided && !profilesParsed?.success) {
        return json({ error: "Invalid profiles payload.", issues: profilesParsed?.error.issues ?? [] }, 400);
      }

      const profiles = profilesProvided && profilesParsed?.success
        ? normalizeProfiles(profilesParsed.data.map(sanitizeRouterProfile))
        : undefined;
      if (profiles) {
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

      const routeLoggingColumnAvailable = await hasUsersRouteLoggingEnabledColumn(bindings.ROUTER_DB);
      const now = new Date().toISOString();
      const touchesCredentials =
        hasOwn(body, "classifier_base_url") || hasOwn(body, "classifier_api_key") || clearClassifierApiKey;
      const touchesRoutingFields =
        profiles !== undefined || routeTriggerKeywords !== undefined || routingFrequency !== undefined;
      const userSetClauses: string[] = [];
      const userBindArgs: unknown[] = [];
      const bindValue = (value: unknown) => {
        userBindArgs.push(value);
        return `?${userBindArgs.length}`;
      };

      if (preferredModels !== undefined) {
        userSetClauses.push(`preferred_models = ${bindValue(preferredModels.length > 0 ? JSON.stringify(preferredModels) : null)}`);
      }

      if (touchesRoutingFields) {
        userSetClauses.push("blocklist = NULL");
        userSetClauses.push("default_model = NULL");
        userSetClauses.push("classifier_model = NULL");
        userSetClauses.push("routing_instructions = NULL");
      }

      if (profiles !== undefined) {
        userSetClauses.push(`profiles = ${bindValue(JSON.stringify(profiles))}`);
      }

      if (routeTriggerKeywords !== undefined) {
        userSetClauses.push(
          `route_trigger_keywords = ${bindValue(
            routeTriggerKeywords && routeTriggerKeywords.length > 0 ? JSON.stringify(routeTriggerKeywords) : null,
          )}`,
        );
      }

      if (routingFrequency !== undefined) {
        userSetClauses.push(`routing_frequency = ${bindValue(routingFrequency)}`);
      }

      if (routeLoggingEnabled !== undefined && routeLoggingColumnAvailable) {
        userSetClauses.push(`route_logging_enabled = ${bindValue(routeLoggingEnabled ? 1 : 0)}`);
      }

      if (userSetClauses.length > 0 || touchesCredentials) {
        userSetClauses.push(`updated_at = ${bindValue(now)}`);
        const updateSql = `UPDATE users
               SET ${userSetClauses.join(", ")}
               WHERE id = ${bindValue(auth.userId)} AND updated_at = ${bindValue(expectedUpdatedAt)}`;
        const updateResult = await bindings.ROUTER_DB.prepare(updateSql).bind(...userBindArgs).run();
        if ((updateResult.meta?.changes ?? 0) === 0) {
          return json({ error: STALE_SETTINGS_MESSAGE }, 409);
        }
      }

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
