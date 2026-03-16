"use client";

import { startTransition, useEffect, useRef, useState } from "react";
import type { RouterProfile, RouterProfileModel } from "@custom-router/core";

import { createAutosaveQueue } from "@/src/features/routing/profiles-autosave";
import {
  buildProfileModelKey,
  hasResolvedProfileModel,
  normalizeProfileIdInput,
  getProfileIdValidationError,
} from "@/src/lib/routing/profile-config";
import type { GatewayInfo, GatewayModel } from "@/src/features/gateways/contracts";
import {
  createBlankProfile,
  createCustomModelDraft,
  createProfileFromPreset,
  DEFAULT_AUTOSAVE_SNAPSHOT,
  formatGatewayModelOptionLabel,
  getGatewayModel,
  getQuickSetupPresets,
  normalizeProfilesForEditor,
  sanitizeProfileSelections,
  syncProfileModelFromGateway,
  type CustomModelDraft,
  type ProfilesAutosaveSnapshot,
  validateProfilesDraft,
} from "@/src/features/routing/profiles-editor-utils";
import type { RoutingPreset } from "@/src/lib/routing-presets";

export interface RoutingProfilesEditorProps {
  profiles: RouterProfile[] | null;
  gateways: GatewayInfo[];
  onChange: (updated: RouterProfile[]) => void;
  onSave: (profiles: RouterProfile[]) => Promise<boolean>;
  saveState?: "pristine" | "dirty" | "saving" | "saved";
  routingConfigRequiresReset?: boolean;
  routingConfigResetMessage?: string | null;
  onResetLegacyConfig?: () => Promise<void>;
  onCreateGatewayModel?: (gatewayId: string, model: GatewayModel) => Promise<GatewayModel | null>;
}

interface QuickSetupState {
  displayName: string;
  error: string | null;
  open: boolean;
  profileId: string;
  selectedPresetId: string;
}

interface CreateProfileState {
  displayName: string;
  error: string | null;
  open: boolean;
  profileId: string;
}

interface ModelEditorState {
  draft: CustomModelDraft;
  error: string | null;
  open: boolean;
  profileId: string | null;
  rowIndex: number | null;
}

interface CustomModelState {
  draft: CustomModelDraft;
  error: string | null;
  open: boolean;
  profileId: string | null;
  saving: boolean;
}

const INSTRUCTION_AUTOSAVE_DEBOUNCE_MS = 2400;

function createQuickSetupState(): QuickSetupState {
  const preset = getQuickSetupPresets()[0];
  return {
    open: false,
    selectedPresetId: preset?.id ?? "",
    profileId: normalizeProfileIdInput(preset?.id ?? ""),
    displayName: preset?.name ?? "",
    error: null,
  };
}

function createProfileState(): CreateProfileState {
  return {
    open: false,
    profileId: "",
    displayName: "",
    error: null,
  };
}

function createModelEditorState(gateways: GatewayInfo[]): ModelEditorState {
  return {
    open: false,
    profileId: null,
    rowIndex: null,
    error: null,
    draft: createCustomModelDraft(gateways),
  };
}

function createCustomModelState(gateways: GatewayInfo[]): CustomModelState {
  return {
    open: false,
    profileId: null,
    error: null,
    saving: false,
    draft: createCustomModelDraft(gateways),
  };
}

function createEditorDraftFromModel(gateways: GatewayInfo[], model?: RouterProfileModel): CustomModelDraft {
  const base = createCustomModelDraft(gateways);
  if (!model) {
    return base;
  }

  const gatewayModel = getGatewayModel(gateways, model.gatewayId, model.modelId);
  const reasoningPreset = model.reasoningPreset ?? model.thinking ?? gatewayModel?.reasoningPreset ?? gatewayModel?.thinking ?? "none";

  return {
    gatewayId: model.gatewayId ?? base.gatewayId,
    modelId: model.modelId,
    name: model.name ?? gatewayModel?.name ?? "",
    modality: model.modality ?? gatewayModel?.modality ?? base.modality,
    reasoningPreset,
    whenToUse: model.whenToUse ?? gatewayModel?.whenToUse ?? "",
    description: model.description ?? gatewayModel?.description ?? "",
  };
}

