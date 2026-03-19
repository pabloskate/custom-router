"use client";

import React, { useEffect, useRef } from "react";
import type { RouterProfile } from "@custom-router/core";

import {
  buildProfileModelKey,
  hasResolvedProfileModel,
} from "@/src/lib/routing/profile-config";
import type { GatewayInfo } from "@/src/features/gateways/contracts";
import {
  availableGatewayModels,
  countResolvedProfileModels,
  createProfileFromPreset,
  formatGatewayModelOptionLabel,
  gatewayName,
  getProfileStatus,
  summarizeInstructions,
} from "@/src/features/routing/profiles-editor-utils";
import type { RoutingPreset } from "@/src/lib/routing-presets";
import { SearchableSelect } from "@/src/components/ui/SearchableSelect";

import {
  type RoutingProfilesEditorProps,
  useRoutingProfilesEditor,
} from "./useRoutingProfilesEditor";

export type { RoutingProfilesEditorProps } from "./useRoutingProfilesEditor";

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
          <span className={`routing-profile-card__preview ${!profile.routingInstructions?.trim() ? "is-empty" : ""}`}>
            {summarizeInstructions(profile.routingInstructions)}
          </span>
          <span className="routing-profile-card__count">{(profile.models ?? []).length} models</span>
        </div>
        <div className="routing-profile-card__header-actions">
          {refreshPreset ? (
            <button
              className="btn btn--ghost btn--sm"
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
            className="btn btn--ghost btn--sm"
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

          <div className="routing-profile-card__footer">
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
          <button className="routing-profiles__ghost-button" type="button" onClick={editor.openCreateProfile}>
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
                <select
                  className="input input--mono"
                  value={editor.modelEditor.draft.modelId}
                  onChange={(event) => {
                    const selectedModel = modelOptions.find((model) => model.id === event.target.value);
                    editor.setModelEditor((current) => ({
                      ...current,
                      error: null,
                      draft: {
                        ...current.draft,
                        modelId: event.target.value,
                        name: current.draft.name || selectedModel?.name || "",
                        modality: current.draft.modality || selectedModel?.modality || current.draft.modality,
                        reasoningPreset: current.draft.reasoningPreset ?? selectedModel?.reasoningPreset ?? selectedModel?.thinking ?? "provider_default",
                        whenToUse: current.draft.whenToUse || selectedModel?.whenToUse || "",
                        description: current.draft.description || selectedModel?.description || "",
                      },
                    }));
                  }}
                >
                  <option value="">Select a gateway model</option>
                  {modelOptions.map((model) => (
                    <option key={model.id} value={model.id}>{model.id}</option>
                  ))}
                </select>
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
                      <option value="provider_default">Provider default</option>
                      <option value="none">None</option>
                      <option value="minimal">Minimal</option>
                      <option value="low">Low</option>
                      <option value="medium">Medium</option>
                      <option value="high">High</option>
                      <option value="xhigh">Extra high</option>
                    </select>
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
                  <option value="provider_default">Provider default</option>
                  <option value="none">None</option>
                  <option value="minimal">Minimal</option>
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                  <option value="xhigh">Extra high</option>
                </select>
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
