"use client";

import { useCallback, useEffect, useState } from "react";
import { GATEWAY_PRESETS, CUSTOM_PRESET_ID } from "../../lib/gateway-presets";
import { ROUTING_PRESETS, getGatewayPresetId, type RoutingPreset } from "../../lib/routing-presets";
import type { GatewayInfo, GatewayModel } from "@/src/features/gateways/contracts";

// ─────────────────────────────────────────────────────────────────────────────
// GatewayPanel.tsx
//
// Unified gateway + model management UI. Each gateway owns its base URL,
// API key, and a list of router-visible model variants.
//
// Sections per gateway card:
//   - Gateway header: name, URL, key status, edit/delete actions
//   - Model list: router model IDs with reasoning preset
//   - "Fetch from gateway" button to auto-discover base models via /models API
//   - "Add model" and "Clone" flows for fixed reasoning variants
// ─────────────────────────────────────────────────────────────────────────────

type ReasoningLevel = "none" | "minimal" | "low" | "medium" | "high" | "xhigh";

export type { GatewayInfo, GatewayModel } from "@/src/features/gateways/contracts";

interface Props {
  onStatus?: (msg: string) => void;
  onError?: (msg?: string) => void;
  onApplyRoutingPreset?: (preset: RoutingPreset) => Promise<boolean>;
  existingProfileIds?: string[];
}

const REASONING_OPTIONS = [
  { value: "none", label: "None" },
  { value: "minimal", label: "Minimal" },
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
  { value: "xhigh", label: "Extra high" },
] as const;

function nextVariantId(modelId: string): string {
  const trimmed = modelId.trim();
  return trimmed ? `${trimmed}:variant` : "";
}

function hasDuplicateModelIds(models: GatewayModel[]): boolean {
  const seen = new Set<string>();
  for (const model of models) {
    if (seen.has(model.id)) {
      return true;
    }
    seen.add(model.id);
  }
  return false;
}

function reasoningLabel(level: GatewayModel["reasoningPreset"] | GatewayModel["thinking"]): string {
  return REASONING_OPTIONS.find((option) => option.value === level)?.label ?? "None";
}

