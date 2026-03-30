import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AuthResult } from "@/src/lib/auth";
import {
  authenticateSession,
  getUserUpstreamCredentials,
  hasUsersRouteLoggingEnabledColumn,
  isSameOriginRequest,
  upsertUserUpstreamCredentials,
  withCsrf,
  withSessionAuth,
} from "@/src/lib/auth";
import { getRuntimeBindings } from "@/src/lib/infra";
import { gatewayRowToInfo, loadGatewaysWithMigration } from "@/src/lib/storage";
import { GET, PUT } from "./route";

vi.mock("@/src/lib/infra", async () => {
  const actual = await vi.importActual<typeof import("@/src/lib/infra")>("@/src/lib/infra");
  return {
    ...actual,
    getRuntimeBindings: vi.fn(),
  };
});

vi.mock("@/src/lib/auth", async () => {
  const actual = await vi.importActual<typeof import("@/src/lib/auth")>("@/src/lib/auth");
  return {
    ...actual,
    authenticateSession: vi.fn(),
    encryptByokSecret: vi.fn(async ({ plaintext }: { plaintext: string }) => `enc:${plaintext}`),
    getUserUpstreamCredentials: vi.fn(),
    hasUsersRouteLoggingEnabledColumn: vi.fn(),
    hasUsersSmartPinTurnsColumn: vi.fn(),
    isSameOriginRequest: vi.fn(),
    resolveByokEncryptionSecret: vi.fn(({ byokSecret }: { byokSecret?: string | null }) => byokSecret ?? null),
    upsertUserUpstreamCredentials: vi.fn(),
    withCsrf: vi.fn(),
    withSessionAuth: vi.fn(),
  };
});

vi.mock("@/src/lib/storage", async () => {
  const actual = await vi.importActual<typeof import("@/src/lib/storage")>("@/src/lib/storage");
  return {
    ...actual,
    gatewayRowToInfo: vi.fn(),
    loadGatewaysWithMigration: vi.fn(),
  };
});

function createAuth(overrides: Partial<AuthResult> = {}): AuthResult {
  return {
    userId: "user_1",
    userName: "Test User",
    updatedAt: "2026-03-11T00:00:00.000Z",
    preferredModels: [],
    defaultModel: null,
    classifierModel: null,
    routingInstructions: null,
    blocklist: null,
    customCatalog: null,
    profiles: [{ id: "planning-backend", name: "Planning Backend", models: [] }],
    routeTriggerKeywords: null,
    routingFrequency: null,
    routeLoggingEnabled: false,
    routingConfigRequiresReset: false,
    upstreamBaseUrl: null,
    upstreamApiKeyEnc: null,
    classifierBaseUrl: null,
    classifierApiKeyEnc: null,
    ...overrides,
  };
}

function createDbMock(changes = 1) {
  const runMock = vi.fn(async () => ({ meta: { changes } }));
  const bindMock = vi.fn((..._args: unknown[]) => ({ run: runMock }));
  const prepareMock = vi.fn((_sql: string) => ({ bind: bindMock }));
  return {
    prepare: prepareMock,
    __runMock: runMock,
    __bindMock: bindMock,
  };
}

