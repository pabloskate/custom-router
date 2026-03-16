import { withAdminAuth } from "@/src/lib/auth";
import { json } from "@/src/lib/infra";
import { getRouterRepository } from "@/src/lib/storage";

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ modelId: string }> }
): Promise<Response> {
  return withAdminAuth(request, async () => {
    const { modelId } = await params;
    const decoded = decodeURIComponent(modelId);

    const repository = getRouterRepository();
    const existing = await repository.getCatalog();
    const updated = existing.filter((m) => m.id !== decoded);

    if (updated.length === existing.length) {
      return json({ error: `Model not found: ${decoded}` }, 404);
    }

    await repository.setCatalog(`manual-${Date.now()}`, updated);
    return json({ ok: true }, 200);
  });
}
