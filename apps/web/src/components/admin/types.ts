import type { ComponentType, ReactNode } from "react";

import { type CatalogItem } from "./CatalogEditorPanel";
import { type RouterProfile } from "./ProfilesPanel";
import { type SaveActionState } from "./SaveActionBar";

export type AdminSection = "configure" | "use" | "account";

export type AdminTabIcon = ComponentType<{ className?: string }>;

export type ServerUserInfo = {
  id: string;
  name: string;
  email?: string;
  preferredModels: string[];
  defaultModel: string | null;
  classifierModel: string | null;
  routingInstructions: string | null;
  blocklist: string[] | null;
  customCatalog: CatalogItem[] | null;
  profiles: RouterProfile[] | null;
  routeTriggerKeywords: string[] | null;
  routingFrequency: string | null;
};

export type UserInfo = ServerUserInfo;
export type RoutingDraftState = SaveActionState;

export type GatewaySummary = {
  id: string;
  name: string;
  models: Array<{ id: string; name?: string }>;
};

export type ApiKeyInfo = {
  id: string;
  prefix: string;
  label: string | null;
  revoked: boolean;
  createdAt: string;
};

export type AdminExtensionContext = {
  user: UserInfo;
  reloadData: () => Promise<void>;
  setStatus: (message: string) => void;
  setError: (message?: string) => void;
  saveUserData: (updates: Partial<UserInfo>) => Promise<boolean>;
  routingDraftState: RoutingDraftState;
  markRoutingDirty: () => void;
  saveRoutingData: (updates: Partial<UserInfo>) => Promise<boolean>;
};

export type AdminTabDefinition = {
  id: string;
  label: string;
  section: AdminSection;
  title: string;
  subtitle: string;
  order: number;
  icon?: AdminTabIcon;
  render: (ctx: AdminExtensionContext) => ReactNode;
};

export function hydrateUser(user: ServerUserInfo): UserInfo {
  return user;
}
