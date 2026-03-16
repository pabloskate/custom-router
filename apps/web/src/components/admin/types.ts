import type { ComponentType, ReactNode } from "react";

import { type SaveActionState } from "./SaveActionBar";
import type { UserInfo } from "@/src/features/account-settings/contracts";
import type { GatewaySummary } from "@/src/features/gateways/contracts";

export type { ServerUserInfo, UserInfo, hydrateUser } from "@/src/features/account-settings/contracts";
export type { GatewaySummary } from "@/src/features/gateways/contracts";

export type AdminSection = "configure" | "use" | "account";

export type AdminTabIcon = ComponentType<{ className?: string }>;
export type RoutingDraftState = SaveActionState;

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
