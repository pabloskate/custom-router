"use client";

import React, { useState } from "react";

import type { SaveActionState } from "./SaveActionBar";
import {
  normalizeRoutingSettingsDraft,
  useRoutingSettingsAutosave,
  type RoutingSettingsDraft,
} from "@/src/features/routing/components/useRoutingSettingsAutosave";

interface Props {
  config: RoutingSettingsDraft;
  onChange: (updated: RoutingSettingsDraft) => void;
  saveState: SaveActionState;
  onSave: (updates: Partial<RoutingSettingsDraft>) => Promise<boolean>;
}

function IconRefresh({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <svg className={className} style={style} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 2v6h-6" />
      <path d="M3 12a9 9 0 0 1 15-6.7L21 8" />
      <path d="M3 22v-6h6" />
      <path d="M21 12a9 9 0 0 1-15 6.7L3 16" />
    </svg>
  );
}

const FREQUENCY_OPTIONS = [
  {
    value: "every_message",
    label: "Every message",
    description: "Re-evaluate the best model on every user message. The classifier runs each turn, so trigger keywords are usually unnecessary.",
  },
  {
    value: "smart",
    label: "Smart",
    description: "Pick a model, keep it pinned, and re-evaluate after a classifier-chosen budget of 1 to 6 future user turns. Trigger keywords can force an earlier switch.",
  },
  {
    value: "new_thread_only",
    label: "New thread only",
    description: "Only select a model at the start of a new conversation by default, but trigger keywords can still force a mid-thread switch.",
  },
] as const;

function SectionHeader({
  title,
  description,
  status,
}: {
  title: string;
  description: string;
  status?: React.ReactNode;
}) {
  return (
    <div style={{ marginBottom: "var(--space-6)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: "var(--space-4)", alignItems: "flex-start" }}>
        <div>
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
              <IconRefresh style={{ width: 16, height: 16, color: "var(--accent)" }} />
            </div>
            <h4 style={{ fontSize: "1rem", fontWeight: 600, color: "var(--text-primary)" }}>{title}</h4>
          </div>
          <p style={{ fontSize: "0.875rem", color: "var(--text-muted)", paddingLeft: 44 }}>{description}</p>
        </div>
        {status}
      </div>
    </div>
  );
}

function AutosaveStatus({ state }: { state: SaveActionState }) {
  const meta = state === "dirty"
    ? { badgeClass: "badge--warning", label: "Changes pending" }
    : state === "saving"
      ? { badgeClass: "badge--info", label: "Saving in background..." }
      : { badgeClass: "badge--success", label: "All changes saved" };

  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "var(--space-2)",
        flexShrink: 0,
        paddingTop: "var(--space-1)",
      }}
    >
      <span className={`badge ${meta.badgeClass}`}>{meta.label}</span>
    </div>
  );
}

export function RouterConfigPanel({ config, onChange, saveState, onSave }: Props) {
  const [tagInput, setTagInput] = useState("");
  const normalizedConfig = normalizeRoutingSettingsDraft(config);
  const activeFrequency = normalizedConfig.routingFrequency ?? "smart";
  const activeOption = FREQUENCY_OPTIONS.find((option) => option.value === activeFrequency) ?? FREQUENCY_OPTIONS[1];
  const tags = normalizedConfig.routeTriggerKeywords ?? [];
  const triggerKeywordsHint =
    activeFrequency === "every_message"
      ? "When any of these keywords appear at the start of a user message, the router re-evaluates and may switch models. In Every message mode this is mostly redundant because routing already runs each turn."
      : activeFrequency === "new_thread_only"
        ? "When any of these keywords appear at the start of a user message, the router re-evaluates and may switch models even in New thread only mode."
        : "When any of these keywords appear at the start of a user message, the router re-evaluates and may switch models.";

  useRoutingSettingsAutosave({
    draft: normalizedConfig,
    onSave,
  });

  function addTag() {
    const value = tagInput.trim();
    if (value && !tags.includes(value) && value.toLowerCase() !== "$$route") {
      onChange({ ...normalizedConfig, routeTriggerKeywords: [...tags, value] });
    }
    setTagInput("");
  }

  function removeTag(index: number) {
    const nextKeywords = tags.filter((_, itemIndex) => itemIndex !== index);
    onChange({
      ...normalizedConfig,
      routeTriggerKeywords: nextKeywords.length > 0 ? nextKeywords : null,
    });
  }

  return (
    <div>
      <SectionHeader
        title="Re-routing Behavior"
        description="Control when the router re-evaluates profile model selection during a conversation."
        status={<AutosaveStatus state={saveState} />}
      />

      <div className="form-group" style={{ marginBottom: "var(--space-5)" }}>
        <label className="form-label">When to route</label>
        <div
          style={{
            display: "flex",
            gap: 0,
            borderRadius: "var(--radius-md)",
            border: "1px solid var(--border-default)",
            overflow: "hidden",
          }}
        >
          {FREQUENCY_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => onChange({ ...normalizedConfig, routingFrequency: option.value })}
              style={{
                flex: 1,
                padding: "var(--space-2) var(--space-3)",
                border: "none",
                borderRight: option.value !== "new_thread_only" ? "1px solid var(--border-default)" : "none",
                background: activeFrequency === option.value ? "var(--accent)" : "transparent",
                color: activeFrequency === option.value ? "#0a0a0f" : "var(--text-secondary)",
                cursor: "pointer",
                fontSize: "0.8125rem",
                fontWeight: 500,
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

      {activeFrequency === "smart" && (
        <div className="form-group" style={{ marginBottom: "var(--space-5)" }}>
          <div
            style={{
              borderRadius: "var(--radius-lg)",
              border: "1px solid color-mix(in srgb, var(--accent) 35%, var(--border-default))",
              background: "color-mix(in srgb, var(--accent) 8%, var(--surface-elevated))",
              padding: "var(--space-5)",
            }}
          >
            <h4 style={{ margin: 0, marginBottom: "var(--space-3)", color: "var(--accent)", fontSize: "1rem", fontWeight: 700 }}>
              How Smart Pinning Works
            </h4>
            <p style={{ margin: 0, color: "var(--text-secondary)", lineHeight: 1.6 }}>
              The router uses a fast classifier to predict how long the conversation will stay on-topic. It automatically pins the selected model for 1 to 6 future user turns. Internal agent tool loops do not consume this budget.
            </p>
          </div>
        </div>
      )}

      <div className="form-group" style={{ marginBottom: "var(--space-5)" }}>
          <label className="form-label">Trigger keywords</label>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-2)", marginBottom: "var(--space-2)" }}>
            <span
              className="badge badge--info"
              style={{
                opacity: 0.6,
                cursor: "default",
                userSelect: "none",
              }}
            >
              $$route
            </span>
            {tags.map((tag, index) => (
              <span
                key={tag}
                className="badge badge--info"
                style={{ display: "inline-flex", alignItems: "center", gap: "var(--space-1)" }}
              >
                {tag}
                <button
                  type="button"
                  onClick={() => removeTag(index)}
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
            onChange={(event) => setTagInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === ",") {
                event.preventDefault();
                addTag();
              }
            }}
            onBlur={() => {
              if (tagInput.trim()) {
                addTag();
              }
            }}
            placeholder="Type a keyword and press Enter..."
          />
          <span className="form-hint">
            {triggerKeywordsHint}
          </span>
      </div>
    </div>
  );
}
