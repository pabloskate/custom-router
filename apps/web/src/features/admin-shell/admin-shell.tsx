"use client";

import { useEffect, useState } from "react";

import { AuthGate } from "@/src/components/admin/AuthGate";
import { getAdminExtensionTabs } from "@/src/components/admin/admin-extensions";
import { getInitialAdminTabId, groupAdminTabsBySection, mergeAdminTabs } from "@/src/components/admin/admin-tab-registry";
import { getBaseAdminTabs } from "@/src/components/admin/admin-tabs";
import type { AdminTabDefinition } from "@/src/components/admin/types";
import type { UserInfo } from "@/src/features/account-settings/contracts";

import { useAdminData } from "./use-admin-data";

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
  const {
    isAuthenticated,
    user,
    setUser,
    keys,
    status,
    setStatus,
    error,
    setError,
    gatewayModelOptions,
    routingDraftState,
    markRoutingDirty,
    registrationMode,
    loadData,
    handleLogout,
    saveUserData,
    saveRoutingData,
  } = useAdminData();
  const [activeTab, setActiveTab] = useState("gateways");

  const baseTabs = user
    ? getBaseAdminTabs({
        setUser,
        keys,
        gatewayModelOptions,
        reloadData: loadData,
        setStatus,
        setError,
        saveUserData,
        routingDraftState,
        markRoutingDirty,
        saveRoutingData,
        registrationMode,
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
              routingDraftState,
              markRoutingDirty,
              saveRoutingData,
            })}
          </>
        )}
      </div>
    </div>
  );
}
