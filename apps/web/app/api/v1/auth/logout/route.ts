import { json } from "@/src/lib/http";
import {
  buildSessionCookie,
  getSessionTokenFromRequest,
  hashKey,
  shouldUseSecureCookies
} from "@/src/lib/auth";
import { getRuntimeBindings } from "@/src/lib/runtime";
import { isSameOriginRequest } from "@/src/lib/csrf";

export async function POST(request: Request): Promise<Response> {
  const bindings = getRuntimeBindings();
  const secureCookie = shouldUseSecureCookies(bindings.SESSION_COOKIE_SECURE);
  const clearCookie = buildSessionCookie("", { secure: secureCookie, clear: true });

  if (!isSameOriginRequest(request)) {
    return json({ error: "Invalid origin." }, 403, {
      "set-cookie": clearCookie
    });
  }

  if (!bindings.ROUTER_DB) {
    return json({ ok: true }, 200, {
      "set-cookie": clearCookie
    });
  }

  const token = getSessionTokenFromRequest(request);
  if (token) {
    const tokenHash = await hashKey(token);
    await bindings.ROUTER_DB
      .prepare("DELETE FROM user_sessions WHERE id = ?1")
      .bind(tokenHash)
      .run();
  }

  return json({ ok: true }, 200, {
    "set-cookie": clearCookie
  });
}
