import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AuthResult } from "@/src/lib/auth";
import { authenticateSession } from "@/src/lib/auth";
import { isSameOriginRequest } from "@/src/lib/csrf";
import { gatewayRowToPublic, loadGatewaysWithMigration } from "@/src/lib/gateway-store";
import { getRuntimeBindings } from "@/src/lib/runtime";
import { getUserUpstreamCredentials, upsertUserUpstreamCredentials } from "@/src/lib/user-upstream-store";
import { GET, PUT } from "./route";

vi.mock("@/src/lib/runtime", () => ({
  getRuntimeBindings: vi.fn(),
}));

vi.mock("@/src/lib/auth", () => ({
  authenticateSession: vi.fn(),
}));

vi.mock("@/src/lib/csrf", () => ({
  isSameOriginRequest: vi.fn(),
}));

vi.mock("@/src/lib/user-upstream-store", () => ({
  getUserUpstreamCredentials: vi.fn(),
  upsertUserUpstreamCredentials: vi.fn(),
}));

vi.mock("@/src/lib/gateway-store", () => ({
  loadGatewaysWithMigration: vi.fn(),
  gatewayRowToPublic: vi.fn(),
}));

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
    showModelInResponse: false,
    configAgentEnabled: false,
    configAgentOrchestratorModel: null,
    configAgentSearchModel: null,
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
  const loadGatewaysMock = vi.mocked(loadGatewaysWithMigration);
  const toPublicMock = vi.mocked(gatewayRowToPublic);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("GET includes config agent fields", async () => {
    runtimeMock.mockReturnValue({ ROUTER_DB: {} as any });
    authMock.mockResolvedValue(
      createAuth({
        configAgentEnabled: true,
        configAgentOrchestratorModel: "model/orchestrator",
        configAgentSearchModel: "model/search",
      })
    );

    const response = await GET(new Request("http://localhost/api/v1/user/me"));
    expect(response.status).toBe(200);

    const body = await response.json() as any;
    expect(body.user.configAgentEnabled).toBe(true);
    expect(body.user.configAgentOrchestratorModel).toBe("model/orchestrator");
    expect(body.user.configAgentSearchModel).toBe("model/search");
  });

  it("PUT persists new config agent fields when models are valid gateway models", async () => {
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
    loadGatewaysMock.mockResolvedValue([
      {
        id: "gw_1",
        user_id: "user_1",
        name: "Gateway",
        base_url: "https://gateway.example/v1",
        api_key_enc: "enc",
        models_json: "[]",
        created_at: "2026-03-11T00:00:00.000Z",
        updated_at: "2026-03-11T00:00:00.000Z",
      },
    ] as any);
    toPublicMock.mockReturnValue({
      id: "gw_1",
      baseUrl: "https://gateway.example/v1",
      apiKeyEnc: "enc",
      models: [{ id: "model/orchestrator" }, { id: "model/search" }],
    } as any);
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
          show_model_in_response: false,
          config_agent_enabled: true,
          config_agent_orchestrator_model: "model/orchestrator",
          config_agent_search_model: "model/search",
        }),
      })
    );

    expect(response.status).toBe(200);
    expect(db.prepare).toHaveBeenCalled();
    const updateSql = db.prepare.mock.calls.find((entry: [string]) => entry[0].includes("UPDATE users"))?.[0] ?? "";
    expect(updateSql).toContain("config_agent_enabled");
    expect(updateSql).toContain("config_agent_orchestrator_model");
    expect(updateSql).toContain("config_agent_search_model");
    const bindArgs = db.__bindMock.mock.calls.at(-1) ?? [];
    expect(bindArgs).toContain(1);
    expect(bindArgs).toContain("model/orchestrator");
    expect(bindArgs).toContain("model/search");
  });

  it("PUT rejects config agent models that are not in the effective gateway catalog", async () => {
    runtimeMock.mockReturnValue({ ROUTER_DB: createDbMock() as any, BYOK_ENCRYPTION_SECRET: "1234567890abcdef" });
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
    loadGatewaysMock.mockResolvedValue([
      {
        id: "gw_1",
        user_id: "user_1",
        name: "Gateway",
        base_url: "https://gateway.example/v1",
        api_key_enc: "enc",
        models_json: "[]",
        created_at: "2026-03-11T00:00:00.000Z",
        updated_at: "2026-03-11T00:00:00.000Z",
      },
    ] as any);
    toPublicMock.mockReturnValue({
      id: "gw_1",
      baseUrl: "https://gateway.example/v1",
      apiKeyEnc: "enc",
      models: [{ id: "model/valid-only" }],
    } as any);

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
          show_model_in_response: false,
          config_agent_enabled: true,
          config_agent_orchestrator_model: "model/invalid",
          config_agent_search_model: null,
        }),
      })
    );

    expect(response.status).toBe(400);
    const body = await response.json() as { error: string };
    expect(body.error).toContain("Invalid config_agent_orchestrator_model");
  });
});
