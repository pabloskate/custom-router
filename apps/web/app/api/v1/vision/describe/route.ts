import { withApiKeyAuth } from "@/src/lib/auth";
import { handleDescribeVisionRequest } from "@/src/features/vision/server/vision-service";

export async function POST(request: Request): Promise<Response> {
  return withApiKeyAuth(request, async (auth, bindings) =>
    handleDescribeVisionRequest({ request, auth, bindings }),
  );
}
