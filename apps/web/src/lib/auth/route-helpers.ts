// ─────────────────────────────────────────────────────────────────────────────
// route-helpers.ts
//
// Composable helpers for Next.js route handlers. Every route that needs auth,
// a DB connection, or CSRF protection should use these instead of duplicating
// the pattern inline.
//
// Usage example:
//
//   export async function GET(request: Request) {
//     return withSessionAuth(request, async (auth, bindings) => {
//       return json({ user: auth.userId });
//     });
//   }
// ─────────────────────────────────────────────────────────────────────────────

import { z, type ZodTypeAny } from "zod";

import { authenticateRequest, authenticateSession, type AuthResult, verifyAdminSecret } from "./auth";
import { isSameOriginRequest } from "./csrf";
import { json } from "../infra/http";
import { getRuntimeBindings, type RouterRuntimeBindings } from "../infra/runtime-bindings";

type BindingsWithDb = RouterRuntimeBindings & {
  ROUTER_DB: NonNullable<RouterRuntimeBindings["ROUTER_DB"]>;
};

// ── withDb ────────────────────────────────────────────────────────────────────
// Guards against misconfigured deployments where ROUTER_DB isn't bound.

export async function withDb<T>(
  handler: (bindings: BindingsWithDb) => Promise<T>
): Promise<T | Response> {
  const bindings = getRuntimeBindings();
  if (!bindings.ROUTER_DB) {
    return json({ error: "Server misconfigured: missing database binding." }, 500);
  }
  return handler(bindings as BindingsWithDb);
}

// ── withApiKeyAuth ────────────────────────────────────────────────────────────
// For public API endpoints authenticated via Bearer API key.
// Use on: POST /api/v1/chat/completions, POST /api/v1/responses

export async function withApiKeyAuth(
  request: Request,
  handler: (auth: AuthResult, bindings: BindingsWithDb) => Promise<Response>
): Promise<Response> {
  const bindings = getRuntimeBindings();
  if (!bindings.ROUTER_DB) {
    return json({ error: "Server misconfigured: missing database binding." }, 500);
  }
  const auth = await authenticateRequest(request, bindings.ROUTER_DB);
  if (!auth) {
    return json({ error: "Unauthorized. Provide a valid API key via Authorization: Bearer <key>." }, 401);
  }
  return handler(auth, bindings as BindingsWithDb);
}

// ── withBrowserSessionOrApiKeyAuth ───────────────────────────────────────────
// For endpoints that accept either bearer auth from external callers or a
// same-origin browser session from the admin UI/playground.

export async function withBrowserSessionOrApiKeyAuth(
  request: Request,
  handler: (auth: AuthResult, bindings: BindingsWithDb) => Promise<Response>
): Promise<Response> {
  const bindings = getRuntimeBindings();
  if (!bindings.ROUTER_DB) {
    return json({ error: "Server misconfigured: missing database binding." }, 500);
  }

  let auth = await authenticateRequest(request, bindings.ROUTER_DB);
  if (!auth && isSameOriginRequest(request)) {
    auth = await authenticateSession(request, bindings.ROUTER_DB);
  }

  if (!auth) {
    return json({ error: "Unauthorized. Provide a valid API key via Authorization: Bearer <key>." }, 401);
  }

  return handler(auth, bindings as BindingsWithDb);
}

// ── withSessionAuth ───────────────────────────────────────────────────────────
// For browser/UI endpoints authenticated via session cookie.
// Use on: GET/PUT /api/v1/user/*, GET /api/v1/user/keys

export async function withSessionAuth(
  request: Request,
  handler: (auth: AuthResult, bindings: BindingsWithDb) => Promise<Response>
): Promise<Response> {
  const bindings = getRuntimeBindings();
  if (!bindings.ROUTER_DB) {
    return json({ error: "Server misconfigured: missing database binding." }, 500);
  }
  const auth = await authenticateSession(request, bindings.ROUTER_DB);
  if (!auth) {
    return json({ error: "Unauthorized." }, 401);
  }
  return handler(auth, bindings as BindingsWithDb);
}

// ── withCsrf ──────────────────────────────────────────────────────────────────
// Wraps a handler with a same-origin check. Compose with withSessionAuth for
// state-mutating browser endpoints (PUT, POST, DELETE from the UI).

export function withCsrf(
  request: Request,
  handler: () => Promise<Response>
): Promise<Response> {
  if (!isSameOriginRequest(request)) {
    return Promise.resolve(json({ error: "Invalid origin." }, 403));
  }
  return handler();
}

// ── withAdminAuth ─────────────────────────────────────────────────────────────
// For routes protected by the shared admin secret rather than a user session.

export async function withAdminAuth(
  request: Request,
  handler: (bindings: RouterRuntimeBindings) => Promise<Response>
): Promise<Response> {
  const bindings = getRuntimeBindings();
  if (!bindings.ADMIN_SECRET) {
    return json({ error: "Server misconfigured." }, 500);
  }

  if (!verifyAdminSecret(request, bindings.ADMIN_SECRET)) {
    return json({ error: "Unauthorized." }, 401);
  }

  return handler(bindings);
}

type ParsedJsonBodyResult<T> =
  | { data: T; response?: never }
  | { data?: never; response: Response };

// ── parseJsonBody ─────────────────────────────────────────────────────────────
// Shared request-body parsing with consistent invalid JSON / schema errors.

export async function parseJsonBody<TSchema extends ZodTypeAny>(
  request: Request,
  schema: TSchema,
  options: {
    invalidJsonMessage?: string;
    invalidPayloadMessage?: string;
  } = {}
): Promise<ParsedJsonBodyResult<z.infer<TSchema>>> {
  const invalidJsonMessage = options.invalidJsonMessage ?? "Invalid JSON body.";
  const invalidPayloadMessage = options.invalidPayloadMessage ?? "Invalid request payload.";

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return { response: json({ error: invalidJsonMessage }, 400) };
  }

  const parsed = schema.safeParse(payload);
  if (!parsed.success) {
    return {
      response: json(
        {
          error: invalidPayloadMessage,
          issues: parsed.error.issues,
        },
        400
      ),
    };
  }

  return { data: parsed.data };
}
