import React, { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { RoutingProfilesEditor } from "./RoutingProfilesEditor";
import { useRoutingProfilesEditor } from "./useRoutingProfilesEditor";

vi.mock("./useRoutingProfilesEditor", () => ({
  useRoutingProfilesEditor: vi.fn(),
}));

const mockUseRoutingProfilesEditor = vi.mocked(useRoutingProfilesEditor);

function createEditorMock(overrides: Record<string, unknown> = {}) {
  return {
    autosaveSnapshot: { state: "saved", message: null },
    createProfileChoice: { open: false },
    createProfile: { open: false, profileId: "profile-1", displayName: "", error: null },
    quickSetup: { open: false, selectedPresetId: "", profileId: "", displayName: "", error: null },
    agentCreate: {
      open: false,
      submitting: false,
      applying: false,
      error: null,
      request: {
        profileId: "agent-profile",
        displayName: "Agent Profile",
        optimizeFor: "balanced",
        taskFamilies: ["general", "coding"],
        needsVision: false,
        needsLongContext: false,
        latencySensitivity: "medium",
        budgetPosture: "balanced",
        preferredGatewayId: "gw_openrouter",
        mustUse: "",
        avoid: "",
        additionalContext: "",
      },
      run: null,
      editedProfileId: "",
      editedDisplayName: "",
      editedDescription: "",
      editedRoutingInstructions: "",
    },
    customModel: {
      open: false,
      profileId: null,
      error: null,
      saving: false,
      draft: { gatewayId: "", modelId: "", name: "", modality: "", reasoningPreset: "provider_default", whenToUse: "", description: "" },
    },
    advancedEditor: { open: false, profileId: null, draft: "", error: null },
    presetRefresh: { open: false, presetId: null, profileId: null },
    modelEditor: {
      open: false,
      profileId: null,
      rowIndex: null,
      error: null,
      draft: { gatewayId: "", modelId: "", name: "", modality: "", reasoningPreset: "provider_default", whenToUse: "", description: "" },
    },
    panelMessage: null,
    items: [],
    presets: [],
    profileBuilderGateways: [],
    profileBuilderUnavailableReason: null,
    expandedProfileId: null,
    renameProfileId: null,
    renameDraft: "",
    lastTouchedField: null,
    lastTouchedProfileId: null,
    getQuickSetupPreset: () => undefined,
    getMatchingPreset: () => undefined,
    getInstructionStatus: () => ({ label: "Saved", tone: "neutral" }),
    openQuickSetup: () => undefined,
    openCreateProfileChoice: () => undefined,
    closeCreateProfileChoice: () => undefined,
    closeQuickSetup: () => undefined,
    closeCreateProfile: () => undefined,
    closeAgentCreate: () => undefined,
    closePresetRefresh: () => undefined,
    closeModelEditor: () => undefined,
    closeCustomModel: () => undefined,
    closeAdvancedEditor: () => undefined,
    createProfileFromQuickSetup: () => undefined,
    createEmptyProfile: () => undefined,
    openCreateProfile: () => undefined,
    openAgentCreate: () => undefined,
    createProfileWithAgent: () => undefined,
    applyAgentDraft: () => undefined,
    importProfileFile: async () => undefined,
    exportProfileJson: () => undefined,
    openPresetRefresh: () => undefined,
    confirmPresetRefresh: () => undefined,
    openModelEditor: () => undefined,
    saveModelEditor: () => undefined,
    removeModel: () => undefined,
    openCustomModel: () => undefined,
    saveCustomModel: () => undefined,
    openAdvancedEditor: () => undefined,
    saveAdvancedEditor: () => undefined,
    removeProfile: () => undefined,
    toggleProfile: () => undefined,
    updateQuickSetupPreset: () => undefined,
    updateQuickSetupProfileId: () => undefined,
    updateCreateProfileId: () => undefined,
    updateAgentRequest: () => undefined,
    toggleAgentTaskFamily: () => undefined,
    updateRoutingInstructions: () => undefined,
    updateDefaultModel: () => undefined,
    updateClassifierModel: () => undefined,
    beginRename: () => undefined,
    cancelRename: () => undefined,
    commitRename: () => undefined,
    saveCustomModelFromGateway: () => undefined,
    flushAutosave: () => Promise.resolve(),
    setQuickSetup: () => undefined,
    setCreateProfile: () => undefined,
    setAgentCreate: () => undefined,
    setModelEditor: () => undefined,
    setCustomModel: () => undefined,
    setAdvancedEditor: () => undefined,
    setExpandedProfileId: () => undefined,
    setRenameDraft: () => undefined,
    setRenameProfileId: () => undefined,
    formatGatewayModelOptionLabel: () => "",
    getGatewayModel: () => undefined,
    ...overrides,
  } as any;
}

describe("RoutingProfilesEditor", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the add-profile choice sheet with manual and coming-soon agent option", () => {
    mockUseRoutingProfilesEditor.mockReturnValue(createEditorMock({
      createProfileChoice: { open: true },
    }));

    const markup = renderToStaticMarkup(
      createElement(RoutingProfilesEditor, {
        profiles: [],
        gateways: [],
        onChange: () => undefined,
        onSave: async () => true,
      }),
    );

    expect(markup).toContain("Manual");
    expect(markup).toContain("Coming soon");
    expect(markup).toContain("With agent:");
  });

  it("renders import and export JSON actions", () => {
    mockUseRoutingProfilesEditor.mockReturnValue(createEditorMock({
      items: [
        {
          id: "team-router",
          name: "Team Router",
          routingInstructions: "Route carefully.",
          models: [],
        },
      ],
      expandedProfileId: "team-router",
    }));

    const markup = renderToStaticMarkup(
      createElement(RoutingProfilesEditor, {
        profiles: [],
        gateways: [],
        onChange: () => undefined,
        onSave: async () => true,
      }),
    );

    expect(markup).toContain("Import JSON");
    expect(markup).toContain("Export JSON");
  });

  it("renders a completed agent draft preview without adding it to the profile list", () => {
    mockUseRoutingProfilesEditor.mockReturnValue(createEditorMock({
      agentCreate: {
        open: true,
        submitting: false,
        applying: false,
        error: null,
        request: {
          profileId: "agent-profile",
          displayName: "Agent Profile",
          optimizeFor: "balanced",
          taskFamilies: ["general", "coding"],
          needsVision: false,
          needsLongContext: false,
          latencySensitivity: "medium",
          budgetPosture: "balanced",
          preferredGatewayId: "gw_openrouter",
          mustUse: "",
          avoid: "",
          additionalContext: "",
        },
        run: {
          id: "run_1",
          status: "completed",
          request: {
            profileId: "agent-profile",
            displayName: "Agent Profile",
            optimizeFor: "balanced",
            taskFamilies: ["general", "coding"],
            needsVision: false,
            needsLongContext: false,
            latencySensitivity: "medium",
            budgetPosture: "balanced",
            preferredGatewayId: "gw_openrouter",
            mustUse: "",
            avoid: "",
            additionalContext: "",
          },
          executor: {
            gatewayId: "gw_openrouter",
            gatewayName: "OpenRouter",
            gatewayPresetId: "openrouter",
            modelId: "openai/gpt-5.4-mini",
            modelName: "GPT-5.4 mini",
          },
          draftProfile: {
            id: "agent-profile",
            name: "Agent Profile",
            description: "Draft summary",
            routingInstructions: "Route carefully.",
            models: [],
          },
          recommendations: [
            {
              gatewayId: "gw_openrouter",
              modelId: "openai/gpt-5.4-mini",
              modelName: "GPT-5.4 mini",
              roleLabel: "Primary default",
              rationale: "Balanced default.",
              score: 12,
              liveVerified: true,
              contextSummary: "400K context",
              costSummary: "$0.75/$4.50 per 1M tokens",
            },
          ],
          rejections: [],
          sources: [{ label: "OpenAI API pricing", url: "https://openai.com/api/pricing/", verifiedAt: "2026-03-19" }],
          researchMode: "live_verified",
          summary: "Draft summary",
          createdAt: "2026-03-19T00:00:00.000Z",
          updatedAt: "2026-03-19T00:00:01.000Z",
          finishedAt: "2026-03-19T00:00:01.000Z",
        },
        editedProfileId: "agent-profile",
        editedDisplayName: "Agent Profile",
        editedDescription: "Draft summary",
        editedRoutingInstructions: "Route carefully.",
      },
    }));

    const markup = renderToStaticMarkup(
      createElement(RoutingProfilesEditor, {
        profiles: [],
        gateways: [],
        onChange: () => undefined,
        onSave: async () => true,
      }),
    );

    expect(markup).toContain("Apply draft");
    expect(markup).toContain("GPT-5.4 mini");
    expect(markup).toContain("Draft summary");
    expect(markup).toContain("No routing profiles yet");
  });

  it("renders a freeform additional context field in the agent intake", () => {
    const base = createEditorMock();
    mockUseRoutingProfilesEditor.mockReturnValue(createEditorMock({
      agentCreate: {
        ...base.agentCreate,
        open: true,
      },
    }));

    const markup = renderToStaticMarkup(
      createElement(RoutingProfilesEditor, {
        profiles: [],
        gateways: [],
        onChange: () => undefined,
        onSave: async () => true,
      }),
    );

    expect(markup).toContain("Additional context");
    expect(markup).toContain("Freeform notes for the agent building this draft.");
  });

  it("renders a searchable gateway model picker in the synced-model modal", () => {
    mockUseRoutingProfilesEditor.mockReturnValue(createEditorMock({
      items: [
        {
          id: "team-router",
          name: "Team Router",
          models: [],
        },
      ],
      modelEditor: {
        open: true,
        profileId: "team-router",
        rowIndex: null,
        error: null,
        draft: {
          gatewayId: "gw_openrouter",
          modelId: "openai/gpt-5.4-mini",
          name: "",
          modality: "",
          reasoningPreset: "provider_default",
          whenToUse: "",
          description: "",
        },
      },
    }));

    const markup = renderToStaticMarkup(
      createElement(RoutingProfilesEditor, {
        profiles: [],
        gateways: [
          {
            id: "gw_openrouter",
            name: "OpenRouter",
            baseUrl: "https://openrouter.ai/api/v1",
            createdAt: "2026-03-20T00:00:00.000Z",
            updatedAt: "2026-03-20T00:00:00.000Z",
            models: [
              {
                id: "openai/gpt-5.4-mini",
                name: "GPT-5.4 mini",
                modality: "text->text",
              },
            ],
          },
        ],
        onChange: () => undefined,
        onSave: async () => true,
      }),
    );

    expect(markup).not.toContain("Select a gateway model");
    expect(markup).toContain("GPT-5.4 mini");
    expect(markup).toContain("openai/gpt-5.4-mini");
    expect(markup).toContain("Provider default (omit reasoning param)");
    expect(markup).toContain("Explicit off (reasoning.effort = none)");
  });
});
