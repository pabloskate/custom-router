import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AuthResult } from "@/src/lib/auth";
import {
  authenticateSession,
  getUserUpstreamCredentials,
  isSameOriginRequest,
  upsertUserUpstreamCredentials,
  withCsrf,
  withSessionAuth,
} from "@/src/lib/auth";
import { getRuntimeBindings } from "@/src/lib/infra";
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
    isSameOriginRequest: vi.fn(),
    resolveByokEncryptionSecret: vi.fn(({ byokSecret }: { byokSecret?: string | null }) => byokSecret ?? null),
    upsertUserUpstreamCredentials: vi.fn(),
    withCsrf: vi.fn(),
    withSessionAuth: vi.fn(),
  };
});

function createAuth(overrides: Partial<AuthResult> = {}): AuthResult {
  return {
    userId: "user_1",
    userName: "Test User",
    preferredModels: [],
    defaultModel: null,
    classifierModel: null,
    routingInstructions: null,
    blocklist: null,
    customCatalog: null,
    profiles: null,
    routeTriggerKeywords: null,
    routingFrequency: null,
    smartPinTurns: null,
    upstreamBaseUrl: null,
    upstreamApiKeyEnc: null,
    classifierBaseUrl: null,
    classifierApiKeyEnc: null,
    ...overrides,
  };
}

