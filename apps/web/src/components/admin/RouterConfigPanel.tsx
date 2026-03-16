"use client";

import React, { useEffect, useRef, useState } from "react";
import { SaveActionBar, type SaveActionState } from "./SaveActionBar";

interface RouterConfigFields {
  defaultModel: string | null;
  classifierModel: string | null;
  routingInstructions: string | null;
  blocklist: string[] | null;
  routeTriggerKeywords: string[] | null;
  routingFrequency: string | null;
}

interface Props {
  config: RouterConfigFields;
  gatewayModelOptions: string[];
  onChange: (updated: RouterConfigFields) => void;
  saveState: SaveActionState;
  onSave: (updates: Partial<RouterConfigFields>) => Promise<boolean>;
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

function IconSparkle({ style }: { style?: React.CSSProperties }) {
  return (
    <svg style={style} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3l1.5 4.5L18 9l-4.5 1.5L12 15l-1.5-4.5L6 9l4.5-1.5z"/><path d="M19 15l.75 2.25L22 18l-2.25.75L19 21l-.75-2.25L16 18l2.25-.75z"/>
    </svg>
  );
}

// ─── Setup Agent Modal ─────────────────────────────────────────────────────────
function SetupAgentModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const dialogRef = useRef<HTMLDialogElement | null>(null);

  useEffect(() => {
    const el = dialogRef.current;
    if (!el) return;
    if (open) {
      el.showModal();
    } else {
      el.close();
    }
  }, [open]);

  // Close on backdrop click
  function handleDialogClick(e: React.MouseEvent<HTMLDialogElement>) {
    const rect = dialogRef.current?.getBoundingClientRect();
    if (!rect) return;
    if (e.clientX < rect.left || e.clientX > rect.right || e.clientY < rect.top || e.clientY > rect.bottom) {
      onClose();
    }
  }

  return (
    <dialog
      ref={dialogRef}
      onClick={handleDialogClick}
      onCancel={onClose}
      style={{
        background: "var(--bg-card)",
        border: "1px solid var(--border-default)",
        borderRadius: "var(--radius-lg)",
        padding: 0,
        width: "min(560px, 90vw)",
        maxHeight: "80vh",
        overflow: "hidden",
        color: "var(--text-primary)",
        boxShadow: "0 24px 64px rgba(0,0,0,0.5)",
      }}
    >
      {/* Header */}
      <div style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "var(--space-5) var(--space-6)",
        borderBottom: "1px solid var(--border-subtle)",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: "var(--space-3)" }}>
          <div style={{
            width: 32, height: 32,
            borderRadius: "var(--radius-md)",
            background: "var(--accent-dim)",
            display: "grid", placeItems: "center",
          }}>
            <IconSparkle style={{ color: "var(--accent)" }} />
          </div>
          <div>
            <div style={{ fontWeight: 600, fontSize: "0.9375rem" }}>Setup with Agent</div>
            <div style={{ fontSize: "0.8125rem", color: "var(--text-muted)", marginTop: 2 }}>AI-assisted routing configuration</div>
          </div>
        </div>
        <button
          className="btn btn--ghost btn--icon btn--sm"
          onClick={onClose}
          aria-label="Close"
          style={{ flexShrink: 0 }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      </div>

      {/* Body — placeholder until agent is wired up */}
      <div style={{ padding: "var(--space-8) var(--space-6)", textAlign: "center", color: "var(--text-muted)" }}>
        <div style={{
          width: 48, height: 48,
          borderRadius: "var(--radius-lg)",
          background: "var(--accent-dim)",
          display: "grid", placeItems: "center",
          margin: "0 auto var(--space-4)",
        }}>
          <IconSparkle style={{ width: 22, height: 22, color: "var(--accent)" } as any} />
        </div>
        <p style={{ fontSize: "0.9375rem", fontWeight: 500, color: "var(--text-primary)", marginBottom: "var(--space-2)" }}>
          Agent coming soon
        </p>
        <p style={{ fontSize: "0.875rem", lineHeight: 1.6 }}>
          The setup agent will walk you through configuring routing profiles, models, and instructions based on your use case.
        </p>
      </div>
    </dialog>
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
  const [agentOpen, setAgentOpen] = useState(false);
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
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
        <SectionHeader
          icon={IconBrain}
          title="Routing Logic"
          description="Configure how CustomRouter selects models for each request"
        />
        <button
          className="btn btn--ghost btn--sm"
          type="button"
          onClick={() => setAgentOpen(true)}
          style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", flexShrink: 0, marginTop: 2 }}
        >
          <IconSparkle />
          Setup with Agent
        </button>
      </div>

      <SetupAgentModal open={agentOpen} onClose={() => setAgentOpen(false)} />

      {/* Row 2: Default Fallback + Default Classifier */}
      <div className="global-settings-row" style={{ marginBottom: "var(--space-5)" }}>
        <div className="form-group" style={{ flex: "1 1 200px" }}>
          <label className="form-label">
            <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
              <IconRoute style={{ width: 14, height: 14 } as any} />
              Default Fallback Model
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
            Used when the classifier fails to decide.
          </span>
        </div>
        <div className="form-group" style={{ flex: "1 1 200px" }}>
          <label className="form-label">
            <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
              <IconBrain style={{ width: 14, height: 14 } as any} />
              Default Router Model
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
            <option value="">Select a router model</option>
            {allModelOptions.map((modelId) => (
              <option key={modelId} value={modelId}>
                {modelId}
              </option>
            ))}
          </select>
          <span className="form-hint">
            Cheap, fast model for routing decisions.
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

      <div className="form-group" style={{ marginBottom: "var(--space-5)" }}>
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
        <span className="form-hint">Comma-separated model IDs excluded from all routing decisions.</span>
      </div>
    </div>
  );
}

