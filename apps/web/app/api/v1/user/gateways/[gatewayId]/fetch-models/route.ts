import { json } from "@/src/lib/http";
import { withSessionAuth } from "@/src/lib/route-helpers";
import { decryptByokSecret, resolveByokEncryptionSecret } from "@/src/lib/byok-crypto";
import { getUserGateway } from "@/src/lib/gateway-store";

interface OpenAIModel {
  id: string;
  object?: string;
  created?: number;
  owned_by?: string;
}

interface OpenAIModelsResponse {
  object?: string;
  data?: OpenAIModel[];
  models?: OpenAIModel[];
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ gatewayId: string }> }
): Promise<Response> {
  return withSessionAuth(request, async (auth, bindings) => {
    const { gatewayId } = await params;

    const row = await getUserGateway(bindings.ROUTER_DB!, auth.userId, gatewayId);
    if (!row) return json({ error: "Not found." }, 404);

    const byokSecret = resolveByokEncryptionSecret({
      byokSecret: bindings.BYOK_ENCRYPTION_SECRET ?? null,
    });
    if (!byokSecret) {
      return json({ error: "Server misconfigured: missing BYOK encryption secret." }, 500);
    }

    const apiKey = await decryptByokSecret({
      ciphertext: row.api_key_enc,
      secret: byokSecret,
    });
    if (!apiKey) {
      return json({ error: "Gateway key cannot be decrypted. Re-save the gateway to fix this." }, 500);
    }

    // Proxy the /models request to the gateway
    let upstreamResponse: Response;
    try {
      upstreamResponse = await fetch(`${row.base_url}/models`, {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
      });
    } catch (err) {
      return json(
        { error: `Failed to reach gateway: ${err instanceof Error ? err.message : String(err)}` },
        502
      );
    }

    if (!upstreamResponse.ok) {
      return json(
        { error: `Gateway returned ${upstreamResponse.status}. Upstream details were redacted.` },
        upstreamResponse.status >= 400 && upstreamResponse.status < 500 ? 400 : 502
      );
    }

    let data: OpenAIModelsResponse;
    try {
      data = (await upstreamResponse.json()) as OpenAIModelsResponse;
    } catch {
      return json({ error: "Gateway returned non-JSON response for /models." }, 502);
    }

    // Normalise: support both { data: [...] } and { models: [...] } and bare arrays
    const rawModels: OpenAIModel[] = Array.isArray(data)
      ? (data as OpenAIModel[])
      : Array.isArray(data.data)
        ? data.data
        : Array.isArray(data.models)
          ? data.models
          : [];

    const models = rawModels
      .filter((m) => m.id)
      .map((m) => ({ id: m.id, name: m.id }))  // name defaults to id; user can rename in UI
      .sort((a, b) => a.id.localeCompare(b.id));

    return json({ models });
  });
}