function createDbMock() {
  const runMock = vi.fn(async () => ({ meta: { changes: 1 } }));
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
  const upstreamUpsertMock = vi.mocked(upsertUserUpstreamCredentials);
  const withSessionAuthMock = vi.mocked(withSessionAuth);
  const withCsrfMock = vi.mocked(withCsrf);

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
  });

  it("GET includes routing fields", async () => {
    runtimeMock.mockReturnValue({ ROUTER_DB: {} as any });
    authMock.mockResolvedValue(
      createAuth({
        defaultModel: "model/default",
        classifierModel: "model/classifier",
        profiles: [{ id: "auto", name: "Auto", routingInstructions: "Use model/default for coding." }] as any,
      })
    );

    const response = await GET(new Request("http://localhost/api/v1/user/me"));
    expect(response.status).toBe(200);

    const body = await response.json() as any;
    expect(body.user.defaultModel).toBe("model/default");
    expect(body.user.classifierModel).toBe("model/classifier");
    expect(body.user.profiles).toEqual([
      { id: "auto", name: "Auto", routingInstructions: "Use model/default for coding." },
    ]);
    expect(body.user.smartPinTurns).toBeNull();
    expect(body.user.configAgentEnabled).toBeUndefined();
  });

  it("PUT persists routing fields without config-agent columns", async () => {
    const db = createDbMock();
    runtimeMock.mockReturnValue({ ROUTER_DB: db as any, BYOK_ENCRYPTION_SECRET: "1234567890abcdef" });
    sameOriginMock.mockReturnValue(true);
    authMock.mockResolvedValue(createAuth({ userId: "user_1" }));
    upstreamGetMock.mockResolvedValue({
      user_id: "user_1",
      upstream_base_url: null,
      upstream_api_key_enc: null,
      classifier_base_url: null,
      classifier_api_key_enc: null,
      updated_at: "2026-03-11T00:00:00.000Z",
    });
    upstreamUpsertMock.mockResolvedValue(undefined);

    const response = await PUT(
      new Request("http://localhost/api/v1/user/me", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          preferred_models: [],
          blocklist: [],
          default_model: null,
          classifier_model: null,
          routing_instructions: null,
          custom_catalog: null,
          profiles: null,
          smart_pin_turns: 5,
        }),
      })
    );

    expect(response.status).toBe(200);
    const updateSql = db.prepare.mock.calls.find((entry: [string]) => entry[0].includes("UPDATE users"))?.[0] ?? "";
    expect(updateSql).not.toContain("show_model_in_response");
    expect(updateSql).not.toContain("config_agent_enabled");
    expect(updateSql).not.toContain("config_agent_orchestrator_model");
    expect(updateSql).not.toContain("config_agent_search_model");
    const bindArgs = db.__bindMock.mock.calls.at(-1) ?? [];
    expect(bindArgs[9]).toBe(5);
  });

  it("PUT migrates legacy routing instructions into the auto profile", async () => {
    const db = createDbMock();
    runtimeMock.mockReturnValue({ ROUTER_DB: db as any, BYOK_ENCRYPTION_SECRET: "1234567890abcdef" });
    sameOriginMock.mockReturnValue(true);
    authMock.mockResolvedValue(createAuth({ userId: "user_1" }));
    upstreamGetMock.mockResolvedValue({
      user_id: "user_1",
      upstream_base_url: null,
      upstream_api_key_enc: null,
      classifier_base_url: null,
      classifier_api_key_enc: null,
      updated_at: "2026-03-11T00:00:00.000Z",
    });
    upstreamUpsertMock.mockResolvedValue(undefined);

    const response = await PUT(
      new Request("http://localhost/api/v1/user/me", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          preferred_models: [],
          blocklist: [],
          default_model: null,
          classifier_model: null,
          routing_instructions: "Use the cheapest model for simple tasks.",
          custom_catalog: null,
          profiles: [{ id: "auto", name: "Auto" }],
          smart_pin_turns: 3,
        }),
      })
    );

    expect(response.status).toBe(200);
    const bindArgs = db.__bindMock.mock.calls.at(-1) ?? [];
    expect(bindArgs[4]).toBeNull();
    expect(JSON.parse(String(bindArgs[6]))).toEqual([
      { id: "auto", name: "Auto", routingInstructions: "Use the cheapest model for simple tasks." },
    ]);
  });

  it("PUT rejects profiles that omit the required auto profile", async () => {
    const db = createDbMock();
    runtimeMock.mockReturnValue({ ROUTER_DB: db as any });
    sameOriginMock.mockReturnValue(true);
    authMock.mockResolvedValue(createAuth({ userId: "user_1" }));
    upstreamGetMock.mockResolvedValue({
      user_id: "user_1",
      upstream_base_url: null,
      upstream_api_key_enc: null,
      classifier_base_url: null,
      classifier_api_key_enc: null,
      updated_at: "2026-03-11T00:00:00.000Z",
    });

    const response = await PUT(
      new Request("http://localhost/api/v1/user/me", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          preferred_models: [],
          blocklist: [],
          default_model: null,
          classifier_model: null,
          routing_instructions: null,
          custom_catalog: null,
          profiles: [{ id: "auto-cheap", name: "Cheap Auto" }],
        }),
      })
    );

    expect(response.status).toBe(400);
    const body = await response.json() as { error: string };
    expect(body.error).toContain("auto");
    expect(body.error).toContain("required");
  });

  it("PUT accepts profiles that include the auto profile", async () => {
    const db = createDbMock();
    runtimeMock.mockReturnValue({ ROUTER_DB: db as any });
    sameOriginMock.mockReturnValue(true);
    authMock.mockResolvedValue(createAuth({ userId: "user_1" }));
    upstreamGetMock.mockResolvedValue({
      user_id: "user_1",
      upstream_base_url: null,
      upstream_api_key_enc: null,
      classifier_base_url: null,
      classifier_api_key_enc: null,
      updated_at: "2026-03-11T00:00:00.000Z",
    });

    const response = await PUT(
      new Request("http://localhost/api/v1/user/me", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          preferred_models: [],
          blocklist: [],
          default_model: null,
          classifier_model: null,
          routing_instructions: null,
          custom_catalog: null,
          profiles: [
            { id: "auto", name: "Auto" },
            { id: "auto-cheap", name: "Cheap Auto", overrideModels: true, defaultModel: "model/cheap" },
          ],
        }),
      })
    );

    expect(response.status).toBe(200);
    expect(db.__bindMock).toHaveBeenCalled();
  });

  it("PUT normalizes blank profile model override fields before persisting", async () => {
    const db = createDbMock();
    runtimeMock.mockReturnValue({ ROUTER_DB: db as any });
    sameOriginMock.mockReturnValue(true);
    authMock.mockResolvedValue(createAuth({ userId: "user_1" }));
    upstreamGetMock.mockResolvedValue({
      user_id: "user_1",
      upstream_base_url: null,
      upstream_api_key_enc: null,
      classifier_base_url: null,
      classifier_api_key_enc: null,
      updated_at: "2026-03-11T00:00:00.000Z",
    });

    const response = await PUT(
      new Request("http://localhost/api/v1/user/me", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          preferred_models: [],
          blocklist: [],
          default_model: "global/fallback",
          classifier_model: "global/classifier",
          routing_instructions: null,
          custom_catalog: null,
          profiles: [
            { id: "auto", name: "Auto", defaultModel: "", classifierModel: "   " },
            {
              id: "auto-cheap",
              name: "Cheap Auto",
              overrideModels: true,
              defaultModel: "",
              classifierModel: "   ",
              blocklist: ["", " model/blocked ", "   "],
              catalogFilter: ["", " model/allowed ", "   "],
            },
          ],
        }),
      })
    );

    expect(response.status).toBe(200);
    const bindArgs = db.__bindMock.mock.calls.at(-1) ?? [];
    const persistedProfiles = JSON.parse(String(bindArgs[6])) as Array<Record<string, unknown>>;
    expect(persistedProfiles).toEqual([
      { id: "auto", name: "Auto" },
      {
        id: "auto-cheap",
        name: "Cheap Auto",
        overrideModels: true,
        blocklist: ["model/blocked"],
        catalogFilter: ["model/allowed"],
      },
    ]);
  });
});