// ─── Re-routing Behavior Section ─────────────────────────────────────────────

function IconRefresh({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <svg className={className} style={style} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 2v6h-6"/><path d="M3 12a9 9 0 0 1 15-6.7L21 8"/><path d="M3 22v-6h6"/><path d="M21 12a9 9 0 0 1-15 6.7L3 16"/>
    </svg>
  );
}

const FREQUENCY_OPTIONS = [
  {
    value: "every_message",
    label: "Every message",
    description: "Re-evaluate the best model on every user message. The classifier runs each turn — no model stickiness.",
  },
  {
    value: "smart",
    label: "Smart",
    description: "Pick a model on the first message and stick with it for the conversation. Use a trigger keyword to force a model switch mid-conversation.",
  },
  {
    value: "new_thread_only",
    label: "New thread only",
    description: "Only select a model at the start of a new conversation. Never switch mid-conversation, even with trigger keywords.",
  },
] as const;

function ReroutingBehaviorSection({
  config,
  onChange,
}: {
  config: RouterConfigFields;
  onChange: (c: RouterConfigFields) => void;
}) {
  const [tagInput, setTagInput] = useState("");
  const activeFrequency = config.routingFrequency ?? "smart";
  const activeOption = FREQUENCY_OPTIONS.find((o) => o.value === activeFrequency) ?? FREQUENCY_OPTIONS[1];
  const tags = config.routeTriggerKeywords ?? [];

  function addTag() {
    const value = tagInput.trim();
    if (value && !tags.includes(value) && value.toLowerCase() !== "$$route") {
      onChange({ ...config, routeTriggerKeywords: [...tags, value] });
      setTagInput("");
    } else {
      setTagInput("");
    }
  }

  function removeTag(index: number) {
    onChange({ ...config, routeTriggerKeywords: tags.filter((_, i) => i !== index) });
  }

  return (
    <div style={{ marginTop: "var(--space-8)", paddingTop: "var(--space-6)", borderTop: "1px solid var(--border-subtle)" }}>
      <SectionHeader
        icon={IconRefresh}
        title="Re-routing Behavior"
        description="Control when the router re-evaluates model selection during a conversation"
      />

      {/* Routing Frequency */}
      <div className="form-group" style={{ marginBottom: "var(--space-5)" }}>
        <label className="form-label">When to route</label>
        <div style={{
          display: "flex",
          gap: 0,
          borderRadius: "var(--radius-md)",
          border: "1px solid var(--border-default)",
          overflow: "hidden",
        }}>
          {FREQUENCY_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => onChange({ ...config, routingFrequency: option.value })}
              style={{
                flex: 1,
                padding: "var(--space-2) var(--space-3)",
                border: "none",
                borderRight: option.value !== "new_thread_only" ? "1px solid var(--border-default)" : "none",
                background: activeFrequency === option.value ? "var(--accent)" : "transparent",
                color: activeFrequency === option.value ? "white" : "var(--text-secondary)",
                cursor: "pointer",
                fontSize: "0.8125rem",
                fontWeight: 500,
                transition: "background 0.15s, color 0.15s",
              }}
            >
              {option.label}
            </button>
          ))}
        </div>
        <span className="form-hint" style={{ marginTop: "var(--space-2)" }}>
          {activeOption.description}
        </span>
      </div>

      {/* Trigger Keywords — only visible in "smart" mode */}
      {activeFrequency === "smart" && (
        <div className="form-group" style={{ marginBottom: "var(--space-5)" }}>
          <label className="form-label">Trigger keywords</label>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-2)", marginBottom: "var(--space-2)" }}>
            {/* Built-in default (non-removable) */}
            <span
              className="badge badge--info"
              style={{
                opacity: 0.6,
                cursor: "default",
                userSelect: "none",
                display: "inline-flex",
                alignItems: "center",
                gap: "var(--space-1)",
              }}
            >
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.7 }}>
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
              </svg>
              $$route
            </span>
            {/* User-added tags */}
            {tags.map((tag, i) => (
              <span
                key={i}
                className="badge badge--info"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "var(--space-1)",
                }}
              >
                {tag}
                <button
                  type="button"
                  onClick={() => removeTag(i)}
                  style={{
                    background: "none",
                    border: "none",
                    color: "inherit",
                    cursor: "pointer",
                    padding: 0,
                    fontSize: "0.875rem",
                    lineHeight: 1,
                    opacity: 0.7,
                  }}
                  aria-label={`Remove ${tag}`}
                >
                  &times;
                </button>
              </span>
            ))}
          </div>
          <input
            className="input input--mono"
            type="text"
            value={tagInput}
            onChange={(e) => setTagInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === ",") {
                e.preventDefault();
                addTag();
              }
            }}
            onBlur={() => { if (tagInput.trim()) addTag(); }}
            placeholder="Type a keyword and press Enter..."
          />
          <span className="form-hint">
            When any of these keywords appear at the start of a user message, the router re-evaluates and may switch models. Press Enter or comma to add.
          </span>
        </div>
      )}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export function RouterConfigPanel({ config, gatewayModelOptions, onChange, saveState, onSave }: Props) {
  async function handleSave() {
    await onSave(config);
  }

  return (
    <div>
      <RoutingLogicSection
        config={config}
        gatewayModelOptions={gatewayModelOptions}
        onChange={onChange}
      />

      <ReroutingBehaviorSection
        config={config}
        onChange={onChange}
      />

      <div style={{ marginTop: "var(--space-8)", paddingTop: "var(--space-6)", borderTop: "1px solid var(--border-subtle)" }}>
        <SaveActionBar state={saveState} onSave={handleSave} saveLabel="Save configuration" />
      </div>
    </div>
  );
}
