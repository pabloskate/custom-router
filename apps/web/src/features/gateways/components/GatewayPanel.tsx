"use client";

import { useEffect, useState } from "react";

import { CUSTOM_PRESET_ID, GATEWAY_PRESETS } from "@/src/lib/gateway-presets";
import type { GatewayInfo, GatewayModel } from "@/src/features/gateways/contracts";
import {
  buildManualGatewayModel,
  createManualGatewayModelDraft,
  mergeFetchedGatewayModels,
  type ManualGatewayModelDraft,
} from "@/src/features/gateways/gateway-models";
import {
  GATEWAY_RECOMMENDATIONS,
  getDirectProviderPresets,
  getGatewayFormHint,
  getRecommendedGatewayPresets,
} from "@/src/features/gateways/recommendations";
import {
  REASONING_PRESET_FIELD_HINT,
  REASONING_PRESET_SELECT_OPTIONS,
} from "@/src/lib/reasoning-options";

export type { GatewayInfo, GatewayModel } from "@/src/features/gateways/contracts";

const MODELS_PREVIEW_LIMIT = 10;
const RECOMMENDED_GATEWAY_PRESETS = getRecommendedGatewayPresets();
const DIRECT_PROVIDER_PRESETS = getDirectProviderPresets();

interface Props {
  onStatus?: (msg: string) => void;
  onError?: (msg?: string) => void;
}

