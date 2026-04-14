import { withCsrf, withSessionAuth } from "@/src/lib/auth";
import {
  handleGetCurrentUser,
  handleUpdateCurrentUser,
} from "@/src/features/account-settings/server/user-settings-route";

export async function GET(request: Request): Promise<Response> {
  return withSessionAuth(request, async (auth) => handleGetCurrentUser({ auth }));
}

export async function PUT(request: Request): Promise<Response> {
  return withSessionAuth(request, async (auth, bindings) =>
    withCsrf(request, async () =>
      handleUpdateCurrentUser({
        request,
        auth,
        bindings,
      }),
    ),
  );
}
