import {
    createInviteCode,
    listInviteCodes,
    revokeInviteCode,
    withCsrf,
    withSessionAuth,
} from "@/src/lib/auth";
import { json, jsonNoStore } from "@/src/lib/infra";

export async function GET(request: Request): Promise<Response> {
    return withSessionAuth(request, async (auth, bindings) => {
        const invites = await listInviteCodes(bindings.ROUTER_DB, auth.userId);

        return json({
            invites: invites.map((inv) => ({
                id: inv.id,
                code: inv.code,
                usesRemaining: inv.usesRemaining,
                expiresAt: inv.expiresAt,
                createdAt: inv.createdAt,
            })),
        });
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

            const uses = typeof body.uses === "number" && body.uses > 0 ? body.uses : undefined;
            const expiresInHours =
                typeof body.expires_in_hours === "number" && body.expires_in_hours > 0
                    ? body.expires_in_hours
                    : undefined;

            const invite = await createInviteCode(bindings.ROUTER_DB, {
                createdBy: auth.userId,
                uses,
                expiresInMs: expiresInHours ? expiresInHours * 60 * 60 * 1000 : undefined,
            });

            return jsonNoStore(
                {
                    invite: {
                        id: invite.id,
                        code: invite.code,
                        usesRemaining: invite.usesRemaining,
                        expiresAt: invite.expiresAt,
                        createdAt: invite.createdAt,
                    },
                },
                201
            );
        });
    });
}

export async function DELETE(request: Request): Promise<Response> {
    return withSessionAuth(request, async (auth, bindings) => {
        return withCsrf(request, async () => {
            const url = new URL(request.url);
            const codeId = url.searchParams.get("codeId");

            if (!codeId) {
                return json({ error: "codeId query parameter is required." }, 400);
            }

            await revokeInviteCode(bindings.ROUTER_DB, codeId, auth.userId);

            return json({ ok: true });
        });
    });
}
