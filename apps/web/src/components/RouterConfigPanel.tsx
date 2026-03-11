"use client";

import { useEffect, useRef, useState } from "react";

// ─────────────────────────────────────────────────────────────────────────────
// RouterConfigPanel.tsx
//
// Redesigned router configuration with clear section grouping:
//
// Sections:
//   1. Classifier Settings — Optional separate endpoint for the routing classifier
//   2. Routing Logic — Default/classifier models, instructions, blocklist
//
// Each section has its own visual grouping with clear hierarchy.
// ─────────────────────────────────────────────────────────────────────────────

interface RouterConfigFields {
  defaultModel: string | null;
  classifierModel: string | null;
  routingInstructions: string | null;
  blocklist: string[] | null;
  classifierBaseUrl: string | null;
  classifierApiKeyConfigured: boolean;
  classifierApiKeyInput: string;
  clearClassifierApiKey: boolean;
  showModelInResponse: boolean;
}

interface Props {
  config: RouterConfigFields;
  gatewayModelOptions: string[];
  onChange: (updated: RouterConfigFields) => void;
  onSave: (updates: Partial<RouterConfigFields>) => Promise<boolean>;
}

// ─── Icons ───────────────────────────────────────────────────────────────────
function IconLink({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <svg className={className} style={style} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
    </svg>
  );
}

function IconKey({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <svg className={className} style={style} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="7.5" cy="15.5" r="5.5"/><path d="M21 2l-9.6 9.6"/><path d="M15.5 9.5l3 3L22 7l-3-3-3.5 3.5"/>
    </svg>
  );
}

function IconBrain({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <svg className={className} style={style} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9.5 2A2.5 2.5 0 0 1 12 4.5v15a2.5 2.5 0 0 1-4.96.46 2.5 2.5 0 0 1-2.96-3.08 3 3 0 0 1-.34-5.58 2.5 2.5 0 0 1 1.32-4.24 2.5 2.5 0 0 1 1.98-3A2.5 2.5 0 0 1 9.5 2Z"/><path d="M14.5 2A2.5 2.5 0 0 0 12 4.5v15a2.5 2.5 0 0 0 4.96.46 2.5 2.5 0 0 0 2.96-3.08 3 3 0 0 0 .34-5.58 2.5 2.5 0 0 0-1.32-4.24 2.5 2.5 0 0 0-1.98-3A2.5 2.5 0 0 0 14.5 2Z"/>
    </svg>
  );
}

function IconRoute({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <svg className={className} style={style} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="6" cy="19" r="3"/><circle cx="18" cy="5" r="3"/><path d="M12 19l4-7-7-4"/>
    </svg>
  );
}

function IconBlock({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <svg className={className} style={style} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/>
    </svg>
  );
}

function IconSave({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <svg className={className} style={style} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/>
    </svg>
  );
}

