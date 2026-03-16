import { withAdminAuth } from "@/src/lib/auth";
import { json } from "@/src/lib/infra";
import { getRouterRepository } from "@/src/lib/storage";

export async function GET(request: Request): Promise<Response> {
  return withAdminAuth(request, async () => {
    const repository = getRouterRepository();
    const runs = await repository.listRuns();

    return json({ runs }, 200);
  });
}
