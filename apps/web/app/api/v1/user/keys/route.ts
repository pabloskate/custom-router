import { generateApiKey, hashKey, withCsrf, withSessionAuth } from "@/src/lib/auth";
import { json, jsonNoStore } from "@/src/lib/infra";

export async function GET(request: Request): Promise<Response> {
    return withSessionAuth(request, async (auth, bindings) => {
        const { results } = await bindings.ROUTER_DB
            .prepare("SELECT id, key_prefix, label, revoked_at, created_at FROM api_keys WHERE user_id = ?1 ORDER BY created_at DESC")
            .bind(auth.userId)
            .all<{ id: string; key_prefix: string; label: string | null; revoked_at: string | null; created_at: string }>();

        return json({
            keys: results.map((k) => ({
                id: k.id,
                prefix: k.key_prefix,
                label: k.label,
                revoked: !!k.revoked_at,
                revokedAt: k.revoked_at,
                createdAt: k.created_at
            }))
        }, 200);
    });
}

export async function POST(request: Request): Promise<Response> {
    return withSessionAuth(request, async (auth, bindings) => {
        return withCsrf(request, async () => {
            let body: Record<string, unknown> = {};
            try {
                body = (await request.json()) as Record<string, unknown>;
            } catch {
                // optional body
            }

            const keyData = generateApiKey();
            keyData.hash = await hashKey(keyData.raw);
            const keyId = crypto.randomUUID();
            const now = new Date().toISOString();

            if (body.rotate === true) {
                await bindings.ROUTER_DB
                    .prepare("UPDATE api_keys SET revoked_at = ?1 WHERE user_id = ?2 AND revoked_at IS NULL")
                    .bind(now, auth.userId)
                    .run();
            }

            await bindings.ROUTER_DB
                .prepare("INSERT INTO api_keys (id, user_id, key_hash, key_prefix, label, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6)")
                .bind(
                    keyId,
                    auth.userId,
                    keyData.hash,
                    keyData.prefix,
                    typeof body.label === "string" ? body.label : "default",
                    now
                )
                .run();

            return jsonNoStore({
                apiKey: keyData.raw,
                apiKeyPrefix: keyData.prefix,
                keyId,
                rotated: body.rotate === true,
                note: "Save this API key — it will not be shown again."
            }, 201);
        });
    });
}

export async function DELETE(request: Request): Promise<Response> {
    return withSessionAuth(request, async (auth, bindings) => {
        return withCsrf(request, async () => {
            const url = new URL(request.url);
            const keyId = url.searchParams.get("keyId");
            const action = url.searchParams.get("action");

            if (!keyId) {
                return json({ error: "keyId query parameter is required." }, 400);
            }

            if (action === "delete") {
                await bindings.ROUTER_DB
                    .prepare("DELETE FROM api_keys WHERE id = ?1 AND user_id = ?2")
                    .bind(keyId, auth.userId)
                    .run();

                return json({ ok: true }, 200);
            }

            const now = new Date().toISOString();
            await bindings.ROUTER_DB
                .prepare("UPDATE api_keys SET revoked_at = ?1 WHERE id = ?2 AND user_id = ?3 AND revoked_at IS NULL")
                .bind(now, keyId, auth.userId)
                .run();

            return json({ ok: true }, 200);
        });
    });
}