// ─── Icons ───────────────────────────────────────────────────────────────────
function IconPlus({ className }: { className?: string }) {
  return (
    <svg className={className} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}

function IconEdit({ className }: { className?: string }) {
  return (
    <svg className={className} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
    </svg>
  );
}

function IconTrash({ className }: { className?: string }) {
  return (
    <svg className={className} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    </svg>
  );
}

function IconDownload({ className }: { className?: string }) {
  return (
    <svg className={className} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  );
}

function IconKey({ className }: { className?: string }) {
  return (
    <svg className={className} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="7.5" cy="15.5" r="5.5" /><path d="M21 2l-9.6 9.6" /><path d="M15.5 9.5l3 3L22 7l-3-3-3.5 3.5" />
    </svg>
  );
}

function IconGlobe({ className }: { className?: string }) {
  return (
    <svg className={className} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" /><line x1="2" y1="12" x2="22" y2="12" /><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
    </svg>
  );
}

// ─── Gateway form ─────────────────────────────────────────────────────────────

interface GatewayFormProps {
  initial?: { name: string; baseUrl: string };
  isEdit?: boolean;
  saving?: boolean;
  onSave: (data: { name: string; baseUrl: string; apiKey: string }) => Promise<void>;
  onCancel: () => void;
}

function GatewayForm({ initial, isEdit, saving, onSave, onCancel }: GatewayFormProps) {
  const [name, setName] = useState(initial?.name ?? "");
  const [baseUrl, setBaseUrl] = useState(initial?.baseUrl ?? "");
  const [apiKey, setApiKey] = useState("");
  const [err, setErr] = useState("");
  const [selectedPreset, setSelectedPreset] = useState("");

  const isPresetSelected = selectedPreset !== "" && selectedPreset !== CUSTOM_PRESET_ID;

  function handlePresetChange(presetId: string) {
    setSelectedPreset(presetId);
    if (presetId === "" || presetId === CUSTOM_PRESET_ID) {
      setName("");
      setBaseUrl("");
    } else {
      const preset = GATEWAY_PRESETS.find((p) => p.id === presetId);
      if (preset) {
        setName(preset.name);
        setBaseUrl(preset.baseUrl);
      }
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return setErr("Name is required.");
    if (!baseUrl.trim()) return setErr("Base URL is required.");
    if (!isEdit && !apiKey.trim()) return setErr("API key is required.");
    setErr("");
    await onSave({ name: name.trim(), baseUrl: baseUrl.trim(), apiKey: apiKey.trim() });
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
      {err && (
        <div style={{ padding: "var(--space-3) var(--space-4)", background: "var(--danger-dim)", border: "1px solid var(--danger)", borderRadius: "var(--radius-md)", fontSize: "0.875rem", color: "var(--danger)" }}>
          {err}
        </div>
      )}
      {!isEdit && (
        <div className="form-group">
          <label className="form-label">Provider</label>
          <select className="input" value={selectedPreset} onChange={(e) => handlePresetChange(e.target.value)}>
            <option value="">Select a provider…</option>
            {GATEWAY_PRESETS.map((preset) => (
              <option key={preset.id} value={preset.id}>{preset.name}</option>
            ))}
            <option value={CUSTOM_PRESET_ID}>Other / Custom</option>
          </select>
        </div>
      )}
      <div className="form-row">
        <div className="form-group">
          <label className="form-label">Name</label>
          <input className="input" placeholder="e.g. OpenAI Direct" value={name} onChange={e => setName(e.target.value)} readOnly={isPresetSelected} style={isPresetSelected ? { opacity: 0.7, cursor: "default" } : undefined} />
        </div>
        <div className="form-group">
          <label className="form-label">Base URL</label>
          <input className="input input--mono" placeholder="https://api.openai.com/v1" value={baseUrl} onChange={e => setBaseUrl(e.target.value)} readOnly={isPresetSelected} style={isPresetSelected ? { opacity: 0.7, cursor: "default" } : undefined} />
        </div>
      </div>
      <div className="form-group">
        <label className="form-label">API Key</label>
        <input
          className="input input--mono"
          type="password"
          placeholder={isEdit ? "Leave blank to keep existing key" : "sk-..."}
          value={apiKey}
          onChange={e => setApiKey(e.target.value)}
          autoComplete="new-password"
        />
        <span className="form-hint">Stored encrypted. Used only for requests routed to this gateway.</span>
      </div>
      <div style={{ display: "flex", gap: "var(--space-3)" }}>
        <button type="submit" className="btn btn--primary btn--sm" disabled={saving}>
          {saving ? "Saving…" : isEdit ? "Save changes" : "Add gateway"}
        </button>
        <button type="button" className="btn btn--secondary btn--sm" onClick={onCancel}>Cancel</button>
      </div>
    </form>
  );
}

// ─── Model form ───────────────────────────────────────────────────────────────

interface ModelFormProps {
  initial?: GatewayModel;
  saving?: boolean;
  submitLabel: string;
  onSave: (m: GatewayModel) => Promise<void>;
  onCancel: () => void;
}

function ModelForm({ initial, saving, submitLabel, onSave, onCancel }: ModelFormProps) {
  const [id, setId] = useState(initial?.id ?? "");
  const [name, setName] = useState(initial?.name ?? "");
  const [reasoningPreset, setReasoningPreset] = useState<ReasoningLevel>(initial?.reasoningPreset ?? "none");
  const [whenToUse, setWhenToUse] = useState(initial?.whenToUse ?? "");
  const [err, setErr] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!id.trim()) return setErr("Model ID is required.");
    if (!name.trim()) return setErr("Display name is required.");
    setErr("");
    const nextModel: GatewayModel = {
      id: id.trim(),
      name: name.trim(),
      description: initial?.description,
      modality: initial?.modality,
      reasoningPreset,
      thinking: reasoningPreset,
      whenToUse: whenToUse.trim() || undefined,
    };
    await onSave(nextModel);
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)", padding: "var(--space-4)", background: "var(--bg-elevated)", borderRadius: "var(--radius-md)", border: "1px solid var(--border-default)" }}>
      {err && (
        <div style={{ fontSize: "0.8125rem", color: "var(--danger)" }}>{err}</div>
      )}
      <div className="form-row">
        <div className="form-group">
          <label className="form-label">Model ID</label>
          <input
            className="input input--mono btn--sm"
            style={{ padding: "var(--space-2) var(--space-3)", fontSize: "0.8125rem" }}
            placeholder="e.g. openai/gpt-5.2:high"
            value={id}
            onChange={e => setId(e.target.value)}
          />
        </div>
        <div className="form-group">
          <label className="form-label">Display name</label>
          <input
            className="input btn--sm"
            style={{ padding: "var(--space-2) var(--space-3)", fontSize: "0.8125rem" }}
            placeholder="e.g. GPT-5.2 High"
            value={name}
            onChange={e => setName(e.target.value)}
          />
        </div>
      </div>
      <div className="form-row">
        <div className="form-group">
          <label className="form-label">Reasoning preset</label>
          <select
            className="input btn--sm"
            style={{ padding: "var(--space-2) var(--space-3)", fontSize: "0.8125rem" }}
            value={reasoningPreset}
            onChange={e => setReasoningPreset(e.target.value as ReasoningLevel)}
          >
            {REASONING_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </div>
      </div>
      <div className="form-group">
        <label className="form-label">When to use (routing hint)</label>
        <input
          className="input btn--sm"
          style={{ padding: "var(--space-2) var(--space-3)", fontSize: "0.8125rem" }}
          placeholder="e.g. Complex planning, architecture, and long-form analysis"
          value={whenToUse}
          onChange={e => setWhenToUse(e.target.value)}
        />
      </div>
      <div style={{ display: "flex", gap: "var(--space-2)" }}>
        <button type="submit" className="btn btn--primary btn--sm" disabled={saving}>
          {saving ? "Saving…" : submitLabel}
        </button>
        <button type="button" className="btn btn--secondary btn--sm" onClick={onCancel}>Cancel</button>
      </div>
    </form>
  );
}

