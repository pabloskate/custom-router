"use client";

// ─────────────────────────────────────────────────────────────────────────────
// CatalogEditorPanel.tsx
//
// Redesigned model catalog ("constitution") editor:
// - Card-based layout for each model (much clearer than inline table editing)
// - Model ID is prominent with monospace font
// - Metadata displayed as tags/badges
// - Expandable details for editing
// - Clear empty state with helpful guidance
// ─────────────────────────────────────────────────────────────────────────────

import { useState } from "react";
import {
  getReasoningPresetBadgeLabel,
  REASONING_PRESET_FIELD_HINT,
  REASONING_PRESET_SELECT_OPTIONS,
} from "@/src/lib/reasoning-options";

export type CatalogItem = {
  id: string;
  name: string;
  modality?: string;
  thinking?: string;
  whenToUse?: string;
};

interface Props {
  catalog: CatalogItem[] | null;
  onChange: (updated: CatalogItem[]) => void;
  onSave: () => Promise<boolean>;
}

const MODALITY_OPTIONS = [
  { value: "text", label: "Text" },
  { value: "text->text", label: "Text → Text" },
  { value: "text,image->text", label: "Text, Image → Text" },
  { value: "text,video->text", label: "Text, Video → Text" },
  { value: "text,audio->text", label: "Text, Audio → Text" },
  { value: "text->image", label: "Text → Image" },
  { value: "text->audio", label: "Text → Audio" },
];

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

function IconSave({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <svg className={className} style={style} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/>
    </svg>
  );
}

function IconCube({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <svg className={className} style={style} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/>
    </svg>
  );
}

function IconEdit({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <svg className={className} style={style} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
    </svg>
  );
}

function IconBrain({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <svg className={className} style={style} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9.5 2A2.5 2.5 0 0 1 12 4.5v15a2.5 2.5 0 0 1-4.96.46 2.5 2.5 0 0 1-2.96-3.08 3 3 0 0 1-.34-5.58 2.5 2.5 0 0 1 1.32-4.24 2.5 2.5 0 0 1 1.98-3A2.5 2.5 0 0 1 9.5 2Z"/><path d="M14.5 2A2.5 2.5 0 0 0 12 4.5v15a2.5 2.5 0 0 0 4.96.46 2.5 2.5 0 0 0 2.96-3.08 3 3 0 0 0 .34-5.58 2.5 2.5 0 0 0-1.32-4.24 2.5 2.5 0 0 0-1.98-3A2.5 2.5 0 0 0 14.5 2Z"/>
    </svg>
  );
}

// ─── Badge Helpers ───────────────────────────────────────────────────────────
function ModalityBadge({ modality }: { modality?: string }) {
  const mod = MODALITY_OPTIONS.find((o) => o.value === modality);
  const label = mod?.label || modality || "Text";

  return (
    <span className="badge badge--info" style={{ fontSize: "0.6875rem" }}>
      {label}
    </span>
  );
}

function ThinkingBadge({ level }: { level?: string }) {
  const label = getReasoningPresetBadgeLabel(level);

  // Color based on level
  let variant = "badge--info";
  if (level === "high" || level === "xhigh") variant = "badge--warning";
  if (level === "none" || level === "minimal") variant = "badge--success";

  return (
    <span className={`badge ${variant}`} style={{ fontSize: "0.6875rem" }}>
      <IconBrain style={{ width: 10, height: 10 } as any} />
      {label}
    </span>
  );
}

// ─── Empty State ────────────────────────────────────────────────────────────
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
        <IconCube style={{ width: 28, height: 28, color: "var(--text-muted)" } as any} />
      </div>
      <div className="empty-state-title">Using System Catalog</div>
      <p className="empty-state-desc">
        You haven&apos;t defined a custom model catalog yet. The router will use the system catalog
        with all available models.
      </p>
      <button className="btn btn--primary" onClick={onCreate}>
        <IconPlus />
        Add Custom Model
      </button>
    </div>
  );
}

