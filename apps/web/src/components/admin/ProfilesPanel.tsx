"use client";

import React, { useState } from "react";
import type { RouterProfile } from "@custom-router/core";
import { SaveActionBar, type SaveActionState } from "./SaveActionBar";

// ─────────────────────────────────────────────────────────────────────────────
// ProfilesPanel.tsx
//
// Redesigned routing profiles with a card-based layout:
// - Each profile is a distinct card with clear visual separation
// - Profile ID is prominent (this is what users send in API calls)
// - Inheritance indicators for overridden settings
// - Inline editing with clear save/discard actions
// ─────────────────────────────────────────────────────────────────────────────

export type { RouterProfile } from "@custom-router/core";

/** Derive overrideModels for backward compat when loading legacy profiles. */
export function normalizeProfile(p: RouterProfile): RouterProfile {
  if (typeof p.overrideModels === "boolean") return p;
  const overrideModels = !!(p.defaultModel || p.classifierModel);
  return { ...p, overrideModels };
}

interface Props {
  profiles: RouterProfile[] | null;
  gatewayModelOptions: string[];
  onChange: (updated: RouterProfile[]) => void;
  saveState: SaveActionState;
  onSave: () => Promise<boolean>;
}

// ─── Icons ───────────────────────────────────────────────────────────────────
function IconPlus({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <svg className={className} style={style} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
    </svg>
  );
}

function IconTrash({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <svg className={className} style={style} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
    </svg>
  );
}

function IconTag({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <svg className={className} style={style} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/>
    </svg>
  );
}

function IconModel({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <svg className={className} style={style} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="3" width="20" height="14" rx="2" ry="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/>
    </svg>
  );
}

function IconBlock({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <svg className={className} style={style} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/>
    </svg>
  );
}

function IconFilter({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <svg className={className} style={style} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/>
    </svg>
  );
}

function IconInfo({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <svg className={className} style={style} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/>
    </svg>
  );
}

function IconChevronDown({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <svg className={className} style={style} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="6 9 12 15 18 9"/>
    </svg>
  );
}

function IconChevronUp({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <svg className={className} style={style} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="18 15 12 9 6 15"/>
    </svg>
  );
}

// ─── Empty State ─────────────────────────────────────────────────────────────
function EmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="empty-state" style={{ padding: "var(--space-10) var(--space-6)" }}>
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
        <IconTag style={{ width: 28, height: 28, color: "var(--text-muted)" } as any} />
      </div>
      <div className="empty-state-title">No Routing Profiles</div>
      <p className="empty-state-desc">
        Profiles let clients use custom model names (e.g., auto-cheap, auto-coding) with purpose-specific routing strategies.
      </p>
      <button className="btn btn--primary" onClick={onCreate}>
        <IconPlus />
        Create First Profile
      </button>
    </div>
  );
}

