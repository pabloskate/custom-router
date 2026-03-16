import { describe, expect, it } from "vitest";

import { getAdminExtensionTabs } from "./admin-extensions";
import { getInitialAdminTabId, groupAdminTabsBySection, mergeAdminTabs } from "./admin-tab-registry";
import { getBaseAdminTabs } from "./admin-tabs";
import { type UserInfo } from "./types";

const TEST_USER: UserInfo = {
  id: "user_123",
  name: "Test User",
  email: "test@example.com",
  preferredModels: [],
  defaultModel: null,
  classifierModel: null,
  routingInstructions: null,
  blocklist: null,
  customCatalog: null,
  profiles: null,
  routeTriggerKeywords: null,
  routingFrequency: null,
};

function createBaseTabs(registrationMode: "open" | "closed" | "invite" = "closed") {
  return getBaseAdminTabs({
    setUser: () => undefined,
    keys: [],
    gatewayModelOptions: [],
    reloadData: async () => undefined,
    setStatus: () => undefined,
    setError: () => undefined,
    saveUserData: async () => true,
    routingDraftState: "pristine",
    markRoutingDirty: () => undefined,
    saveRoutingData: async () => true,
    registrationMode,
  });
}

describe("admin tab registry", () => {
  it("hides the invite tab unless registration mode is invite", () => {
    const tabs = createBaseTabs();

    expect(tabs.map((tab) => tab.id)).toEqual([
      "gateways",
      "routing",
      "keys",
      "playground",
      "account",
    ]);
  });

  it("includes the invite tab when registration mode is invite", () => {
    const tabs = createBaseTabs("invite");

    expect(tabs.map((tab) => tab.id)).toEqual([
      "gateways",
      "routing",
      "keys",
      "playground",
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
    expect(groups.use.map((tab) => tab.id)).toEqual(["keys", "playground"]);
    expect(groups.account.map((tab) => tab.id)).toEqual(["invites", "account"]);
    expect(getInitialAdminTabId(tabs, "gateways")).toBe("gateways");
  });
});