// ─── Model Card ────────────────────────────────────────────────────────────
function ModelCard({
  item,
  index,
  onUpdate,
  onRemove,
}: {
  item: CatalogItem;
  index: number;
  onUpdate: (idx: number, patch: Partial<CatalogItem>) => void;
  onRemove: (idx: number) => void;
}) {
  const [isExpanded, setIsExpanded] = useState(!item.id || item.id === "new-model/id");

  const isDefaultModel = item.id === "new-model/id";

  return (
    <div
      className="animate-slide-in"
      style={{
        background: "var(--bg-surface)",
        border: "1px solid var(--border-subtle)",
        borderRadius: "var(--radius-lg)",
        overflow: "hidden",
        animationDelay: `${index * 30}ms`,
      }}
    >
      {/* Card Header - Always Visible */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "var(--space-4)",
          padding: "var(--space-4) var(--space-5)",
          background: isDefaultModel ? "var(--warning-dim)" : undefined,
          borderBottom: isExpanded ? "1px solid var(--border-subtle)" : "none",
        }}
      >
        {/* Model Icon */}
        <div
          style={{
            width: 40,
            height: 40,
            borderRadius: "var(--radius-md)",
            background: isDefaultModel ? "var(--warning-dim)" : "var(--accent-dim)",
            display: "grid",
            placeItems: "center",
            flexShrink: 0,
          }}
        >
          <IconCube
            style={{
              width: 20,
              height: 20,
              color: isDefaultModel ? "var(--warning)" : "var(--accent)",
            } as any}
          />
        </div>

        {/* Model Info */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: "var(--space-3)", marginBottom: "var(--space-1)" }}>
            <code
              className="mono"
              style={{
                fontSize: "0.9375rem",
                fontWeight: 600,
                color: "var(--text-primary)",
              }}
            >
              {isDefaultModel ? "New Model" : item.id}
            </code>
            {isDefaultModel && (
              <span className="badge badge--warning" style={{ fontSize: "0.625rem" }}>
                EDIT REQUIRED
              </span>
            )}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", flexWrap: "wrap" }}>
            <span style={{ fontSize: "0.875rem", color: "var(--text-secondary)" }}>
              {item.name}
            </span>
            {!isExpanded && (
              <>
                <span style={{ color: "var(--border-default)" }}>•</span>
                <ModalityBadge modality={item.modality} />
                <ThinkingBadge level={item.thinking} />
              </>
            )}
          </div>
        </div>

        {/* Actions */}
        <div style={{ display: "flex", gap: "var(--space-2)", flexShrink: 0 }}>
          <button
            className="btn btn--sm btn--ghost"
            onClick={() => setIsExpanded(!isExpanded)}
          >
            <IconEdit />
            {isExpanded ? "Done" : "Edit"}
          </button>
          <button
            className="btn btn--sm btn--danger"
            onClick={() => onRemove(index)}
          >
            <IconTrash />
          </button>
        </div>
      </div>

      {/* Expanded Edit Form */}
      {isExpanded && (
        <div style={{ padding: "var(--space-5)" }}>
          <div className="form-row" style={{ marginBottom: "var(--space-4)" }}>
            <div className="form-group">
              <label className="form-label">Model ID</label>
              <input
                className="input input--mono"
                type="text"
                value={item.id}
                onChange={(e) => onUpdate(index, { id: e.target.value })}
                placeholder="provider/model-name"
              />
              <span className="form-hint">The unique identifier for this model (e.g., openai/gpt-4o)</span>
            </div>

            <div className="form-group">
              <label className="form-label">Display Name</label>
              <input
                className="input"
                type="text"
                value={item.name}
                onChange={(e) => onUpdate(index, { name: e.target.value })}
                placeholder="GPT-4o"
              />
              <span className="form-hint">Human-readable name for this model</span>
            </div>
          </div>

          <div className="form-row" style={{ marginBottom: "var(--space-4)" }}>
            <div className="form-group">
              <label className="form-label">Modality</label>
              <select
                className="select"
                value={item.modality || "text"}
                onChange={(e) => onUpdate(index, { modality: e.target.value })}
              >
                {MODALITY_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
              <span className="form-hint">What inputs/outputs this model supports</span>
            </div>

            <div className="form-group">
              <label className="form-label">Reasoning preset</label>
              <select
                className="select"
                value={item.thinking || "provider_default"}
                onChange={(e) => onUpdate(index, { thinking: e.target.value })}
              >
                {REASONING_PRESET_SELECT_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
              <span className="form-hint">{REASONING_PRESET_FIELD_HINT}</span>
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">When to Use</label>
            <input
              className="input"
              type="text"
              value={item.whenToUse || ""}
              onChange={(e) => onUpdate(index, { whenToUse: e.target.value })}
              placeholder="e.g., Best for coding tasks, technical reasoning, and analysis..."
            />
            <span className="form-hint">
              Guidance for the classifier on when to select this model. Be specific!
            </span>
          </div>
        </div>
      )}

      {/* Footer with Notes Preview */}
      {!isExpanded && item.whenToUse && (
        <div
          style={{
            padding: "var(--space-3) var(--space-5)",
            background: "var(--bg-elevated)",
            borderTop: "1px solid var(--border-subtle)",
          }}
        >
          <div style={{ display: "flex", alignItems: "flex-start", gap: "var(--space-2)" }}>
            <IconBrain style={{ width: 14, height: 14, color: "var(--text-muted)", flexShrink: 0, marginTop: 2 } as any} />
            <span style={{ fontSize: "0.8125rem", color: "var(--text-secondary)", lineHeight: 1.5 }}>
              {item.whenToUse}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main Component ─────────────────────────────────────────────────────────
export function CatalogEditorPanel({ catalog, onChange, onSave }: Props) {
  const [saving, setSaving] = useState(false);
  const items = catalog || [];

  function updateItem(idx: number, patch: Partial<CatalogItem>) {
    const updated = [...items];
    updated[idx] = { ...(updated[idx] as CatalogItem), ...patch };
    onChange(updated);
  }

  function addItem() {
    onChange([...items, { id: "new-model/id", name: "New Model" }]);
  }

  function removeItem(idx: number) {
    const updated = [...items];
    updated.splice(idx, 1);
    onChange(updated);
  }

  async function handleSave() {
    setSaving(true);
    await onSave();
    setSaving(false);
  }

  return (
    <div>
      {/* Header */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          marginBottom: "var(--space-5)",
          gap: "var(--space-4)",
        }}
      >
        <div style={{ flex: 1 }}>
          <p style={{ fontSize: "0.875rem", color: "var(--text-muted)", maxWidth: 700, lineHeight: 1.6 }}>
            Your custom model catalog (or &quot;constitution&quot;) tells the router exactly which models
            it can choose from. For each model, specify when it should be used so the classifier
            makes smart decisions. If empty, the system catalog is used.
          </p>
        </div>
        <button className="btn" onClick={addItem}>
          <IconPlus />
          Add Model
        </button>
      </div>

      {/* Models List */}
      {items.length === 0 ? (
        <EmptyState onCreate={addItem} />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
          {items.map((item, idx) => (
            <ModelCard
              key={idx}
              item={item}
              index={idx}
              onUpdate={updateItem}
              onRemove={removeItem}
            />
          ))}
        </div>
      )}

      {/* Save Footer */}
      {items.length > 0 && (
        <div
          style={{
            marginTop: "var(--space-6)",
            paddingTop: "var(--space-6)",
            borderTop: "1px solid var(--border-subtle)",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <span style={{ fontSize: "0.875rem", color: "var(--text-muted)" }}>
            {items.length} model{items.length !== 1 ? "s" : ""} in custom catalog
          </span>
          <button className="btn btn--primary" onClick={() => void handleSave()} disabled={saving}>
            <IconSave />
            {saving ? "Saving..." : "Save Catalog"}
          </button>
        </div>
      )}
    </div>
  );
}
