"use client";

// ─────────────────────────────────────────────────────────────────────────────
// ApiKeyPanel.tsx
//
// Redesigned API key management with:
// - Clean table-based layout with clear status indicators
// - Prominent new key reveal with auto-copy and clear warnings
// - Individual revoke actions per key
// - Empty state with helpful CTA
// ─────────────────────────────────────────────────────────────────────────────

import { useState } from "react";

export type ApiKeyInfo = {
  id: string;
  prefix: string;
  label: string | null;
  revoked: boolean;
  createdAt: string;
};

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
}: {
  apiKey: string;
  onCopied: () => void;
}) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    await navigator.clipboard.writeText(apiKey);
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
            alignItems: "center",
            gap: "var(--space-3)",
            padding: "var(--space-3) var(--space-4)",
            background: "var(--bg-interactive)",
            borderRadius: "var(--radius-md)",
            border: "1px solid var(--border-default)",
          }}
        >
          <code
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: "0.8125rem",
              color: "var(--text-primary)",
              wordBreak: "break-all",
              flex: 1,
            }}
          >
            {apiKey}
          </code>
          <button
            className={`btn btn--sm ${copied ? "btn--secondary" : ""}`}
            onClick={handleCopy}
            disabled={copied}
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

function EmptyState({ onGenerate }: { onGenerate: () => void }) {
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
      <button className="btn" onClick={onGenerate}>
        <IconPlus />
        Generate API Key
      </button>
    </div>
  );
}

export function ApiKeyPanel({ keys, onKeysChanged, onStatus, onError }: Props) {
  const [newKey, setNewKey] = useState<string | null>(null);
  const [revokingId, setRevokingId] = useState<string | null>(null);

  async function generateKey() {
    onStatus("Generating key...");
    onError?.(undefined);
    setNewKey(null);

    const res = await fetch("/api/v1/user/keys", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ label: "API Key" }),
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

  const activeKeys = keys.filter((k) => !k.revoked);

  return (
    <div>
      {/* New Key Alert */}
      {newKey && (
        <NewKeyReveal
          apiKey={newKey}
          onCopied={() => onStatus("Copied to clipboard")}
        />
      )}

      {/* Empty State */}
      {keys.length === 0 ? (
        <EmptyState onGenerate={() => void generateKey()} />
      ) : (
        <>
          {/* Generate Button */}
          <div style={{ marginBottom: "var(--space-5)" }}>
            <button className="btn" onClick={() => void generateKey()}>
              <IconPlus />
              Generate New Key
            </button>
          </div>

          {/* Keys Table */}
          <div className="table-container">
            <table className="table">
              <thead>
                <tr>
                  <th>Key</th>
                  <th>Status</th>
                  <th>Created</th>
                  <th style={{ textAlign: "right" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {keys.map((key) => (
                  <tr key={key.id}>
                    <td>
                      <div style={{ display: "flex", alignItems: "center", gap: "var(--space-3)" }}>
                        <div
                          style={{
                            width: 32,
                            height: 32,
                            borderRadius: "var(--radius-md)",
                            background: key.revoked ? "var(--danger-dim)" : "var(--accent-dim)",
                            display: "grid",
                            placeItems: "center",
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
                        <code className="mono" style={{ color: "var(--text-primary)" }}>
                          {key.prefix}••••••••
                        </code>
                      </div>
                    </td>
                    <td>
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
                    </td>
                    <td>
                      <span style={{ color: "var(--text-muted)" }}>
                        {new Date(key.createdAt).toLocaleDateString(undefined, {
                          year: "numeric",
                          month: "short",
                          day: "numeric",
                        })}
                      </span>
                    </td>
                    <td style={{ textAlign: "right" }}>
                      {!key.revoked && (
                        <button
                          className="btn btn--sm btn--danger"
                          onClick={() => void revokeKey(key.id)}
                          disabled={revokingId === key.id}
                        >
                          <IconRevoke />
                          {revokingId === key.id ? "Revoking..." : "Revoke"}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Summary Footer */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "var(--space-6)",
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
