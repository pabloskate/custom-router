"use client";

// ─────────────────────────────────────────────────────────────────────────────
// ApiKeyPanel.tsx
//
// Redesigned API key management with:
// - Clean table-based layout with clear status indicators
// - Prominent new key reveal with auto-copy and clear warnings
// - Individual revoke and delete actions per key
// - Empty state with helpful CTA
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState } from "react";

import type { ApiKeyInfo } from "@/src/features/account-settings/contracts";
import { copyTextToClipboard } from "@/src/lib/clipboard";
import { AUTH } from "@/src/lib/constants";

interface Props {
  keys: ApiKeyInfo[];
  onKeysChanged: () => void;
  onStatus: (msg: string) => void;
  onError?: (msg?: string) => void;
}

// ─── Icons ───────────────────────────────────────────────────────────────────
function IconKey({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <svg className={className} style={style} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="7.5" cy="15.5" r="5.5"/><path d="M21 2l-9.6 9.6"/><path d="M15.5 9.5l3 3L22 7l-3-3-3.5 3.5"/>
    </svg>
  );
}

function IconCopy({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <svg className={className} style={style} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
    </svg>
  );
}

function IconCheck({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <svg className={className} style={style} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12"/>
    </svg>
  );
}

function IconRevoke({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <svg className={className} style={style} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>
    </svg>
  );
}

function IconTrash({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <svg className={className} style={style} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
    </svg>
  );
}

function IconPlus({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <svg className={className} style={style} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
    </svg>
  );
}

function IconWarning({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <svg className={className} style={style} width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
    </svg>
  );
}

