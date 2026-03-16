"use client";

import { useEffect, useMemo, useRef } from "react";

import { createAutosaveQueue } from "@/src/features/routing/profiles-autosave";

export interface RoutingSettingsDraft {
  routeTriggerKeywords: string[] | null;
  routingFrequency: string | null;
}

const ROUTING_SETTINGS_AUTOSAVE_DEBOUNCE_MS = 1200;
const VALID_ROUTING_FREQUENCIES = new Set([
  "every_message",
  "smart",
  "new_thread_only",
]);

export function normalizeRoutingSettingsDraft(
  draft: RoutingSettingsDraft,
): RoutingSettingsDraft {
  const seenKeywords = new Set<string>();
  const routeTriggerKeywords = Array.isArray(draft.routeTriggerKeywords)
    ? draft.routeTriggerKeywords
        .map((keyword) => keyword.trim())
        .filter((keyword) => {
          if (keyword.length === 0 || seenKeywords.has(keyword)) {
            return false;
          }

          seenKeywords.add(keyword);
          return true;
        })
    : [];

  return {
    routeTriggerKeywords: routeTriggerKeywords.length > 0 ? routeTriggerKeywords : null,
    routingFrequency:
      typeof draft.routingFrequency === "string"
      && VALID_ROUTING_FREQUENCIES.has(draft.routingFrequency)
        ? draft.routingFrequency
        : null,
  };
}

export function getRoutingSettingsAutosaveKey(
  draft: RoutingSettingsDraft,
): string {
  return JSON.stringify(normalizeRoutingSettingsDraft(draft));
}

export function useRoutingSettingsAutosave(args: {
  draft: RoutingSettingsDraft;
  onSave: (updates: Partial<RoutingSettingsDraft>) => Promise<boolean>;
}) {
  const onSaveRef = useRef(args.onSave);
  const lastDraftKeyRef = useRef<string | null>(null);
  const autosaveQueueRef = useRef(
    createAutosaveQueue<RoutingSettingsDraft>({
      debounceMs: ROUTING_SETTINGS_AUTOSAVE_DEBOUNCE_MS,
      validate: () => null,
      save: async (draft) => onSaveRef.current(draft),
    }),
  );

  onSaveRef.current = args.onSave;

  const normalizedDraft = useMemo(
    () => normalizeRoutingSettingsDraft(args.draft),
    [args.draft.routeTriggerKeywords, args.draft.routingFrequency],
  );
  const draftKey = useMemo(
    () => getRoutingSettingsAutosaveKey(normalizedDraft),
    [normalizedDraft],
  );

  useEffect(() => {
    if (lastDraftKeyRef.current === null) {
      lastDraftKeyRef.current = draftKey;
      return;
    }

    if (lastDraftKeyRef.current === draftKey) {
      return;
    }

    lastDraftKeyRef.current = draftKey;
    autosaveQueueRef.current.update(normalizedDraft);
  }, [draftKey, normalizedDraft]);

  useEffect(() => {
    return () => {
      void autosaveQueueRef.current.dispose({ flushPending: true });
    };
  }, []);
}
