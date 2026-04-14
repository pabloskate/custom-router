import { decryptByokSecret, resolveByokEncryptionSecret, withSessionAuth } from "@/src/lib/auth";
import { json } from "@/src/lib/infra";
import { getUserGateway } from "@/src/lib/storage";
import { getUpstreamBaseUrlValidationError, resolveUpstreamHostPolicy, validateUpstreamBaseUrl } from "@/src/lib/upstream";

interface OpenAIModel {
  id: string;
  name?: string;
  object?: string;
  created?: number;
  owned_by?: string;
  architecture?: {
    modality?: string;
    input_modalities?: unknown[];
    output_modalities?: unknown[];
  };
}

interface OpenAIModelsResponse {
  object?: string;
  data?: OpenAIModel[];
  models?: OpenAIModel[];
}

function normalizeModalityTokens(values: unknown[] | undefined): string[] {
  if (!Array.isArray(values)) {
    return [];
  }

  return values
    .filter((value): value is string => typeof value === "string")
    .map((value) => value.trim().toLowerCase())
    .filter((value) => value.length > 0);
}

function deriveModelModality(model: OpenAIModel): string | undefined {
  const explicitModality = model.architecture?.modality?.trim();
  if (explicitModality) {
    return explicitModality.replace(/\+/g, ",").toLowerCase();
  }

  const inputModalities = normalizeModalityTokens(model.architecture?.input_modalities);
  const outputModalities = normalizeModalityTokens(model.architecture?.output_modalities);

  if (inputModalities.length === 0 && outputModalities.length === 0) {
    return undefined;
  }

  const inputSegment = inputModalities.join(",");
  const outputSegment = outputModalities.join(",");

  if (!inputSegment) {
    return outputSegment || undefined;
  }

  return outputSegment ? `${inputSegment}->${outputSegment}` : inputSegment;
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ gatewayId: string }> }
): Promise<Response> {
  return withSessionAuth(request, async (auth, bindings) => {
    const { gatewayId } = await params;

    const row = await getUserGateway(bindings.ROUTER_DB!, auth.userId, gatewayId);
    if (!row) return json({ error: "Not found." }, 404);

    const baseUrlValidation = validateUpstreamBaseUrl(row.base_url, resolveUpstreamHostPolicy(bindings));
    if (!baseUrlValidation.ok) {
      return json(
        { error: getUpstreamBaseUrlValidationError({ fieldLabel: "gateway baseUrl", result: baseUrlValidation }) },
        400
      );
    }

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
      upstreamResponse = await fetch(`${baseUrlValidation.normalized}/models`, {
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
      .map((m) => ({
        id: m.id,
        name: m.id,
        modality: deriveModelModality(m),
      }))
      .sort((a, b) => a.id.localeCompare(b.id));

    return json({ models });
  });
}
