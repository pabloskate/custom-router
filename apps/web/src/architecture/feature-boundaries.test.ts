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

  it("keeps feature-owned admin shell wiring out of legacy admin adapters", () => {
    const adminShell = fs.readFileSync(path.resolve(process.cwd(), "src/features/admin-shell/admin-shell.tsx"), "utf8");
    const useAdminData = fs.readFileSync(path.resolve(process.cwd(), "src/features/admin-shell/use-admin-data.ts"), "utf8");

    expect(adminShell).not.toMatch(/@\/src\/components\/admin\/admin-(extensions|tab-registry|tabs)/);
    expect(adminShell).not.toContain('@/src/components/admin/types');
    expect(useAdminData).not.toContain('@/src/components/admin/types');
  });

  it("keeps the user settings route as a thin adapter", () => {
    const route = fs.readFileSync(path.resolve(process.cwd(), "app/api/v1/user/me/route.ts"), "utf8");

    expect(route).toContain("handleGetCurrentUser");
    expect(route).toContain("handleUpdateCurrentUser");
    expect(route).not.toMatch(/\b(loadGatewaysWithMigration|getUserUpstreamCredentials|normalizeProfile|request\.json)\b/);
  });
});
