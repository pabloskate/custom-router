"use client";

import React, { useEffect, useRef } from "react";
import type { RouterProfile } from "@custom-router/core";

import {
  PROFILE_BUILDER_BUDGET_POSTURES,
  PROFILE_BUILDER_LATENCY_SENSITIVITIES,
  PROFILE_BUILDER_OPTIMIZE_FOR,
  PROFILE_BUILDER_TASK_FAMILIES,
  type ProfileBuilderTaskFamily,
} from "@/src/features/routing/profile-builder-contracts";
import {
  buildProfileModelKey,
  hasResolvedProfileModel,
  normalizeProfileIdInput,
} from "@/src/lib/routing/profile-config";
import {
  REASONING_PRESET_FIELD_HINT,
  REASONING_PRESET_SELECT_OPTIONS,
} from "@/src/lib/reasoning-options";
import type { GatewayInfo } from "@/src/features/gateways/contracts";
import {
  availableGatewayModels,
  countResolvedProfileModels,
  createProfileFromPreset,
  formatGatewayModelOptionLabel,
  gatewayName,
  getProfileStatus,
} from "@/src/features/routing/profiles-editor-utils";
import type { RoutingPreset } from "@/src/lib/routing-presets";
import { SearchableSelect } from "@/src/components/ui/SearchableSelect";

import {
  type RoutingProfilesEditorProps,
  useRoutingProfilesEditor,
} from "./useRoutingProfilesEditor";

export type { RoutingProfilesEditorProps } from "./useRoutingProfilesEditor";

const PROFILE_BUILDER_TASK_FAMILY_LABELS: Record<ProfileBuilderTaskFamily, string> = {
  general: "General",
  coding: "Coding",
  agentic_coding: "Agentic coding",
  research: "Research",
  support: "Support",
  long_context: "Long context",
  multimodal: "Multimodal",
};

function IconChevron({ open }: { open: boolean }) {
  return (
    <svg
      className={`routing-profiles__chevron ${open ? "is-open" : ""}`}
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <polyline points="9 18 15 12 9 6" />
    </svg>
  );
}

function IconPlus() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}

function IconSpark() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
    </svg>
  );
}

function IconCheck() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5 13l4 4L19 7" />
    </svg>
  );
}

function IconShield() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </svg>
  );
}

function IconEdit() {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M11.5 1.5l3 3L5 14H2v-3z" />
    </svg>
  );
}

function IconCode() {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="6 3 1.5 8 6 13" />
      <polyline points="10 3 14.5 8 10 13" />
    </svg>
  );
}

function IconUpload() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="17 8 12 3 7 8" />
      <line x1="12" y1="3" x2="12" y2="15" />
    </svg>
  );
}

function IconDownload() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  );
}

function IconClose() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

function AutoGrowTextarea({
  className,
  minHeight = 150,
  onBlur,
  onChange,
  placeholder,
  rows = 5,
  value,
}: {
  className?: string;
  minHeight?: number;
  onBlur?: React.TextareaHTMLAttributes<HTMLTextAreaElement>["onBlur"];
  onChange: React.TextareaHTMLAttributes<HTMLTextAreaElement>["onChange"];
  placeholder?: string;
  rows?: number;
  value: string;
}) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    const node = textareaRef.current;
    if (!node) {
      return;
    }

    node.style.height = "0px";
    node.style.height = `${Math.max(node.scrollHeight, minHeight)}px`;
  }, [minHeight, value]);

  return (
    <textarea
      ref={textareaRef}
      className={className}
      rows={rows}
      value={value}
      onBlur={onBlur}
      onChange={onChange}
      placeholder={placeholder}
      style={{ minHeight, overflow: "hidden", resize: "none" }}
    />
  );
}

function LegacyResetNotice({
  message,
  onReset,
  disabled,
}: {
  message?: string | null;
  onReset?: () => Promise<void>;
  disabled: boolean;
}) {
  return (
    <div className="routing-profiles__reset-notice">
      <div>
        <div className="routing-profiles__reset-title">Routing profiles need to be rebuilt</div>
        <div className="routing-profiles__reset-copy">
          {message ?? "Legacy routing settings were detected. Reset the routing profiles and rebuild them in the new profile editor."}
        </div>
      </div>
      <button className="btn btn--danger" type="button" onClick={() => void onReset?.()} disabled={disabled}>
        Reset routing profiles
      </button>
    </div>
  );
}