// ─── Section Header ───────────────────────────────────────────────────────────
function SectionHeader({
  icon: Icon,
  title,
  description,
}: {
  icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
  title: string;
  description: string;
}) {
  return (
    <div style={{ marginBottom: "var(--space-6)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "var(--space-3)", marginBottom: "var(--space-2)" }}>
        <div
          style={{
            width: 32,
            height: 32,
            borderRadius: "var(--radius-md)",
            background: "var(--accent-dim)",
            display: "grid",
            placeItems: "center",
          }}
        >
          <Icon style={{ width: 16, height: 16, color: "var(--accent)" }} />
        </div>
        <h4 style={{ fontSize: "1rem", fontWeight: 600, color: "var(--text-primary)" }}>{title}</h4>
      </div>
      <p style={{ fontSize: "0.875rem", color: "var(--text-muted)", paddingLeft: 44 }}>{description}</p>
    </div>
  );
}

// ─── Classifier Section ───────────────────────────────────────────────────────
function ClassifierSection({ config, onChange }: { config: RouterConfigFields; onChange: (c: RouterConfigFields) => void }) {
  return (
    <div style={{ marginBottom: "var(--space-8)" }}>
      <SectionHeader
        icon={IconLink}
        title="Classifier Settings"
        description="Configure a separate endpoint for the routing classifier (optional — defaults to the first gateway)"
      />

      <div className="form-row">
        <div className="form-group">
          <label className="form-label">Classifier Base URL</label>
          <input
            className="input"
            type="text"
            value={config.classifierBaseUrl || ""}
            onChange={(e) => onChange({ ...config, classifierBaseUrl: e.target.value })}
            placeholder="https://openrouter.ai/api/v1"
          />
          <span className="form-hint">Optional. Falls back to the default gateway if not set.</span>
        </div>

        <div className="form-group">
          <label className="form-label">
            <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
              <IconKey style={{ width: 14, height: 14 } as any} />
              Classifier API Key
            </div>
          </label>
          <input
            className="input"
            type="password"
            value={config.classifierApiKeyInput}
            onChange={(e) =>
              onChange({
                ...config,
                classifierApiKeyInput: e.target.value,
                clearClassifierApiKey: false,
              })
            }
            placeholder={config.classifierApiKeyConfigured ? "•••••••• (configured)" : "Optional separate key..."}
            autoComplete="new-password"
          />
          <span className="form-hint">Optional. Falls back to the gateway key if not set.</span>
          {config.classifierApiKeyConfigured && (
            <label className="checkbox-wrapper" style={{ marginTop: "var(--space-2)" }}>
              <input
                type="checkbox"
                checked={config.clearClassifierApiKey}
                onChange={(e) =>
                  onChange({
                    ...config,
                    clearClassifierApiKey: e.target.checked,
                    classifierApiKeyInput: e.target.checked ? "" : config.classifierApiKeyInput,
                  })
                }
              />
              <span className="checkbox-label">Clear saved key</span>
            </label>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Routing Logic Section ────────────────────────────────────────────────────
function RoutingLogicSection({
  config,
  gatewayModelOptions,
  onChange,
}: {
  config: RouterConfigFields;
  gatewayModelOptions: string[];
  onChange: (c: RouterConfigFields) => void;
}) {
  const routingInstructionsRef = useRef<HTMLTextAreaElement | null>(null);
  const allModelOptions = Array.from(
    new Set(
      [
        ...gatewayModelOptions,
        config.defaultModel ?? "",
        config.classifierModel ?? "",
      ].filter((id): id is string => id.trim().length > 0)
    )
  ).sort((a, b) => a.localeCompare(b));

  useEffect(() => {
    const textarea = routingInstructionsRef.current;
    if (!textarea) return;

    textarea.style.height = "auto";
    textarea.style.height = `${textarea.scrollHeight}px`;
  }, [config.routingInstructions]);

  return (
    <div>
      <SectionHeader
        icon={IconBrain}
        title="Routing Logic"
        description="Configure how CustomRouter selects models for each request"
      />

      <div className="form-row" style={{ marginBottom: "var(--space-5)" }}>
        <div className="form-group">
          <label className="form-label">
            <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
              <IconRoute style={{ width: 14, height: 14 } as any} />
              Fallback Model
            </div>
          </label>
          <select
            className="input input--mono"
            value={config.defaultModel || ""}
            onChange={(e) =>
              onChange({
                ...config,
                defaultModel: e.target.value.trim().length > 0 ? e.target.value : null,
              })
            }
          >
            <option value="">Select a fallback model</option>
            {allModelOptions.map((modelId) => (
              <option key={modelId} value={modelId}>
                {modelId}
              </option>
            ))}
          </select>
          <span className="form-hint">
            Used when the classifier fails to decide. Options are loaded from all gateway models.
          </span>
        </div>

        <div className="form-group">
          <label className="form-label">
            <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
              <IconBrain style={{ width: 14, height: 14 } as any} />
              Classifier Model
            </div>
          </label>
          <select
            className="input input--mono"
            value={config.classifierModel || ""}
            onChange={(e) =>
              onChange({
                ...config,
                classifierModel: e.target.value.trim().length > 0 ? e.target.value : null,
              })
            }
          >
            <option value="">Select a classifier model</option>
            {allModelOptions.map((modelId) => (
              <option key={modelId} value={modelId}>
                {modelId}
              </option>
            ))}
          </select>
          <span className="form-hint">
            Cheap, fast model for routing decisions. Options are loaded from all gateway models.
          </span>
        </div>
      </div>

      <div className="form-group" style={{ marginBottom: "var(--space-5)" }}>
        <label className="form-label">Routing Instructions</label>
        <textarea
          ref={routingInstructionsRef}
          className="textarea"
          value={config.routingInstructions || ""}
          onChange={(e) => {
            onChange({ ...config, routingInstructions: e.target.value });
            e.target.style.height = "auto";
            e.target.style.height = `${e.target.scrollHeight}px`;
          }}
          placeholder="e.g., Use Claude for coding tasks, GPT-4o for creative writing, and Gemini for general chat..."
          rows={4}
          style={{ overflow: "hidden", resize: "none" }}
        />
        <span className="form-hint">
          Plain-text instructions for the classifier. Be specific about when to use each model type.
        </span>
      </div>

      <div className="form-group">
        <label className="form-label">
          <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
            <IconBlock style={{ width: 14, height: 14 } as any} />
            Global Blocklist
          </div>
        </label>
        <input
          className="input input--mono"
          type="text"
          value={config.blocklist?.join(", ") || ""}
          onChange={(e) => {
            const ids = e.target.value
              .split(",")
              .map((v) => v.trim())
              .filter((v) => v.length > 0);
            onChange({ ...config, blocklist: ids });
          }}
          placeholder="model/id-1, model/id-2, ..."
        />
        <span className="form-hint">Comma-separated model IDs that the router will never use. These models are excluded from all routing decisions.</span>
      </div>

      {/* Show Model in Response Toggle */}
      <div className="form-group" style={{ marginTop: "var(--space-6)" }}>
        <label
          className="checkbox-wrapper"
          style={{
            display: "flex",
            alignItems: "flex-start",
            gap: "var(--space-3)",
            padding: "var(--space-4)",
            background: "var(--bg-interactive)",
            borderRadius: "var(--radius-md)",
            border: "1px solid var(--border-default)",
          }}
        >
          <input
            type="checkbox"
            checked={config.showModelInResponse}
            onChange={(e) => onChange({ ...config, showModelInResponse: e.target.checked })}
            style={{ marginTop: 2 }}
          />
          <div>
            <span className="checkbox-label" style={{ fontWeight: 500 }}>Show model in responses</span>
            <p style={{ fontSize: "0.875rem", color: "var(--text-muted)", marginTop: "var(--space-1)", marginBottom: 0 }}>
              When enabled, the router will append the selected model ID (e.g., <code style={{ fontSize: "0.75rem" }}>#anthropic/claude-sonnet-4</code>) to the end of non-tool-call responses.
            </p>
          </div>
        </label>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export function RouterConfigPanel({ config, gatewayModelOptions, onChange, onSave }: Props) {
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setSaving(true);
    await onSave(config);
    setSaving(false);
  }

  return (
    <div>
      {/* Classifier Settings */}
      <ClassifierSection config={config} onChange={onChange} />

      {/* Divider */}
      <div style={{ height: 1, background: "var(--border-subtle)", margin: "var(--space-8) 0" }} />

      {/* Routing Logic */}
      <RoutingLogicSection
        config={config}
        gatewayModelOptions={gatewayModelOptions}
        onChange={onChange}
      />

      {/* Save Button */}
      <div style={{ marginTop: "var(--space-8)", paddingTop: "var(--space-6)", borderTop: "1px solid var(--border-subtle)" }}>
        <button className="btn" onClick={handleSave} disabled={saving}>
          <IconSave />
          {saving ? "Saving..." : "Save Configuration"}
        </button>
      </div>
    </div>
  );
}