// ─── Fetch-models picker ──────────────────────────────────────────────────────

interface FetchedModel { id: string; name: string }

interface FetchPickerProps {
  models: FetchedModel[];
  existing: GatewayModel[];
  onImport: (selected: FetchedModel[]) => Promise<void>;
  onClose: () => void;
}

function FetchPicker({ models, existing, onImport, onClose }: FetchPickerProps) {
  const existingIds = new Set(existing.map((model) => model.id));
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);

  function toggle(id: string) {
    setSelected((current) => {
      const next = new Set(current);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  async function handleImport() {
    const toImport = models.filter((model) => selected.has(model.id));
    setSaving(true);
    await onImport(toImport);
    setSaving(false);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)", padding: "var(--space-4)", background: "var(--bg-elevated)", borderRadius: "var(--radius-md)", border: "1px solid var(--border-default)" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{ fontSize: "0.875rem", fontWeight: 600, color: "var(--text-primary)" }}>
          {models.length} models found
        </span>
        <button className="btn btn--ghost btn--sm" onClick={onClose}>Close</button>
      </div>
      <div style={{ maxHeight: 280, overflowY: "auto", display: "flex", flexDirection: "column", gap: "var(--space-1)" }}>
        {models.map((model) => {
          const alreadyAdded = existingIds.has(model.id);
          return (
            <label
              key={model.id}
              style={{ display: "flex", alignItems: "center", gap: "var(--space-3)", padding: "var(--space-2) var(--space-3)", borderRadius: "var(--radius-sm)", background: selected.has(model.id) ? "var(--accent-dim)" : "transparent", cursor: alreadyAdded ? "default" : "pointer", opacity: alreadyAdded ? 0.5 : 1 }}
            >
              <input
                type="checkbox"
                checked={alreadyAdded || selected.has(model.id)}
                disabled={alreadyAdded}
                onChange={() => !alreadyAdded && toggle(model.id)}
                style={{ accentColor: "var(--accent)", flexShrink: 0 }}
              />
              <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.8125rem", color: "var(--text-primary)" }}>{model.id}</span>
              {alreadyAdded && <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>already added</span>}
            </label>
          );
        })}
      </div>
      <div style={{ display: "flex", gap: "var(--space-2)" }}>
        <button className="btn btn--primary btn--sm" disabled={selected.size === 0 || saving} onClick={handleImport}>
          {saving ? "Importing…" : `Import ${selected.size > 0 ? selected.size : ""} selected`}
        </button>
        <button className="btn btn--secondary btn--sm" onClick={() => setSelected(new Set(models.filter((model) => !existingIds.has(model.id)).map((model) => model.id)))}>
          Select all new
        </button>
      </div>
    </div>
  );
}

// ─── Routing preset picker ───────────────────────────────────────────────────

function IconZap({ className }: { className?: string }) {
  return (
    <svg className={className} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
    </svg>
  );
}

interface RoutingPresetPickerProps {
  gatewayBaseUrl: string;
  existingModelCount: number;
  existingProfileIds: string[];
  applying: boolean;
  onApply: (preset: RoutingPreset) => void;
}

function RoutingPresetPicker({ gatewayBaseUrl, existingModelCount, existingProfileIds, applying, onApply }: RoutingPresetPickerProps) {
  const providerPresetId = getGatewayPresetId(gatewayBaseUrl);
  const matchingPresets = ROUTING_PRESETS.filter((p) => p.gatewayPresetId === providerPresetId);

  if (matchingPresets.length === 0) return null;

  function handleClick(preset: RoutingPreset) {
    if (applying || existingProfileIds.includes(preset.id)) return;
    if (
      existingModelCount > 0 &&
      !window.confirm(
        `This will replace all ${existingModelCount} existing model(s) and add a "${preset.name}" routing profile.\n\nContinue?`
      )
    ) {
      return;
    }
    onApply(preset);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
        <IconZap />
        <span style={{ fontSize: "0.8125rem", fontWeight: 600, color: "var(--text-secondary)" }}>Quick setup</span>
      </div>
      <div style={{ display: "flex", gap: "var(--space-2)", flexWrap: "wrap" }}>
        {matchingPresets.map((preset) => {
          const isAdded = existingProfileIds.includes(preset.id);
          return (
            <button
              key={preset.id}
              type="button"
              className="btn btn--ghost btn--sm"
              disabled={applying || isAdded}
              onClick={() => handleClick(preset)}
              title={isAdded ? "Already added as a routing profile" : preset.description}
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "flex-start",
                gap: "var(--space-1)",
                padding: "var(--space-3) var(--space-4)",
                background: isAdded ? "var(--accent-dim)" : "var(--bg-elevated)",
                border: `1px solid ${isAdded ? "var(--accent)" : "var(--border-subtle)"}`,
                borderRadius: "var(--radius-md)",
                cursor: isAdded ? "default" : applying ? "wait" : "pointer",
                textAlign: "left",
                minWidth: 160,
                opacity: isAdded ? 0.8 : 1,
              }}
            >
              <span style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", fontSize: "0.8125rem", fontWeight: 600, color: isAdded ? "var(--accent)" : "var(--text-primary)" }}>
                {isAdded && (
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                )}
                {preset.name}
              </span>
              <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
                {isAdded ? "Profile added" : `${preset.models.length} models`}
              </span>
            </button>
          );
        })}
      </div>
      <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
        Adds models to this gateway and creates a routing profile
      </span>
    </div>
  );
}

