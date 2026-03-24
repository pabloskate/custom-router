import type { AuthResult } from "@/src/lib/auth";
import { gatewayRowToPublic, loadGatewaysWithMigration } from "@/src/lib/storage";
import type { D1Database } from "@/src/lib/infra/cloudflare-types";

import type { UserRouterConfig } from "./router-service-types";

export async function buildUserRouterConfig(args: {
  auth: AuthResult;
  db: D1Database;
}): Promise<UserRouterConfig> {
  const gatewayRows = await loadGatewaysWithMigration({
    db: args.db,
    userId: args.auth.userId,
    upstreamBaseUrl: args.auth.upstreamBaseUrl ?? null,
    upstreamApiKeyEnc: args.auth.upstreamApiKeyEnc ?? null,
    customCatalogJson: args.auth.customCatalog ? JSON.stringify(args.auth.customCatalog) : null,
  }).then((rows) => rows.map(gatewayRowToPublic)).catch(() => []);

  return {
    preferredModels: args.auth.preferredModels,
    customCatalog: args.auth.customCatalog,
    profiles: args.auth.profiles,
    gatewayRows,
    classifierBaseUrl: args.auth.classifierBaseUrl,
    classifierApiKeyEnc: args.auth.classifierApiKeyEnc,
    routeTriggerKeywords: args.auth.routeTriggerKeywords,
    routingFrequency: args.auth.routingFrequency,
    routeLoggingEnabled: args.auth.routeLoggingEnabled,
    routingConfigRequiresReset: args.auth.routingConfigRequiresReset,
  };
}
