import type { ZodTypeAny } from "zod";

import { parseJsonBody, withBrowserSessionOrApiKeyAuth } from "@/src/lib/auth";

import { buildUserRouterConfig } from "./routed-request-context";
import { routeAndProxy } from "@/src/lib/routing/router-service";
import type { RoutedApiPath, RoutedRequestBody } from "./router-service-types";

export function createRoutedEndpoint<TSchema extends ZodTypeAny>(args: {
  schema: TSchema;
  apiPath: RoutedApiPath;
  dryRun?: boolean;
}) {
  return async function POST(request: Request): Promise<Response> {
    return withBrowserSessionOrApiKeyAuth(request, async (auth, bindings) => {
      const parsed = await parseJsonBody(request, args.schema);
      if (parsed.response) {
        return parsed.response;
      }

      const userConfig = await buildUserRouterConfig({
        auth,
        db: bindings.ROUTER_DB!,
      });

      const result = await routeAndProxy({
        body: parsed.data as RoutedRequestBody,
        apiPath: args.apiPath,
        dryRun: args.dryRun,
        userConfig,
      });

      return result.response;
    });
  };
}