// ─── Gateway card ─────────────────────────────────────────────────────────────

interface GatewayCardProps {
  gateway: GatewayInfo;
  onRefresh: () => void;
  onStatus?: (msg: string) => void;
  onError?: (msg?: string) => void;
  onApplyRoutingPreset?: (preset: RoutingPreset) => Promise<boolean>;
  existingProfileIds?: string[];
}

function GatewayCard({ gateway, onRefresh, onStatus, onError, onApplyRoutingPreset, existingProfileIds = [] }: GatewayCardProps) {
  const [editingGateway, setEditingGateway] = useState(false);
  const [deletingGateway, setDeletingGateway] = useState(false);
  const [savingGateway, setSavingGateway] = useState(false);

  const [addingModel, setAddingModel] = useState(false);
  const [addModelSeed, setAddModelSeed] = useState<GatewayModel | undefined>();
  const [editingModelId, setEditingModelId] = useState<string | null>(null);
  const [removingModelId, setRemovingModelId] = useState<string | null>(null);
  const [savingModel, setSavingModel] = useState(false);

  const [fetchedModels, setFetchedModels] = useState<FetchedModel[] | null>(null);
  const [fetching, setFetching] = useState(false);
  const [applyingPreset, setApplyingPreset] = useState(false);

  async function applyPreset(preset: RoutingPreset) {
    setApplyingPreset(true);
    try {
      const models = preset.models.map((m) => ({ ...m }));
      if (!(await saveModels(models))) return;

      if (onApplyRoutingPreset) {
        const ok = await onApplyRoutingPreset(preset);
        if (!ok) {
          onError?.("Models were updated but the routing profile failed to save.");
          return;
        }
      }
      onStatus?.(`Applied "${preset.name}" preset.`);
    } finally {
      setApplyingPreset(false);
    }
  }

  async function saveGateway(data: { name: string; baseUrl: string; apiKey: string }) {
    setSavingGateway(true);
    try {
      const body: Record<string, string> = { name: data.name, baseUrl: data.baseUrl };
      if (data.apiKey) body.apiKey = data.apiKey;
      const res = await fetch(`/api/v1/user/gateways/${gateway.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({ error: "Unknown error" })) as { error?: string };
        onError?.(e.error ?? "Failed to save gateway.");
        return;
      }
      onStatus?.("Gateway saved.");
      setEditingGateway(false);
      onRefresh();
    } finally {
      setSavingGateway(false);
    }
  }

  async function deleteGateway() {
    if (!deletingGateway) {
      setDeletingGateway(true);
      return;
    }
    const res = await fetch(`/api/v1/user/gateways/${gateway.id}`, { method: "DELETE" });
    if (!res.ok && res.status !== 204) {
      onError?.("Failed to delete gateway.");
      setDeletingGateway(false);
      return;
    }
    onStatus?.("Gateway deleted.");
    onRefresh();
  }

  async function saveModels(models: GatewayModel[]) {
    const normalizedModels = models.map((model) => {
      const reasoningPreset = model.reasoningPreset ?? model.thinking;
      return {
        id: model.id,
        name: model.name,
        whenToUse: model.whenToUse,
        description: model.description,
        modality: model.modality,
        reasoningPreset,
        thinking: reasoningPreset ?? model.thinking,
      };
    });

    if (hasDuplicateModelIds(normalizedModels)) {
      onError?.("Model IDs must be unique within a gateway.");
      return false;
    }

    const res = await fetch(`/api/v1/user/gateways/${gateway.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ models: normalizedModels }),
    });
    if (!res.ok) {
      const e = await res.json().catch(() => ({ error: "Unknown error" })) as { error?: string };
      onError?.(e.error ?? "Failed to save models.");
      return false;
    }
    onRefresh();
    return true;
  }

  async function addModel(model: GatewayModel) {
    setSavingModel(true);
    try {
      if (gateway.models.some((entry) => entry.id === model.id)) {
        onError?.(`Model "${model.id}" already exists in this gateway.`);
        return;
      }

      const models = [...gateway.models, model];
      if (await saveModels(models)) {
        setAddingModel(false);
        setAddModelSeed(undefined);
        onStatus?.("Model added.");
      }
    } finally {
      setSavingModel(false);
    }
  }

  async function editModel(originalId: string, model: GatewayModel) {
    setSavingModel(true);
    try {
      const models = gateway.models.map((entry) => entry.id === originalId ? model : entry);
      if (await saveModels(models)) {
        setEditingModelId(null);
        onStatus?.("Model updated.");
      }
    } finally {
      setSavingModel(false);
    }
  }

  async function removeModel(id: string) {
    if (removingModelId !== id) {
      setRemovingModelId(id);
      return;
    }
    const models = gateway.models.filter((model) => model.id !== id);
    if (await saveModels(models)) {
      setRemovingModelId(null);
      onStatus?.("Model removed.");
    } else {
      setRemovingModelId(null);
    }
  }

  async function fetchModels() {
    setFetching(true);
    try {
      const res = await fetch(`/api/v1/user/gateways/${gateway.id}/fetch-models`);
      const data = await res.json() as { models?: FetchedModel[]; error?: string };
      if (!res.ok || !data.models) {
        onError?.(data.error ?? "Failed to fetch models from gateway.");
        return;
      }
      setFetchedModels(data.models);
    } finally {
      setFetching(false);
    }
  }

  async function importModels(selected: FetchedModel[]) {
    const existing = new Set(gateway.models.map((model) => model.id));
    const newModels = selected
      .filter((model) => !existing.has(model.id))
      .map((model) => ({
        id: model.id,
        name: model.name,
        reasoningPreset: "none" as const,
      }));
    const models = [...gateway.models, ...newModels];
    if (await saveModels(models)) {
      setFetchedModels(null);
      onStatus?.(`Imported ${newModels.length} model${newModels.length !== 1 ? "s" : ""}.`);
    }
  }

  function beginAddModel() {
    setAddingModel(true);
    setAddModelSeed(undefined);
    setEditingModelId(null);
    setRemovingModelId(null);
  }

  function cloneModel(model: GatewayModel) {
    setAddModelSeed({
      ...model,
      id: nextVariantId(model.id),
      name: `${model.name} Variant`,
    });
    setAddingModel(true);
    setEditingModelId(null);
    setRemovingModelId(null);
  }

  return (
    <div className="card" style={{ overflow: "visible" }}>
      <div className="card-header">
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-1)", minWidth: 0 }}>
          <h3 style={{ fontSize: "1rem", fontWeight: 600, color: "var(--text-primary)" }}>{gateway.name}</h3>
          <div style={{ display: "flex", alignItems: "center", gap: "var(--space-3)", flexWrap: "wrap" }}>
            <span style={{ display: "flex", alignItems: "center", gap: "var(--space-1)", fontFamily: "var(--font-mono)", fontSize: "0.8125rem", color: "var(--text-secondary)" }}>
              <IconGlobe /> {gateway.baseUrl}
            </span>
            <span className="badge badge--success" style={{ fontSize: "0.7rem" }}>
              <IconKey /> Key configured
            </span>
          </div>
        </div>
        <div style={{ display: "flex", gap: "var(--space-2)", flexShrink: 0 }}>
          <button className="btn btn--secondary btn--sm" onClick={() => { setEditingGateway((value) => !value); setDeletingGateway(false); }}>
            <IconEdit /> Edit
          </button>
          <button className={`btn btn--sm ${deletingGateway ? "btn--danger" : "btn--ghost"}`} onClick={deleteGateway}>
            <IconTrash /> {deletingGateway ? "Confirm?" : "Delete"}
          </button>
        </div>
      </div>

      {editingGateway && (
        <div className="card-body" style={{ borderBottom: "1px solid var(--border-subtle)" }}>
          <GatewayForm
            initial={{ name: gateway.name, baseUrl: gateway.baseUrl }}
            isEdit
            saving={savingGateway}
            onSave={saveGateway}
            onCancel={() => { setEditingGateway(false); setDeletingGateway(false); }}
          />
        </div>
      )}

      <div style={{ padding: "var(--space-5) var(--space-6)", display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span style={{ fontSize: "0.875rem", fontWeight: 600, color: "var(--text-secondary)" }}>
            Models
            {gateway.models.length > 0 && (
              <span className="badge badge--info" style={{ marginLeft: "var(--space-2)", fontSize: "0.7rem" }}>
                {gateway.models.length}
              </span>
            )}
          </span>
          <div style={{ display: "flex", gap: "var(--space-2)" }}>
            <button className="btn btn--ghost btn--sm" onClick={fetchModels} disabled={fetching}>
              <IconDownload /> {fetching ? "Fetching…" : "Fetch from gateway"}
            </button>
            <button className="btn btn--secondary btn--sm" onClick={beginAddModel}>
              <IconPlus /> Add model
            </button>
          </div>
        </div>

        <RoutingPresetPicker
          gatewayBaseUrl={gateway.baseUrl}
          existingModelCount={gateway.models.length}
          existingProfileIds={existingProfileIds}
          applying={applyingPreset}
          onApply={applyPreset}
        />

        {fetchedModels && (
          <FetchPicker
            models={fetchedModels}
            existing={gateway.models}
            onImport={importModels}
            onClose={() => setFetchedModels(null)}
          />
        )}

        {addingModel && (
          <ModelForm
            initial={addModelSeed}
            saving={savingModel}
            submitLabel="Add model"
            onSave={addModel}
            onCancel={() => { setAddingModel(false); setAddModelSeed(undefined); }}
          />
        )}

        {gateway.models.length === 0 && !addingModel ? (
          <div style={{ padding: "var(--space-6)", textAlign: "center", color: "var(--text-muted)", fontSize: "0.875rem", background: "var(--bg-elevated)", borderRadius: "var(--radius-md)", border: "1px dashed var(--border-subtle)" }}>
            No models yet. Add models manually or fetch from the gateway.
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
            {gateway.models.map((model) => (
              <div key={model.id} style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
                {editingModelId === model.id ? (
                  <ModelForm
                    initial={model}
                    saving={savingModel}
                    submitLabel="Save"
                    onSave={(nextModel) => editModel(model.id, nextModel)}
                    onCancel={() => setEditingModelId(null)}
                  />
                ) : (
                  <div style={{ display: "flex", alignItems: "center", gap: "var(--space-4)", padding: "var(--space-3) var(--space-4)", background: "var(--bg-elevated)", borderRadius: "var(--radius-md)", border: "1px solid var(--border-subtle)" }}>
                    <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
                      <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.8125rem", color: "var(--text-primary)", wordBreak: "break-all" }}>
                        {model.id}
                      </span>
                      <div style={{ display: "flex", gap: "var(--space-2)", flexWrap: "wrap" }}>
                        <span className="badge badge--info" style={{ fontSize: "0.7rem" }}>
                          reasoning {reasoningLabel(model.reasoningPreset ?? "none")}
                        </span>
                      </div>
                      <div style={{ display: "flex", gap: "var(--space-3)", flexWrap: "wrap" }}>
                        <span style={{ fontSize: "0.8125rem", color: "var(--text-secondary)" }}>{model.name}</span>
                        {model.whenToUse && (
                          <span style={{ fontSize: "0.8125rem", color: "var(--text-muted)" }}>{model.whenToUse}</span>
                        )}
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: "var(--space-1)", flexShrink: 0 }}>
                      <button className="btn btn--ghost btn--sm" title="Clone model" onClick={() => cloneModel(model)}>
                        Clone
                      </button>
                      <button className="btn btn--ghost btn--sm btn--icon" title="Edit model" onClick={() => { setEditingModelId(model.id); setRemovingModelId(null); }}>
                        <IconEdit />
                      </button>
                      <button className={`btn btn--sm btn--icon ${removingModelId === model.id ? "btn--danger" : "btn--ghost"}`} title={removingModelId === model.id ? "Click again to confirm removal" : "Remove model"} onClick={() => removeModel(model.id)}>
                        <IconTrash />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main panel ───────────────────────────────────────────────────────────────

export function GatewayPanel({ onStatus, onError, onApplyRoutingPreset, existingProfileIds = [] }: Props) {
  const [gateways, setGateways] = useState<GatewayInfo[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [savingNew, setSavingNew] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/v1/user/gateways", { cache: "no-store" });
      const data = await res.json() as { gateways?: GatewayInfo[]; error?: string };
      if (!res.ok) {
        onError?.(data.error ?? "Failed to load gateways.");
        return;
      }
      setGateways(data.gateways ?? []);
    } catch {
      onError?.("Network error loading gateways.");
    } finally {
      setLoading(false);
    }
  }, [onError]);

  useEffect(() => {
    void load();
  }, [load]);

  async function createGateway(data: { name: string; baseUrl: string; apiKey: string }) {
    setSavingNew(true);
    try {
      const res = await fetch("/api/v1/user/gateways", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      const body = await res.json() as { error?: string };
      if (!res.ok) {
        onError?.(body.error ?? "Failed to create gateway.");
        return;
      }
      onStatus?.("Gateway created.");
      setShowAddForm(false);
      await load();
    } finally {
      setSavingNew(false);
    }
  }

  if (loading) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-8)" }}>
        <div style={{ color: "var(--text-muted)", fontSize: "0.875rem" }}>
          Loading gateways…
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-8)" }}>
      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <button className="btn btn--sm" style={{ flexShrink: 0 }} onClick={() => setShowAddForm((value) => !value)}>
          <IconPlus /> Add gateway
        </button>
      </div>

      {showAddForm && (
        <div className="card">
          <div className="card-header">
            <h3>New gateway</h3>
          </div>
          <div className="card-body">
            <GatewayForm
              saving={savingNew}
              onSave={createGateway}
              onCancel={() => setShowAddForm(false)}
            />
          </div>
        </div>
      )}

      {gateways?.length === 0 && !showAddForm && (
        <div style={{ padding: "var(--space-12)", textAlign: "center", background: "var(--bg-surface)", borderRadius: "var(--radius-lg)", border: "1px dashed var(--border-default)" }}>
          <div style={{ fontSize: "2rem", marginBottom: "var(--space-4)" }}>🔌</div>
          <p style={{ fontWeight: 600, color: "var(--text-primary)", marginBottom: "var(--space-2)" }}>No gateways configured</p>
          <p style={{ fontSize: "0.875rem", color: "var(--text-muted)", marginBottom: "var(--space-6)", maxWidth: 360, margin: "0 auto var(--space-6)" }}>
            Add a gateway to connect an upstream API provider and assign models to it.
          </p>
          <button className="btn btn--primary" onClick={() => setShowAddForm(true)}>
            <IconPlus /> Add your first gateway
          </button>
        </div>
      )}

      {gateways?.map((gateway) => (
        <GatewayCard
          key={gateway.id}
          gateway={gateway}
          onRefresh={load}
          onStatus={onStatus}
          onError={onError}
          onApplyRoutingPreset={onApplyRoutingPreset}
          existingProfileIds={existingProfileIds}
        />
      ))}
    </div>
  );
}