function IconPlus({ className }: { className?: string }) {
  return (
    <svg className={className} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}

function IconDownload({ className }: { className?: string }) {
  return (
    <svg className={className} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  );
}

function IconEdit({ className }: { className?: string }) {
  return (
    <svg className={className} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
    </svg>
  );
}

function IconTrash({ className }: { className?: string }) {
  return (
    <svg className={className} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    </svg>
  );
}

interface GatewayFormProps {
  initial?: { name: string; baseUrl: string };
  /** When set (create flow only), pre-selects this preset and fills name/base URL. */
  initialPresetId?: string;
  isEdit?: boolean;
  saving?: boolean;
  onSave: (data: { name: string; baseUrl: string; apiKey: string }) => Promise<void>;
  onCancel: () => void;
}

function GatewayForm({ initial, initialPresetId, isEdit, saving, onSave, onCancel }: GatewayFormProps) {
  const [name, setName] = useState(initial?.name ?? "");
  const [baseUrl, setBaseUrl] = useState(initial?.baseUrl ?? "");
  const [apiKey, setApiKey] = useState("");
  const [selectedPreset, setSelectedPreset] = useState("");
  const [error, setError] = useState("");

  const isPresetSelected = selectedPreset !== "" && selectedPreset !== CUSTOM_PRESET_ID;
  const formHint = getGatewayFormHint(selectedPreset || undefined);

  useEffect(() => {
    if (isEdit || initialPresetId === undefined) {
      return;
    }
    setSelectedPreset(initialPresetId);
    if (initialPresetId === "" || initialPresetId === CUSTOM_PRESET_ID) {
      setName("");
      setBaseUrl("");
      return;
    }
    const preset = GATEWAY_PRESETS.find((entry) => entry.id === initialPresetId);
    if (preset) {
      setName(preset.name);
      setBaseUrl(preset.baseUrl);
    }
  }, [isEdit, initialPresetId]);

  function handlePresetChange(presetId: string) {
    setSelectedPreset(presetId);
    if (presetId === "" || presetId === CUSTOM_PRESET_ID) {
      setName("");
      setBaseUrl("");
      return;
    }

    const preset = GATEWAY_PRESETS.find((entry) => entry.id === presetId);
    if (preset) {
      setName(preset.name);
      setBaseUrl(preset.baseUrl);
    }
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!name.trim()) return setError("Name is required.");
    if (!baseUrl.trim()) return setError("Base URL is required.");
    if (!isEdit && !apiKey.trim()) return setError("API key is required.");
    setError("");
    await onSave({ name: name.trim(), baseUrl: baseUrl.trim(), apiKey: apiKey.trim() });
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
      {error && (
        <div style={{ padding: "var(--space-3) var(--space-4)", background: "var(--danger-dim)", border: "1px solid var(--danger)", borderRadius: "var(--radius-md)", color: "var(--danger)" }}>
          {error}
        </div>
      )}
      {!isEdit && (
        <div className="form-group">
          <label className="form-label">Gateway</label>
          <select className="input" value={selectedPreset} onChange={(event) => handlePresetChange(event.target.value)}>
            <option value="">Choose a gateway…</option>
            <optgroup label="Recommended">
              {RECOMMENDED_GATEWAY_PRESETS.map((preset) => (
                <option key={preset.id} value={preset.id}>{preset.name}</option>
              ))}
              <option value={CUSTOM_PRESET_ID}>Other / Custom</option>
            </optgroup>
            <optgroup label="Individual providers">
              {DIRECT_PROVIDER_PRESETS.map((preset) => (
                <option key={preset.id} value={preset.id}>{preset.name}</option>
              ))}
            </optgroup>
          </select>
          <span className="form-hint">{formHint}</span>
        </div>
      )}
      <div className="form-row">
        <div className="form-group">
          <label className="form-label">Name</label>
          <input className="input" value={name} onChange={(event) => setName(event.target.value)} readOnly={isPresetSelected} />
        </div>
        <div className="form-group">
          <label className="form-label">Base URL</label>
          <input className="input input--mono" value={baseUrl} onChange={(event) => setBaseUrl(event.target.value)} readOnly={isPresetSelected} />
        </div>
      </div>
      <div className="form-group">
        <label className="form-label">API Key</label>
        <input
          className="input input--mono"
          type="password"
          value={apiKey}
          onChange={(event) => setApiKey(event.target.value)}
          placeholder={isEdit ? "Leave blank to keep existing key" : "sk-..."}
          autoComplete="new-password"
        />
        <span className="form-hint">Stored encrypted. Used only for requests routed to this gateway. Billing stays with this gateway, not with CustomRouter.</span>
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

async function saveGatewayModels(gatewayId: string, models: GatewayModel[]): Promise<{
  error?: string;
  ok: boolean;
}> {
  const response = await fetch(`/api/v1/user/gateways/${gatewayId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ models }),
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => ({ error: "Failed to save gateway models." })) as { error?: string };
    return {
      ok: false,
      error: payload.error ?? "Failed to save gateway models.",
    };
  }

  return { ok: true };
}

async function syncGatewayModelsFromFetch(gateway: GatewayInfo): Promise<{
  error?: string;
  models: GatewayModel[];
  ok: boolean;
}> {
  const response = await fetch(`/api/v1/user/gateways/${gateway.id}/fetch-models`);
  const payload = await response.json().catch(() => ({ error: "Failed to fetch gateway models." })) as {
    models?: Array<Pick<GatewayModel, "id" | "name">>;
    error?: string;
  };

  if (!response.ok) {
    return {
      ok: false,
      models: gateway.models,
      error: payload.error ?? "Failed to fetch gateway models.",
    };
  }

  const models = mergeFetchedGatewayModels(gateway.models, payload.models ?? []);
  const saveResult = await saveGatewayModels(gateway.id, models);
  if (!saveResult.ok) {
    return {
      ok: false,
      models: gateway.models,
      error: saveResult.error ?? "Failed to save synced models.",
    };
  }

  return {
    ok: true,
    models,
  };
}

interface ManualGatewayModelFormProps {
  gateway: GatewayInfo;
  onCancel: () => void;
  onError?: (message?: string) => void;
  onRefresh: () => Promise<void>;
  onStatus?: (message: string) => void;
}

function ManualGatewayModelForm({
  gateway,
  onCancel,
  onError,
  onRefresh,
  onStatus,
}: ManualGatewayModelFormProps) {
  const [draft, setDraft] = useState<ManualGatewayModelDraft>(createManualGatewayModelDraft);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const modelId = draft.modelId.trim();
    if (!modelId) {
      setError("Model ID is required.");
      return;
    }

    if (gateway.models.some((model) => model.id === modelId)) {
      setError(`Model "${modelId}" already exists in this gateway.`);
      return;
    }

    setError("");
    setSaving(true);
    try {
      const nextModels = [...gateway.models, buildManualGatewayModel(draft)].sort((left, right) => left.id.localeCompare(right.id));
      const result = await saveGatewayModels(gateway.id, nextModels);
      if (!result.ok) {
        const message = result.error ?? "Failed to save gateway model.";
        setError(message);
        onError?.(message);
        return;
      }

      onStatus?.(`Added ${modelId} to ${gateway.name}. You can now use it in Routing Profiles.`);
      setDraft(createManualGatewayModelDraft());
      onCancel();
      await onRefresh();
    } finally {
      setSaving(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "var(--space-4)",
        padding: "var(--space-4)",
        border: "1px solid var(--border-subtle)",
        borderRadius: "var(--radius-md)",
        background: "var(--bg-surface)",
      }}
    >
      <div>
        <div style={{ fontWeight: 600, marginBottom: "var(--space-1)" }}>Add model manually</div>
        <p style={{ fontSize: "0.875rem", color: "var(--text-muted)", margin: 0 }}>
          Use this when the gateway does not implement <code>/models</code>. Once saved, the model will appear in Routing Profiles for router, fallback, and profile model selection.
        </p>
      </div>

      {error ? (
        <div style={{ padding: "var(--space-3) var(--space-4)", background: "var(--danger-dim)", border: "1px solid var(--danger)", borderRadius: "var(--radius-md)", color: "var(--danger)" }}>
          {error}
        </div>
      ) : null}

      <div className="form-row">
        <label className="form-group">
          <span className="form-label">Model ID</span>
          <input
            className="input input--mono"
            value={draft.modelId}
            onChange={(event) => setDraft((current) => ({ ...current, modelId: event.target.value }))}
            placeholder="provider/model-id"
          />
        </label>
        <label className="form-group">
          <span className="form-label">Display name</span>
          <input
            className="input"
            value={draft.name}
            onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))}
            placeholder="Defaults to model ID"
          />
        </label>
      </div>

      <div className="form-row">
        <label className="form-group">
          <span className="form-label">Modality</span>
          <input
            className="input input--mono"
            value={draft.modality}
            onChange={(event) => setDraft((current) => ({ ...current, modality: event.target.value }))}
          />
        </label>
        <label className="form-group">
          <span className="form-label">Reasoning preset</span>
          <select
            className="input"
            value={draft.reasoningPreset}
            onChange={(event) => setDraft((current) => ({
              ...current,
              reasoningPreset: event.target.value as GatewayModel["reasoningPreset"],
            }))}
          >
            {REASONING_PRESET_SELECT_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
          <span className="form-hint">{REASONING_PRESET_FIELD_HINT}</span>
        </label>
      </div>

      <label className="form-group">
        <span className="form-label">When to use</span>
        <input
          className="input"
          value={draft.whenToUse}
          onChange={(event) => setDraft((current) => ({ ...current, whenToUse: event.target.value }))}
          placeholder="Optional routing hint"
        />
      </label>

      <label className="form-group">
        <span className="form-label">Description</span>
        <textarea
          className="textarea"
          rows={3}
          value={draft.description}
          onChange={(event) => setDraft((current) => ({ ...current, description: event.target.value }))}
        />
      </label>

      <div style={{ display: "flex", gap: "var(--space-3)" }}>
        <button className="btn btn--primary btn--sm" type="submit" disabled={saving}>
          <IconPlus />
          {saving ? "Saving…" : "Save model"}
        </button>
        <button className="btn btn--secondary btn--sm" type="button" onClick={onCancel} disabled={saving}>
          Cancel
        </button>
      </div>
    </form>
  );
}

function GatewayModelsPreview({
  models,
  onAddManual,
  onSync,
  syncing,
  manualModelOpen,
  onToggleManual,
}: {
  models: GatewayModel[];
  onAddManual?: () => void;
  onSync?: () => void;
  syncing?: boolean;
  manualModelOpen?: boolean;
  onToggleManual?: () => void;
}) {
  const [showAllModels, setShowAllModels] = useState(false);
  const [query, setQuery] = useState("");

  if (models.length === 0) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
        <p style={{ fontSize: "0.875rem", color: "var(--text-muted)", margin: 0 }}>
          No models yet. Sync from the gateway if it exposes <code>/models</code>, or add the first model manually so Routing Profiles can use it.
        </p>
        {onSync || onToggleManual ? (
          <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-2)", alignItems: "center" }}>
            {onSync ? (
              <button className="btn btn--secondary btn--sm" type="button" onClick={() => void onSync()} disabled={syncing}>
                <IconDownload />
                {syncing ? "Syncing…" : "Sync models"}
              </button>
            ) : null}
            {onToggleManual ? (
              <button className="btn btn--secondary btn--sm" type="button" onClick={onToggleManual}>
                <IconPlus />
                {manualModelOpen ? "Close model form" : "Add model manually"}
              </button>
            ) : onAddManual ? (
              <button className="btn btn--secondary btn--sm" type="button" onClick={onAddManual}>
                <IconPlus />
                Add model manually
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
    );
  }

  const normalizedQuery = query.trim().toLowerCase();
  const filteredModels = normalizedQuery
    ? models.filter((model) => model.id.toLowerCase().includes(normalizedQuery) || model.name?.toLowerCase().includes(normalizedQuery))
    : models;
  const previewModels = models.slice(0, MODELS_PREVIEW_LIMIT);
  const hiddenCount = Math.max(models.length - previewModels.length, 0);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: "var(--space-3)",
          flexWrap: "wrap",
        }}
      >
        <p
          style={{
            fontSize: "0.875rem",
            color: "var(--text-muted)",
            margin: 0,
            flex: "1 1 12rem",
            minWidth: 0,
          }}
        >
          These models power Routing Profiles. Choose bindings there; keep this list lean here.
        </p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-2)", alignItems: "center", justifyContent: "flex-end" }}>
          {onSync ? (
            <button className="btn btn--secondary btn--sm" type="button" onClick={() => void onSync()} disabled={syncing}>
              <IconDownload />
              {syncing ? "Syncing…" : "Sync models"}
            </button>
          ) : null}
          {onToggleManual ? (
            <button className="btn btn--secondary btn--sm" type="button" onClick={onToggleManual}>
              <IconPlus />
              {manualModelOpen ? "Close model form" : "Add model manually"}
            </button>
          ) : null}
          <button className="btn btn--ghost btn--sm" type="button" onClick={() => setShowAllModels((current) => !current)}>
            {showAllModels ? "Hide models" : `View models (${models.length})`}
          </button>
        </div>
      </div>

      {!showAllModels ? (
        <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-2)" }}>
          {previewModels.map((model) => (
            <span key={model.id} className="badge badge--info" title={model.name}>
              {model.id}
            </span>
          ))}
          {hiddenCount > 0 && <span className="badge badge--default">+{hiddenCount} more</span>}
        </div>
      ) : (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "var(--space-3)",
            padding: "var(--space-4)",
            border: "1px solid var(--border-subtle)",
            borderRadius: "var(--radius-md)",
            background: "var(--bg-surface)",
          }}
        >
          <input
            className="input input--mono"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Filter synced model IDs"
          />
          {filteredModels.length === 0 ? (
            <p style={{ fontSize: "0.875rem", color: "var(--text-muted)", margin: 0 }}>
              No synced models match this filter.
            </p>
          ) : (
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: "var(--space-2)",
                maxHeight: 240,
                overflowY: "auto",
                paddingRight: "var(--space-1)",
              }}
            >
              {filteredModels.map((model) => (
                <span key={model.id} className="badge badge--info" title={model.name}>
                  {model.id}
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function GatewayCard({
  gateway,
  openManualModel,
  onRefresh,
  onManualModelPrimed,
  onStatus,
  onError,
}: {
  gateway: GatewayInfo;
  openManualModel?: boolean;
  onRefresh: () => Promise<void>;
  onManualModelPrimed?: () => void;
  onStatus?: (msg: string) => void;
  onError?: (msg?: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [manualModelOpen, setManualModelOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    if (openManualModel) {
      setManualModelOpen(true);
      onManualModelPrimed?.();
    }
  }, [onManualModelPrimed, openManualModel]);

  async function saveGateway(data: { name: string; baseUrl: string; apiKey: string }) {
    setSaving(true);
    try {
      const body: Record<string, string> = { name: data.name, baseUrl: data.baseUrl };
      if (data.apiKey) {
        body.apiKey = data.apiKey;
      }

      const response = await fetch(`/api/v1/user/gateways/${gateway.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => ({ error: "Failed to save gateway." })) as { error?: string };
        onError?.(payload.error ?? "Failed to save gateway.");
        return;
      }

      onStatus?.("Gateway saved.");
      setEditing(false);
      await onRefresh();
    } finally {
      setSaving(false);
    }
  }

  async function deleteGateway() {
    if (!deleting) {
      setDeleting(true);
      return;
    }

    const response = await fetch(`/api/v1/user/gateways/${gateway.id}`, { method: "DELETE" });
    if (!response.ok && response.status !== 204) {
      onError?.("Failed to delete gateway.");
      setDeleting(false);
      return;
    }

    onStatus?.("Gateway deleted.");
    await onRefresh();
  }

  async function syncModels() {
    setSyncing(true);
    try {
      const result = await syncGatewayModelsFromFetch(gateway);
      if (!result.ok) {
        setManualModelOpen(true);
        onError?.(`${result.error ?? "Failed to sync gateway models."} Add the model manually below if this gateway does not expose /models.`);
        return;
      }

      if (result.models.length === 0) {
        setManualModelOpen(true);
        onStatus?.("No models were returned. Add your first model manually below to use this gateway in Routing Profiles.");
      } else {
        onStatus?.("Gateway models synced.");
      }
      await onRefresh();
    } finally {
      setSyncing(false);
    }
  }

  return (
    <div className="card">
      <div className="card-header" style={{ alignItems: "flex-start" }}>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "var(--space-1)",
            minWidth: 0,
            flex: "1 1 auto",
          }}
        >
          <h3 style={{ margin: 0 }}>{gateway.name}</h3>
          <p style={{ fontSize: "0.875rem", color: "var(--text-muted)", margin: 0 }}>
            <code className="code" style={{ wordBreak: "break-all", whiteSpace: "pre-wrap" }}>
              {gateway.baseUrl}
            </code>
          </p>
        </div>
        <div
          style={{
            display: "flex",
            gap: "var(--space-2)",
            flexShrink: 0,
            flexWrap: "wrap",
            alignItems: "center",
            justifyContent: "flex-end",
          }}
        >
          <button className="btn btn--ghost btn--sm" type="button" onClick={() => setEditing((current) => !current)}>
            <IconEdit />
            {editing ? "Close" : "Edit"}
          </button>
          <button className="btn btn--danger btn--sm" type="button" onClick={() => void deleteGateway()}>
            <IconTrash />
            {deleting ? "Confirm delete" : "Delete"}
          </button>
        </div>
      </div>
      <div className="card-body" style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
        {editing && (
          <GatewayForm
            initial={{ name: gateway.name, baseUrl: gateway.baseUrl }}
            isEdit
            saving={saving}
            onSave={saveGateway}
            onCancel={() => setEditing(false)}
          />
        )}

        <div>
          <div style={{ fontWeight: 600, marginBottom: "var(--space-2)" }}>Synced models</div>
          <GatewayModelsPreview
            models={gateway.models}
            onAddManual={() => setManualModelOpen(true)}
            onSync={() => void syncModels()}
            syncing={syncing}
            manualModelOpen={manualModelOpen}
            onToggleManual={() => setManualModelOpen((current) => !current)}
          />
        </div>

        {manualModelOpen ? (
          <ManualGatewayModelForm
            gateway={gateway}
            onCancel={() => setManualModelOpen(false)}
            onError={onError}
            onRefresh={onRefresh}
            onStatus={onStatus}
          />
        ) : null}
      </div>
    </div>
  );
}

