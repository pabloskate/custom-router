"use client";

// ─────────────────────────────────────────────────────────────────────────────
// admin-console.tsx
//
// Navigation: vertical sidebar with logical setup order
//   1. Gateways   — register upstreams and assign models
//   2. Routing    — configure classifier, rules, profiles
//   3. API Keys   — provision access keys to call the proxy
//   4. Playground — test everything end-to-end
//   5. Account    — name/email (bottom, rarely visited)
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useState } from "react";
import { AuthGate } from "./AuthGate";
import { ApiKeyPanel } from "./ApiKeyPanel";
import { GatewayPanel } from "./GatewayPanel";
import { PlaygroundPanel } from "./PlaygroundPanel";
import { RouterConfigPanel } from "./RouterConfigPanel";
import { ProfilesPanel, type RouterProfile } from "./ProfilesPanel";
import { type CatalogItem } from "./CatalogEditorPanel";

type TabId = "gateways" | "routing" | "keys" | "playground" | "account";

type ServerUserInfo = {
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
  showModelInResponse: boolean;
  classifierBaseUrl: string | null;
  classifierApiKeyConfigured: boolean;
};

type UserInfo = ServerUserInfo & {
  classifierApiKeyInput: string;
  clearClassifierApiKey: boolean;
};

type GatewaySummary = {
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

function hydrateUser(user: ServerUserInfo): UserInfo {
  return {
    ...user,
    classifierApiKeyInput: "",
    clearClassifierApiKey: false,
  };
}

// ─── Icons ───────────────────────────────────────────────────────────────────
function IconGateway({ className }: { className?: string }) {
  return (
    <svg className={className} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="7" width="20" height="10" rx="2" /><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2" /><line x1="12" y1="12" x2="12" y2="12" />
    </svg>
  );
}

function IconRouting({ className }: { className?: string }) {
  return (
    <svg className={className} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="18" cy="18" r="3" /><circle cx="6" cy="6" r="3" /><path d="M13 6h3a2 2 0 0 1 2 2v7" /><line x1="6" y1="9" x2="6" y2="21" />
    </svg>
  );
}

function IconKeys({ className }: { className?: string }) {
  return (
    <svg className={className} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" />
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
      <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" />
    </svg>
  );
}

function IconLogout({ className }: { className?: string }) {
  return (
    <svg className={className} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" />
    </svg>
  );
}

// ─── Status Indicator ────────────────────────────────────────────────────────
function StatusBadge({ status, error }: { status: string; error?: string }) {
  if (error) {
    return (
      <div className="badge badge--danger">
        <span className="status-dot status-dot--danger" />
        {error}
      </div>
    );
  }
  if (status === "Saving..." || status === "Loading...") {
    return (
      <div className="badge badge--info animate-pulse">
        <span className="status-dot status-dot--info" />
        {status}
      </div>
    );
  }
  if (status.includes("saved") || status.includes("Success")) {
    return (
      <div className="badge badge--success">
        <span className="status-dot status-dot--success" />
        {status}
      </div>
    );
  }
  return (
    <div className="badge badge--info">
      <span className="status-dot status-dot--info" />
      {status || "Ready"}
    </div>
  );
}

// ─── Sidebar Navigation ───────────────────────────────────────────────────────
function SideNav({
  activeTab,
  onTabChange,
  user,
  onLogout,
  status,
  error,
}: {
  activeTab: TabId;
  onTabChange: (tab: TabId) => void;
  user: UserInfo | null;
  onLogout: () => void;
  status: string;
  error?: string;
}) {
  function NavItem({ id, label, icon: Icon }: { id: TabId; label: string; icon: React.ComponentType<{ className?: string }> }) {
    return (
      <button
        className={`sidenav-item ${activeTab === id ? "sidenav-item--active" : ""}`}
        onClick={() => onTabChange(id)}
      >
        <Icon />
        <span>{label}</span>
      </button>
    );
  }

  return (
    <aside className="sidenav">
      <nav className="sidenav-nav">
        <div className="sidenav-section-label">Configure</div>
        <NavItem id="gateways" label="Gateways" icon={IconGateway} />
        <NavItem id="routing" label="Routing" icon={IconRouting} />

        <div className="sidenav-section-label">Use</div>
        <NavItem id="keys" label="API Keys" icon={IconKeys} />
        <NavItem id="playground" label="Playground" icon={IconPlayground} />

        <div className="sidenav-divider" />
        <NavItem id="account" label="Account" icon={IconAccount} />
      </nav>

      <div className="sidenav-footer">
        <StatusBadge status={status} error={error} />
        <div className="sidenav-user">
          <span className="sidenav-user-name">{user?.name}</span>
          <button className="btn btn--sm btn--ghost" onClick={onLogout} title="Log out">
            <IconLogout />
            <span className="sr-only">Log out</span>
          </button>
        </div>
      </div>
    </aside>
  );
}

// ─── Section Header ───────────────────────────────────────────────────────────
function SectionHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="admin-content-header">
      <div>
        <h2>{title}</h2>
        {subtitle && <p>{subtitle}</p>}
      </div>
    </div>
  );
}

