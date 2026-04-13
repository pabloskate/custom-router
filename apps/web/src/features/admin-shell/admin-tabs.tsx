import React, { type Dispatch, type SetStateAction } from "react";

import { ApiKeyPanel } from "@/src/components/admin/ApiKeyPanel";
import { InviteCodePanel } from "@/src/components/admin/InviteCodePanel";
import { ProfilesPanel, type RouterProfile } from "@/src/components/admin/ProfilesPanel";
import { RouterConfigPanel } from "@/src/components/admin/RouterConfigPanel";
import { type AdminExtensionContext, type AdminTabDefinition, type ApiKeyInfo, type RoutingDraftState, type UserInfo } from "./types";
import { GatewayPanel } from "@/src/features/gateways/components/GatewayPanel";
import type { GatewayInfo, GatewayModel } from "@/src/features/gateways/contracts";
import { PlaygroundPanel } from "@/src/features/playground/PlaygroundPanel";
import { LogsPanelWithState } from "@/src/features/routing-logs/LogsPanel";
import { QuickstartPanel } from "@/src/features/routing-quickstart/QuickstartPanel";
import { type RegistrationMode } from "@/src/lib/constants";

type BaseAdminTabsArgs = {
  setUser: Dispatch<SetStateAction<UserInfo | null>>;
  keys: ApiKeyInfo[];
  gateways: GatewayInfo[];
  reloadData: () => Promise<void>;
  setStatus: (message: string) => void;
  setError: (message?: string) => void;
  saveUserData: (updates: Partial<UserInfo>) => Promise<boolean>;
  reroutingDraftState: RoutingDraftState;
  profilesDraftState: RoutingDraftState;
  markReroutingDirty: () => void;
  markProfilesDirty: () => void;
  saveReroutingData: (updates: Partial<UserInfo>) => Promise<boolean>;
  saveProfilesData: (updates: Partial<UserInfo>) => Promise<boolean>;
  registrationMode: RegistrationMode;
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

function IconQuickstart({ className }: { className?: string }) {
  return (
    <svg className={className} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
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

function IconLogs({ className }: { className?: string }) {
  return (
    <svg className={className} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M8 6h13" />
      <path d="M8 12h13" />
      <path d="M8 18h13" />
      <path d="M3 6h.01" />
      <path d="M3 12h.01" />
      <path d="M3 18h.01" />
    </svg>
  );
}

function IconInvite({ className }: { className?: string }) {
  return (
    <svg className={className} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2Z"/>
      <path d="M13 5v2"/><path d="M13 17v2"/><path d="M13 11v2"/>
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
  const tabs: AdminTabDefinition[] = [
    {
      id: "gateways",
      label: "Gateways",
      section: "configure",
      title: "Gateways",
      subtitle: "Register upstream API providers and keep their models in sync",
      order: 100,
      icon: IconGateway,
      render: (ctx: AdminExtensionContext) => (
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
      title: "Routing Profiles",
      subtitle: "Configure model selection, routing instructions, and profiles",
      order: 200,
      icon: IconRouting,
      render: (ctx: AdminExtensionContext) => (
        <div className="animate-fade-in" style={{ display: "flex", flexDirection: "column", gap: "var(--space-6)" }}>
          <div className="card">
            <div className="card-header">
              <h3>Global Settings</h3>
              <p style={{ fontSize: "0.875rem", color: "var(--text-muted)", marginTop: "var(--space-1)", marginBottom: 0 }}>Shared defaults for models, blocking, and re-routing behavior</p>
            </div>
            <div className="card-body">
              <RouterConfigPanel
                config={{
                  routeTriggerKeywords: ctx.user.routeTriggerKeywords ?? null,
                  routingFrequency: ctx.user.routingFrequency ?? null,
                }}
                onChange={(updated) => {
                  args.setUser((current) => (current ? { ...current, ...updated } : current));
                  args.markReroutingDirty();
                }}
                saveState={ctx.reroutingDraftState}
                onSave={ctx.saveReroutingData}
              />
            </div>
          </div>

          <ProfilesPanel
            profiles={ctx.user.profiles ?? null}
            gateways={args.gateways}
            onChange={(profiles) => {
              args.setUser((current) => (current ? { ...current, profiles } : current));
              args.markProfilesDirty();
            }}
            saveState={ctx.profilesDraftState}
            onSave={(profiles) => ctx.saveProfilesData({ profiles })}
            onProfileBuilderApplied={args.reloadData}
            routingConfigRequiresReset={ctx.user.routingConfigRequiresReset}
            routingConfigResetMessage={ctx.user.routingConfigResetMessage}
            onResetLegacyConfig={async () => {
              const resetProfiles: RouterProfile[] = [];
              args.setUser((current) => current ? {
                ...current,
                profiles: resetProfiles,
                routingConfigRequiresReset: false,
                routingConfigResetMessage: null,
              } : current);
              args.markProfilesDirty();
              await ctx.saveProfilesData({
                profiles: resetProfiles,
                routingConfigRequiresReset: false,
                routingConfigResetMessage: null,
              });
            }}
            onCreateGatewayModel={async (gatewayId, model) => {
              const gateway = args.gateways.find((entry) => entry.id === gatewayId);
              if (!gateway) {
                args.setError("Gateway not found.");
                return null;
              }

              if (gateway.models.some((entry) => entry.id === model.id)) {
                args.setError(`Model "${model.id}" already exists in this gateway.`);
                return null;
              }

              const models: GatewayModel[] = [...gateway.models, model].sort((left, right) => left.id.localeCompare(right.id));
              const response = await fetch(`/api/v1/user/gateways/${gatewayId}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ models }),
              });
              const payload = await response.json().catch(() => ({ error: "Failed to save gateway model." })) as { error?: string };
              if (!response.ok) {
                args.setError(payload.error ?? "Failed to save gateway model.");
                return null;
              }

              await args.reloadData();
              args.setStatus(`Added ${model.id} to ${gateway.name}.`);
              return model;
            }}
          />
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
      id: "quickstart",
      label: "Quickstart",
      section: "use",
      title: "Quickstart",
      subtitle: "Get up and running with code examples for every integration",
      order: 150,
      icon: IconQuickstart,
      render: (ctx: AdminExtensionContext) => (
        <div className="animate-fade-in">
          <QuickstartPanel
            profiles={ctx.user.profiles}
            hasKeys={args.keys.some((k) => !k.revoked)}
          />
        </div>
      ),
    },
    {
      id: "playground",
      label: "Playground",
      section: "use",
      title: "Playground",
      subtitle: "Send test requests and inspect routing decisions inline",
      order: 200,
      icon: IconPlayground,
      render: (ctx: AdminExtensionContext) => (
        <div className="animate-fade-in">
          <PlaygroundPanel profiles={ctx.user.profiles} />
        </div>
      ),
    },
    {
      id: "logs",
      label: "Logs",
      section: "use",
      title: "Logs",
      subtitle: "Review recent routed requests and the models they selected",
      order: 250,
      icon: IconLogs,
      render: (ctx: AdminExtensionContext) => (
        <div className="animate-fade-in">
          <LogsPanelWithState
            enabled={ctx.user.routeLoggingEnabled}
            onToggle={async (enabled) => {
              return args.saveUserData({ routeLoggingEnabled: enabled });
            }}
          />
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

  if (args.registrationMode === "invite") {
    tabs.splice(-1, 0, {
      id: "invites",
      label: "Invites",
      section: "account",
      title: "Invite Codes",
      subtitle: "Generate and manage invite codes for new users",
      order: 50,
      icon: IconInvite,
      render: () => (
        <div className="animate-fade-in">
          <div className="card">
            <div className="card-header">
              <h3>Invite Codes</h3>
            </div>
            <div className="card-body">
              <InviteCodePanel
                onStatus={args.setStatus}
                onError={(msg) => args.setError(msg)}
              />
            </div>
          </div>
        </div>
      ),
    });
  }

  return tabs;
}