describe("/api/v1/user/me route", () => {
  const runtimeMock = vi.mocked(getRuntimeBindings);
  const authMock = vi.mocked(authenticateSession);
  const sameOriginMock = vi.mocked(isSameOriginRequest);
  const upstreamGetMock = vi.mocked(getUserUpstreamCredentials);
  const hasRouteLoggingEnabledColumnMock = vi.mocked(hasUsersRouteLoggingEnabledColumn);
  const upstreamUpsertMock = vi.mocked(upsertUserUpstreamCredentials);
  const withSessionAuthMock = vi.mocked(withSessionAuth);
  const withCsrfMock = vi.mocked(withCsrf);
  const loadGatewaysMock = vi.mocked(loadGatewaysWithMigration);
  const gatewayRowToInfoMock = vi.mocked(gatewayRowToInfo);

  beforeEach(() => {
    vi.clearAllMocks();
    withSessionAuthMock.mockImplementation(async (request, handler) => {
      const bindings = runtimeMock() ?? { ROUTER_DB: {} as any };
      const auth = await authMock(request, (bindings as any).ROUTER_DB);
      if (!auth) {
        return new Response(JSON.stringify({ error: "Unauthorized." }), { status: 401 });
      }
      return handler(auth as any, bindings as any);
    });
    withCsrfMock.mockImplementation(async (request, handler) => {
      if (!sameOriginMock(request)) {
        return new Response(JSON.stringify({ error: "Invalid origin." }), { status: 403 });
      }
      return handler();
    });
    upstreamGetMock.mockResolvedValue({
      user_id: "user_1",
      upstream_base_url: null,
      upstream_api_key_enc: null,
      classifier_base_url: null,
      classifier_api_key_enc: null,
      updated_at: "2026-03-11T00:00:00.000Z",
    });
    hasRouteLoggingEnabledColumnMock.mockResolvedValue(true);
    upstreamUpsertMock.mockResolvedValue(undefined);
    loadGatewaysMock.mockResolvedValue([
      {
        id: "gw_openrouter",
        user_id: "user_1",
        name: "OpenRouter",
        base_url: "https://openrouter.ai/api/v1",
        api_key_enc: "enc:key",
        models_json: "[]",
        created_at: "2026-03-11T00:00:00.000Z",
        updated_at: "2026-03-11T00:00:00.000Z",
      },
    ] as any);
    gatewayRowToInfoMock.mockReturnValue({
      id: "gw_openrouter",
      name: "OpenRouter",
      baseUrl: "https://openrouter.ai/api/v1",
      createdAt: "2026-03-11T00:00:00.000Z",
      updatedAt: "2026-03-11T00:00:00.000Z",
      models: [
        { id: "anthropic/claude-sonnet-4.6", name: "Claude Sonnet 4.6" },
        { id: "model/classifier", name: "Classifier" },
      ],
    });
  });

  it("GET omits removed legacy routing fields and surfaces reset metadata", async () => {
    runtimeMock.mockReturnValue({ ROUTER_DB: {} as any });
    authMock.mockResolvedValue(
      createAuth({
        profiles: null,
        routingConfigRequiresReset: true,
      }),
    );

    const response = await GET(new Request("http://localhost/api/v1/user/me"));
    expect(response.status).toBe(200);

    const body = await response.json() as any;
    expect(body.user.profiles).toBeNull();
    expect(body.user.updatedAt).toBe("2026-03-11T00:00:00.000Z");
    expect(body.user.routeLoggingEnabled).toBe(false);
    expect(body.user.routingConfigRequiresReset).toBe(true);
    expect(body.user.routingConfigResetMessage).toContain("Legacy routing settings");
    expect(body.user.defaultModel).toBeUndefined();
    expect(body.user.classifierModel).toBeUndefined();
    expect(body.user.blocklist).toBeUndefined();
  });

  it("PUT persists only the new profile-centric routing payload and clears legacy routing columns", async () => {
    const db = createDbMock();
    runtimeMock.mockReturnValue({ ROUTER_DB: db as any, BYOK_ENCRYPTION_SECRET: "1234567890abcdef" });
    sameOriginMock.mockReturnValue(true);
    authMock.mockResolvedValue(createAuth({ userId: "user_1" }));

    const response = await PUT(
      new Request("http://localhost/api/v1/user/me", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          expected_updated_at: "2026-03-11T00:00:00.000Z",
          preferred_models: [],
          profiles: [
            {
              id: "planning-backend",
              name: "Planning Backend",
              models: [
                {
                  gatewayId: "gw_openrouter",
                  modelId: "anthropic/claude-sonnet-4.6",
                  name: "Claude Sonnet 4.6",
                },
              ],
              defaultModel: "gw_openrouter::anthropic/claude-sonnet-4.6",
              classifierModel: "gw_openrouter::anthropic/claude-sonnet-4.6",
            },
          ],
          route_trigger_keywords: ["reroute"],
          routing_frequency: "smart",
          route_logging_enabled: true,
        }),
      }),
    );

    expect(response.status).toBe(200);
    const updateSql = db.prepare.mock.calls.find((entry: [string]) => entry[0].includes("UPDATE users"))?.[0] ?? "";
    expect(updateSql).toContain("default_model = NULL");
    expect(updateSql).toContain("classifier_model = NULL");
    expect(updateSql).toContain("routing_instructions = NULL");
    expect(updateSql).toContain("blocklist = NULL");
    expect(updateSql).toContain("route_logging_enabled =");
    expect(updateSql).toContain("WHERE id =");
    expect(updateSql).toContain("updated_at =");
    const profileUpdateBindArgs = db.__bindMock.mock.calls.at(-1) ?? [];
    expect(profileUpdateBindArgs[4]).toBe(1);
    const serializedProfiles = profileUpdateBindArgs.find((value) =>
      typeof value === "string" && value.includes("\"planning-backend\""),
    );
    expect(JSON.parse(String(serializedProfiles))).toEqual([
      {
        id: "planning-backend",
        name: "Planning Backend",
        models: [
          {
            gatewayId: "gw_openrouter",
            modelId: "anthropic/claude-sonnet-4.6",
            name: "Claude Sonnet 4.6",
          },
        ],
        defaultModel: "gw_openrouter::anthropic/claude-sonnet-4.6",
        classifierModel: "gw_openrouter::anthropic/claude-sonnet-4.6",
      },
    ]);
    expect(profileUpdateBindArgs.at(-1)).toBe("2026-03-11T00:00:00.000Z");
  });

  it("PUT accepts a router model that is not part of the routed profile pool", async () => {
    const db = createDbMock();
    runtimeMock.mockReturnValue({ ROUTER_DB: db as any, BYOK_ENCRYPTION_SECRET: "1234567890abcdef" });
    sameOriginMock.mockReturnValue(true);
    authMock.mockResolvedValue(createAuth({ userId: "user_1" }));

    const response = await PUT(
      new Request("http://localhost/api/v1/user/me", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          expected_updated_at: "2026-03-11T00:00:00.000Z",
          profiles: [
            {
              id: "planning-backend",
              name: "Planning Backend",
              models: [
                {
                  gatewayId: "gw_openrouter",
                  modelId: "anthropic/claude-sonnet-4.6",
                  name: "Claude Sonnet 4.6",
                },
              ],
              defaultModel: "gw_openrouter::anthropic/claude-sonnet-4.6",
              classifierModel: "gw_openrouter::model/classifier",
            },
          ],
        }),
      }),
    );

    expect(response.status).toBe(200);
  });

  it("PUT rejects removed legacy routing fields", async () => {
    runtimeMock.mockReturnValue({ ROUTER_DB: {} as any });
    sameOriginMock.mockReturnValue(true);
    authMock.mockResolvedValue(createAuth({ userId: "user_1" }));

    const response = await PUT(
      new Request("http://localhost/api/v1/user/me", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          expected_updated_at: "2026-03-11T00:00:00.000Z",
          profiles: [{ id: "planning-backend", name: "Planning Backend", models: [] }],
          default_model: "legacy/default",
        }),
      }),
    );

    expect(response.status).toBe(400);
    const body = await response.json() as { error: string };
    expect(body.error).toContain("Legacy routing fields");
  });

  it("PUT rejects invalid profile ids", async () => {
    runtimeMock.mockReturnValue({ ROUTER_DB: {} as any });
    sameOriginMock.mockReturnValue(true);
    authMock.mockResolvedValue(createAuth({ userId: "user_1" }));

    const response = await PUT(
      new Request("http://localhost/api/v1/user/me", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          expected_updated_at: "2026-03-11T00:00:00.000Z",
          profiles: [{ id: "Auto With Spaces", name: "Planning Backend", models: [] }],
        }),
      }),
    );

    expect(response.status).toBe(400);
    const body = await response.json() as { error: string };
    expect(body.error).toContain("invalid");
  });

  it('PUT accepts "auto" as a profile id', async () => {
    const db = createDbMock();
    runtimeMock.mockReturnValue({ ROUTER_DB: db as any, BYOK_ENCRYPTION_SECRET: "1234567890abcdef" });
    sameOriginMock.mockReturnValue(true);
    authMock.mockResolvedValue(createAuth({ userId: "user_1" }));

    const response = await PUT(
      new Request("http://localhost/api/v1/user/me", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          expected_updated_at: "2026-03-11T00:00:00.000Z",
          profiles: [{ id: "auto", name: "Auto", models: [] }],
        }),
      }),
    );

    expect(response.status).toBe(200);
    const bindArgs = db.__bindMock.mock.calls.at(-1) ?? [];
    const serializedProfiles = bindArgs.find((value) =>
      typeof value === "string" && value.includes("\"auto\""),
    );
    expect(JSON.parse(String(serializedProfiles))).toEqual([
      {
        id: "auto",
        name: "Auto",
        models: [],
      },
    ]);
  });

  it("PUT updates only the touched field when saving logs settings", async () => {
    const db = createDbMock();
    runtimeMock.mockReturnValue({ ROUTER_DB: db as any, BYOK_ENCRYPTION_SECRET: "1234567890abcdef" });
    sameOriginMock.mockReturnValue(true);
    authMock.mockResolvedValue(createAuth({ userId: "user_1" }));

    const response = await PUT(
      new Request("http://localhost/api/v1/user/me", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          expected_updated_at: "2026-03-11T00:00:00.000Z",
          route_logging_enabled: true,
        }),
      }),
    );

    expect(response.status).toBe(200);
    const updateSql = db.prepare.mock.calls.find((entry: [string]) => entry[0].includes("UPDATE users"))?.[0] ?? "";
    expect(updateSql).toContain("route_logging_enabled =");
    expect(updateSql).not.toContain("profiles =");
    expect(updateSql).not.toContain("route_trigger_keywords =");
    expect(updateSql).not.toContain("routing_frequency =");
    expect(loadGatewaysMock).not.toHaveBeenCalled();
  });

  it("PUT rejects stale settings revisions", async () => {
    const db = createDbMock(0);
    runtimeMock.mockReturnValue({ ROUTER_DB: db as any, BYOK_ENCRYPTION_SECRET: "1234567890abcdef" });
    sameOriginMock.mockReturnValue(true);
    authMock.mockResolvedValue(createAuth({ userId: "user_1" }));

    const response = await PUT(
      new Request("http://localhost/api/v1/user/me", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          expected_updated_at: "2026-03-11T00:00:00.000Z",
          route_logging_enabled: true,
        }),
      }),
    );

    expect(response.status).toBe(409);
    const body = await response.json() as { error: string };
    expect(body.error).toContain("another tab or session");
  });

  it("PUT rejects a mismatched client revision before writing", async () => {
    const db = createDbMock();
    runtimeMock.mockReturnValue({ ROUTER_DB: db as any, BYOK_ENCRYPTION_SECRET: "1234567890abcdef" });
    sameOriginMock.mockReturnValue(true);
    authMock.mockResolvedValue(createAuth({ userId: "user_1", updatedAt: "2026-03-12T00:00:00.000Z" }));

    const response = await PUT(
      new Request("http://localhost/api/v1/user/me", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          expected_updated_at: "2026-03-11T00:00:00.000Z",
          route_logging_enabled: true,
        }),
      }),
    );

    expect(response.status).toBe(409);
    const updateSql = db.prepare.mock.calls.find((entry: [string]) => entry[0].includes("UPDATE users"));
    expect(updateSql).toBeUndefined();
  });
});
