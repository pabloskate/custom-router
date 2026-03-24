interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  first<T = unknown>(): Promise<T | null>;
  run(): Promise<unknown>;
}

interface D1Database {
  prepare(query: string): D1PreparedStatement;
}

interface KVNamespace {
  put(
    key: string,
    value: string,
    options?: {
      expiration?: number;
      expirationTtl?: number;
    }
  ): Promise<void>;
}

interface ScheduledController {
  cron: string;
  scheduledTime: number;
}

interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
}

interface Env {
  ROUTER_DB: D1Database;
  ROUTER_KV: KVNamespace;
  ROUTER_NAME?: string;
  ADMIN_SECRET?: string;
}

const ROUTING_EXPLANATION_RETENTION_MS = 48 * 60 * 60 * 1000;

function runId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2, 10)}`;
}

function constantTimeEqual(left: string, right: string): boolean {
  const encoder = new TextEncoder();
  const leftBytes = encoder.encode(left);
  const rightBytes = encoder.encode(right);
  const maxLength = Math.max(leftBytes.length, rightBytes.length);

  let diff = leftBytes.length ^ rightBytes.length;
  for (let index = 0; index < maxLength; index += 1) {
    diff |= (leftBytes[index] ?? 0) ^ (rightBytes[index] ?? 0);
  }

  return diff === 0;
}

function verifyAdminSecret(request: Request, adminSecret?: string): boolean {
  if (!adminSecret) {
    return false;
  }

  const authHeader = request.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return false;
  }

  return constantTimeEqual(authHeader.slice(7).trim(), adminSecret);
}

async function putRun(
  env: Env,
  run: {
    id: string;
    status: "running" | "ok" | "error";
    startedAt: string;
    finishedAt?: string;
    error?: string;
    artifactVersion?: string;
  }
): Promise<void> {
  await env.ROUTER_DB
    .prepare(
      "INSERT OR REPLACE INTO ingestion_runs (id, status, started_at, finished_at, error, artifact_version) VALUES (?1, ?2, ?3, ?4, ?5, ?6)"
    )
    .bind(
      run.id,
      run.status,
      run.startedAt,
      run.finishedAt ?? null,
      run.error ?? null,
      run.artifactVersion ?? null
    )
    .run();
}

async function cleanupOldRoutingExplanations(env: Env): Promise<void> {
  const cutoffIso = new Date(Date.now() - ROUTING_EXPLANATION_RETENTION_MS).toISOString();
  await env.ROUTER_DB
    .prepare("DELETE FROM routing_explanations WHERE created_at < ?1")
    .bind(cutoffIso)
    .run();
}

async function executeIngestion(env: Env): Promise<{ ok: true; runId: string; artifactVersion: string } | { ok: false; runId: string; error: string }> {
  const id = runId("ingest");
  const startedAt = new Date().toISOString();
  await cleanupOldRoutingExplanations(env);
  const error = "Catalog ingestion disabled. App is BYOK-only.";
  await putRun(env, {
    id,
    status: "error",
    startedAt,
    finishedAt: new Date().toISOString(),
    error
  });
  return { ok: false, runId: id, error };
}

export default {
  async scheduled(_event: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(executeIngestion(env));
  },

  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === "POST" && url.pathname === "/run") {
      if (!verifyAdminSecret(request, env.ADMIN_SECRET)) {
        return new Response(JSON.stringify({ error: "Unauthorized." }), {
          status: 401,
          headers: { "content-type": "application/json" }
        });
      }

      const result = await executeIngestion(env);
      if (result.ok) {
        return new Response(
          JSON.stringify({
            ok: true,
            run_id: result.runId,
            artifact_version: result.artifactVersion
          }),
          {
            headers: {
              "content-type": "application/json"
            }
          }
        );
      }

      return new Response(
        JSON.stringify({
          ok: false,
          run_id: result.runId,
          error: result.error
        }),
        {
          status: 500,
          headers: {
            "content-type": "application/json"
          }
        }
      );
    }

    return new Response(
      JSON.stringify({
        service: env.ROUTER_NAME ?? "custom-router",
        status: "ok"
      }),
      {
        headers: {
          "content-type": "application/json"
        }
      }
    );
  }
};
