import type { Dispatch, SetStateAction } from "react";

import { ApiKeyPanel } from "../ApiKeyPanel";
import { GatewayPanel } from "../GatewayPanel";
import { PlaygroundPanel } from "../PlaygroundPanel";
import { ProfilesPanel } from "../ProfilesPanel";
import { RouterConfigPanel } from "../RouterConfigPanel";
import { type AdminExtensionContext, type AdminTabDefinition, type ApiKeyInfo, type UserInfo } from "./types";

type BaseAdminTabsArgs = {
  setUser: Dispatch<SetStateAction<UserInfo | null>>;
  keys: ApiKeyInfo[];
  gatewayModelOptions: string[];
  reloadData: () => Promise<void>;
  setStatus: (message: string) => void;
  setError: (message?: string) => void;
  saveUserData: (updates: Partial<UserInfo>) => Promise<boolean>;
};

function IconGateway({ className }: { className?: string }) {
  return (
    <svg className={className} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="7" width="20" height="10" rx="2" />
      <path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2" />
      <line x1="12" y1="12" x2="12" y2="12" />
    </svg>
  );
}

function IconRouting({ className }: { className?: string }) {
  return (
    <svg className={className} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="18" cy="18" r="3" />
      <circle cx="6" cy="6" r="3" />
      <path d="M13 6h3a2 2 0 0 1 2 2v7" />
      <line x1="6" y1="9" x2="6" y2="21" />
    </svg>
  );
}

function IconKeys({ className }: { className?: string }) {
  return (
    <svg className={className} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  );
}

function IconPlayground({ className }: { className?: string }) {
  return (
    <svg className={className} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  );
}

function IconAccount({ className }: { className?: string }) {
  return (
    <svg className={className} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  );
}

function InventoryBadge({ activeKeys, revokedKeys }: { activeKeys: number; revokedKeys: number }) {
  return (
    <div className="badge badge--info">
      <span className="status-dot status-dot--info" />
      {activeKeys} active, {revokedKeys} revoked
    </div>
  );
}

export function getBaseAdminTabs(args: BaseAdminTabsArgs): AdminTabDefinition[] {
  return [
    {
      id: "gateways",
      label: "Gateways",
      section: "configure",
      title: "Gateways",
      subtitle: "Register upstream API providers and assign models to each gateway",
      order: 100,
      icon: IconGateway,
      render: () => (
        <div className="animate-fade-in">
          <GatewayPanel
            onStatus={(message) => {
              args.setStatus(message);
              void args.reloadData();
            }}
            onError={(message) => args.setError(message)}
          />
        </div>
      ),
    },
    {
      id: "routing",
      label: "Routing",
      section: "configure",
      title: "Routing",
      subtitle: "Configure model selection, rules, and routing profiles",
      order: 200,
      icon: IconRouting,
      render: (ctx: AdminExtensionContext) => (
        <div className="animate-fade-in" style={{ display: "flex", flexDirection: "column", gap: "var(--space-6)" }}>
          <div className="card">
            <div className="card-header">
              <h3>Router Configuration</h3>
            </div>
            <div className="card-body">
              <RouterConfigPanel
                config={{
                  defaultModel: ctx.user.defaultModel ?? null,
                  classifierModel: ctx.user.classifierModel ?? null,
                  routingInstructions: ctx.user.routingInstructions ?? null,
                  blocklist: ctx.user.blocklist ?? null,
                  showModelInResponse: ctx.user.showModelInResponse,
                  configAgentEnabled: ctx.user.configAgentEnabled,
                  configAgentOrchestratorModel: ctx.user.configAgentOrchestratorModel ?? null,
                  configAgentSearchModel: ctx.user.configAgentSearchModel ?? null,
                }}
                gatewayModelOptions={args.gatewayModelOptions}
                onChange={(updated) => {
                  args.setUser((current) => (current ? { ...current, ...updated } : current));
                }}
                onSave={ctx.saveUserData}
              />
            </div>
          </div>

          <div className="card">
            <div className="card-header">
              <h3>Routing Profiles</h3>
            </div>
            <div className="card-body">
              <ProfilesPanel
                profiles={ctx.user.profiles ?? null}
                onChange={(profiles) => {
                  args.setUser((current) => (current ? { ...current, profiles } : current));
                }}
                onSave={() => ctx.saveUserData({})}
              />
            </div>
          </div>
        </div>
      ),
    },
    {
      id: "keys",
      label: "API Keys",
      section: "use",
      title: "API Keys",
      subtitle: "Provision and manage access keys for the proxy",
      order: 100,
      icon: IconKeys,
      render: () => {
        const activeKeys = args.keys.filter((key) => !key.revoked).length;
        const revokedKeys = args.keys.filter((key) => key.revoked).length;

        return (
          <div className="animate-fade-in">
            <div className="card">
              <div className="card-header">
                <h3>API Keys</h3>
                <InventoryBadge activeKeys={activeKeys} revokedKeys={revokedKeys} />
              </div>
              <div className="card-body">
                <ApiKeyPanel
                  keys={args.keys}
                  onKeysChanged={() => void args.reloadData()}
                  onStatus={args.setStatus}
                  onError={args.setError}
                />
              </div>
            </div>
          </div>
        );
      },
    },
    {
      id: "playground",
      label: "Playground",
      section: "use",
      title: "Playground",
      subtitle: "Send test requests and inspect routing decisions",
      order: 200,
      icon: IconPlayground,
      render: (ctx: AdminExtensionContext) => (
        <div className="animate-fade-in">
          <PlaygroundPanel profiles={ctx.user.profiles} />
        </div>
      ),
    },
    {
      id: "account",
      label: "Account",
      section: "account",
      title: "Account",
      subtitle: "Your profile information",
      order: 100,
      icon: IconAccount,
      render: (ctx: AdminExtensionContext) => (
        <div className="animate-fade-in">
          <div className="card">
            <div className="card-body">
              <div className="form-group">
                <label className="form-label">Display Name</label>
                <input className="input" type="text" value={ctx.user.name} disabled />
                <span className="form-hint">Contact support to change your display name</span>
              </div>
              {ctx.user.email && (
                <div className="form-group mt-4">
                  <label className="form-label">Email</label>
                  <input className="input" type="text" value={ctx.user.email} disabled />
                </div>
              )}
            </div>
          </div>
        </div>
      ),
    },
  ];
}
