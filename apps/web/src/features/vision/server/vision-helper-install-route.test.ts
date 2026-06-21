import { describe, expect, it } from "vitest";

import {
  buildVisionHelperInstallScript,
  buildVisionHelperPowerShellInstallScript,
} from "./vision-helper-install-route";

describe("vision helper install route", () => {
  it("builds a self-hosted install script for the request origin", () => {
    const script = buildVisionHelperInstallScript(new Request("https://router.example.com/api/v1/vision/helper/install.sh"));

    expect(script).toContain("https://router.example.com/vision-helper/customrouter-vision-helper.mjs");
    expect(script).toContain("$HOME/.customrouter/vision-helper");
    expect(script).toContain("Node.js 20 or newer");
    expect(script).not.toContain("github.com");
    expect(script).not.toContain("npm install");
  });

  it("builds a self-hosted PowerShell install script for Windows users", () => {
    const script = buildVisionHelperPowerShellInstallScript(new Request("https://router.example.com/api/v1/vision/helper/install.ps1"));

    expect(script).toContain("https://router.example.com/vision-helper/customrouter-vision-helper.mjs");
    expect(script).toContain("Join-Path $HOME");
    expect(script).toContain("Invoke-WebRequest");
    expect(script).toContain("Node.js 20 or newer");
    expect(script).not.toContain("github.com");
    expect(script).not.toContain("npm install");
  });
});
