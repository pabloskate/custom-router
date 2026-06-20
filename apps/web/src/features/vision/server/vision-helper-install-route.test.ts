import { describe, expect, it } from "vitest";

import { buildVisionHelperInstallScript } from "./vision-helper-install-route";

describe("vision helper install route", () => {
  it("builds a self-hosted install script for the request origin", () => {
    const script = buildVisionHelperInstallScript(new Request("https://router.example.com/api/v1/vision/helper/install.sh"));

    expect(script).toContain("https://router.example.com/vision-helper/customrouter-vision-helper.mjs");
    expect(script).toContain("$HOME/.customrouter/vision-helper");
    expect(script).toContain("Node.js 20 or newer");
    expect(script).not.toContain("github.com");
    expect(script).not.toContain("npm install");
  });
});
