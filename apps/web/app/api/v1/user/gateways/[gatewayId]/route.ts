import {
  encryptByokSecret,
  resolveByokEncryptionSecret,
  withCsrf,
  withSessionAuth,
} from "@/src/lib/auth";
import { json } from "@/src/lib/infra";
import {
  deleteUserGateway,
  gatewayRowToInfo,
  getUserGateway,
  updateUserGateway,
} from "@/src/lib/storage";
import { updateGatewaySchema } from "@/src/lib/schemas";
import {
  getUpstreamBaseUrlValidationError,
  resolveUpstreamHostPolicy,
  validateUpstreamBaseUrl,
} from "@/src/lib/upstream";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ gatewayId: string }> }
): Promise<Response> {
  return withSessionAuth(request, async (auth, bindings) => {
    const { gatewayId } = await params;
    const row = await getUserGateway(bindings.ROUTER_DB!, auth.userId, gatewayId);
    if (!row) return json({ error: "Not found." }, 404);
    return json({ gateway: gatewayRowToInfo(row) });
  });
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ gatewayId: string }> }
): Promise<Response> {
  return withSessionAuth(request, async (auth, bindings) => {
    return withCsrf(request, async () => {
      const { gatewayId } = await params;

      let body: unknown;
      try {
        body = await request.json();
      } catch {
        return json({ error: "Invalid JSON body." }, 400);
      }

      const parsed = updateGatewaySchema.safeParse(body);
      if (!parsed.success) {
        return json({ error: "Invalid payload.", issues: parsed.error.issues }, 400);
      }

      const updateArgs: Parameters<typeof updateUserGateway>[0] = {
        db: bindings.ROUTER_DB!,
        id: gatewayId,
        userId: auth.userId,
      };

      if (parsed.data.name !== undefined) {
        updateArgs.name = parsed.data.name;
      }

      if (parsed.data.baseUrl !== undefined) {
        const baseUrlValidation = validateUpstreamBaseUrl(
          parsed.data.baseUrl,
          resolveUpstreamHostPolicy(bindings),
        );
        if (!baseUrlValidation.ok) {
          return json(
            { error: getUpstreamBaseUrlValidationError({ fieldLabel: "baseUrl", result: baseUrlValidation }) },
            400
          );
        }
        updateArgs.baseUrl = baseUrlValidation.normalized;
      }

      if (parsed.data.apiKey !== undefined) {
        const byokSecret = resolveByokEncryptionSecret({
          byokSecret: bindings.BYOK_ENCRYPTION_SECRET ?? null,
        });
        if (!byokSecret) {
          return json({ error: "Server misconfigured: missing BYOK encryption secret." }, 500);
        }
        updateArgs.apiKeyEnc = await encryptByokSecret({
          plaintext: parsed.data.apiKey,
          secret: byokSecret,
        });
      }

      if (parsed.data.models !== undefined) {
        updateArgs.models = parsed.data.models;
      }

      const result = await updateUserGateway(updateArgs);
      if (!result.found) return json({ error: "Not found." }, 404);

      const row = await getUserGateway(bindings.ROUTER_DB!, auth.userId, gatewayId);
      return json({ gateway: row ? gatewayRowToInfo(row) : { id: gatewayId } });
    });
  });
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ gatewayId: string }> }
): Promise<Response> {
  return withSessionAuth(request, async (auth, bindings) => {
    return withCsrf(request, async () => {
      const { gatewayId } = await params;
      const result = await deleteUserGateway({
        db: bindings.ROUTER_DB!,
        id: gatewayId,
        userId: auth.userId,
      });
      if (!result.found) return json({ error: "Not found." }, 404);
      return new Response(null, { status: 204 });
    });
  });
}
