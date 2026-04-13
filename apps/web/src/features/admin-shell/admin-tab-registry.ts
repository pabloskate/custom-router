import { type AdminSection, type AdminTabDefinition } from "./types";

const SECTION_ORDER: Record<AdminSection, number> = {
  configure: 0,
  use: 1,
  account: 2,
};

export function sortAdminTabs(tabs: readonly AdminTabDefinition[]): AdminTabDefinition[] {
  return [...tabs].sort((left, right) => {
    const sectionOrder = SECTION_ORDER[left.section] - SECTION_ORDER[right.section];
    if (sectionOrder !== 0) {
      return sectionOrder;
    }

    if (left.order !== right.order) {
      return left.order - right.order;
    }

    return left.label.localeCompare(right.label);
  });
}

export function mergeAdminTabs(
  baseTabs: readonly AdminTabDefinition[],
  extensionTabs: readonly AdminTabDefinition[],
): AdminTabDefinition[] {
  const merged = sortAdminTabs([...baseTabs, ...extensionTabs]);
  const seen = new Set<string>();

  for (const tab of merged) {
    if (seen.has(tab.id)) {
      throw new Error(`Duplicate admin tab id: ${tab.id}`);
    }
    seen.add(tab.id);
  }

  return merged;
}

export function getInitialAdminTabId(
  tabs: readonly AdminTabDefinition[],
  fallbackId: string,
): string {
  if (tabs.some((tab) => tab.id === fallbackId)) {
    return fallbackId;
  }

  return tabs[0]?.id ?? fallbackId;
}

export function groupAdminTabsBySection(tabs: readonly AdminTabDefinition[]): Record<AdminSection, AdminTabDefinition[]> {
  return tabs.reduce<Record<AdminSection, AdminTabDefinition[]>>(
    (groups, tab) => {
      groups[tab.section].push(tab);
      return groups;
    },
    { configure: [], use: [], account: [] },
  );
}
