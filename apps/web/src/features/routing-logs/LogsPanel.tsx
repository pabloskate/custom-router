"use client";

import React, { useCallback, useEffect, useState } from "react";

import { ROUTER_HISTORY } from "@/src/lib/constants";
import type { RecentModelUsageEntry } from "@/src/features/routing/contracts";

type RecentHistoryResponse = {
  entries?: RecentModelUsageEntry[];
  error?: string;
};

function recentDecisionReasonLabel(reason: string): string {
  const labels: Record<string, string> = {
    initial_route: "Classifier",
    thread_pin: "Pinned thread",
    fallback_default: "Default fallback",
    fallback_after_failure: "Fallback",
    passthrough: "Passthrough",
    pin_invalid: "Pin invalid",
  };
  return labels[reason] ?? reason;
}

export function LogsPanel() {
  return <LogsPanelWithState enabled />;
}

function ToggleSwitch({
  enabled,
  disabled,
  onToggle,
}: {
  enabled: boolean;
  disabled?: boolean;
  onToggle?: () => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={enabled}
      aria-label="Toggle routing logs"
      className="btn btn--ghost btn--sm"
      onClick={onToggle}
      disabled={disabled}
      style={{
        padding: "0.25rem",
        borderRadius: "9999px",
        minWidth: 52,
        justifyContent: enabled ? "flex-end" : "flex-start",
        background: enabled ? "var(--accent-dim)" : "var(--bg-interactive)",
        borderColor: enabled ? "rgba(103,232,249,0.35)" : "var(--border-default)",
      }}
    >
      <span
        style={{
          display: "block",
          width: 20,
          height: 20,
          borderRadius: "9999px",
          background: enabled ? "var(--accent)" : "var(--text-muted)",
          boxShadow: enabled ? "0 0 12px var(--accent-glow)" : "none",
          transition: "all 150ms ease",
        }}
      />
    </button>
  );
}

export function LogsPanelWithState({
  enabled,
  onToggle,
}: {
  enabled: boolean;
  onToggle?: (enabled: boolean) => Promise<boolean>;
}) {
  const [entries, setEntries] = useState<RecentModelUsageEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savingToggle, setSavingToggle] = useState(false);

  async function handleToggle() {
    if (!onToggle || savingToggle) {
      return;
    }

    setSavingToggle(true);
    try {
      await onToggle(!enabled);
    } finally {
      setSavingToggle(false);
    }
  }

  const loadRecentHistory = useCallback(async () => {
    if (!enabled) {
      setEntries([]);
      setError(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/v1/user/routing-history?limit=${ROUTER_HISTORY.DEFAULT_LIMIT}`, { cache: "no-store" });
      const payload = await response.json().catch(() => ({ error: "Failed to load recent routing history." })) as RecentHistoryResponse;

      if (!response.ok) {
        throw new Error(payload.error ?? "Failed to load recent routing history.");
      }

      setEntries(Array.isArray(payload.entries) ? payload.entries : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load recent routing history.");
    } finally {
      setLoading(false);
    }
  }, [enabled]);

  useEffect(() => {
    void loadRecentHistory();
  }, [loadRecentHistory]);

  return (
    <div className="animate-fade-in" style={{ display: "flex", flexDirection: "column", gap: "var(--space-6)" }}>
      <div className="card">
        <div className="card-header">
          <div>
            <h3 style={{ marginBottom: "var(--space-1)" }}>Routing Logs</h3>
            <p style={{ fontSize: "0.875rem", color: "var(--text-muted)", margin: 0 }}>
              Store recent routing decisions and explanation lookups for this account.
            </p>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "var(--space-3)" }}>
            <span className={`badge ${enabled ? "badge--success" : "badge--default"}`}>
              {savingToggle ? "Saving..." : enabled ? "Enabled" : "Disabled"}
            </span>
            <ToggleSwitch enabled={enabled} disabled={savingToggle} onToggle={() => void handleToggle()} />
          </div>
        </div>
        <div className="card-body" style={{ paddingTop: 0 }}>
          <p style={{ margin: 0, color: "var(--text-muted)" }}>
            Disabled by default to avoid extra writes. Turn it on here when you want recent routed model history or `GET /api/v1/router/explanations/{'{requestId}'}` lookups.
          </p>
        </div>
      </div>

      {enabled ? (
        <RecentModelHistoryCard
          entries={entries}
          loading={loading}
          error={error}
          onRefresh={() => void loadRecentHistory()}
        />
      ) : (
        <div className="card">
          <div className="card-header">
            <div>
              <h3 style={{ marginBottom: "var(--space-1)" }}>Recent Routed Models</h3>
              <p style={{ fontSize: "0.875rem", color: "var(--text-muted)", margin: 0 }}>
                Routing logs are currently disabled for this account.
              </p>
            </div>
          </div>
          <div className="card-body" style={{ paddingTop: 0 }}>
            <p style={{ margin: 0, color: "var(--text-muted)" }}>
              Turn on the toggle above to start storing recent routing history.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

export function RecentModelHistoryCard({
  entries,
  loading,
  error,
  onRefresh,
}: {
  entries: RecentModelUsageEntry[];
  loading: boolean;
  error?: string | null;
  onRefresh?: () => void;
}) {
  return (
    <div className="animate-fade-in">
      <div className="card">
        <div className="card-header">
          <div>
            <h3 style={{ marginBottom: "var(--space-1)" }}>Recent Routed Models</h3>
            <p style={{ fontSize: "0.875rem", color: "var(--text-muted)", margin: 0 }}>
              Latest {ROUTER_HISTORY.DEFAULT_LIMIT} routed requests for this account.
            </p>
          </div>
          {onRefresh ? (
            <button type="button" className="btn btn--secondary btn--sm" onClick={onRefresh} disabled={loading}>
              {loading ? "Refreshing..." : "Refresh"}
            </button>
          ) : null}
        </div>
        <div className="card-body" style={{ paddingTop: 0 }}>
          {loading ? (
            <p style={{ margin: 0, color: "var(--text-muted)" }}>Loading recent history...</p>
          ) : error ? (
            <p style={{ margin: 0, color: "var(--danger)" }}>{error}</p>
          ) : entries.length === 0 ? (
            <p style={{ margin: 0, color: "var(--text-muted)" }}>No recent routed model history yet.</p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
              {entries.map((entry) => (
                <div
                  key={entry.requestId}
                  style={{
                    border: "1px solid var(--border-subtle)",
                    borderRadius: "var(--radius-lg)",
                    padding: "var(--space-3) var(--space-4)",
                    background: "var(--bg-elevated)",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", gap: "var(--space-3)", alignItems: "center", marginBottom: "var(--space-2)", flexWrap: "wrap" }}>
                    <span className="badge badge--info" style={{ fontSize: "0.6875rem" }}>
                      {recentDecisionReasonLabel(entry.decisionReason)}
                    </span>
                    <span style={{ fontSize: "0.75rem", color: "var(--text-muted)", fontFamily: "var(--font-mono, monospace)" }}>
                      {entry.createdAt}
                    </span>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "var(--space-1) var(--space-3)" }}>
                    <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>Requested</span>
                    <span style={{ fontSize: "0.8125rem", fontFamily: "var(--font-mono, monospace)", wordBreak: "break-all" }}>{entry.requestedModel}</span>
                    <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>Selected</span>
                    <span style={{ fontSize: "0.8125rem", fontFamily: "var(--font-mono, monospace)", wordBreak: "break-all" }}>{entry.selectedModel}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
