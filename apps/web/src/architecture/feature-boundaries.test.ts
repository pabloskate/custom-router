import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

function collectRouteFiles(dir: string): string[] {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  return entries.flatMap((entry) => {
    const entryPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      return collectRouteFiles(entryPath);
    }
    return entry.name === "route.ts" ? [entryPath] : [];
  });
}

describe("feature boundaries", () => {
  it("keeps low-level auth imports out of non-auth route handlers", () => {
    const routeRoot = path.resolve(process.cwd(), "app/api/v1");
    const exempt = new Set([
      path.resolve(routeRoot, "admin/verify/route.ts"),
      path.resolve(routeRoot, "billing/enterprise-inquiry/route.ts"),
    ]);

    const lowLevelAuthPattern = /\b(authenticateRequest|authenticateSession|isSameOriginRequest|verifyAdminSecret)\b/;
    const routeFiles = collectRouteFiles(routeRoot)
      .map((file) => path.resolve(file))
      .filter((file) => !file.includes(`${path.sep}auth${path.sep}`))
      .filter((file) => !exempt.has(file));

    for (const file of routeFiles) {
      const contents = fs.readFileSync(file, "utf8");
      expect(contents, path.relative(process.cwd(), file)).not.toMatch(lowLevelAuthPattern);
    }
  });

  it("keeps routed endpoints on the shared factory", () => {
    const routedEndpoints = [
      path.resolve(process.cwd(), "app/api/v1/chat/completions/route.ts"),
      path.resolve(process.cwd(), "app/api/v1/responses/route.ts"),
      path.resolve(process.cwd(), "app/api/v1/completions/route.ts"),
      path.resolve(process.cwd(), "app/api/v1/router/inspect/route.ts"),
    ];

    for (const file of routedEndpoints) {
      const contents = fs.readFileSync(file, "utf8");
      expect(contents, path.relative(process.cwd(), file)).toMatch(
        /create(?:Billed)?RoutedEndpoint/
      );
      expect(contents, path.relative(process.cwd(), file)).not.toMatch(/\b(routeAndProxy|authenticateRequest|authenticateSession|loadGatewaysWithMigration)\b/);
    }
  });

  it("keeps shared UI contracts out of admin component definitions", () => {
    const profilesPanel = fs.readFileSync(path.resolve(process.cwd(), "src/components/admin/ProfilesPanel.tsx"), "utf8");
    const gatewayPanel = fs.readFileSync(path.resolve(process.cwd(), "src/components/admin/GatewayPanel.tsx"), "utf8");

    expect(profilesPanel).not.toContain("export type RouterProfile =");
    expect(gatewayPanel).not.toContain("export interface GatewayInfo");
    expect(gatewayPanel).not.toContain("export interface GatewayModel");
  });
});
