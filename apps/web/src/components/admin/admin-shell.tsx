"use client";

import { useEffect, useState } from "react";

import { AuthGate } from "../AuthGate";
import { getAdminExtensionTabs } from "./admin-extensions";
import { getInitialAdminTabId, groupAdminTabsBySection, mergeAdminTabs } from "./admin-tab-registry";
import { getBaseAdminTabs } from "./admin-tabs";
import { type AdminTabDefinition, type UserInfo, type ApiKeyInfo, type ServerUserInfo, type GatewaySummary, hydrateUser } from "./types";

function IconLogout({ className }: { className?: string }) {
  return (
    <svg className={className} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <polyline points="16 17 21 12 16 7" />
      <line x1="21" y1="12" x2="9" y2="12" />
    </svg>
  );
}

function IconTab({ className }: { className?: string }) {
  return (
    <svg className={className} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <circle cx="12" cy="12" r="9" strokeOpacity="0.35" />
    </svg>
  );
}

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

function SideNav({
  activeTab,
  tabs,
  user,
  status,
  error,
  onLogout,
  onTabChange,
}: {
  activeTab: string;
  tabs: readonly AdminTabDefinition[];
  user: UserInfo | null;
  status: string;
  error?: string;
  onLogout: () => void;
  onTabChange: (tabId: string) => void;
}) {
  const groups = groupAdminTabsBySection(tabs);

  function NavItem({ tab }: { tab: AdminTabDefinition }) {
    const Icon = tab.icon ?? IconTab;

    return (
      <button
        className={`sidenav-item ${activeTab === tab.id ? "sidenav-item--active" : ""}`}
        onClick={() => onTabChange(tab.id)}
      >
        <Icon />
        <span>{tab.label}</span>
      </button>
    );
  }

  return (
    <aside className="sidenav">
      <nav className="sidenav-nav">
        {groups.configure.length > 0 && (
          <>
            <div className="sidenav-section-label">Configure</div>
            {groups.configure.map((tab) => (
              <NavItem key={tab.id} tab={tab} />
            ))}
          </>
        )}

        {groups.use.length > 0 && (
          <>
            <div className="sidenav-section-label">Use</div>
            {groups.use.map((tab) => (
              <NavItem key={tab.id} tab={tab} />
            ))}
          </>
        )}

        {groups.account.length > 0 && (
          <>
            <div className="sidenav-divider" />
            {groups.account.map((tab) => (
              <NavItem key={tab.id} tab={tab} />
            ))}
          </>
        )}
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

export function AdminShell() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [user, setUser] = useState<UserInfo | null>(null);
  const [keys, setKeys] = useState<ApiKeyInfo[]>([]);
  const [activeTab, setActiveTab] = useState("gateways");
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
        new Set(
          (gatewaysData.gateways ?? [])
            .flatMap((gateway) => gateway.models.map((model) => model.id))
            .filter(Boolean),
        ),
      ).sort((left, right) => left.localeCompare(right));
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
    if (!user) {
      return false;
    }

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
      show_model_in_response: updatedUser.showModelInResponse,
      config_agent_enabled: updatedUser.configAgentEnabled,
      config_agent_orchestrator_model: updatedUser.configAgentOrchestratorModel,
      config_agent_search_model: updatedUser.configAgentSearchModel,
    };

    const response = await fetch("/api/v1/user/me", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (response.ok) {
      await loadData();
      setStatus("Saved successfully");
      return true;
    }

    setError("Failed to save changes");
    setStatus("Error");
    return false;
  }

  const baseTabs = user
    ? getBaseAdminTabs({
        setUser,
        keys,
        gatewayModelOptions,
        reloadData: loadData,
        setStatus,
        setError,
        saveUserData,
      })
    : [];
  const tabs = user ? mergeAdminTabs(baseTabs, getAdminExtensionTabs()) : [];
  const initialTabId = getInitialAdminTabId(tabs, "gateways");
  const resolvedActiveTab = tabs.find((tab) => tab.id === activeTab)
    ?? tabs.find((tab) => tab.id === initialTabId)
    ?? tabs[0];

  useEffect(() => {
    if (tabs.length > 0 && !tabs.some((tab) => tab.id === activeTab)) {
      setActiveTab(initialTabId);
    }
  }, [activeTab, initialTabId, tabs]);

  if (!isAuthenticated || !user) {
    return <AuthGate onAuthenticated={() => void loadData()} />;
  }

  return (
    <div className="admin-layout animate-fade-in">
      <SideNav
        activeTab={resolvedActiveTab?.id ?? activeTab}
        tabs={tabs}
        user={user}
        status={status}
        error={error}
        onLogout={() => void handleLogout()}
        onTabChange={setActiveTab}
      />

      <div>
        {resolvedActiveTab && (
          <>
            <SectionHeader title={resolvedActiveTab.title} subtitle={resolvedActiveTab.subtitle} />
            {resolvedActiveTab.render({
              user,
              reloadData: loadData,
              setStatus,
              setError,
              saveUserData,
            })}
          </>
        )}
      </div>
    </div>
  );
}