// ─── Profile Card ────────────────────────────────────────────────────────────
function ProfileCard({
  profile,
  index,
  gatewayModelOptions,
  isRequired,
  onUpdate,
  onRemove,
}: {
  profile: RouterProfile;
  index: number;
  gatewayModelOptions: string[];
  isRequired: boolean;
  onUpdate: (idx: number, patch: Partial<RouterProfile>) => void;
  onRemove: (idx: number) => void;
}) {
  const [isExpanded, setIsExpanded] = useState(!profile.id || isRequired);
  const overrideModels = profile.overrideModels ?? false;
  const allModelOptions = Array.from(
    new Set(
      [
        ...gatewayModelOptions,
        profile.defaultModel ?? "",
        profile.classifierModel ?? "",
      ].filter((id): id is string => typeof id === "string" && id.trim().length > 0)
    )
  ).sort((a, b) => a.localeCompare(b));

  return (
    <div className="profile-card animate-slide-in" style={{ animationDelay: `${index * 50}ms` }}>
      {/* Card Header */}
      <div className={`profile-card-header ${isRequired ? "profile-card-header--required" : ""}`}>
        <div className="profile-card-title">
          {profile.id ? (
            <>
              <span className="profile-card-id">{profile.id}</span>
              {profile.name && <span className="profile-card-name">— {profile.name}</span>}
              {isRequired && <span className="badge badge--accent" style={{ marginLeft: "var(--space-2)" }}>Required</span>}
            </>
          ) : (
            <span style={{ fontStyle: "italic", color: "var(--text-muted)" }}>New Profile</span>
          )}
        </div>
        <div style={{ display: "flex", gap: "var(--space-2)", alignItems: "center" }}>
          <span className="badge" style={{ color: "var(--text-muted)" }}>
            {isExpanded ? "Advanced shown" : "Advanced hidden"}
          </span>
          {!isRequired && (
            <button
              className="btn btn--sm btn--danger"
              onClick={(e) => {
                onRemove(index);
              }}
            >
              <IconTrash />
            </button>
          )}
        </div>
      </div>

      {/* Required Fields - Always Visible */}
      <div className="form-row" style={{ marginBottom: isExpanded ? "var(--space-5)" : 0 }}>
        <div className="form-group">
          <label className="form-label">
            Profile ID <span style={{ color: "var(--danger)" }}>*</span>
          </label>
          <input
            className="input input--mono"
            type="text"
            value={profile.id}
            onChange={(e) => onUpdate(index, { id: e.target.value })}
            placeholder="auto-cheap"
            readOnly={isRequired}
          />
          <span className="form-hint">The model name clients send in requests. Must be unique.</span>
        </div>

        <div className="form-group">
          <label className="form-label">
            Display Name <span style={{ color: "var(--danger)" }}>*</span>
          </label>
          <input
            className="input"
            type="text"
            value={profile.name}
            onChange={(e) => onUpdate(index, { name: e.target.value })}
            placeholder="Cheap Auto"
          />
          <span className="form-hint">Human-readable name shown in the UI.</span>
        </div>
      </div>

      {/* Custom Routing Instructions - Critical, always visible */}
      <div className="form-group" style={{ marginBottom: "var(--space-5)" }}>
        <label className="form-label">
          <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
            <IconInfo style={{ width: 12, height: 12 } as any} />
            Custom Routing Instructions
          </div>
        </label>
        <textarea
          className="textarea"
          value={profile.routingInstructions || ""}
          onChange={(e) => onUpdate(index, { routingInstructions: e.target.value || undefined })}
          placeholder="e.g., Always prefer the cheapest model. Prioritize DeepSeek and GLM for reasoning tasks..."
          rows={3}
        />
        <span className="form-hint">
          {isRequired ? "Base routing instructions for requests sent to auto." : "Only applies to this profile. Leave blank to route from catalog hints alone."}
        </span>
      </div>

      <button
        type="button"
        className="btn btn--sm"
        onClick={() => setIsExpanded((prev) => !prev)}
        style={{
          width: "100%",
          justifyContent: "space-between",
          marginBottom: isExpanded ? "var(--space-5)" : 0,
          border: "1px solid var(--border-default)",
          background: isExpanded ? "var(--bg-interactive)" : "transparent",
          color: "var(--text-primary)",
        }}
        aria-expanded={isExpanded}
      >
        <span style={{ display: "inline-flex", alignItems: "center", gap: "var(--space-2)" }}>
          {isExpanded ? <IconChevronUp /> : <IconChevronDown />}
          Advanced settings
        </span>
        <span style={{ color: "var(--text-muted)" }}>
          {isExpanded ? "Hide details" : "Show model overrides and filters"}
        </span>
      </button>

      {/* Expanded Fields */}
      {isExpanded && (
        <>
          {/* Description */}
          <div className="form-group" style={{ marginBottom: "var(--space-5)" }}>
            <label className="form-label">Description</label>
            <input
              className="input"
              type="text"
              value={profile.description || ""}
              onChange={(e) => onUpdate(index, { description: e.target.value || undefined })}
              placeholder="Brief description of when to use this profile..."
            />
          </div>

          {/* Model Selection: for auto always shown; for others only when overrideModels */}
          <div style={{ marginBottom: "var(--space-5)" }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "var(--space-2)",
                marginBottom: "var(--space-4)",
                paddingBottom: "var(--space-3)",
                borderBottom: "1px solid var(--border-subtle)",
              }}
            >
              <IconModel style={{ color: "var(--text-muted)" } as any} />
              <span style={{ fontSize: "0.8125rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-muted)" }}>
                Model Selection
              </span>
            </div>

            {isRequired ? (
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Fallback Model</label>
                  <select
                    className="input input--mono"
                    value={profile.defaultModel || ""}
                    onChange={(e) =>
                      onUpdate(index, {
                        defaultModel: e.target.value.trim().length > 0 ? e.target.value : undefined,
                      })
                    }
                  >
                    <option value="">Select a fallback model</option>
                    {allModelOptions.map((modelId) => (
                      <option key={modelId} value={modelId}>{modelId}</option>
                    ))}
                  </select>
                  <span className="form-hint">Used when the classifier fails to decide.</span>
                </div>
                <div className="form-group">
                  <label className="form-label">Router Model</label>
                  <select
                    className="input input--mono"
                    value={profile.classifierModel || ""}
                    onChange={(e) =>
                      onUpdate(index, {
                        classifierModel: e.target.value.trim().length > 0 ? e.target.value : undefined,
                      })
                    }
                  >
                    <option value="">Select a router model</option>
                    {allModelOptions.map((modelId) => (
                      <option key={modelId} value={modelId}>{modelId}</option>
                    ))}
                  </select>
                  <span className="form-hint">Cheap, fast model for routing decisions.</span>
                </div>
              </div>
            ) : (
              <>
                <label
                  className="override-toggle"
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "var(--space-2)",
                    padding: "var(--space-2) var(--space-3)",
                    background: "var(--bg-interactive)",
                    border: "1px solid var(--border-default)",
                    borderRadius: "var(--radius-md)",
                    cursor: "pointer",
                    marginBottom: overrideModels ? "var(--space-4)" : 0,
                  }}
                >
                  <input
                    type="checkbox"
                    checked={overrideModels}
                    onChange={(e) => onUpdate(index, { overrideModels: e.target.checked })}
                    style={{ margin: 0 }}
                  />
                  <span style={{ fontSize: "0.8125rem", fontWeight: 500, color: "var(--text-secondary)" }}>Override global models</span>
                </label>
                {overrideModels && (
                  <div className="form-row" style={{ marginTop: "var(--space-4)" }}>
                    <div className="form-group">
                      <label className="form-label">Fallback Model</label>
                      <select
                        className="input input--mono"
                        value={profile.defaultModel || ""}
                        onChange={(e) =>
                          onUpdate(index, {
                            defaultModel: e.target.value.trim().length > 0 ? e.target.value : undefined,
                          })
                        }
                      >
                        <option value="">Select a fallback model</option>
                        {allModelOptions.map((modelId) => (
                          <option key={modelId} value={modelId}>{modelId}</option>
                        ))}
                      </select>
                      <span className="form-hint">Override the default fallback model for this profile.</span>
                    </div>
                    <div className="form-group">
                      <label className="form-label">Router Model</label>
                      <select
                        className="input input--mono"
                        value={profile.classifierModel || ""}
                        onChange={(e) =>
                          onUpdate(index, {
                            classifierModel: e.target.value.trim().length > 0 ? e.target.value : undefined,
                          })
                        }
                      >
                        <option value="">Select a router model</option>
                        {allModelOptions.map((modelId) => (
                          <option key={modelId} value={modelId}>{modelId}</option>
                        ))}
                      </select>
                      <span className="form-hint">Override the router model for this profile.</span>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>

          {/* Filters */}
          <div style={{ marginBottom: "var(--space-5)" }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "var(--space-2)",
                marginBottom: "var(--space-4)",
                paddingBottom: "var(--space-3)",
                borderBottom: "1px solid var(--border-subtle)",
              }}
            >
              <IconFilter style={{ color: "var(--text-muted)" } as any} />
              <span style={{ fontSize: "0.8125rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-muted)" }}>
                Model Filters
              </span>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label className="form-label">
                  <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
                    <IconBlock style={{ width: 12, height: 12 } as any} />
                    Additional Blocklist
                  </div>
                </label>
                <input
                  className="input input--mono"
                  type="text"
                  value={profile.blocklist?.join(", ") || ""}
                  onChange={(e) => {
                    const ids = e.target.value
                      .split(",")
                      .map((v) => v.trim())
                      .filter((v) => v.length > 0);
                    onUpdate(index, { blocklist: ids.length > 0 ? ids : undefined });
                  }}
                  placeholder="Added to global blocklist"
                />
                <span className="form-hint">Extra models to exclude (in addition to global blocklist).</span>
              </div>

              <div className="form-group">
                <label className="form-label">Catalog Filter</label>
                <input
                  className="input input--mono"
                  type="text"
                  value={profile.catalogFilter?.join(", ") || ""}
                  onChange={(e) => {
                    const ids = e.target.value
                      .split(",")
                      .map((v) => v.trim())
                      .filter((v) => v.length > 0);
                    onUpdate(index, { catalogFilter: ids.length > 0 ? ids : undefined });
                  }}
                  placeholder="Only route to these models"
                />
                <span className="form-hint">If set, only these models will be considered (restricts catalog).</span>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

const DEFAULT_AUTO_PROFILE: RouterProfile = {
  id: "auto",
  name: "Auto",
  overrideModels: false,
};

// ─── Main Component ───────────────────────────────────────────────────────────
export function ProfilesPanel({ profiles, gatewayModelOptions, onChange, saveState, onSave }: Props) {
  const baseItems = (profiles ?? []).map(normalizeProfile);
  const hasAuto = baseItems.some((p) => p.id === "auto");
  const items = hasAuto ? baseItems : [DEFAULT_AUTO_PROFILE, ...baseItems];

  function updateProfile(idx: number, patch: Partial<RouterProfile>) {
    const updated = [...items];
    updated[idx] = { ...(updated[idx] as RouterProfile), ...patch };
    onChange(updated);
  }

  function addProfile() {
    onChange([...items, { id: "", name: "", overrideModels: false }]);
  }

  function removeProfile(idx: number) {
    const updated = [...items];
    updated.splice(idx, 1);
    onChange(updated);
  }

  async function handleSave() {
    await onSave();
  }

  return (
    <div>
      {/* Create Button */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "var(--space-5)" }}>
        <p style={{ fontSize: "0.875rem", color: "var(--text-muted)", maxWidth: 600 }}>
          Profiles let clients use custom model names like <code className="code">auto-cheap</code> or{" "}
          <code className="code">auto-coding</code> that trigger specific routing strategies. <strong>auto</strong> is always available.
        </p>
        <button className="btn" onClick={addProfile}>
          <IconPlus />
          Add Profile
        </button>
      </div>

      {/* Profiles List */}
      {items.length === 0 ? (
        <EmptyState onCreate={addProfile} />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
          {items.map((profile, idx) => (
            <ProfileCard
              key={profile.id || idx}
              profile={profile}
              index={idx}
              gatewayModelOptions={gatewayModelOptions}
              isRequired={profile.id === "auto"}
              onUpdate={updateProfile}
              onRemove={removeProfile}
            />
          ))}
        </div>
      )}

      {/* Save Button */}
      {items.length > 0 && (
        <div style={{ marginTop: "var(--space-6)", paddingTop: "var(--space-6)", borderTop: "1px solid var(--border-subtle)" }}>
          <SaveActionBar state={saveState} onSave={handleSave} saveLabel="Save profiles" />
        </div>
      )}
    </div>
  );
}
