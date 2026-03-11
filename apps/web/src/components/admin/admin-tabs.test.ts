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
  showModelInResponse: false,
  classifierBaseUrl: null,
  classifierApiKeyConfigured: false,
  classifierApiKeyInput: "",
  clearClassifierApiKey: false,
};

function createBaseTabs() {
  return getBaseAdminTabs({
    setUser: () => undefined,
    keys: [],
    gatewayModelOptions: [],
    reloadData: async () => undefined,
    setStatus: () => undefined,
    setError: () => undefined,
    saveUserData: async () => true,
  });
}

describe("admin tab registry", () => {
  it("returns the OSS base tabs in the current order", () => {
    const tabs = createBaseTabs();

    expect(tabs.map((tab) => tab.id)).toEqual([
      "gateways",
      "routing",
      "keys",
      "playground",
      "account",
    ]);
  });

  it("defaults to no OSS admin extensions", () => {
    expect(getAdminExtensionTabs()).toEqual([]);
  });

  it("merges tabs into the expected sections and preserves the default tab", () => {
    const tabs = mergeAdminTabs(createBaseTabs(), getAdminExtensionTabs());
    const groups = groupAdminTabsBySection(tabs);

    expect(groups.configure.map((tab) => tab.id)).toEqual(["gateways", "routing"]);
    expect(groups.use.map((tab) => tab.id)).toEqual(["keys", "playground"]);
    expect(groups.account.map((tab) => tab.id)).toEqual(["account"]);
    expect(getInitialAdminTabId(tabs, "gateways")).toBe("gateways");
  });
});
