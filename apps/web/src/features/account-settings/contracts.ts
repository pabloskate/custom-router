import type { CatalogItem, RouterProfile } from "@custom-router/core";

import { normalizeProfiles } from "@/src/lib/routing/profile-config";

export type ServerUserInfo = {
  id: string;
  name: string;
  email?: string;
  preferredModels: string[];
  customCatalog: CatalogItem[] | null;
  profiles: RouterProfile[] | null;
  routeTriggerKeywords: string[] | null;
  routingFrequency: string | null;
  routeLoggingEnabled: boolean;
  routingConfigRequiresReset: boolean;
  routingConfigResetMessage?: string | null;
};

export type UserInfo = ServerUserInfo;

export function hydrateUser(user: ServerUserInfo): UserInfo {
  return {
    ...user,
    profiles: user.routingConfigRequiresReset ? null : normalizeProfiles(user.profiles),
  };
}