// ─── API Keys Tab ─────────────────────────────────────────────────────────────
function ApiKeysTab({
  keys,
  onKeysChanged,
  setStatus,
  setError,
}: {
  keys: ApiKeyInfo[];
  onKeysChanged: () => void;
  setStatus: (s: string) => void;
  setError: (e?: string) => void;
}) {
  const activeKeys = keys.filter((k) => !k.revoked).length;
  const revokedKeys = keys.filter((k) => k.revoked).length;

  return (
    <div className="animate-fade-in">
      <div className="card">
        <div className="card-header">
          <h3>API Keys</h3>
          <StatusBadge status={`${activeKeys} active, ${revokedKeys} revoked`} />
        </div>
        <div className="card-body">
          <ApiKeyPanel keys={keys} onKeysChanged={onKeysChanged} onStatus={setStatus} onError={setError} />
        </div>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export function AdminConsole() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [user, setUser] = useState<UserInfo | null>(null);
  const [keys, setKeys] = useState<ApiKeyInfo[]>([]);
  const [activeTab, setActiveTab] = useState<TabId>("gateways");
  const [status, setStatus] = useState("Loading...");
  const [error, setError] = useState<string | undefined>();
  const [gatewayModelOptions, setGatewayModelOptions] = useState<string[]>([]);

  async function loadData() {
    setStatus("Loading...");
    setError(undefined);

    const [userRes, keysRes, gatewaysRes] = await Promise.all([
      fetch("/api/v1/user/me", { cache: "no-store" }),
      fetch("/api/v1/user/keys", { cache: "no-store" }),
      fetch("/api/v1/user/gateways", { cache: "no-store" }),
    ]);

    if (!userRes.ok) {
      setIsAuthenticated(false);
      setUser(null);
      setKeys([]);
      setStatus("Please log in");
      return;
    }

    if (!keysRes.ok) {
      setError("Failed to load API keys");
      setStatus("Error");
      return;
    }

    const userData = await userRes.json() as { user: ServerUserInfo };
    const keysData = await keysRes.json() as { keys: ApiKeyInfo[] };
    if (gatewaysRes.ok) {
      const gatewaysData = await gatewaysRes.json() as { gateways?: GatewaySummary[] };
      const modelIds = Array.from(
        new Set((gatewaysData.gateways ?? []).flatMap((gw) => gw.models.map((m) => m.id)).filter(Boolean))
      ).sort((a, b) => a.localeCompare(b));
      setGatewayModelOptions(modelIds);
    } else {
      setGatewayModelOptions([]);
    }

    setUser(hydrateUser(userData.user));
    setKeys(keysData.keys);
    setIsAuthenticated(true);
    setStatus("Ready");
  }

  useEffect(() => {
    void loadData();
  }, []);

  async function handleLogout() {
    await fetch("/api/v1/auth/logout", { method: "POST" });
    setIsAuthenticated(false);
    setUser(null);
    setKeys([]);
    setStatus("Logged out");
    setActiveTab("gateways");
  }

  async function saveUserData(updates: Partial<UserInfo>) {
    if (!user) return false;
    setStatus("Saving...");
    setError(undefined);

    const updatedUser = { ...user, ...updates };

    const payload: Record<string, unknown> = {
      preferred_models: updatedUser.preferredModels,
      default_model: updatedUser.defaultModel,
      classifier_model: updatedUser.classifierModel,
      routing_instructions: updatedUser.routingInstructions,
      blocklist: updatedUser.blocklist,
      custom_catalog: updatedUser.customCatalog,
      profiles: updatedUser.profiles,
      classifier_base_url: updatedUser.classifierBaseUrl,
      clear_classifier_api_key: updatedUser.clearClassifierApiKey,
      show_model_in_response: updatedUser.showModelInResponse,
    };

    if (updatedUser.classifierApiKeyInput.trim().length > 0) {
      payload.classifier_api_key = updatedUser.classifierApiKeyInput.trim();
    }

    const res = await fetch("/api/v1/user/me", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (res.ok) {
      await loadData();
      setStatus("Saved successfully");
      return true;
    }

    setError("Failed to save changes");
    setStatus("Error");
    return false;
  }

  if (!isAuthenticated) {
    return <AuthGate onAuthenticated={() => void loadData()} />;
  }

  const sectionMeta: Record<TabId, { title: string; subtitle: string }> = {
    gateways: { title: "Gateways", subtitle: "Register upstream API providers and assign models to each gateway" },
    routing: { title: "Routing", subtitle: "Configure the classifier, rules, and routing profiles" },
    keys: { title: "API Keys", subtitle: "Provision and manage access keys for the proxy" },
    playground: { title: "Playground", subtitle: "Send test requests and inspect routing decisions" },
    account: { title: "Account", subtitle: "Your profile information" },
  };

  return (
    <div className="admin-layout animate-fade-in">
      <SideNav
        activeTab={activeTab}
        onTabChange={setActiveTab}
        user={user}
        onLogout={() => void handleLogout()}
        status={status}
        error={error}
      />

      <div>
        <SectionHeader
          title={sectionMeta[activeTab].title}
          subtitle={sectionMeta[activeTab].subtitle}
        />

        {activeTab === "gateways" && (
          <div className="animate-fade-in">
            <GatewayPanel
              onStatus={(msg) => {
                setStatus(msg);
                void loadData();
              }}
              onError={(e) => setError(e)}
            />
          </div>
        )}

        {activeTab === "routing" && (
          <div className="animate-fade-in" style={{ display: "flex", flexDirection: "column", gap: "var(--space-6)" }}>
            <div className="card">
              <div className="card-header">
                <h3>Router Configuration</h3>
              </div>
              <div className="card-body">
                <RouterConfigPanel
                  config={{
                    defaultModel: user?.defaultModel ?? null,
                    classifierModel: user?.classifierModel ?? null,
                    routingInstructions: user?.routingInstructions ?? null,
                    blocklist: user?.blocklist ?? null,
                    classifierBaseUrl: user?.classifierBaseUrl ?? null,
                    classifierApiKeyConfigured: user?.classifierApiKeyConfigured ?? false,
                    classifierApiKeyInput: user?.classifierApiKeyInput ?? "",
                    clearClassifierApiKey: user?.clearClassifierApiKey ?? false,
                    showModelInResponse: user?.showModelInResponse ?? false,
                  }}
                  gatewayModelOptions={gatewayModelOptions}
                  onChange={(updated) => user && setUser({ ...user, ...updated })}
                  onSave={saveUserData}
                />
              </div>
            </div>

            <div className="card">
              <div className="card-header">
                <h3>Routing Profiles</h3>
              </div>
              <div className="card-body">
                <ProfilesPanel
                  profiles={user?.profiles ?? null}
                  onChange={(profiles) => user && setUser({ ...user, profiles })}
                  onSave={() => saveUserData({})}
                />
              </div>
            </div>
          </div>
        )}

        {activeTab === "keys" && (
          <ApiKeysTab
            keys={keys}
            onKeysChanged={() => void loadData()}
            setStatus={setStatus}
            setError={setError}
          />
        )}

        {activeTab === "playground" && (
          <div className="animate-fade-in">
            <PlaygroundPanel profiles={user?.profiles} />
          </div>
        )}

        {activeTab === "account" && (
          <div className="animate-fade-in">
            <div className="card">
              <div className="card-body">
                <div className="form-group">
                  <label className="form-label">Display Name</label>
                  <input className="input" type="text" value={user?.name || ""} disabled />
                  <span className="form-hint">Contact support to change your display name</span>
                </div>
                {user?.email && (
                  <div className="form-group mt-4">
                    <label className="form-label">Email</label>
                    <input className="input" type="text" value={user.email} disabled />
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
