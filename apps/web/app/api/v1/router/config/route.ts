import { routerConfigSchema } from "@/src/lib/schemas";
import { parseJsonBody, withAdminAuth } from "@/src/lib/auth";
import { json } from "@/src/lib/infra";
import { getRouterRepository } from "@/src/lib/storage";

export async function GET(request: Request): Promise<Response> {
  return withAdminAuth(request, async () => {
    const repository = getRouterRepository();
    const config = await repository.getConfig();

    return json(config, 200);
  });
}

export async function PUT(request: Request): Promise<Response> {
  return withAdminAuth(request, async () => {
    const parsed = await parseJsonBody(request, routerConfigSchema, {
      invalidPayloadMessage: "Invalid router configuration.",
    });
    if (parsed.response) {
      return parsed.response;
    }

    const repository = getRouterRepository();
    await repository.setConfig(parsed.data);

    return json({ ok: true, version: parsed.data.version }, 200);
  });
}