function buildModelFromDraft(gateways: GatewayInfo[], draft: CustomModelDraft): RouterProfileModel {
  return syncProfileModelFromGateway(gateways, {
    gatewayId: draft.gatewayId || undefined,
    modelId: draft.modelId.trim(),
    name: draft.name.trim() || undefined,
    modality: draft.modality.trim() || undefined,
    reasoningPreset: draft.reasoningPreset,
    thinking: draft.reasoningPreset,
    whenToUse: draft.whenToUse.trim() || undefined,
    description: draft.description.trim() || undefined,
  });
}

function nextGeneratedProfileId(existing: RouterProfile[]): string {
  let counter = existing.length + 1;
  let candidate = `profile-${counter}`;
  const existingIds = new Set(existing.map((profile) => profile.id));
  while (existingIds.has(candidate)) {
    counter += 1;
    candidate = `profile-${counter}`;
  }

  return candidate;
}

export function useRoutingProfilesEditor(props: RoutingProfilesEditorProps) {
  const items = normalizeProfilesForEditor(props.profiles, props.gateways);
  const presets = getQuickSetupPresets();
  const gatewaysRef = useRef(props.gateways);
  const onSaveRef = useRef(props.onSave);
  const mountedRef = useRef(true);
  const [expandedProfileId, setExpandedProfileId] = useState<string | null>(null);
  const [renameProfileId, setRenameProfileId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const [lastTouchedProfileId, setLastTouchedProfileId] = useState<string | null>(null);
  const [lastTouchedField, setLastTouchedField] = useState<"routingInstructions" | "profile" | "model" | null>(null);
  const [autosaveSnapshot, setAutosaveSnapshot] = useState<ProfilesAutosaveSnapshot>(DEFAULT_AUTOSAVE_SNAPSHOT);
  const [quickSetup, setQuickSetup] = useState<QuickSetupState>(createQuickSetupState);
  const [createProfile, setCreateProfile] = useState<CreateProfileState>(createProfileState);
  const [modelEditor, setModelEditor] = useState<ModelEditorState>(() => createModelEditorState(props.gateways));
  const [customModel, setCustomModel] = useState<CustomModelState>(() => createCustomModelState(props.gateways));
  const autosaveQueueRef = useRef(
    createAutosaveQueue<RouterProfile[]>({
      debounceMs: 900,
      validate: (profiles) => validateProfilesDraft(profiles, gatewaysRef.current),
      save: (profiles) => onSaveRef.current(profiles),
      onSnapshot: (snapshot) => {
        if (mountedRef.current) {
          setAutosaveSnapshot(snapshot);
        }
      },
    }),
  );

  gatewaysRef.current = props.gateways;
  onSaveRef.current = props.onSave;

  useEffect(() => {
    return () => {
      mountedRef.current = false;
      void autosaveQueueRef.current.dispose({ flushPending: true });
    };
  }, []);

  useEffect(() => {
    if (expandedProfileId && !items.some((profile) => profile.id === expandedProfileId)) {
      setExpandedProfileId(null);
    }
  }, [expandedProfileId, items]);

  function commitProfiles(nextProfiles: RouterProfile[], args?: {
    autosaveDebounceMs?: number;
    expandProfileId?: string | null;
    touchedField?: "routingInstructions" | "profile" | "model";
    touchedProfileId?: string | null;
  }) {
    const normalized = normalizeProfilesForEditor(nextProfiles, props.gateways);
    if (typeof args?.expandProfileId !== "undefined") {
      setExpandedProfileId(args.expandProfileId);
    }
    if (typeof args?.touchedProfileId !== "undefined") {
      setLastTouchedProfileId(args.touchedProfileId);
    }
    if (typeof args?.touchedField !== "undefined") {
      setLastTouchedField(args.touchedField);
    }

    startTransition(() => {
      props.onChange(normalized);
    });
    autosaveQueueRef.current.update(normalized, {
      debounceMs: args?.autosaveDebounceMs,
    });
  }

  function updateProfile(profileId: string, mutate: (profile: RouterProfile) => RouterProfile, args?: {
    autosaveDebounceMs?: number;
    touchedField?: "routingInstructions" | "profile" | "model";
  }) {
    const nextProfiles = items.map((profile) => {
      if (profile.id !== profileId) {
        return profile;
      }

      return sanitizeProfileSelections(mutate(profile), props.gateways);
    });
    commitProfiles(nextProfiles, {
      autosaveDebounceMs: args?.autosaveDebounceMs,
      expandProfileId: profileId,
      touchedField: args?.touchedField ?? "profile",
      touchedProfileId: profileId,
    });
  }

  function removeProfile(profileId: string) {
    commitProfiles(
      items.filter((profile) => profile.id !== profileId),
      {
        expandProfileId: expandedProfileId === profileId ? null : expandedProfileId,
        touchedField: "profile",
        touchedProfileId: null,
      },
    );
  }

  function toggleProfile(profileId: string) {
    setExpandedProfileId((current) => current === profileId ? null : profileId);
  }

  function openQuickSetup() {
    const preset = presets[0];
    setQuickSetup({
      open: true,
      selectedPresetId: preset?.id ?? "",
      profileId: preset?.id ?? "",
      displayName: preset?.name ?? "",
      error: null,
    });
  }

  function closeQuickSetup() {
    setQuickSetup((current) => ({ ...current, open: false, error: null }));
  }

  function updateQuickSetupPreset(selectedPresetId: string) {
    const preset = presets.find((entry) => entry.id === selectedPresetId);
    setQuickSetup((current) => ({
      ...current,
      selectedPresetId,
      profileId: normalizeProfileIdInput(preset?.id ?? current.profileId),
      displayName: preset?.name ?? current.displayName,
      error: null,
    }));
  }

  function updateQuickSetupProfileId(value: string) {
    setQuickSetup((current) => ({
      ...current,
      profileId: normalizeProfileIdInput(value),
      error: null,
    }));
  }

  function createProfileFromQuickSetup() {
    const preset = presets.find((entry) => entry.id === quickSetup.selectedPresetId);
    if (!preset) {
      setQuickSetup((current) => ({ ...current, error: "Select a template first." }));
      return;
    }

    const profileId = normalizeProfileIdInput(quickSetup.profileId);
    const displayName = quickSetup.displayName.trim();
    const existingIds = new Set(items.map((profile) => profile.id));

    const profileIdError = getProfileIdValidationError(profileId);
    if (profileIdError) {
      setQuickSetup((current) => ({ ...current, profileId, error: profileIdError }));
      return;
    }
    if (existingIds.has(profileId)) {
      setQuickSetup((current) => ({ ...current, error: `Profile ID "${profileId}" already exists.` }));
      return;
    }
    if (!displayName) {
      setQuickSetup((current) => ({ ...current, error: "Display name is required." }));
      return;
    }

    const nextProfile = {
      ...createProfileFromPreset(preset, props.gateways),
      id: profileId,
      name: displayName,
    };

    closeQuickSetup();
    commitProfiles([...items, nextProfile], {
      expandProfileId: nextProfile.id,
      touchedField: "profile",
      touchedProfileId: nextProfile.id,
    });
  }

  function openCreateProfile() {
    setCreateProfile({
      open: true,
      profileId: nextGeneratedProfileId(items),
      displayName: "",
      error: null,
    });
  }

  function closeCreateProfile() {
    setCreateProfile((current) => ({ ...current, open: false, error: null }));
  }

  function updateCreateProfileId(value: string) {
    setCreateProfile((current) => ({
      ...current,
      profileId: normalizeProfileIdInput(value),
      error: null,
    }));
  }

  function createEmptyProfile() {
    const profileId = normalizeProfileIdInput(createProfile.profileId);
    const displayName = createProfile.displayName.trim();
    const existingIds = new Set(items.map((profile) => profile.id));

    const profileIdError = getProfileIdValidationError(profileId);
    if (profileIdError) {
      setCreateProfile((current) => ({ ...current, profileId, error: profileIdError }));
      return;
    }
    if (existingIds.has(profileId)) {
      setCreateProfile((current) => ({ ...current, error: `Profile ID "${profileId}" already exists.` }));
      return;
    }
    if (!displayName) {
      setCreateProfile((current) => ({ ...current, error: "Display name is required." }));
      return;
    }

    const nextProfile = createBlankProfile({
      id: profileId,
      name: displayName,
    });

    closeCreateProfile();
    commitProfiles([...items, nextProfile], {
      expandProfileId: nextProfile.id,
      touchedField: "profile",
      touchedProfileId: nextProfile.id,
    });
  }

  function beginRename(profileId: string, currentName: string) {
    setRenameProfileId(profileId);
    setRenameDraft(currentName);
  }

  function cancelRename() {
    setRenameProfileId(null);
    setRenameDraft("");
  }

  function commitRename(profileId: string) {
    const nextName = renameDraft.trim();
    const currentProfile = items.find((profile) => profile.id === profileId);
    cancelRename();

    if (!currentProfile || !nextName || nextName === currentProfile.name) {
      return;
    }

    updateProfile(profileId, (profile) => ({ ...profile, name: nextName }), { touchedField: "profile" });
  }

  function openModelEditor(profileId: string, rowIndex: number | null) {
    const profile = items.find((entry) => entry.id === profileId);
    const model = rowIndex === null ? undefined : profile?.models?.[rowIndex];
    setModelEditor({
      open: true,
      profileId,
      rowIndex,
      error: null,
      draft: createEditorDraftFromModel(props.gateways, model),
    });
  }

  function closeModelEditor() {
    setModelEditor(createModelEditorState(props.gateways));
  }

  function saveModelEditor() {
    if (!modelEditor.profileId) {
      return;
    }

    const draft = modelEditor.draft;
    if (!draft.gatewayId) {
      setModelEditor((current) => ({ ...current, error: "Select a gateway." }));
      return;
    }
    if (!draft.modelId.trim()) {
      setModelEditor((current) => ({ ...current, error: "Select a gateway model." }));
      return;
    }

    const nextModel = buildModelFromDraft(props.gateways, draft);
    updateProfile(modelEditor.profileId, (profile) => {
      const nextModels = [...(profile.models ?? [])];
      if (modelEditor.rowIndex === null) {
        nextModels.push(nextModel);
      } else {
        nextModels[modelEditor.rowIndex] = nextModel;
      }

      return {
        ...profile,
        models: nextModels,
      };
    }, { touchedField: "model" });
    closeModelEditor();
  }

  function removeModel(profileId: string, rowIndex: number) {
    updateProfile(profileId, (profile) => {
      const nextModels = [...(profile.models ?? [])];
      nextModels.splice(rowIndex, 1);
      return {
        ...profile,
        models: nextModels,
      };
    }, { touchedField: "model" });
  }

  function openCustomModel(profileId: string) {
    setCustomModel({
      open: true,
      profileId,
      error: null,
      saving: false,
      draft: createCustomModelDraft(props.gateways),
    });
  }

  function closeCustomModel() {
    setCustomModel(createCustomModelState(props.gateways));
  }

  async function saveCustomModel() {
    if (!customModel.profileId) {
      return;
    }
    if (!props.onCreateGatewayModel) {
      setCustomModel((current) => ({ ...current, error: "Custom model creation is unavailable in this environment." }));
      return;
    }
    if (!customModel.draft.gatewayId) {
      setCustomModel((current) => ({ ...current, error: "Select a gateway." }));
      return;
    }
    if (!customModel.draft.modelId.trim()) {
      setCustomModel((current) => ({ ...current, error: "Model ID is required." }));
      return;
    }

    setCustomModel((current) => ({ ...current, saving: true, error: null }));
    try {
      const createdModel = await props.onCreateGatewayModel(customModel.draft.gatewayId, {
        id: customModel.draft.modelId.trim(),
        name: customModel.draft.name.trim() || customModel.draft.modelId.trim(),
        modality: customModel.draft.modality.trim() || undefined,
        reasoningPreset: customModel.draft.reasoningPreset,
        thinking: customModel.draft.reasoningPreset,
        whenToUse: customModel.draft.whenToUse.trim() || undefined,
        description: customModel.draft.description.trim() || undefined,
      });

      if (!createdModel) {
        setCustomModel((current) => ({
          ...current,
          saving: false,
          error: "Failed to create the gateway model.",
        }));
        return;
      }

      updateProfile(customModel.profileId, (profile) => ({
        ...profile,
        models: [
          ...(profile.models ?? []),
          {
            gatewayId: customModel.draft.gatewayId,
            modelId: createdModel.id,
            name: createdModel.name,
            modality: createdModel.modality,
            reasoningPreset: createdModel.reasoningPreset ?? createdModel.thinking,
            thinking: createdModel.reasoningPreset ?? createdModel.thinking,
            whenToUse: createdModel.whenToUse,
            description: createdModel.description,
          },
        ],
      }), { touchedField: "model" });
      closeCustomModel();
    } finally {
      setCustomModel((current) => ({ ...current, saving: false }));
    }
  }

  function updateRoutingInstructions(profileId: string, value: string) {
    updateProfile(profileId, (profile) => ({
      ...profile,
      routingInstructions: value || undefined,
    }), {
      touchedField: "routingInstructions",
      autosaveDebounceMs: INSTRUCTION_AUTOSAVE_DEBOUNCE_MS,
    });
  }

  function updateDefaultModel(profileId: string, value: string) {
    updateProfile(profileId, (profile) => ({
      ...profile,
      defaultModel: value || undefined,
    }), { touchedField: "profile" });
  }

  function updateClassifierModel(profileId: string, value: string) {
    updateProfile(profileId, (profile) => ({
      ...profile,
      classifierModel: value || undefined,
    }), { touchedField: "profile" });
  }

  function getQuickSetupPreset(): RoutingPreset | undefined {
    return presets.find((preset) => preset.id === quickSetup.selectedPresetId);
  }

  function getInstructionStatus(profileId: string): { label: string; tone: "neutral" | "success" | "warning" | "danger" } {
    const isTarget = profileId === lastTouchedProfileId && lastTouchedField === "routingInstructions";
    if (!isTarget) {
      return { label: "Saved", tone: "neutral" };
    }

    if (autosaveSnapshot.state === "saving") {
      return { label: "Saving...", tone: "neutral" };
    }
    if (autosaveSnapshot.state === "dirty") {
      return { label: "Pending", tone: "neutral" };
    }
    if (autosaveSnapshot.state === "invalid") {
      return { label: "Fix errors to save", tone: "warning" };
    }
    if (autosaveSnapshot.state === "error") {
      return { label: "Save failed", tone: "danger" };
    }

    return { label: "Saved", tone: "success" };
  }

  return {
    autosaveSnapshot,
    createEmptyProfile,
    createProfile,
    createProfileFromQuickSetup,
    customModel,
    closeCreateProfile,
    closeCustomModel,
    closeModelEditor,
    closeQuickSetup,
    commitRename,
    expandedProfileId,
    getInstructionStatus,
    getQuickSetupPreset,
    items,
    lastTouchedField,
    lastTouchedProfileId,
    modelEditor,
    openCreateProfile,
    openCustomModel,
    openModelEditor,
    openQuickSetup,
    panelMessage: autosaveSnapshot.state === "error" || autosaveSnapshot.state === "invalid" ? autosaveSnapshot.message : null,
    presets,
    quickSetup,
    removeModel,
    removeProfile,
    renameDraft,
    renameProfileId,
    saveCustomModel,
    saveModelEditor,
    setCreateProfile,
    setCustomModel,
    setExpandedProfileId,
    setModelEditor,
    setQuickSetup,
    setRenameDraft,
    setRenameProfileId,
    toggleProfile,
    updateClassifierModel,
    updateCreateProfileId,
    updateDefaultModel,
    updateQuickSetupPreset,
    updateQuickSetupProfileId,
    updateRoutingInstructions,
    beginRename,
    cancelRename,
    flushAutosave: () => autosaveQueueRef.current.flush(),
    formatGatewayModelOptionLabel,
    getGatewayModel,
  };
}
