import { withAdminAuth } from "@/src/lib/auth";
import { json } from "@/src/lib/infra";
import { getRouterRepository } from "@/src/lib/storage";

export async function GET(
  request: Request,
  context: { params: Promise<{ requestId: string }> }
): Promise<Response> {
  return withAdminAuth(request, async () => {
    const { requestId } = await context.params;
    const repository = getRouterRepository();
    const explanation = await repository.getExplanation(requestId);

    if (!explanation) {
      return json({ error: "Explanation not found.", request_id: requestId }, 404);
    }

    return json(explanation, 200);
  });
}