export function GatewayPanel({ onStatus, onError }: Props) {
  const [gateways, setGateways] = useState<GatewayInfo[] | null>(null);
  const [primedManualGatewayId, setPrimedManualGatewayId] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  /** Preset id (or CUSTOM_PRESET_ID) when opening the form from a tile; undefined = blank form. */
  const [addFormPresetId, setAddFormPresetId] = useState<string | undefined>(undefined);
  const [saving, setSaving] = useState(false);

  function closeAddGatewayForm() {
    setShowAddForm(false);
    setAddFormPresetId(undefined);
  }

  function openAddGatewayBlank() {
    setAddFormPresetId(undefined);
    setShowAddForm(true);
  }

  function openAddGatewayWithPreset(presetId: string) {
    setAddFormPresetId(presetId);
    setShowAddForm(true);
  }

  async function load() {
    const response = await fetch("/api/v1/user/gateways", { cache: "no-store" });
    const payload = await response.json().catch(() => ({ gateways: [] })) as { gateways?: GatewayInfo[]; error?: string };
    if (!response.ok) {
      onError?.(payload.error ?? "Failed to load gateways.");
      setGateways([]);
      return;
    }
    setGateways(payload.gateways ?? []);
  }

  useEffect(() => {
    void load();
  }, []);

  async function createGateway(data: { name: string; baseUrl: string; apiKey: string }) {
    setSaving(true);
    try {
      const response = await fetch("/api/v1/user/gateways", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      const payload = await response.json().catch(() => ({ error: "Failed to create gateway." })) as {
        error?: string;
        gateway?: GatewayInfo;
      };
      if (!response.ok) {
        onError?.(payload.error ?? "Failed to create gateway.");
        return;
      }

      let statusMessage = "Gateway added.";
      if (payload.gateway?.id) {
        const syncResult = await syncGatewayModelsFromFetch({
          ...payload.gateway,
          models: payload.gateway.models ?? [],
        });

        if (syncResult.ok && syncResult.models.length > 0) {
          statusMessage = `Gateway added and synced ${syncResult.models.length} models.`;
          setPrimedManualGatewayId(null);
        } else {
          setPrimedManualGatewayId(payload.gateway.id);
          statusMessage = "Gateway added. Automatic model sync was not available, so add your first model manually below.";
        }
      }

      onStatus?.(statusMessage);
      closeAddGatewayForm();
      await load();
    } finally {
      setSaving(false);
    }
  }

  if (!gateways) {
    return (
      <div className="card">
        <div className="card-body">Loading gateways…</div>
      </div>
    );
  }

  const hasGateways = gateways.length > 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
      {!hasGateways ? (
        <div className="card">
          <div className="card-header">
            <div>
              <h3>Connect a gateway</h3>
              <p style={{ fontSize: "0.875rem", color: "var(--text-muted)", marginTop: "var(--space-1)", marginBottom: 0 }}>
                CustomRouter routes requests; your gateway or provider supplies models, keys, and billing.
              </p>
            </div>
            <button
              className="btn btn--primary btn--sm"
              type="button"
              onClick={() => (showAddForm ? closeAddGatewayForm() : openAddGatewayBlank())}
            >
              <IconPlus />
              {showAddForm ? "Close" : "Add gateway"}
            </button>
          </div>
          {showAddForm ? (
            <div className="card-body">
              <GatewayForm
                key={addFormPresetId ?? "blank"}
                initialPresetId={addFormPresetId}
                saving={saving}
                onSave={createGateway}
                onCancel={closeAddGatewayForm}
              />
            </div>
          ) : (
            <div className="card-body" style={{ display: "flex", flexDirection: "column", gap: "var(--space-5)" }}>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
                  gap: "var(--space-3)",
                }}
              >
                {GATEWAY_RECOMMENDATIONS.map((recommendation) => (
                  <button
                    key={recommendation.id}
                    type="button"
                    className="gateway-choice-tile"
                    onClick={() => openAddGatewayWithPreset(recommendation.presetId)}
                  >
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "var(--space-2)", flexWrap: "wrap", width: "100%" }}>
                      <strong>{recommendation.name}</strong>
                      <span className="badge badge--info">{recommendation.badge}</span>
                    </div>
                    <p style={{ margin: 0, fontSize: "0.875rem", color: "var(--text-muted)", lineHeight: 1.45 }}>
                      {recommendation.summary}
                    </p>
                  </button>
                ))}
              </div>
              <details style={{ borderTop: "1px solid var(--border-subtle)", paddingTop: "var(--space-4)" }}>
                <summary
                  style={{
                    cursor: "pointer",
                    fontSize: "0.875rem",
                    color: "var(--text-muted)",
                    userSelect: "none",
                  }}
                >
                  Don&apos;t have a gateway account?
                </summary>
                <div
                  style={{
                    marginTop: "var(--space-3)",
                    fontSize: "0.875rem",
                    color: "var(--text-muted)",
                    lineHeight: 1.55,
                    display: "flex",
                    flexDirection: "column",
                    gap: "var(--space-3)",
                  }}
                >
                  <p style={{ margin: 0 }}>
                    A gateway (or provider) exposes an OpenAI-compatible API: you get a base URL and API key. CustomRouter
                    uses those to call models when routing.
                  </p>
                  <p style={{ margin: 0 }}>
                    If you are new to this, create an account with a provider such as OpenRouter, copy your key, then use
                    the <strong>OpenRouter</strong> tile above or <strong>Add gateway</strong> and pick it from the list.
                  </p>
                  <p style={{ margin: 0 }}>
                    After saving, use <strong>Sync models</strong> on the gateway card. If <code className="code">/models</code>{" "}
                    is not available, add model IDs manually from that card.
                  </p>
                </div>
              </details>
            </div>
          )}
        </div>
      ) : null}

      {hasGateways
        ? gateways.map((gateway) => (
            <GatewayCard
              key={gateway.id}
              gateway={gateway}
              openManualModel={gateway.id === primedManualGatewayId}
              onRefresh={load}
              onManualModelPrimed={() => setPrimedManualGatewayId((current) => (current === gateway.id ? null : current))}
              onStatus={onStatus}
              onError={onError}
            />
          ))
        : null}

      {hasGateways ? (
        showAddForm ? (
          <div className="card">
            <div className="card-body">
              <GatewayForm
                key={addFormPresetId ?? "blank"}
                initialPresetId={addFormPresetId}
                saving={saving}
                onSave={createGateway}
                onCancel={closeAddGatewayForm}
              />
            </div>
          </div>
        ) : (
          <div>
            <button className="btn btn--secondary btn--sm" type="button" onClick={() => openAddGatewayBlank()}>
              <IconPlus />
              Add gateway
            </button>
          </div>
        )
      ) : null}
    </div>
  );
}
