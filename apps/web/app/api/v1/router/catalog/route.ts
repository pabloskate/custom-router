import type { CatalogItem } from "@custom-router/core";
import { withAdminAuth } from "@/src/lib/auth";
import { json } from "@/src/lib/infra";
import { getRouterRepository } from "@/src/lib/storage";

export async function GET(request: Request): Promise<Response> {
  return withAdminAuth(request, async () => {
    const repository = getRouterRepository();
    const catalog = await repository.getCatalog();
    return json({ catalog }, 200);
  });
}

export async function POST(request: Request): Promise<Response> {
  return withAdminAuth(request, async () => {
    let payload: unknown;
    try {
      payload = await request.json();
    } catch {
      return json({ error: "Invalid JSON body." }, 400);
    }

    const item = payload as Record<string, unknown>;
    if (!item.id || typeof item.id !== "string") {
      return json({ error: "model id is required." }, 400);
    }

    const newItem: CatalogItem = {
      id: item.id,
      name: typeof item.name === "string" ? item.name : item.id,
      modality: typeof item.modality === "string" ? item.modality : undefined,
      thinking: (item.thinking as CatalogItem["thinking"]) ?? undefined,
      reasoningPreset: (item.reasoningPreset as CatalogItem["reasoningPreset"]) ?? undefined,
      upstreamModelId: typeof item.upstreamModelId === "string" ? item.upstreamModelId : undefined,
      whenToUse: typeof item.whenToUse === "string" ? item.whenToUse : undefined,
      description: typeof item.description === "string" ? item.description : undefined
    };

    const repository = getRouterRepository();
    const existing = await repository.getCatalog();
    const updated = [...existing.filter((m) => m.id !== newItem.id), newItem];
    await repository.setCatalog(`manual-${Date.now()}`, updated);

    return json({ ok: true, model: newItem }, 200);
  });
}
