import { withSessionAuth } from "@/src/lib/auth";
import { ROUTER_HISTORY } from "@/src/lib/constants";
import { jsonNoStore } from "@/src/lib/infra";
import { getRouterRepository } from "@/src/lib/storage";

function parseLimit(request: Request): number {
  const url = new URL(request.url);
  const rawLimit = Number(url.searchParams.get("limit") ?? ROUTER_HISTORY.DEFAULT_LIMIT);
  if (!Number.isFinite(rawLimit)) {
    return ROUTER_HISTORY.DEFAULT_LIMIT;
  }

  return Math.max(1, Math.min(Math.trunc(rawLimit), ROUTER_HISTORY.MAX_LIMIT));
}

export async function GET(request: Request): Promise<Response> {
  return withSessionAuth(request, async (auth) => {
    const repository = getRouterRepository();
    const entries = await repository.listRecentModelUsage(auth.userId, parseLimit(request));

    return jsonNoStore({ entries }, 200);
  });
}
