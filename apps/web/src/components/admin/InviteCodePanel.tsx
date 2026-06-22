"use client";

// ─────────────────────────────────────────────────────────────────────────────
// InviteCodePanel.tsx
//
// Manage invite codes: generate, copy, revoke. Follows the same structure as
// ApiKeyPanel.tsx for UI consistency.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useState } from "react";

import { copyTextToClipboard } from "@/src/lib/clipboard";

interface InviteInfo {
  id: string;
  code: string;
  usesRemaining: number;
  expiresAt: string;
  createdAt: string;
}

interface Props {
  onStatus: (msg: string) => void;
  onError: (msg?: string) => void;
}

// ─── Icons ───────────────────────────────────────────────────────────────────
function IconTicket({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <svg className={className} style={style} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2Z"/>
      <path d="M13 5v2"/><path d="M13 17v2"/><path d="M13 11v2"/>
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

// ─── Helpers ─────────────────────────────────────────────────────────────────
function maskCode(code: string): string {
  if (code.length <= 12) return code;
  return code.slice(0, 8) + "••••" + code.slice(-4);
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function isExpired(expiresAt: string): boolean {
  return new Date(expiresAt) < new Date();
}

// ─── Main Component ──────────────────────────────────────────────────────────
export function InviteCodePanel({ onStatus, onError }: Props) {
  const [invites, setInvites] = useState<InviteInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [regMode, setRegMode] = useState<string | null>(null);

  async function loadInvites() {
    try {
      const res = await fetch("/api/v1/user/invites");
      if (res.ok) {
        const data = (await res.json()) as { invites: InviteInfo[] };
        setInvites(data.invites);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadInvites();
    fetch("/api/v1/auth/registration-status")
      .then((r) => r.json() as Promise<{ mode: string }>)
      .then((d) => setRegMode(d.mode))
      .catch(() => {});
  }, []);

  async function generateInvite() {
    onStatus("Generating invite code...");
    onError(undefined);

    const res = await fetch("/api/v1/user/invites", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    });

    if (!res.ok) {
      onError("Failed to generate invite code");
      onStatus("Error");
      return;
    }

    const data = (await res.json()) as { invite: InviteInfo };
    setInvites((prev) => [data.invite, ...prev]);
    onStatus("Invite code generated");
  }

  async function copyCode(invite: InviteInfo) {
    const result = await copyTextToClipboard(invite.code);
    if (!result.ok) {
      onError(result.error);
      onStatus("Error");
      return;
    }

    setCopiedId(invite.id);
    onStatus("Invite code copied to clipboard");
    setTimeout(() => setCopiedId((c) => (c === invite.id ? null : c)), 2000);
  }

  async function revokeInvite(id: string) {
    setRevokingId(id);
    onStatus("Revoking invite...");

    const res = await fetch(`/api/v1/user/invites?codeId=${id}`, { method: "DELETE" });

    if (!res.ok) {
      onError("Failed to revoke invite");
      onStatus("Error");
      setRevokingId(null);
      return;
    }

    setInvites((prev) => prev.filter((i) => i.id !== id));
    onStatus("Invite revoked");
    setRevokingId(null);
  }

  if (loading) {
    return (
      <div style={{ padding: "var(--space-6)", textAlign: "center", color: "var(--text-muted)" }}>
        Loading...
      </div>
    );
  }

  // Show info message when not in invite mode
  if (regMode && regMode !== "invite") {
    return (
      <div>
        <div
          className="alert alert--info"
          style={{ marginBottom: "var(--space-5)" }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/>
          </svg>
          <div>
            Invite codes are used when <code className="mono">REGISTRATION_MODE</code> is set
            to <code className="mono">invite</code>. Current mode: <strong>{regMode}</strong>.
          </div>
        </div>

        {/* Still allow generating codes even in other modes, for convenience */}
        <button className="btn btn--primary" onClick={() => void generateInvite()}>
          <IconPlus />
          Generate Invite Code
        </button>

        {invites.length > 0 && (
          <div style={{ marginTop: "var(--space-5)" }}>
            <InviteTable
              invites={invites}
              copiedId={copiedId}
              revokingId={revokingId}
              onCopy={copyCode}
              onRevoke={revokeInvite}
            />
          </div>
        )}
      </div>
    );
  }

  // Empty state
  if (invites.length === 0) {
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
          <IconTicket style={{ width: 28, height: 28, color: "var(--text-muted)" } as any} />
        </div>
        <div className="empty-state-title">No Invite Codes</div>
        <p className="empty-state-desc">
          Generate invite codes to allow new users to sign up on this instance.
        </p>
        <button className="btn btn--primary" onClick={() => void generateInvite()}>
          <IconPlus />
          Generate Invite Code
        </button>
      </div>
    );
  }

  return (
    <div>
      <div style={{ marginBottom: "var(--space-5)" }}>
        <button className="btn btn--primary" onClick={() => void generateInvite()}>
          <IconPlus />
          Generate Invite Code
        </button>
      </div>

      <InviteTable
        invites={invites}
        copiedId={copiedId}
        revokingId={revokingId}
        onCopy={copyCode}
        onRevoke={revokeInvite}
      />

      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "var(--space-2)",
          marginTop: "var(--space-4)",
          paddingTop: "var(--space-4)",
          borderTop: "1px solid var(--border-subtle)",
        }}
      >
        <span className="badge badge--info">{invites.filter((i) => !isExpired(i.expiresAt) && i.usesRemaining > 0).length} Active</span>
        <span style={{ fontSize: "0.8125rem", color: "var(--text-muted)" }}>
          Total: {invites.length} code{invites.length !== 1 ? "s" : ""}
        </span>
      </div>
    </div>
  );
}

// ─── Table Sub-Component ────────────────────────────────────────────────────
function InviteTable({
  invites,
  copiedId,
  revokingId,
  onCopy,
  onRevoke,
}: {
  invites: InviteInfo[];
  copiedId: string | null;
  revokingId: string | null;
  onCopy: (invite: InviteInfo) => void;
  onRevoke: (id: string) => void;
}) {
  return (
    <div className="table-container">
      <table className="table">
        <thead>
          <tr>
            <th>Code</th>
            <th>Uses Left</th>
            <th>Expires</th>
            <th style={{ textAlign: "right" }}>Actions</th>
          </tr>
        </thead>
        <tbody>
          {invites.map((inv) => {
            const expired = isExpired(inv.expiresAt);
            const exhausted = inv.usesRemaining <= 0;
            const inactive = expired || exhausted;

            return (
              <tr key={inv.id}>
                <td>
                  <div style={{ display: "flex", alignItems: "center", gap: "var(--space-3)" }}>
                    <div
                      style={{
                        width: 32,
                        height: 32,
                        borderRadius: "var(--radius-md)",
                        background: inactive ? "var(--danger-dim)" : "var(--accent-dim)",
                        display: "grid",
                        placeItems: "center",
                      }}
                    >
                      <IconTicket
                        style={{
                          width: 16,
                          height: 16,
                          color: inactive ? "var(--danger)" : "var(--accent)",
                        } as any}
                      />
                    </div>
                    <code className="mono" style={{ color: "var(--text-primary)" }}>
                      {maskCode(inv.code)}
                    </code>
                  </div>
                </td>
                <td>
                  {exhausted ? (
                    <span className="badge badge--danger">Used up</span>
                  ) : (
                    <span className="badge badge--info">{inv.usesRemaining}</span>
                  )}
                </td>
                <td>
                  {expired ? (
                    <span style={{ color: "var(--danger)" }}>Expired</span>
                  ) : (
                    <span style={{ color: "var(--text-muted)" }}>
                      {formatDate(inv.expiresAt)}
                    </span>
                  )}
                </td>
                <td style={{ textAlign: "right" }}>
                  <div style={{ display: "flex", gap: "var(--space-2)", justifyContent: "flex-end" }}>
                    {!inactive && (
                      <button
                        className={`btn btn--sm ${copiedId === inv.id ? "btn--secondary" : ""}`}
                        onClick={() => void onCopy(inv)}
                        disabled={copiedId === inv.id}
                      >
                        {copiedId === inv.id ? <IconCheck /> : <IconCopy />}
                        {copiedId === inv.id ? "Copied" : "Copy"}
                      </button>
                    )}
                    <button
                      className="btn btn--sm btn--danger"
                      onClick={() => void onRevoke(inv.id)}
                      disabled={revokingId === inv.id}
                    >
                      <IconRevoke />
                      {revokingId === inv.id ? "Revoking..." : "Revoke"}
                    </button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
