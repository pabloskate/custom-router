import { json } from "@/src/lib/http";
import { authenticateSession } from "@/src/lib/auth";
import { getRuntimeBindings } from "@/src/lib/runtime";
import { isSameOriginRequest } from "@/src/lib/csrf";
import { routerProfileSchema } from "@/src/lib/schemas";
import { gatewayRowToPublic, loadGatewaysWithMigration } from "@/src/lib/gateway-store";
import { encryptByokSecret, resolveByokEncryptionSecret } from "@/src/lib/byok-crypto";
import { normalizeAndValidateUpstreamBaseUrl } from "@/src/lib/upstream";
import { getUserUpstreamCredentials, upsertUserUpstreamCredentials } from "@/src/lib/user-upstream-store";
import { z } from "zod";

function hasOwn(body: Record<string, unknown>, key: string): boolean {
    return Object.prototype.hasOwnProperty.call(body, key);
}

export async function GET(request: Request): Promise<Response> {
    const bindings = getRuntimeBindings();
    if (!bindings.ROUTER_DB) {
        return json({ error: "Server misconfigured." }, 500);
    }

    const auth = await authenticateSession(request, bindings.ROUTER_DB);
    if (!auth) {
        return json({ error: "Unauthorized." }, 401);
    }

    return json({
        user: {
            id: auth.userId,
            name: auth.userName,
            preferredModels: auth.preferredModels,
            defaultModel: auth.defaultModel,
            classifierModel: auth.classifierModel,
            routingInstructions: auth.routingInstructions,
            blocklist: auth.blocklist,
            customCatalog: auth.customCatalog,
            profiles: auth.profiles,
            showModelInResponse: auth.showModelInResponse,
            configAgentEnabled: auth.configAgentEnabled,
            configAgentOrchestratorModel: auth.configAgentOrchestratorModel,
            configAgentSearchModel: auth.configAgentSearchModel,
        }
    });
}

export async function PUT(request: Request): Promise<Response> {
    const bindings = getRuntimeBindings();
    if (!bindings.ROUTER_DB) {
        return json({ error: "Server misconfigured." }, 500);
    }

    if (!isSameOriginRequest(request)) {
        return json({ error: "Invalid origin." }, 403);
    }

    const auth = await authenticateSession(request, bindings.ROUTER_DB);
    if (!auth) {
        return json({ error: "Unauthorized." }, 401);
    }

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
    const showModelInResponse = body.show_model_in_response === true;
    const configAgentEnabled = body.config_agent_enabled === true;
    const configAgentOrchestratorModel =
        typeof body.config_agent_orchestrator_model === "string" && body.config_agent_orchestrator_model.trim().length > 0
            ? body.config_agent_orchestrator_model.trim()
            : null;
    const configAgentSearchModel =
        typeof body.config_agent_search_model === "string" && body.config_agent_search_model.trim().length > 0
            ? body.config_agent_search_model.trim()
            : null;
    const clearClassifierApiKey = body.clear_classifier_api_key === true;

    // Validate and sanitise profiles array
    const profilesParsed = Array.isArray(body.profiles)
        ? z.array(routerProfileSchema).safeParse(body.profiles)
        : null;
    const profiles = profilesParsed?.success ? profilesParsed.data : null;

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
    const gatewayRows = await loadGatewaysWithMigration({
        db: bindings.ROUTER_DB,
        userId: auth.userId,
        upstreamBaseUrl: existingCredentials?.upstream_base_url ?? null,
        upstreamApiKeyEnc: existingCredentials?.upstream_api_key_enc ?? null,
        customCatalogJson: customCatalog
            ? JSON.stringify(customCatalog)
            : auth.customCatalog
                ? JSON.stringify(auth.customCatalog)
                : null,
    }).then((rows) => rows.map(gatewayRowToPublic));
    const gatewayModelIds = new Set(
        gatewayRows.flatMap((gateway) =>
            gateway.models
                .map((model) => model.id)
                .filter((modelId): modelId is string => typeof modelId === "string" && modelId.trim().length > 0)
        )
    );

    if (configAgentOrchestratorModel && !gatewayModelIds.has(configAgentOrchestratorModel)) {
        return json(
            { error: `Invalid config_agent_orchestrator_model. "${configAgentOrchestratorModel}" is not in your effective gateway catalog.` },
            400
        );
    }

    if (configAgentSearchModel && !gatewayModelIds.has(configAgentSearchModel)) {
        return json(
            { error: `Invalid config_agent_search_model. "${configAgentSearchModel}" is not in your effective gateway catalog.` },
            400
        );
    }

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
                 show_model_in_response = ?8,
                 config_agent_enabled = ?9,
                 config_agent_orchestrator_model = ?10,
                 config_agent_search_model = ?11,
                 updated_at = ?12
             WHERE id = ?13`
        )
        .bind(
            preferredModels.length > 0 ? JSON.stringify(preferredModels) : null,
            blocklist.length > 0 ? JSON.stringify(blocklist) : null,
            defaultModel,
            classifierModel,
            routingInstructions,
            customCatalog ? JSON.stringify(customCatalog) : null,
            profiles ? JSON.stringify(profiles) : null,
            showModelInResponse ? 1 : 0,
            configAgentEnabled ? 1 : 0,
            configAgentOrchestratorModel,
            configAgentSearchModel,
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
}