function ModalShell({
  children,
  onClose,
  title,
  description,
}: {
  children: React.ReactNode;
  onClose: () => void;
  title: string;
  description: string;
}) {
  return (
    <div className="routing-profiles-modal__overlay" onClick={onClose} role="presentation">
      <div className="routing-profiles-modal" onClick={(event) => event.stopPropagation()} role="dialog" aria-modal="true" aria-label={title}>
        <div className="routing-profiles-modal__header">
          <div>
            <h3>{title}</h3>
            <p>{description}</p>
          </div>
          <button className="routing-profiles-modal__close" type="button" onClick={onClose} aria-label="Close">
            <IconClose />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function autosaveMeta(state: ReturnType<typeof useRoutingProfilesEditor>["autosaveSnapshot"]) {
  if (state.state === "saving") {
    return { label: "Saving changes...", tone: "info" as const, icon: <IconSpark /> };
  }
  if (state.state === "dirty") {
    return { label: "Changes pending", tone: "warning" as const, icon: <IconSpark /> };
  }
  if (state.state === "invalid") {
    return { label: "Fix profile errors", tone: "warning" as const, icon: <IconSpark /> };
  }
  if (state.state === "error") {
    return { label: "Autosave failed", tone: "danger" as const, icon: <IconClose /> };
  }

  return { label: "All changes saved", tone: "success" as const, icon: <IconCheck /> };
}

function optionLabel(value: string): string {
  return value.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function modalityOptions(gateways: GatewayInfo[], selectedValues: Array<string | undefined>): string[] {
  const values = new Set<string>(["text->text", "text,image->text"]);
  for (const gateway of gateways) {
    for (const model of gateway.models) {
      const modality = model.modality?.trim();
      if (modality) {
        values.add(modality);
      }
    }
  }

  for (const selectedValue of selectedValues) {
    const modality = selectedValue?.trim();
    if (modality) {
      values.add(modality);
    }
  }

  const sorted = Array.from(values).sort((a, b) => a.localeCompare(b));
  if (!sorted.includes("text->text")) {
    return sorted;
  }

  return ["text->text", ...sorted.filter((value) => value !== "text->text")];
}

function ProfileCard({
  editor,
  gateways,
  profile,
}: {
  editor: ReturnType<typeof useRoutingProfilesEditor>;
  gateways: GatewayInfo[];
  profile: RouterProfile;
}) {
  const isExpanded = editor.expandedProfileId === profile.id;
  const status = getProfileStatus(profile);
  const instructionStatus = editor.getInstructionStatus(profile.id);
  const refreshPreset = editor.getMatchingPreset(profile.id);
  const resolvedModels = (profile.models ?? []).filter(hasResolvedProfileModel);
  const fallbackOptions = resolvedModels.map((model) => ({
    key: buildProfileModelKey(model.gatewayId, model.modelId),
    label: formatGatewayModelOptionLabel(gateways, model),
  }));
  const classifierOptions = gateways.flatMap((gateway) =>
    gateway.models.map((model) => ({
      key: buildProfileModelKey(gateway.id, model.id),
      label: formatGatewayModelOptionLabel(gateways, {
        gatewayId: gateway.id,
        modelId: model.id,
        name: model.name,
      }),
    })),
  );

  return (
    <div className={`routing-profile-card ${status.needsSetup ? "is-warning" : ""} ${isExpanded ? "is-open" : ""}`}>
      <div
        className="routing-profile-card__header"
        role="button"
        tabIndex={0}
        onClick={() => editor.toggleProfile(profile.id)}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            editor.toggleProfile(profile.id);
          }
        }}
      >
        <div className="routing-profile-card__header-left">
          <IconChevron open={isExpanded} />
          {editor.renameProfileId === profile.id ? (
            <input
              className="routing-profile-card__name-input"
              value={editor.renameDraft}
              onBlur={() => editor.commitRename(profile.id)}
              onChange={(event) => editor.setRenameDraft(event.target.value)}
              onClick={(event) => event.stopPropagation()}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  editor.commitRename(profile.id);
                }
                if (event.key === "Escape") {
                  editor.cancelRename();
                }
              }}
              autoFocus
            />
          ) : (
            <span
              className="routing-profile-card__name"
              onClick={(event) => {
                event.stopPropagation();
                editor.beginRename(profile.id, profile.name);
              }}
            >
              {profile.name}
              <span className="routing-profile-card__name-edit">
                <IconEdit />
              </span>
            </span>
          )}
          <span className="routing-profile-card__id">{profile.id}</span>
          <span className={`routing-profile-card__badge is-${status.tone}`}>{status.label}</span>
        </div>
        <div className="routing-profile-card__meta">
          <span className="routing-profile-card__count">{(profile.models ?? []).length} models</span>
        </div>
      </div>

      {isExpanded ? (
        <div className="routing-profile-card__body">
          <div className={`routing-profile-card__instructions ${status.needsSetup ? "is-warning" : ""}`}>
            <div className="routing-profile-card__instructions-header">
              <div className="routing-profile-card__instructions-title">
                <IconShield />
                <span>Routing instructions</span>
              </div>
              <span className={`routing-profile-card__instructions-status is-${instructionStatus.tone}`}>
                {instructionStatus.label}
              </span>
            </div>
            <AutoGrowTextarea
              className="routing-profile-card__instructions-input"
              value={profile.routingInstructions ?? ""}
              onChange={(event) => editor.updateRoutingInstructions(profile.id, event.target.value)}
              onBlur={() => {
                void editor.flushAutosave();
              }}
              placeholder="Tell the classifier how to route messages across this profile's models..."
            />
          </div>

          <div className="routing-profile-card__section">
            <div className="routing-profile-card__section-title">Models</div>
            {(profile.models ?? []).length === 0 ? (
              <div className="routing-profile-card__empty">
                No models yet. Add synced models or create a custom one to start routing.
              </div>
            ) : (
              <div className="routing-profile-card__model-grid">
                {(profile.models ?? []).map((model, rowIndex) => (
                  <button
                    key={`${model.gatewayId ?? "draft"}:${model.modelId || rowIndex}`}
                    className={`routing-profile-chip ${hasResolvedProfileModel(model) ? "is-resolved" : "is-unresolved"}`}
                    type="button"
                    onClick={() => editor.openModelEditor(profile.id, rowIndex)}
                  >
                    <span className="routing-profile-chip__dot" />
                    <span className="routing-profile-chip__label">{model.name || model.modelId || "Select a model"}</span>
                    <span className="routing-profile-chip__meta">
                      {hasResolvedProfileModel(model) ? gatewayName(gateways, model.gatewayId) : "Needs binding"}
                    </span>
                    <span
                      className="routing-profile-chip__remove"
                      onClick={(event) => {
                        event.stopPropagation();
                        editor.removeModel(profile.id, rowIndex);
                      }}
                    >
                      <IconClose />
                    </span>
                  </button>
                ))}
                <button className="routing-profile-chip routing-profile-chip--add" type="button" onClick={() => editor.openModelEditor(profile.id, null)}>
                  <IconPlus />
                  <span>Add model</span>
                </button>
              </div>
            )}

            {(profile.models ?? []).length === 0 ? (
              <div className="routing-profile-card__actions">
                <button className="btn btn--primary btn--sm" type="button" onClick={() => editor.openModelEditor(profile.id, null)}>
                  <IconPlus />
                  Add synced model
                </button>
                <button className="btn btn--secondary btn--sm" type="button" onClick={() => editor.openCustomModel(profile.id)}>
                  Create custom model
                </button>
              </div>
            ) : (
              <div className="routing-profile-card__actions">
                <button className="btn btn--secondary btn--sm" type="button" onClick={() => editor.openCustomModel(profile.id)}>
                  Create custom model
                </button>
              </div>
            )}
          </div>

          <div className="routing-profile-card__selectors">
            <label className="form-group">
              <span className="form-label">Fallback model</span>
              <select
                className="input"
                value={profile.defaultModel ?? ""}
                onChange={(event) => editor.updateDefaultModel(profile.id, event.target.value)}
              >
                <option value="">Select a fallback model</option>
                {fallbackOptions.map((option) => (
                  <option key={option.key} value={option.key}>{option.label}</option>
                ))}
              </select>
            </label>
            <label className="form-group">
              <span className="form-label">Router model</span>
              <SearchableSelect
                options={classifierOptions}
                value={profile.classifierModel ?? ""}
                onChange={(value) => editor.updateClassifierModel(profile.id, value)}
                placeholder="Search router models..."
              />
            </label>
          </div>

          <div className="routing-profile-card__footer" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "var(--space-4)" }}>
            <div style={{ display: "flex", gap: "var(--space-2)", flexWrap: "wrap" }}>
              {refreshPreset ? (
                <button
                  className="btn btn--secondary btn--sm"
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    editor.openPresetRefresh(profile.id);
                  }}
                >
                  <IconSpark />
                  Refresh preset
                </button>
              ) : null}
              <button
                className="btn btn--secondary btn--sm"
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  editor.exportProfileJson(profile.id);
                }}
              >
                <IconDownload />
                Export JSON
              </button>
              <button
                className="btn btn--secondary btn--sm"
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  editor.openAdvancedEditor(profile.id);
                }}
              >
                <IconCode />
                Advanced
              </button>
            </div>
            <button className="routing-profile-card__delete" type="button" onClick={() => editor.removeProfile(profile.id)}>
              Delete profile
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function RoutingProfilesEditor(props: RoutingProfilesEditorProps) {
  const editor = useRoutingProfilesEditor(props);
  const importInputRef = useRef<HTMLInputElement | null>(null);

  if (props.routingConfigRequiresReset) {
    return (
      <LegacyResetNotice
        message={props.routingConfigResetMessage}
        onReset={props.onResetLegacyConfig}
        disabled={props.saveState === "saving"}
      />
    );
  }

  const autosave = autosaveMeta(editor.autosaveSnapshot);
  const quickSetupPreset = editor.getQuickSetupPreset();
  const quickSetupProfile = quickSetupPreset ? createQuickSetupPreview(quickSetupPreset, props.gateways) : null;
  const quickSetupResolvedCount = quickSetupProfile ? countResolvedProfileModels(quickSetupProfile) : 0;
  const quickSetupUnresolvedCount = quickSetupProfile ? (quickSetupProfile.models ?? []).length - quickSetupResolvedCount : 0;
  const presetRefreshProfile = editor.presetRefresh.profileId
    ? editor.items.find((profile) => profile.id === editor.presetRefresh.profileId)
    : undefined;
  const presetRefreshPreset = presetRefreshProfile
    ? editor.getMatchingPreset(presetRefreshProfile.id)
    : undefined;
  const modelEditorProfile = editor.modelEditor.profileId
    ? editor.items.find((profile) => profile.id === editor.modelEditor.profileId)
    : undefined;
  const currentGateway = props.gateways.find((gateway) => gateway.id === editor.modelEditor.draft.gatewayId);
  const modelOptions = availableGatewayModels(currentGateway, modelEditorProfile ?? { id: "", name: "", models: [] }, editor.modelEditor.rowIndex ?? undefined);
  const searchableModelOptions = modelOptions.map((model) => ({
    key: model.id,
    label: formatGatewayModelOptionLabel(props.gateways, {
      gatewayId: currentGateway?.id ?? editor.modelEditor.draft.gatewayId,
      modelId: model.id,
      name: model.name,
    }),
  }));
  const availableModalities = modalityOptions(props.gateways, [
    editor.modelEditor.draft.modality,
    editor.customModel.draft.modality,
  ]);

  return (
    <div className="routing-profiles">
      <div className="routing-profiles__toolbar">
        <div className="routing-profiles__toolbar-actions">
          {editor.presets.length > 0 ? (
            <button className="routing-profiles__accent-button" type="button" onClick={editor.openQuickSetup}>
              <IconSpark />
              Quick setup
            </button>
          ) : null}
          <button
            className="routing-profiles__ghost-button"
            type="button"
            onClick={() => importInputRef.current?.click()}
          >
            <IconUpload />
            Import JSON
          </button>
          <button className="routing-profiles__ghost-button" type="button" onClick={editor.openCreateProfileChoice}>
            <IconPlus />
            Add profile
          </button>
        </div>
        <div className={`routing-profiles__autosave is-${autosave.tone}`} role="status" aria-live="polite">
          {autosave.icon}
          <span>{autosave.label}</span>
        </div>
      </div>

      {editor.panelMessage ? (
        <div className="routing-profiles__message">
          {editor.panelMessage}
        </div>
      ) : null}

      <input
        ref={importInputRef}
        type="file"
        accept=".json,application/json"
        hidden
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) {
            void editor.importProfileFile(file);
          }
          event.target.value = "";
        }}
      />

      <div className="routing-profiles__section-label">Profiles</div>

      <div className="routing-profiles__list">
        {editor.items.length === 0 ? (
          <div className="routing-profile-card">
            <div className="routing-profile-card__body">
              <div className="routing-profile-card__empty">
                No routing profiles yet. Create a profile, give it a stable ID, and call that ID from your client to enable routing.
              </div>
            </div>
          </div>
        ) : (
          editor.items.map((profile) => (
            <ProfileCard
              key={profile.id}
              editor={editor}
              gateways={props.gateways}
              profile={profile}
            />
          ))
        )}
      </div>

      {editor.quickSetup.open ? (
        <ModalShell
          title="Quick setup"
          description="Create a profile from a template, then bind any unresolved models to your gateway."
          onClose={editor.closeQuickSetup}
        >
          <div className="routing-profiles-modal__body">
            {editor.quickSetup.error ? (
              <div className="routing-profiles-modal__error">{editor.quickSetup.error}</div>
            ) : null}
            <label className="form-group">
              <span className="form-label">Template</span>
              <select
                className="input"
                value={editor.quickSetup.selectedPresetId}
                onChange={(event) => editor.updateQuickSetupPreset(event.target.value)}
              >
                {editor.presets.map((preset) => (
                  <option key={preset.id} value={preset.id}>{preset.name}</option>
                ))}
              </select>
            </label>

            {quickSetupPreset ? (
              <div className="routing-profiles-modal__hint">
                <span className="routing-profiles-modal__hint-dot">•</span>
                <span>
                  {quickSetupPreset.description}. {quickSetupResolvedCount} resolved
                  {quickSetupUnresolvedCount > 0 ? `, ${quickSetupUnresolvedCount} unresolved` : ""}.
                </span>
              </div>
            ) : null}

            <label className="form-group">
              <span className="form-label">Profile ID</span>
              <input
                className="input input--mono"
                value={editor.quickSetup.profileId}
                onChange={(event) => editor.updateQuickSetupProfileId(event.target.value)}
              />
              <span className="form-hint">Use lowercase letters, numbers, and hyphens only.</span>
            </label>

            <label className="form-group">
              <span className="form-label">Display name</span>
              <input
                className="input"
                value={editor.quickSetup.displayName}
                onChange={(event) => editor.setQuickSetup((current) => ({ ...current, displayName: event.target.value, error: null }))}
              />
            </label>
          </div>
          <div className="routing-profiles-modal__actions">
            <button className="btn btn--secondary" type="button" onClick={editor.closeQuickSetup}>Cancel</button>
            <button className="btn btn--primary" type="button" onClick={editor.createProfileFromQuickSetup}>Create profile</button>
          </div>
        </ModalShell>
      ) : null}

      {editor.createProfileChoice.open ? (
        <ModalShell
          title="Add profile"
          description="Create a blank profile yourself. Agent-assisted drafts from your gateway inventory are coming soon."
          onClose={editor.closeCreateProfileChoice}
        >
          <div className="routing-profiles-modal__body">
            <div className="routing-profiles-modal__choice-grid">
              <button className="routing-profiles-modal__choice-card" type="button" onClick={editor.openCreateProfile}>
                <span className="routing-profiles-modal__choice-title">Manual</span>
                <span className="routing-profiles-modal__choice-copy">
                  Start from a blank profile and bind models yourself.
                </span>
              </button>
              <button
                className="routing-profiles-modal__choice-card"
                type="button"
                disabled
                aria-label="Coming soon: agent-guided profile drafts from your gateway inventory"
              >
                <span className="routing-profiles-modal__choice-title">Coming soon</span>
                <span className="routing-profiles-modal__choice-copy">
                  With agent: answer a fixed intake, then let the agent build a draft from your gateway inventory.
                </span>
              </button>
            </div>
          </div>
          <div className="routing-profiles-modal__actions">
            <button className="btn btn--secondary" type="button" onClick={editor.closeCreateProfileChoice}>Cancel</button>
          </div>
        </ModalShell>
      ) : null}

      {editor.createProfile.open ? (
        <ModalShell
          title="Add profile"
          description="Create a new routing profile and lock in the API-facing profile ID."
          onClose={editor.closeCreateProfile}
        >
          <div className="routing-profiles-modal__body">
            {editor.createProfile.error ? (
              <div className="routing-profiles-modal__error">{editor.createProfile.error}</div>
            ) : null}
            <label className="form-group">
              <span className="form-label">Profile ID</span>
              <input
                className="input input--mono"
                value={editor.createProfile.profileId}
                onChange={(event) => editor.updateCreateProfileId(event.target.value)}
              />
              <span className="form-hint">Use lowercase letters, numbers, and hyphens only.</span>
            </label>
            <label className="form-group">
              <span className="form-label">Display name</span>
              <input
                className="input"
                value={editor.createProfile.displayName}
                onChange={(event) => editor.setCreateProfile((current) => ({ ...current, displayName: event.target.value, error: null }))}
              />
            </label>
          </div>
          <div className="routing-profiles-modal__actions">
            <button className="btn btn--secondary" type="button" onClick={editor.closeCreateProfile}>Cancel</button>
            <button className="btn btn--primary" type="button" onClick={editor.createEmptyProfile}>Create profile</button>
          </div>
        </ModalShell>
      ) : null}

      {editor.agentCreate.open ? (
        <ModalShell
          title="Add profile with agent"
          description="The agent uses your selected gateway and synced models to build a draft profile. Nothing is saved until you apply the draft."
          onClose={editor.closeAgentCreate}
        >
          <div className="routing-profiles-modal__body">
            {editor.agentCreate.error ? (
              <div className="routing-profiles-modal__error">{editor.agentCreate.error}</div>
            ) : null}

            {!editor.agentCreate.run ? (
              <>
                <div className="routing-profiles-modal__grid">
                  <label className="form-group">
                    <span className="form-label">Profile ID</span>
                    <input
                      className="input input--mono"
                      value={editor.agentCreate.request.profileId}
                      onChange={(event) => editor.updateAgentRequest("profileId", normalizeProfileIdInput(event.target.value))}
                    />
                    <span className="form-hint">Use lowercase letters, numbers, and hyphens only.</span>
                  </label>
                  <label className="form-group">
                    <span className="form-label">Display name</span>
                    <input
                      className="input"
                      value={editor.agentCreate.request.displayName}
                      onChange={(event) => editor.updateAgentRequest("displayName", event.target.value)}
                    />
                  </label>
                  <label className="form-group">
                    <span className="form-label">Gateway</span>
                    <select
                      className="input"
                      value={editor.agentCreate.request.preferredGatewayId ?? ""}
                      onChange={(event) => editor.updateAgentRequest("preferredGatewayId", event.target.value || undefined)}
                    >
                      {editor.profileBuilderGateways.map((gateway) => (
                        <option key={gateway.id} value={gateway.id}>{gateway.name}</option>
                      ))}
                    </select>
                  </label>
                  <label className="form-group">
                    <span className="form-label">Optimize for</span>
                    <select
                      className="input"
                      value={editor.agentCreate.request.optimizeFor}
                      onChange={(event) => editor.updateAgentRequest("optimizeFor", event.target.value as typeof editor.agentCreate.request.optimizeFor)}
                    >
                      {PROFILE_BUILDER_OPTIMIZE_FOR.map((value) => (
                        <option key={value} value={value}>{optionLabel(value)}</option>
                      ))}
                    </select>
                  </label>
                  <label className="form-group">
                    <span className="form-label">Latency sensitivity</span>
                    <select
                      className="input"
                      value={editor.agentCreate.request.latencySensitivity}
                      onChange={(event) => editor.updateAgentRequest("latencySensitivity", event.target.value as typeof editor.agentCreate.request.latencySensitivity)}
                    >
                      {PROFILE_BUILDER_LATENCY_SENSITIVITIES.map((value) => (
                        <option key={value} value={value}>{optionLabel(value)}</option>
                      ))}
                    </select>
                  </label>
                  <label className="form-group">
                    <span className="form-label">Budget posture</span>
                    <select
                      className="input"
                      value={editor.agentCreate.request.budgetPosture}
                      onChange={(event) => editor.updateAgentRequest("budgetPosture", event.target.value as typeof editor.agentCreate.request.budgetPosture)}
                    >
                      {PROFILE_BUILDER_BUDGET_POSTURES.map((value) => (
                        <option key={value} value={value}>{optionLabel(value)}</option>
                      ))}
                    </select>
                  </label>
                </div>

                <div className="routing-profiles-modal__section">
                  <div className="routing-profiles-modal__section-title">What kinds of tasks will this profile handle?</div>
                  <div className="routing-profiles-modal__checkbox-grid">
                    {PROFILE_BUILDER_TASK_FAMILIES.map((taskFamily) => (
                      <label key={taskFamily} className="routing-profiles-modal__checkbox">
                        <input
                          type="checkbox"
                          checked={editor.agentCreate.request.taskFamilies.includes(taskFamily)}
                          onChange={() => editor.toggleAgentTaskFamily(taskFamily)}
                        />
                        <span>{PROFILE_BUILDER_TASK_FAMILY_LABELS[taskFamily]}</span>
                      </label>
                    ))}
                  </div>
                </div>

                <div className="routing-profiles-modal__grid">
                  <label className="routing-profiles-modal__checkbox routing-profiles-modal__checkbox--inline">
                    <input
                      type="checkbox"
                      checked={editor.agentCreate.request.needsVision}
                      onChange={(event) => editor.updateAgentRequest("needsVision", event.target.checked)}
                    />
                    <span>Needs image / screenshot support</span>
                  </label>
                  <label className="routing-profiles-modal__checkbox routing-profiles-modal__checkbox--inline">
                    <input
                      type="checkbox"
                      checked={editor.agentCreate.request.needsLongContext}
                      onChange={(event) => editor.updateAgentRequest("needsLongContext", event.target.checked)}
                    />
                    <span>Needs long-context or repo-wide reads</span>
                  </label>
                </div>

                <div className="routing-profiles-modal__grid">
                  <label className="form-group">
                    <span className="form-label">Must use</span>
                    <input
                      className="input input--mono"
                      value={editor.agentCreate.request.mustUse ?? ""}
                      onChange={(event) => editor.updateAgentRequest("mustUse", event.target.value)}
                      placeholder="Optional: model ids or providers"
                    />
                  </label>
                  <label className="form-group">
                    <span className="form-label">Avoid</span>
                    <input
                      className="input input--mono"
                      value={editor.agentCreate.request.avoid ?? ""}
                      onChange={(event) => editor.updateAgentRequest("avoid", event.target.value)}
                      placeholder="Optional: model ids or providers"
                    />
                  </label>
                </div>

                <label className="form-group">
                  <span className="form-label">Additional context</span>
                  <textarea
                    className="input"
                    rows={4}
                    value={editor.agentCreate.request.additionalContext ?? ""}
                    onChange={(event) => editor.updateAgentRequest("additionalContext", event.target.value)}
                    placeholder="Optional: describe the workload, constraints, quality bar, or any routing nuance the fixed intake missed."
                  />
                  <span className="form-hint">Freeform notes for the agent building this draft.</span>
                </label>
              </>
            ) : null}

            {editor.agentCreate.run?.status === "running" ? (
              <div className="routing-profiles-modal__progress">
                <div className="routing-profiles-modal__progress-title">Researching models...</div>
                <p>
                  The agent is ranking models from your synced gateway inventory and building a draft profile.
                </p>
                <div className="routing-profiles-modal__hint">
                  <span className="routing-profiles-modal__hint-dot">•</span>
                  <span>Executor: <code>{editor.agentCreate.run.executor.modelId}</code> on {editor.agentCreate.run.executor.gatewayName}</span>
                </div>
              </div>
            ) : null}

            {editor.agentCreate.run?.status === "completed" && editor.agentCreate.run.draftProfile ? (
              <>
                <div className="routing-profiles-modal__grid">
                  <label className="form-group">
                    <span className="form-label">Profile ID</span>
                    <input
                      className="input input--mono"
                      value={editor.agentCreate.editedProfileId}
                      onChange={(event) => editor.setAgentCreate((current) => ({ ...current, editedProfileId: normalizeProfileIdInput(event.target.value), error: null }))}
                    />
                  </label>
                  <label className="form-group">
                    <span className="form-label">Display name</span>
                    <input
                      className="input"
                      value={editor.agentCreate.editedDisplayName}
                      onChange={(event) => editor.setAgentCreate((current) => ({ ...current, editedDisplayName: event.target.value, error: null }))}
                    />
                  </label>
                </div>

                {editor.agentCreate.run.summary ? (
                  <div className="routing-profiles-modal__hint">
                    <span className="routing-profiles-modal__hint-dot">•</span>
                    <span>{editor.agentCreate.run.summary}</span>
                  </div>
                ) : null}

                <div className="routing-profiles-modal__result-meta">
                  <span><strong>Executor:</strong> <code>{editor.agentCreate.run.executor.modelId}</code></span>
                  <span><strong>Research mode:</strong> {optionLabel(editor.agentCreate.run.researchMode ?? "catalog_only")}</span>
                </div>

                <label className="form-group">
                  <span className="form-label">Description</span>
                  <input
                    className="input"
                    value={editor.agentCreate.editedDescription}
                    onChange={(event) => editor.setAgentCreate((current) => ({ ...current, editedDescription: event.target.value, error: null }))}
                  />
                </label>

                <label className="form-group">
                  <span className="form-label">Routing instructions</span>
                  <AutoGrowTextarea
                    className="routing-profile-card__instructions-input"
                    minHeight={140}
                    value={editor.agentCreate.editedRoutingInstructions}
                    onChange={(event) => editor.setAgentCreate((current) => ({ ...current, editedRoutingInstructions: event.target.value, error: null }))}
                  />
                </label>

                <div className="routing-profiles-modal__section">
                  <div className="routing-profiles-modal__section-title">Recommended models</div>
                  <div className="routing-profiles-modal__recommendations">
                    {editor.agentCreate.run.recommendations.map((recommendation) => (
                      <div key={`${recommendation.gatewayId}::${recommendation.modelId}`} className="routing-profiles-modal__recommendation">
                        <div className="routing-profiles-modal__recommendation-title">
                          <strong>{recommendation.modelName}</strong>
                          <span>{recommendation.roleLabel}</span>
                        </div>
                        <div className="routing-profiles-modal__recommendation-copy">{recommendation.rationale}</div>
                        <div className="routing-profiles-modal__result-meta">
                          {recommendation.contextSummary ? <span>{recommendation.contextSummary}</span> : null}
                          {recommendation.costSummary ? <span>{recommendation.costSummary}</span> : null}
                          {recommendation.liveVerified ? <span>Live verified</span> : null}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {editor.agentCreate.run.rejections.length > 0 ? (
                  <div className="routing-profiles-modal__section">
                    <div className="routing-profiles-modal__section-title">Rejected alternatives</div>
                    <div className="routing-profiles-modal__recommendations">
                      {editor.agentCreate.run.rejections.map((rejection) => (
                        <div key={rejection.modelId} className="routing-profiles-modal__recommendation">
                          <div className="routing-profiles-modal__recommendation-title">
                            <strong>{rejection.modelName}</strong>
                          </div>
                          <div className="routing-profiles-modal__recommendation-copy">{rejection.reason}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}

                {editor.agentCreate.run.sources.length > 0 ? (
                  <div className="routing-profiles-modal__section">
                    <div className="routing-profiles-modal__section-title">Sources</div>
                    <div className="routing-profiles-modal__sources">
                      {editor.agentCreate.run.sources.map((source) => (
                        <a key={`${source.label}:${source.url}`} href={source.url} target="_blank" rel="noreferrer">
                          {source.label}
                        </a>
                      ))}
                    </div>
                  </div>
                ) : null}
              </>
            ) : null}
          </div>
          <div className="routing-profiles-modal__actions">
            <button className="btn btn--secondary" type="button" onClick={editor.closeAgentCreate}>
              {editor.agentCreate.run?.status === "completed" ? "Close" : "Cancel"}
            </button>
            {!editor.agentCreate.run ? (
              <button className="btn btn--primary" type="button" onClick={editor.createProfileWithAgent}>
                Start research
              </button>
            ) : null}
            {editor.agentCreate.run?.status === "completed" ? (
              <button className="btn btn--primary" type="button" onClick={editor.applyAgentDraft}>
                Apply draft
              </button>
            ) : null}
          </div>
        </ModalShell>
      ) : null}

      {editor.presetRefresh.open && presetRefreshProfile && presetRefreshPreset ? (
        <ModalShell
          title="Refresh preset profile"
          description="Replace this profile with the latest built-in preset version for your configured gateway."
          onClose={editor.closePresetRefresh}
        >
          <div className="routing-profiles-modal__body">
            <div className="routing-profiles-modal__warning">
              Refresh will overwrite the current profile configuration. Custom model choices, router model, fallback model, and routing instructions will be replaced.
            </div>
            <div className="routing-profiles-modal__hint">
              <span className="routing-profiles-modal__hint-dot">•</span>
              <span>
                Profile ID <code>{presetRefreshProfile.id}</code> stays the same so API calls keep working.
              </span>
            </div>
            <div className="routing-profiles-modal__hint">
              <span className="routing-profiles-modal__hint-dot">•</span>
              <span>
                Refreshing from <strong>{presetRefreshPreset.name}</strong> applies the latest preset definition and removes manual edits on this profile.
              </span>
            </div>
          </div>
          <div className="routing-profiles-modal__actions">
            <button className="btn btn--secondary" type="button" onClick={editor.closePresetRefresh}>Cancel</button>
            <button className="btn btn--danger" type="button" onClick={editor.confirmPresetRefresh}>Refresh profile</button>
          </div>
        </ModalShell>
      ) : null}

      {editor.modelEditor.open ? (
        <ModalShell
          title={editor.modelEditor.rowIndex === null ? "Add synced model" : "Edit model"}
          description="Choose a synced gateway model and optionally override its profile-facing metadata."
          onClose={editor.closeModelEditor}
        >
          <div className="routing-profiles-modal__body">
            {editor.modelEditor.error ? (
              <div className="routing-profiles-modal__error">{editor.modelEditor.error}</div>
            ) : null}
            <div className="routing-profiles-modal__grid">
              <label className="form-group">
                <span className="form-label">Gateway</span>
                <select
                  className="input"
                  value={editor.modelEditor.draft.gatewayId}
                  onChange={(event) => {
                    const nextGatewayId = event.target.value;
                    const nextGateway = props.gateways.find((gateway) => gateway.id === nextGatewayId);
                    const nextProfile = modelEditorProfile ?? { id: "", name: "", models: [] };
                    const nextOptions = availableGatewayModels(nextGateway, nextProfile, editor.modelEditor.rowIndex ?? undefined);
                    const matchingModel = nextOptions.find((model) => model.id === editor.modelEditor.draft.modelId);
                    const fallbackModel = matchingModel ?? nextOptions[0];
                    editor.setModelEditor((current) => ({
                      ...current,
                      error: null,
                      draft: {
                        ...current.draft,
                        gatewayId: nextGatewayId,
                        modelId: fallbackModel?.id ?? "",
                        name: current.draft.name || fallbackModel?.name || "",
                        modality: current.draft.modality || fallbackModel?.modality || current.draft.modality,
                        reasoningPreset: current.draft.reasoningPreset ?? fallbackModel?.reasoningPreset ?? fallbackModel?.thinking ?? "provider_default",
                        whenToUse: current.draft.whenToUse || fallbackModel?.whenToUse || "",
                        description: current.draft.description || fallbackModel?.description || "",
                      },
                    }));
                  }}
                >
                  <option value="">Select a gateway</option>
                  {props.gateways.map((gateway) => (
                    <option key={gateway.id} value={gateway.id}>{gateway.name}</option>
                  ))}
                </select>
              </label>
              <label className="form-group">
                <span className="form-label">Gateway model</span>
                <SearchableSelect
                  options={searchableModelOptions}
                  value={editor.modelEditor.draft.modelId}
                  onChange={(value) => {
                    const selectedModel = modelOptions.find((model) => model.id === value);
                    editor.setModelEditor((current) => ({
                      ...current,
                      error: null,
                      draft: {
                        ...current.draft,
                        modelId: value,
                        name: current.draft.name || selectedModel?.name || "",
                        modality: current.draft.modality || selectedModel?.modality || current.draft.modality,
                        reasoningPreset: current.draft.reasoningPreset ?? selectedModel?.reasoningPreset ?? selectedModel?.thinking ?? "provider_default",
                        whenToUse: current.draft.whenToUse || selectedModel?.whenToUse || "",
                        description: current.draft.description || selectedModel?.description || "",
                      },
                    }));
                  }}
                  placeholder="Search gateway models..."
                />
              </label>
            </div>

            <label className="form-group">
              <span className="form-label">Profile label</span>
              <input
                className="input"
                value={editor.modelEditor.draft.name}
                onChange={(event) => editor.setModelEditor((current) => ({
                  ...current,
                  draft: { ...current.draft, name: event.target.value },
                  error: null,
                }))}
                placeholder="Optional label override"
              />
            </label>

            <details className="routing-profiles-modal__details">
              <summary>Advanced overrides</summary>
              <div className="routing-profiles-modal__details-body">
                <div className="routing-profiles-modal__grid">
                  <label className="form-group">
                    <span className="form-label">Reasoning preset</span>
                    <select
                      className="input"
                      value={editor.modelEditor.draft.reasoningPreset}
                      onChange={(event) => editor.setModelEditor((current) => ({
                        ...current,
                        draft: {
                          ...current.draft,
                          reasoningPreset: event.target.value as NonNullable<GatewayInfo["models"][number]["reasoningPreset"]>,
                        },
                      }))}
                    >
                      {REASONING_PRESET_SELECT_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>{option.label}</option>
                      ))}
                    </select>
                    <span className="form-hint">{REASONING_PRESET_FIELD_HINT}</span>
                  </label>
                  <label className="form-group">
                    <span className="form-label">Modality</span>
                    <select
                      className="input"
                      value={editor.modelEditor.draft.modality}
                      onChange={(event) => editor.setModelEditor((current) => ({
                        ...current,
                        draft: { ...current.draft, modality: event.target.value },
                      }))}
                    >
                      <option value="">Use gateway modality</option>
                      {availableModalities.map((modality) => (
                        <option key={modality} value={modality}>{modality}</option>
                      ))}
                    </select>
                  </label>
                </div>
                <label className="form-group">
                  <span className="form-label">When to use</span>
                  <input
                    className="input"
                    value={editor.modelEditor.draft.whenToUse}
                    onChange={(event) => editor.setModelEditor((current) => ({
                      ...current,
                      draft: { ...current.draft, whenToUse: event.target.value },
                    }))}
                    placeholder="Optional routing hint"
                  />
                </label>
                <label className="form-group">
                  <span className="form-label">Description</span>
                  <textarea
                    className="textarea"
                    rows={3}
                    value={editor.modelEditor.draft.description}
                    onChange={(event) => editor.setModelEditor((current) => ({
                      ...current,
                      draft: { ...current.draft, description: event.target.value },
                    }))}
                  />
                </label>
              </div>
            </details>
          </div>
          <div className="routing-profiles-modal__actions">
            <button className="btn btn--secondary" type="button" onClick={editor.closeModelEditor}>Cancel</button>
            <button className="btn btn--primary" type="button" onClick={editor.saveModelEditor}>Save model</button>
          </div>
        </ModalShell>
      ) : null}

      {editor.customModel.open ? (
        <ModalShell
          title="Create custom model"
          description="Add a model to a gateway (sync or manual), then attach it to this routing profile."
          onClose={editor.closeCustomModel}
        >
          <div className="routing-profiles-modal__body">
            {editor.customModel.error ? (
              <div className="routing-profiles-modal__error">{editor.customModel.error}</div>
            ) : null}
            <div className="routing-profiles-modal__grid">
              <label className="form-group">
                <span className="form-label">Gateway</span>
                <select
                  className="input"
                  value={editor.customModel.draft.gatewayId}
                  onChange={(event) => editor.setCustomModel((current) => ({
                    ...current,
                    draft: { ...current.draft, gatewayId: event.target.value },
                    error: null,
                  }))}
                >
                  <option value="">Select a gateway</option>
                  {props.gateways.map((gateway) => (
                    <option key={gateway.id} value={gateway.id}>{gateway.name}</option>
                  ))}
                </select>
              </label>
              <label className="form-group">
                <span className="form-label">Model ID</span>
                <input
                  className="input input--mono"
                  value={editor.customModel.draft.modelId}
                  onChange={(event) => editor.setCustomModel((current) => ({
                    ...current,
                    draft: { ...current.draft, modelId: event.target.value },
                    error: null,
                  }))}
                  placeholder="provider/model-id"
                />
              </label>
            </div>
            <label className="form-group">
              <span className="form-label">Display name</span>
              <input
                className="input"
                value={editor.customModel.draft.name}
                onChange={(event) => editor.setCustomModel((current) => ({
                  ...current,
                  draft: { ...current.draft, name: event.target.value },
                }))}
              />
            </label>
            <div className="routing-profiles-modal__grid">
              <label className="form-group">
                <span className="form-label">Modality</span>
                <select
                  className="input"
                  value={editor.customModel.draft.modality}
                  onChange={(event) => editor.setCustomModel((current) => ({
                    ...current,
                    draft: { ...current.draft, modality: event.target.value },
                  }))}
                >
                  {availableModalities.map((modality) => (
                    <option key={modality} value={modality}>{modality}</option>
                  ))}
                </select>
              </label>
              <label className="form-group">
                <span className="form-label">Reasoning preset</span>
                <select
                  className="input"
                  value={editor.customModel.draft.reasoningPreset}
                  onChange={(event) => editor.setCustomModel((current) => ({
                    ...current,
                    draft: {
                      ...current.draft,
                      reasoningPreset: event.target.value as NonNullable<GatewayInfo["models"][number]["reasoningPreset"]>,
                    },
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
                value={editor.customModel.draft.whenToUse}
                onChange={(event) => editor.setCustomModel((current) => ({
                  ...current,
                  draft: { ...current.draft, whenToUse: event.target.value },
                }))}
              />
            </label>
            <label className="form-group">
              <span className="form-label">Description</span>
              <textarea
                className="textarea"
                rows={3}
                value={editor.customModel.draft.description}
                onChange={(event) => editor.setCustomModel((current) => ({
                  ...current,
                  draft: { ...current.draft, description: event.target.value },
                }))}
              />
            </label>
          </div>
          <div className="routing-profiles-modal__actions">
            <button className="btn btn--secondary" type="button" onClick={editor.closeCustomModel}>Cancel</button>
            <button className="btn btn--primary" type="button" onClick={() => void editor.saveCustomModel()} disabled={editor.customModel.saving}>
              {editor.customModel.saving ? "Saving..." : "Create model"}
            </button>
          </div>
        </ModalShell>
      ) : null}

      {editor.advancedEditor.open ? (
        <ModalShell
          title="Advanced profile JSON"
          description="Inspect and edit the raw JSON for this routing profile. This is intended for experimentation."
          onClose={editor.closeAdvancedEditor}
        >
          <div className="routing-profiles-modal__body">
            {editor.advancedEditor.error ? (
              <div className="routing-profiles-modal__error">{editor.advancedEditor.error}</div>
            ) : null}
            <label className="form-group">
              <span className="form-label">Profile JSON</span>
              <AutoGrowTextarea
                className="textarea input--mono"
                minHeight={360}
                rows={16}
                value={editor.advancedEditor.draft}
                onChange={(event) => editor.setAdvancedEditor((current) => ({
                  ...current,
                  draft: event.target.value,
                  error: null,
                }))}
                placeholder="{\n  &quot;id&quot;: &quot;profile-id&quot;,\n  &quot;name&quot;: &quot;Profile Name&quot;\n}"
              />
              <span className="form-hint">Save applies only to this profile and still runs the normal profile validation before autosave.</span>
            </label>
          </div>
          <div className="routing-profiles-modal__actions">
            <button className="btn btn--secondary" type="button" onClick={editor.closeAdvancedEditor}>Cancel</button>
            <button className="btn btn--primary" type="button" onClick={editor.saveAdvancedEditor}>Apply JSON</button>
          </div>
        </ModalShell>
      ) : null}
    </div>
  );
}

function createQuickSetupPreview(preset: RoutingPreset | undefined, gateways: GatewayInfo[]) {
  if (!preset) {
    return null;
  }

  return createProfileFromPreset(preset, gateways);
}
