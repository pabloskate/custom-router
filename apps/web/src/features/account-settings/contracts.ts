import type { CatalogItem, RouterProfile } from "@custom-router/core";

import { normalizeProfiles } from "@/src/lib/routing/profile-config";

export type ServerUserInfo = {
  id: string;
  name: string;
  email?: string;
  updatedAt: string;
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

export type UpdateUserInfoRequest = {
  expected_updated_at: string;
  profiles?: RouterProfile[] | null;
  route_trigger_keywords?: string[] | null;
  routing_frequency?: string | null;
  route_logging_enabled?: boolean;
};

function hasOwn<T extends object, K extends PropertyKey>(value: T, key: K): value is T & Record<K, unknown> {
  return Object.prototype.hasOwnProperty.call(value, key);
}

export function hydrateUser(user: ServerUserInfo): UserInfo {
  return {
    ...user,
    profiles: user.routingConfigRequiresReset ? null : normalizeProfiles(user.profiles),
  };
}

export function buildUserInfoUpdateRequest(args: {
  expectedUpdatedAt: string;
  updates: Partial<UserInfo>;
}): UpdateUserInfoRequest {
  const payload: UpdateUserInfoRequest = {
    expected_updated_at: args.expectedUpdatedAt,
  };

  if (hasOwn(args.updates, "profiles")) {
    payload.profiles = args.updates.profiles ?? null;
  }

  if (hasOwn(args.updates, "routeTriggerKeywords")) {
    payload.route_trigger_keywords = args.updates.routeTriggerKeywords ?? null;
  }

  if (hasOwn(args.updates, "routingFrequency")) {
    payload.routing_frequency = args.updates.routingFrequency ?? null;
  }

  if (hasOwn(args.updates, "routeLoggingEnabled")) {
    payload.route_logging_enabled = args.updates.routeLoggingEnabled === true;
  }

  return payload;
}
