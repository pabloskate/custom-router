import { beforeEach, describe, expect, it, vi } from "vitest";

import { authenticateSession, generateApiKey, hashKey, isSameOriginRequest, withCsrf, withSessionAuth } from "@/src/lib/auth";
import { getRuntimeBindings } from "@/src/lib/infra";
import { DELETE, POST } from "./route";

vi.mock("@/src/lib/infra", async () => {
  const actual = await vi.importActual<typeof import("@/src/lib/infra")>("@/src/lib/infra");
  return {
    ...actual,
    getRuntimeBindings: vi.fn(),
  };
});

vi.mock("@/src/lib/auth", () => ({
  authenticateSession: vi.fn(),
  generateApiKey: vi.fn(),
  hashKey: vi.fn(),
  isSameOriginRequest: vi.fn(),
  withCsrf: vi.fn(),
  withSessionAuth: vi.fn(),
}));

function createDbMock() {
  const runMock = vi.fn(async () => ({ meta: { changes: 1 } }));
  const bindMock = vi.fn((..._args: unknown[]) => ({ run: runMock }));
  const prepareMock = vi.fn((_sql: string) => ({ bind: bindMock }));
  return {
    prepare: prepareMock,
  };
}

describe("/api/v1/user/keys route", () => {
  const runtimeMock = vi.mocked(getRuntimeBindings);
  const authMock = vi.mocked(authenticateSession);
  const sameOriginMock = vi.mocked(isSameOriginRequest);
  const generateApiKeyMock = vi.mocked(generateApiKey);
  const hashKeyMock = vi.mocked(hashKey);
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

  it("marks the one-time key response as no-store", async () => {
    runtimeMock.mockReturnValue({ ROUTER_DB: createDbMock() as any });
    sameOriginMock.mockReturnValue(true);
    authMock.mockResolvedValue({ userId: "user_1" } as any);
    generateApiKeyMock.mockReturnValue({
      raw: "ar_sk_test_key",
      hash: "",
      prefix: "ar_sk_test_",
    });
    hashKeyMock.mockResolvedValue("hashed-key");

    const response = await POST(
      new Request("http://localhost/api/v1/user/keys", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ label: "API Key" }),
      })
    );

    expect(response.status).toBe(201);
    expect(response.headers.get("cache-control")).toBe("no-store");
    const body = await response.json() as { apiKey: string };
    expect(body.apiKey).toBe("ar_sk_test_key");
  });

  it("deletes a key when action=delete is requested", async () => {
    const db = createDbMock();
    runtimeMock.mockReturnValue({ ROUTER_DB: db as any });
    sameOriginMock.mockReturnValue(true);
    authMock.mockResolvedValue({ userId: "user_1" } as any);

    const response = await DELETE(
      new Request("http://localhost/api/v1/user/keys?keyId=key_1&action=delete", {
        method: "DELETE",
      })
    );

    expect(response.status).toBe(200);
    expect(db.prepare).toHaveBeenCalledWith("DELETE FROM api_keys WHERE id = ?1 AND user_id = ?2");
  });
});
