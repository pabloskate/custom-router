import { withCsrf, withSessionAuth } from "@/src/lib/auth";
import {
  handleGetVisionSettings,
  handleUpdateVisionSettings,
} from "@/src/features/vision/server/vision-settings-route";

export async function GET(request: Request): Promise<Response> {
  return withSessionAuth(request, async (auth, bindings) =>
    handleGetVisionSettings({ auth, bindings }),
  );
}

export async function PUT(request: Request): Promise<Response> {
  return withSessionAuth(request, async (auth, bindings) =>
    withCsrf(request, async () =>
      handleUpdateVisionSettings({ request, auth, bindings }),
    ),
  );
}
