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

const FREQUENCY_OPTIONS = [
  {
    value: "every_message" as const,
    label: "Every message",
    hint: "Re-evaluates on every turn",
  },
  {
    value: "smart" as const,
    label: "Smart (recommended)",
    hint: "Pins model for 1-6 turns, then re-evaluates",
  },
  {
    value: "new_thread_only" as const,
    label: "New thread only",
    hint: "Selects model once per conversation",
  },
];

type RoutingFrequencyValue = (typeof FREQUENCY_OPTIONS)[number]["value"];

function SectionHeader({ title, status }: { title: string; status?: React.ReactNode }) {
  return (
    <div
      style={{
        marginBottom: "var(--space-5)",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        gap: "var(--space-4)",
      }}
    >
      <h4 style={{ fontSize: "1rem", fontWeight: 600, color: "var(--text-primary)", margin: 0 }}>{title}</h4>
      {status}
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
      }}
    >
      <span className={`badge ${meta.badgeClass}`}>{meta.label}</span>
    </div>
  );
}

const TRIGGER_KEYWORDS_HINT = "Keywords at the start of a message force re-routing.";

export function RouterConfigPanel({ config, onChange, saveState, onSave }: Props) {
  const [tagInput, setTagInput] = useState("");
  const normalizedConfig = normalizeRoutingSettingsDraft(config);
  const activeFrequency = normalizedConfig.routingFrequency ?? "smart";
  const defaultFrequencyOption = FREQUENCY_OPTIONS[1]!;
  const activeOption =
    FREQUENCY_OPTIONS.find((option) => option.value === activeFrequency) ?? defaultFrequencyOption;
  const tags = normalizedConfig.routeTriggerKeywords ?? [];

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
      <SectionHeader title="Re-routing Behavior" status={<AutosaveStatus state={saveState} />} />

      <div className="form-group" style={{ marginBottom: "var(--space-5)" }}>
        <label className="form-label" htmlFor="routing-frequency">
          Routing frequency
        </label>
        <select
          id="routing-frequency"
          className="input select"
          value={activeFrequency}
          onChange={(event) => {
            const next = event.target.value as RoutingFrequencyValue;
            onChange({ ...normalizedConfig, routingFrequency: next });
          }}
        >
          {FREQUENCY_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <span className="form-hint" style={{ marginTop: "var(--space-2)" }}>
          {activeOption.hint}
        </span>
      </div>

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
        <span className="form-hint">{TRIGGER_KEYWORDS_HINT}</span>
      </div>
    </div>
  );
}
