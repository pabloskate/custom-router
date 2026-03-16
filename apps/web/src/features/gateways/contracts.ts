import type { CatalogItem } from "@custom-router/core";

export type GatewayModel = CatalogItem;

export interface GatewayInfo {
  id: string;
  name: string;
  baseUrl: string;
  models: GatewayModel[];
  createdAt: string;
  updatedAt: string;
}

export interface GatewaySummary {
  id: string;
  name: string;
  models: Array<Pick<GatewayModel, "id" | "name">>;
}
