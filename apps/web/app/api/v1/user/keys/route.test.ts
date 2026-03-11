import { beforeEach, describe, expect, it, vi } from "vitest";

import { authenticateSession, generateApiKey, hashKey } from "@/src/lib/auth";
import { isSameOriginRequest } from "@/src/lib/csrf";
import { getRuntimeBindings } from "@/src/lib/runtime";
import { POST } from "./route";

vi.mock("@/src/lib/runtime", () => ({
  getRuntimeBindings: vi.fn(),
}));

vi.mock("@/src/lib/auth", () => ({
  authenticateSession: vi.fn(),
  generateApiKey: vi.fn(),
  hashKey: vi.fn(),
}));

vi.mock("@/src/lib/csrf", () => ({
  isSameOriginRequest: vi.fn(),
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

  beforeEach(() => {
    vi.clearAllMocks();
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
});
