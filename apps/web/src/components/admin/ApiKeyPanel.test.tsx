import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { ApiKeyPanel } from "./ApiKeyPanel";

describe("ApiKeyPanel", () => {
  it("renders the empty-state call to action when no keys exist", () => {
    const markup = renderToStaticMarkup(
      createElement(ApiKeyPanel, {
        keys: [],
        onKeysChanged: () => undefined,
        onStatus: () => undefined,
        onError: () => undefined,
      })
    );

    expect(markup).toContain("No API Keys Yet");
    expect(markup).toContain("Generate your first API key");
    expect(markup).toContain("Generate API Key");
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