// ─── Components ────────────────────────────────────────────────────────────
function NewKeyReveal({
  apiKey,
  onCopied,
  onCopyFailed,
}: {
  apiKey: string;
  onCopied: () => void;
  onCopyFailed?: (message: string) => void;
}) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    const result = await copyTextToClipboard(apiKey);
    if (!result.ok) {
      onCopyFailed?.(result.error);
      return;
    }

    setCopied(true);
    onCopied();
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="alert alert--warning" style={{ marginBottom: "var(--space-6)" }}>
      <IconWarning style={{ flexShrink: 0, color: "var(--warning)" } as any} />
      <div style={{ flex: 1 }}>
        <div style={{ fontWeight: 600, color: "var(--text-primary)", marginBottom: "var(--space-2)" }}>
          New API Key Created
        </div>
        <p style={{ fontSize: "0.8125rem", color: "var(--text-secondary)", marginBottom: "var(--space-4)", lineHeight: 1.5 }}>
          This key will only be shown once. Copy it now and store it securely. It cannot be retrieved later.
        </p>
        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            gap: "var(--space-3)",
            padding: "var(--space-3) var(--space-4)",
            background: "var(--bg-interactive)",
            borderRadius: "var(--radius-md)",
            border: "1px solid var(--border-default)",
            flexWrap: "wrap",
          }}
        >
          <code
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: "0.8125rem",
              color: "var(--text-primary)",
              wordBreak: "break-all",
              flex: 1,
              minWidth: 0,
            }}
          >
            {apiKey}
          </code>
          <button
            className={`btn btn--sm ${copied ? "btn--secondary" : ""}`}
            onClick={handleCopy}
            disabled={copied}
            style={{ flexShrink: 0 }}
          >
            {copied ? (
              <>
                <IconCheck />
                Copied
              </>
            ) : (
              <>
                <IconCopy />
                Copy
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

function EmptyState({ children }: { children: React.ReactNode }) {
  return (
    <div className="empty-state">
      <div
        style={{
          width: 64,
          height: 64,
          borderRadius: "var(--radius-xl)",
          background: "var(--bg-interactive)",
          display: "grid",
          placeItems: "center",
        }}
      >
        <IconKey style={{ width: 28, height: 28, color: "var(--text-muted)" } as any} />
      </div>
      <div className="empty-state-title">No API Keys Yet</div>
      <p className="empty-state-desc">
        Generate your first API key to start making requests to CustomRouter.
      </p>
      {children}
    </div>
  );
}

function formatRateLimit(limit: number | null): string {
  return limit == null ? "" : String(limit);
}

function parseRateLimitDraft(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  return Number(trimmed);
}

function isValidRateLimit(value: number | null): boolean {
  return (
    value == null ||
    (Number.isInteger(value) &&
      value >= AUTH.API_KEY_RATE_LIMIT_MIN_PER_MINUTE &&
      value <= AUTH.API_KEY_RATE_LIMIT_MAX_PER_MINUTE)
  );
}

export function ApiKeyPanel({ keys, onKeysChanged, onStatus, onError }: Props) {
  const [newKey, setNewKey] = useState<string | null>(null);
  const [newKeyRateLimit, setNewKeyRateLimit] = useState("");
  const [limitDrafts, setLimitDrafts] = useState<Record<string, string>>({});
  const [savingLimitId, setSavingLimitId] = useState<string | null>(null);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  function getLimitDraft(key: ApiKeyInfo): string {
    return limitDrafts[key.id] ?? formatRateLimit(key.rateLimitPerMinute);
  }

  async function generateKey() {
    onStatus("Generating key...");
    onError?.(undefined);
    setNewKey(null);
    const rateLimitPerMinute = parseRateLimitDraft(newKeyRateLimit);
    if (!isValidRateLimit(rateLimitPerMinute)) {
      onError?.(`Use a whole number from ${AUTH.API_KEY_RATE_LIMIT_MIN_PER_MINUTE} to ${AUTH.API_KEY_RATE_LIMIT_MAX_PER_MINUTE}, or leave it blank.`);
      onStatus("Error");
      return;
    }

    const res = await fetch("/api/v1/user/keys", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ label: "API Key", rate_limit_per_minute: rateLimitPerMinute }),
    });

    if (!res.ok) {
      onError?.("Failed to generate key");
      onStatus("Error");
      return;
    }

    const data = await res.json() as { apiKey: string };
    setNewKey(data.apiKey);

    onStatus("API key generated — copy it now!");
    onKeysChanged();
  }

  async function saveRateLimit(key: ApiKeyInfo) {
    const rateLimitPerMinute = parseRateLimitDraft(getLimitDraft(key));
    if (!isValidRateLimit(rateLimitPerMinute)) {
      onError?.(`Use a whole number from ${AUTH.API_KEY_RATE_LIMIT_MIN_PER_MINUTE} to ${AUTH.API_KEY_RATE_LIMIT_MAX_PER_MINUTE}, or leave it blank.`);
      return;
    }

    setSavingLimitId(key.id);
    onStatus("Saving rate limit...");
    onError?.(undefined);

    const res = await fetch(`/api/v1/user/keys?keyId=${key.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ rate_limit_per_minute: rateLimitPerMinute }),
    });

    if (!res.ok) {
      onError?.("Failed to save rate limit");
      onStatus("Error");
      setSavingLimitId(null);
      return;
    }

    setLimitDrafts((current) => {
      const next = { ...current };
      delete next[key.id];
      return next;
    });
    onStatus("Rate limit saved");
    setSavingLimitId(null);
    onKeysChanged();
  }

  async function revokeKey(keyId: string) {
    setRevokingId(keyId);
    onStatus("Revoking key...");

    const res = await fetch(`/api/v1/user/keys?keyId=${keyId}`, { method: "DELETE" });

    if (!res.ok) {
      onError?.("Failed to revoke key");
      onStatus("Error");
      setRevokingId(null);
      return;
    }

    onStatus("Key revoked");
    setRevokingId(null);
    onKeysChanged();
  }

  async function deleteKey(keyId: string) {
    const confirmed = window.confirm("Delete this API key permanently? This cannot be undone.");
    if (!confirmed) {
      return;
    }

    setDeletingId(keyId);
    onStatus("Deleting key...");
    onError?.(undefined);

    const res = await fetch(`/api/v1/user/keys?keyId=${keyId}&action=delete`, { method: "DELETE" });

    if (!res.ok) {
      onError?.("Failed to delete key");
      onStatus("Error");
      setDeletingId(null);
      return;
    }

    onStatus("Key deleted");
    setDeletingId(null);
    onKeysChanged();
  }

  const activeKeys = keys.filter((k) => !k.revoked);
  const newKeyControls = (
    <div style={{ display: "flex", alignItems: "flex-end", gap: "var(--space-3)", flexWrap: "wrap" }}>
      <label style={{ display: "grid", gap: "var(--space-1)", minWidth: 180 }}>
        <span style={{ fontSize: "0.75rem", fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
          Requests per minute
        </span>
        <input
          className="input"
          type="number"
          min={AUTH.API_KEY_RATE_LIMIT_MIN_PER_MINUTE}
          max={AUTH.API_KEY_RATE_LIMIT_MAX_PER_MINUTE}
          step={1}
          placeholder="Unlimited"
          value={newKeyRateLimit}
          onChange={(event) => setNewKeyRateLimit(event.target.value)}
        />
      </label>
      <button className="btn btn--primary" onClick={() => void generateKey()}>
        <IconPlus />
        Generate API Key
      </button>
    </div>
  );

  return (
    <div>
      {/* New Key Alert */}
      {newKey && (
        <NewKeyReveal
          apiKey={newKey}
          onCopied={() => onStatus("Copied to clipboard")}
          onCopyFailed={(message) => {
            onError?.(message);
            onStatus("Error");
          }}
        />
      )}

      {/* Empty State */}
      {keys.length === 0 ? (
        <EmptyState>{newKeyControls}</EmptyState>
      ) : (
        <>
          {/* Generate Button */}
          <div style={{ marginBottom: "var(--space-5)" }}>
            {newKeyControls}
          </div>

          {/* Keys List */}
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
            {/* Table header — hidden on mobile */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr auto auto auto",
                gap: "var(--space-4)",
                padding: "var(--space-2) var(--space-3)",
                borderBottom: "1px solid var(--border-subtle)",
              }}
              className="api-key-table-header"
            >
              <span style={{ fontSize: "0.75rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-muted)" }}>Key</span>
              <span style={{ fontSize: "0.75rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-muted)" }}>Status</span>
              <span style={{ fontSize: "0.75rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-muted)" }}>Created</span>
              <span style={{ fontSize: "0.75rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-muted)", textAlign: "right" }}>Actions</span>
            </div>
            {keys.map((key) => (
              <div
                key={key.id}
                style={{
                  padding: "var(--space-3)",
                  borderRadius: "var(--radius-md)",
                  border: "1px solid var(--border-subtle)",
                  background: "var(--bg-card)",
                }}
              >
                {/* Mobile: stacked layout */}
                <div style={{ display: "flex", alignItems: "center", gap: "var(--space-3)", marginBottom: "var(--space-3)" }}>
                  <div
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: "var(--radius-md)",
                      background: key.revoked ? "var(--danger-dim)" : "var(--accent-dim)",
                      display: "grid",
                      placeItems: "center",
                      flexShrink: 0,
                    }}
                  >
                    <IconKey
                      style={{
                        width: 16,
                        height: 16,
                        color: key.revoked ? "var(--danger)" : "var(--accent)",
                      } as any}
                    />
                  </div>
                  <code className="mono" style={{ color: "var(--text-primary)", fontSize: "0.875rem", flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis" }}>
                    {key.prefix}••••••••
                  </code>
                </div>
                <div style={{ display: "flex", alignItems: "flex-end", gap: "var(--space-2)", flexWrap: "wrap", marginBottom: "var(--space-3)" }}>
                  <label style={{ display: "grid", gap: "var(--space-1)", minWidth: 170 }}>
                    <span style={{ fontSize: "0.75rem", fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                      Requests per minute
                    </span>
                    <input
                      className="input"
                      type="number"
                      min={AUTH.API_KEY_RATE_LIMIT_MIN_PER_MINUTE}
                      max={AUTH.API_KEY_RATE_LIMIT_MAX_PER_MINUTE}
                      step={1}
                      placeholder="Unlimited"
                      value={getLimitDraft(key)}
                      disabled={key.revoked || savingLimitId === key.id}
                      onChange={(event) => setLimitDrafts((current) => ({ ...current, [key.id]: event.target.value }))}
                    />
                  </label>
                  <button
                    className="btn btn--sm btn--secondary"
                    onClick={() => void saveRateLimit(key)}
                    disabled={key.revoked || savingLimitId === key.id || getLimitDraft(key) === formatRateLimit(key.rateLimitPerMinute)}
                  >
                    {savingLimitId === key.id ? "Saving..." : "Save"}
                  </button>
                  <span style={{ fontSize: "0.8125rem", color: "var(--text-muted)", paddingBottom: "0.45rem" }}>
                    {key.rateLimitPerMinute == null ? "Unlimited" : `${key.rateLimitPerMinute}/min`}
                  </span>
                </div>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "var(--space-2)" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "var(--space-3)" }}>
                    {key.revoked ? (
                      <span className="badge badge--danger">
                        <span className="status-dot status-dot--danger" />
                        Revoked
                      </span>
                    ) : (
                      <span className="badge badge--success">
                        <span className="status-dot status-dot--success" />
                        Active
                      </span>
                    )}
                    <span style={{ fontSize: "0.8125rem", color: "var(--text-muted)" }}>
                      {new Date(key.createdAt).toLocaleDateString(undefined, {
                        year: "numeric",
                        month: "short",
                        day: "numeric",
                      })}
                    </span>
                  </div>
                  <div style={{ display: "flex", gap: "var(--space-2)", flexShrink: 0 }}>
                    {!key.revoked && (
                      <button
                        className="btn btn--sm btn--danger"
                        onClick={() => void revokeKey(key.id)}
                        disabled={revokingId === key.id || deletingId === key.id}
                      >
                        <IconRevoke />
                        {revokingId === key.id ? "Revoking..." : "Revoke"}
                      </button>
                    )}
                    <button
                      className="btn btn--sm btn--ghost"
                      onClick={() => void deleteKey(key.id)}
                      disabled={deletingId === key.id || revokingId === key.id}
                    >
                      <IconTrash />
                      {deletingId === key.id ? "Deleting..." : "Delete"}
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Summary Footer */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              flexWrap: "wrap",
              gap: "var(--space-3)",
              marginTop: "var(--space-4)",
              paddingTop: "var(--space-4)",
              borderTop: "1px solid var(--border-subtle)",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
              <span className="badge badge--success">{activeKeys.length} Active</span>
              {keys.length - activeKeys.length > 0 && (
                <span className="badge badge--danger">{keys.length - activeKeys.length} Revoked</span>
              )}
            </div>
            <span style={{ fontSize: "0.8125rem", color: "var(--text-muted)" }}>
              Total: {keys.length} key{keys.length !== 1 ? "s" : ""}
            </span>
          </div>

        </>
      )}
    </div>
  );
}
