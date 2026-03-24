import { Children, isValidElement, type ReactElement } from "react";
import { describe, expect, it, vi } from "vitest";

import { getAdminExtensionTabs } from "./admin-extensions";
import { getInitialAdminTabId, groupAdminTabsBySection, mergeAdminTabs } from "./admin-tab-registry";
import { getBaseAdminTabs } from "./admin-tabs";
import { type AdminExtensionContext, type UserInfo } from "./types";
import { LogsPanelWithState } from "@/src/features/routing-logs/LogsPanel";

const TEST_USER: UserInfo = {
  id: "user_123",
  name: "Test User",
  email: "test@example.com",
  preferredModels: [],
  customCatalog: null,
  profiles: null,
  routeTriggerKeywords: null,
  routingFrequency: null,
  routeLoggingEnabled: false,
  routingConfigRequiresReset: false,
  routingConfigResetMessage: null,
};

function createBaseTabs(registrationMode: "open" | "closed" | "invite" = "closed") {
  return getBaseAdminTabs({
    setUser: () => undefined,
    keys: [],
    gateways: [],
    reloadData: async () => undefined,
    setStatus: () => undefined,
    setError: () => undefined,
    saveUserData: async () => true,
    reroutingDraftState: "pristine",
    profilesDraftState: "pristine",
    markReroutingDirty: () => undefined,
    markProfilesDirty: () => undefined,
    saveReroutingData: async () => true,
    saveProfilesData: async () => true,
    registrationMode,
  });
}

function createAdminContext(overrides: Partial<AdminExtensionContext> = {}): AdminExtensionContext {
  return {
    user: TEST_USER,
    reloadData: async () => undefined,
    setStatus: () => undefined,
    setError: () => undefined,
    saveUserData: async () => true,
    reroutingDraftState: "pristine",
    profilesDraftState: "pristine",
    markReroutingDirty: () => undefined,
    markProfilesDirty: () => undefined,
    saveReroutingData: async () => true,
    saveProfilesData: async () => true,
    ...overrides,
  };
}

describe("admin tab registry", () => {
  it("hides the invite tab unless registration mode is invite", () => {
    const tabs = createBaseTabs();

    expect(tabs.map((tab) => tab.id)).toEqual([
      "gateways",
      "routing",
      "keys",
      "quickstart",
      "playground",
      "logs",
      "account",
    ]);
  });

  it("includes the invite tab when registration mode is invite", () => {
    const tabs = createBaseTabs("invite");

    expect(tabs.map((tab) => tab.id)).toEqual([
      "gateways",
      "routing",
      "keys",
      "quickstart",
      "playground",
      "logs",
      "invites",
      "account",
    ]);
  });

  it("defaults to no OSS admin extensions", () => {
    expect(getAdminExtensionTabs()).toEqual([]);
  });

  it("merges tabs into the expected sections and preserves the default tab", () => {
    const tabs = mergeAdminTabs(createBaseTabs("invite"), getAdminExtensionTabs());
    const groups = groupAdminTabsBySection(tabs);

    expect(groups.configure.map((tab) => tab.id)).toEqual(["gateways", "routing"]);
    expect(groups.use.map((tab) => tab.id)).toEqual(["keys", "quickstart", "playground", "logs"]);
    expect(groups.account.map((tab) => tab.id)).toEqual(["invites", "account"]);
    expect(getInitialAdminTabId(tabs, "gateways")).toBe("gateways");
  });

  it("wires the logs tab toggle through user settings", async () => {
    const saveUserData = vi.fn(async () => true);
    const tabs = getBaseAdminTabs({
      setUser: () => undefined,
      keys: [],
      gateways: [],
      reloadData: async () => undefined,
      setStatus: () => undefined,
      setError: () => undefined,
      saveUserData,
      reroutingDraftState: "pristine",
      profilesDraftState: "pristine",
      markReroutingDirty: () => undefined,
      markProfilesDirty: () => undefined,
      saveReroutingData: async () => true,
      saveProfilesData: async () => true,
      registrationMode: "closed",
    });
    const logsTab = tabs.find((tab) => tab.id === "logs");

    expect(logsTab).toBeDefined();

    const rendered = logsTab?.render(createAdminContext());

    expect(isValidElement(rendered)).toBe(true);

    const wrapper = rendered as ReactElement<{
      children: ReactElement;
    }>;
    const panel = Children.only(wrapper.props.children) as ReactElement<{
      enabled: boolean;
      onToggle: (enabled: boolean) => Promise<boolean>;
    }>;

    expect(isValidElement(panel)).toBe(true);
    expect(panel.type).toBe(LogsPanelWithState);
    expect(panel.props.enabled).toBe(false);

    await panel.props.onToggle(true);

    expect(saveUserData).toHaveBeenCalledWith({ routeLoggingEnabled: true });
  });
});
