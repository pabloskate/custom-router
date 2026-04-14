import {
  encryptByokSecret,
  resolveByokEncryptionSecret,
  withCsrf,
  withSessionAuth,
} from "@/src/lib/auth";
import { json } from "@/src/lib/infra";
import {
  generateGatewayId,
  gatewayRowToInfo,
  getUserGateways,
  insertUserGateway,
  loadGatewaysWithMigration,
} from "@/src/lib/storage";
import { createGatewaySchema } from "@/src/lib/schemas";
import {
  getUpstreamBaseUrlValidationError,
  resolveUpstreamHostPolicy,
  validateUpstreamBaseUrl,
} from "@/src/lib/upstream";

export async function GET(request: Request): Promise<Response> {
  return withSessionAuth(request, async (auth, bindings) => {
    const gateways = await loadGatewaysWithMigration({
      db: bindings.ROUTER_DB!,
      userId: auth.userId,
      upstreamBaseUrl: auth.upstreamBaseUrl ?? null,
      upstreamApiKeyEnc: auth.upstreamApiKeyEnc ?? null,
      customCatalogJson: auth.customCatalog ? JSON.stringify(auth.customCatalog) : null,
    });
    return json({ gateways: gateways.map(gatewayRowToInfo) });
  });
}

export async function POST(request: Request): Promise<Response> {
  return withSessionAuth(request, async (auth, bindings) => {
    return withCsrf(request, async () => {
      let body: unknown;
      try {
        body = await request.json();
      } catch {
        return json({ error: "Invalid JSON body." }, 400);
      }

      const parsed = createGatewaySchema.safeParse(body);
      if (!parsed.success) {
        return json({ error: "Invalid payload.", issues: parsed.error.issues }, 400);
      }

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

      const byokSecret = resolveByokEncryptionSecret({
        byokSecret: bindings.BYOK_ENCRYPTION_SECRET ?? null,
      });
      if (!byokSecret) {
        return json({ error: "Server misconfigured: missing BYOK encryption secret." }, 500);
      }

      const apiKeyEnc = await encryptByokSecret({
        plaintext: parsed.data.apiKey,
        secret: byokSecret,
      });

      const id = generateGatewayId();
      await insertUserGateway({
        db: bindings.ROUTER_DB!,
        id,
        userId: auth.userId,
        name: parsed.data.name,
        baseUrl: baseUrlValidation.normalized,
        apiKeyEnc,
      });

      const rows = await getUserGateways(bindings.ROUTER_DB!, auth.userId);
      const row = rows.find((r) => r.id === id);
      return json({
        gateway: row ? gatewayRowToInfo(row) : { id, name: parsed.data.name, baseUrl: baseUrlValidation.normalized },
      }, 201);
    });
  });
}
