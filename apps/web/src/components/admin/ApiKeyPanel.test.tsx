import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { ApiKeyPanel } from "./ApiKeyPanel";

describe("ApiKeyPanel", () => {
  it("renders OpenAI-compatible quickstart guidance", () => {
    const markup = renderToStaticMarkup(
      createElement(ApiKeyPanel, {
        keys: [],
        onKeysChanged: () => undefined,
        onStatus: () => undefined,
        onError: () => undefined,
      })
    );

    expect(markup).toContain("Quickstart");
    expect(markup).toContain("OpenAI-compatible");
    expect(markup).toContain("/api/v1/chat/completions");
    expect(markup).toContain("/api/v1/responses");
    expect(markup).toContain('model: &quot;auto&quot;');
    expect(markup).toContain("baseURL: &quot;/api/v1&quot;");
    expect(markup).toContain("Authorization: Bearer YOUR_API_KEY");
    expect(markup).toContain("Copy base URL");
    expect(markup).toContain("Copy endpoints");
    expect(markup).toContain("Copy SDK");
    expect(markup).toContain("Copy curl");
  });

  it("renders delete actions for existing keys", () => {
    const markup = renderToStaticMarkup(
      createElement(ApiKeyPanel, {
        keys: [
          {
            id: "key_1",
            prefix: "ar_sk_test_",
            label: "API Key",
            revoked: false,
            createdAt: "2026-03-13T00:00:00.000Z",
          },
        ],
        onKeysChanged: () => undefined,
        onStatus: () => undefined,
        onError: () => undefined,
      })
    );

    expect(markup).toContain("Revoke");
    expect(markup).toContain("Delete");
  });
});
