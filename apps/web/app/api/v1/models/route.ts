import type { CatalogItem } from "@custom-router/core";
import { withApiKeyAuth } from "@/src/lib/auth";
import { json } from "@/src/lib/infra";
import { ROUTING_PRESETS } from "@/src/lib/routing-presets";
import { gatewayRowToPublic, loadGatewaysWithMigration } from "@/src/lib/storage";

interface OpenAiModelEntry {
  id: string;
  object: "model";
  created: number;
  owned_by: string;
  attachment?: boolean;
  modalities?: {
    input: string[];
    output: string[];
  };
}

function ownedByFromModelId(modelId: string): string {
  const slashIndex = modelId.indexOf("/");
  return slashIndex > 0 ? modelId.slice(0, slashIndex) : "custom-router";
}

function uniqueSorted(values: Iterable<string>): string[] {
  return Array.from(new Set(values)).sort((a, b) => a.localeCompare(b));
}

function parseModality(modality: string | null | undefined): { input: string[]; output: string[] } {
  const raw = typeof modality === "string" ? modality.trim().toLowerCase() : "";
  if (!raw) {
    return { input: [], output: [] };
  }

  const [inputSegment, outputSegment] = raw.split("->", 2);
  const parseSegment = (segment: string | undefined) =>
    (segment ?? "")
      .split(/[,+]/)
      .map((token) => token.trim())
      .filter(Boolean);

  const input = parseSegment(inputSegment);
  return {
    input,
    output: parseSegment(outputSegment ?? inputSegment),
  };
}

function addModalityTokens(
  target: { input: Set<string>; output: Set<string> },
  modality: string | undefined
): void {
  const parsed = parseModality(modality);
  parsed.input.forEach((token) => target.input.add(token));
  parsed.output.forEach((token) => target.output.add(token));
}

function modelIdFromProfileModel(model: unknown): string | null {
  if (!model || typeof model !== "object") {
    return null;
  }

  const candidate = (model as { modelId?: unknown; id?: unknown }).modelId ?? (model as { id?: unknown }).id;
  return typeof candidate === "string" && candidate.trim() ? candidate : null;
}

function aggregateProfileModalities(
  profile: unknown,
  gatewayModalitiesById: Map<string, string | undefined>
): { input: string[]; output: string[] } | undefined {
  if (!profile || typeof profile !== "object" || !Array.isArray((profile as { models?: unknown }).models)) {
    return undefined;
  }

  const input = new Set<string>();
  const output = new Set<string>();
  for (const model of (profile as { models: unknown[] }).models) {
    const ownModality = typeof (model as { modality?: unknown }).modality === "string"
      ? (model as { modality: string }).modality
      : undefined;
    const modelId = modelIdFromProfileModel(model);
    addModalityTokens({ input, output }, ownModality ?? (modelId ? gatewayModalitiesById.get(modelId) : undefined));
  }

  if (input.size === 0 && output.size === 0) {
    const id = profileId(profile);
    const preset = id ? ROUTING_PRESETS.find((entry) => entry.id === id) : undefined;
    for (const model of preset?.models ?? []) {
      addModalityTokens({ input, output }, model.modality);
    }
  }

  if (input.size === 0 && output.size === 0) {
    return undefined;
  }

  input.add("text");
  output.add("text");
  return {
    input: uniqueSorted(input),
    output: uniqueSorted(output),
  };
}

function pushUniqueModelEntry(
  models: OpenAiModelEntry[],
  seenIds: Set<string>,
  modelId: string,
  ownedBy = ownedByFromModelId(modelId),
  metadata?: Pick<OpenAiModelEntry, "attachment" | "modalities">
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
    ...metadata,
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
    const gatewayModalitiesById = new Map(gatewayModels.map((item) => [item.id, item.modality] as const));

    const sortedProfiles = (Array.isArray(auth.profiles) ? auth.profiles : [])
      .map((profile) => ({ profile, id: profileId(profile) }))
      .filter((entry): entry is { profile: unknown; id: string } => Boolean(entry.id))
      .sort((a, b) => a.id.localeCompare(b.id));

    for (const { profile, id } of sortedProfiles) {
      const modalities = aggregateProfileModalities(profile, gatewayModalitiesById);
      pushUniqueModelEntry(models, seenIds, id, "custom-router", modalities
        ? {
            modalities,
            attachment: modalities.input.some((modality) => modality !== "text"),
          }
        : undefined);
    }

    for (const item of gatewayModels) {
      const modalities = parseModality(item.modality);
      pushUniqueModelEntry(models, seenIds, item.id, ownedByFromModelId(item.id), modalities.input.length || modalities.output.length
        ? {
            modalities: {
              input: uniqueSorted(["text", ...modalities.input]),
              output: uniqueSorted(["text", ...modalities.output]),
            },
            attachment: modalities.input.some((modality) => modality !== "text"),
          }
        : undefined);
    }

    return json({ object: "list", data: models });
  });
}
