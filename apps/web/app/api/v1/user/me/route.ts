import {
    encryptByokSecret,
    getUserUpstreamCredentials,
    resolveByokEncryptionSecret,
    upsertUserUpstreamCredentials,
    withCsrf,
    withSessionAuth,
} from "@/src/lib/auth";
import { json } from "@/src/lib/infra";
import { AUTO_PROFILE_ID, AUTO_PROFILE_NAME, mergeLegacyRoutingInstructions } from "@/src/lib/routing/profile-config";
import { routerProfileSchema } from "@/src/lib/schemas";
import { normalizeAndValidateUpstreamBaseUrl } from "@/src/lib/upstream";
import { z } from "zod";

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

function sanitizeOptionalStringArray(values: string[] | undefined): string[] | undefined {
    if (!Array.isArray(values)) {
        return undefined;
    }

    const sanitized = values
        .map((value) => value.trim())
        .filter((value) => value.length > 0);

    return sanitized.length > 0 ? sanitized : undefined;
}

function sanitizeRouterProfile(profile: z.infer<typeof routerProfileSchema>): z.infer<typeof routerProfileSchema> {
    return {
        ...profile,
        description: sanitizeOptionalString(profile.description),
        defaultModel: sanitizeOptionalString(profile.defaultModel),
        classifierModel: sanitizeOptionalString(profile.classifierModel),
        routingInstructions: sanitizeOptionalString(profile.routingInstructions),
        blocklist: sanitizeOptionalStringArray(profile.blocklist),
        catalogFilter: sanitizeOptionalStringArray(profile.catalogFilter),
    };
}

function upsertAutoProfileRoutingInstructions(args: {
    profiles: z.infer<typeof routerProfileSchema>[] | null;
    routingInstructions: string | null;
}): z.infer<typeof routerProfileSchema>[] | null {
    const trimmedInstructions = sanitizeOptionalString(args.routingInstructions);
    const profilesWithAuto = mergeLegacyRoutingInstructions({
        profiles: args.profiles,
        routingInstructions: trimmedInstructions,
    });

    if (!profilesWithAuto) {
        return null;
    }

    if (!trimmedInstructions) {
        return profilesWithAuto.map((profile) =>
            profile.id === AUTO_PROFILE_ID
                ? { ...profile, routingInstructions: undefined, name: sanitizeOptionalString(profile.name) ?? AUTO_PROFILE_NAME }
                : profile
        );
    }

    return profilesWithAuto.map((profile) =>
        profile.id === AUTO_PROFILE_ID
            ? {
                ...profile,
                name: sanitizeOptionalString(profile.name) ?? AUTO_PROFILE_NAME,
                routingInstructions: trimmedInstructions,
            }
            : profile
    );
}

export async function GET(request: Request): Promise<Response> {
    return withSessionAuth(request, async (auth) => {
        return json({
            user: {
                id: auth.userId,
                name: auth.userName,
                preferredModels: auth.preferredModels,
                defaultModel: auth.defaultModel,
                classifierModel: auth.classifierModel,
                blocklist: auth.blocklist,
                customCatalog: auth.customCatalog,
                profiles: auth.profiles,
                routeTriggerKeywords: auth.routeTriggerKeywords,
                routingFrequency: auth.routingFrequency,
            }
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

            const preferredModels = Array.isArray(body.preferred_models) ? body.preferred_models : [];
            const blocklist = Array.isArray(body.blocklist) ? body.blocklist : [];
            const defaultModel = typeof body.default_model === "string" ? body.default_model : null;
            const classifierModel = typeof body.classifier_model === "string" ? body.classifier_model : null;
            const routingInstructions = typeof body.routing_instructions === "string" ? body.routing_instructions : null;
            const customCatalog = Array.isArray(body.custom_catalog) ? body.custom_catalog : null;
            const routeTriggerKeywords = Array.isArray(body.route_trigger_keywords)
                ? (body.route_trigger_keywords as unknown[]).filter((v): v is string => typeof v === "string" && v.trim().length > 0)
                : null;
            const validFrequencies = ["every_message", "smart", "new_thread_only"];
            const routingFrequency = typeof body.routing_frequency === "string" && validFrequencies.includes(body.routing_frequency)
                ? body.routing_frequency
                : null;
            const clearClassifierApiKey = body.clear_classifier_api_key === true;

            const profilesParsed = Array.isArray(body.profiles)
                ? z.array(routerProfileSchema).safeParse(body.profiles)
                : null;
            let profiles = profilesParsed?.success ? profilesParsed.data.map(sanitizeRouterProfile) : null;
            profiles = upsertAutoProfileRoutingInstructions({
                profiles,
                routingInstructions,
            });

            if (profiles !== null) {
                const hasAuto = profiles.some((p: { id: string }) => p.id === "auto");
                if (!hasAuto) {
                    return json(
                        { error: "Profiles must include the required 'auto' profile. It cannot be removed or renamed." },
                        400
                    );
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
                            400
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
            await bindings.ROUTER_DB
                .prepare(
                    `UPDATE users
                     SET preferred_models = ?1,
                         blocklist = ?2,
                         default_model = ?3,
                         classifier_model = ?4,
                         routing_instructions = ?5,
                         custom_catalog = ?6,
                         profiles = ?7,
                         route_trigger_keywords = ?8,
                         routing_frequency = ?9,
                         updated_at = ?10
                     WHERE id = ?11`
                )
                .bind(
                    preferredModels.length > 0 ? JSON.stringify(preferredModels) : null,
                    blocklist.length > 0 ? JSON.stringify(blocklist) : null,
                    defaultModel,
                    classifierModel,
                    null,
                    customCatalog ? JSON.stringify(customCatalog) : null,
                    profiles ? JSON.stringify(profiles) : null,
                    routeTriggerKeywords && routeTriggerKeywords.length > 0 ? JSON.stringify(routeTriggerKeywords) : null,
                    routingFrequency,
                    now,
                    auth.userId
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
