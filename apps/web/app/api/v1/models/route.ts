import type { CatalogItem } from "@custom-router/core";
import { withApiKeyAuth } from "@/src/lib/auth";
import { json } from "@/src/lib/infra";
import { gatewayRowToPublic, loadGatewaysWithMigration } from "@/src/lib/storage";

interface OpenAiModelEntry {
  id: string;
  object: "model";
  created: number;
  owned_by: string;
}

function ownedByFromModelId(modelId: string): string {
  const slashIndex = modelId.indexOf("/");
  return slashIndex > 0 ? modelId.slice(0, slashIndex) : "custom-router";
}

function pushUniqueModelEntry(
  models: OpenAiModelEntry[],
  seenIds: Set<string>,
  modelId: string,
  ownedBy = ownedByFromModelId(modelId)
): void {
  if (!modelId || seenIds.has(modelId)) {
    return;
  }
  seenIds.add(modelId);
  models.push({
    id: modelId,
    object: "model",
    created: 0,
    owned_by: ownedBy,
  });
}

function profileId(profile: unknown): string | null {
  if (!profile || typeof profile !== "object" || !("id" in profile)) {
    return null;
  }
  const id = (profile as { id?: unknown }).id;
  return typeof id === "string" && id.trim() ? id : null;
}

/**
 * GET /api/v1/models
 *
 * OpenAI-compatible models listing endpoint.
 * Returns the caller-specific catalog in the standard { data: [...] } format
 * so clients like Cursor, Continue, Apollo, etc. can discover available models.
 *
 * Requires API key auth and returns:
 * - named routing profiles (e.g. "cost-optimized", "fast-coding")
 * - flattened model list from all configured user gateways
 */
export async function GET(request: Request): Promise<Response> {
  return withApiKeyAuth(request, async (auth, bindings) => {
    const gatewayRows = await loadGatewaysWithMigration({
      db: bindings.ROUTER_DB!,
      userId: auth.userId,
      upstreamBaseUrl: auth.upstreamBaseUrl ?? null,
      upstreamApiKeyEnc: auth.upstreamApiKeyEnc ?? null,
      customCatalogJson: auth.customCatalog ? JSON.stringify(auth.customCatalog) : null,
    }).then((rows) => rows.map(gatewayRowToPublic)).catch(() => []);

    const gatewayModels: CatalogItem[] = gatewayRows.flatMap((gw) =>
      gw.models.map((m) => ({ ...m, gatewayId: gw.id }))
    );

    const models: OpenAiModelEntry[] = [];
    const seenIds = new Set<string>();

    const sortedProfiles = (Array.isArray(auth.profiles) ? auth.profiles : [])
      .map(profileId)
      .filter((id): id is string => Boolean(id))
      .sort((a, b) => a.localeCompare(b));

    for (const id of sortedProfiles) {
      pushUniqueModelEntry(models, seenIds, id, "custom-router");
    }

    for (const item of gatewayModels) {
      pushUniqueModelEntry(models, seenIds, item.id);
    }

    return json({ object: "list", data: models });
  });
}
