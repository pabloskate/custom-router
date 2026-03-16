import type { CatalogItem, RouterProfile } from "@custom-router/core";

import { mergeLegacyRoutingInstructions } from "@/src/lib/routing/profile-config";

export type ServerUserInfo = {
  id: string;
  name: string;
  email?: string;
  preferredModels: string[];
  defaultModel: string | null;
  classifierModel: string | null;
  routingInstructions?: string | null;
  blocklist: string[] | null;
  customCatalog: CatalogItem[] | null;
  profiles: RouterProfile[] | null;
  routeTriggerKeywords: string[] | null;
  routingFrequency: string | null;
  smartPinTurns: number | null;
};

export type UserInfo = Omit<ServerUserInfo, "routingInstructions">;

export function hydrateUser(user: ServerUserInfo): UserInfo {
  const { routingInstructions: legacyRoutingInstructions, ...rest } = user;
  return {
    ...rest,
    profiles: mergeLegacyRoutingInstructions({
      profiles: user.profiles,
      routingInstructions: legacyRoutingInstructions,
    }),
  };
}
