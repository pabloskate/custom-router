import type { ProfilesAutosaveSnapshot } from "./profiles-editor-utils";

export interface AutosaveQueueOptions<T> {
  debounceMs: number;
  validate: (value: T) => string | null;
  save: (value: T) => Promise<boolean>;
  onSnapshot?: (snapshot: ProfilesAutosaveSnapshot) => void;
}

export interface AutosaveQueue<T> {
  dispose: (args?: { flushPending?: boolean }) => Promise<void>;
  flush: () => Promise<void>;
  getSnapshot: () => ProfilesAutosaveSnapshot;
  update: (value: T, options?: { debounceMs?: number }) => void;
}

function sameSnapshot(
  left: ProfilesAutosaveSnapshot,
  right: ProfilesAutosaveSnapshot,
): boolean {
  return left.state === right.state && left.message === right.message;
}

export function createAutosaveQueue<T>(options: AutosaveQueueOptions<T>): AutosaveQueue<T> {
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  let inFlight = false;
  let revision = 0;
  let savingRevision = 0;
  let disposed = false;
  let latestValue: T | null = null;
  let flushPromise: Promise<void> | null = null;
  let snapshot: ProfilesAutosaveSnapshot = {
    state: "saved",
    message: null,
  };

  function emit(next: ProfilesAutosaveSnapshot) {
    if (sameSnapshot(snapshot, next)) {
      return;
    }

    snapshot = next;
    options.onSnapshot?.(next);
  }

  async function runSave(): Promise<void> {
    if (disposed || latestValue === null) {
      return;
    }

    const validationError = options.validate(latestValue);
    if (validationError) {
      emit({ state: "invalid", message: validationError });
      return;
    }

    if (inFlight) {
      return;
    }

    inFlight = true;
    savingRevision = revision;
    const savingValue = latestValue;
    emit({ state: "saving", message: null });

    const saved = await options.save(savingValue);
    inFlight = false;

    if (disposed) {
      return;
    }

    const latestValidationError = latestValue === null ? "Autosave has no value to persist." : options.validate(latestValue);
    if (revision !== savingRevision) {
      if (latestValidationError) {
        emit({ state: "invalid", message: latestValidationError });
        return;
      }

      emit({ state: "dirty", message: null });
      await runSave();
      return;
    }

    if (saved) {
      emit({ state: "saved", message: null });
      return;
    }

    emit({ state: "error", message: "Autosave failed. Changes are still pending." });
  }

  function schedule(debounceMs?: number) {
    if (debounceTimer) {
      clearTimeout(debounceTimer);
    }

    debounceTimer = setTimeout(() => {
      debounceTimer = null;
      flushPromise = runSave().finally(() => {
        flushPromise = null;
      });
    }, debounceMs ?? options.debounceMs);
  }

  return {
    update(value, updateOptions) {
      if (disposed) {
        return;
      }

      latestValue = value;
      revision += 1;
      const validationError = options.validate(value);

      if (validationError) {
        if (debounceTimer) {
          clearTimeout(debounceTimer);
          debounceTimer = null;
        }
        emit({ state: "invalid", message: validationError });
        return;
      }

      emit({ state: "dirty", message: null });
      schedule(updateOptions?.debounceMs);
    },
    async flush() {
      if (debounceTimer) {
        clearTimeout(debounceTimer);
        debounceTimer = null;
      }

      if (flushPromise) {
        await flushPromise;
        return;
      }

      flushPromise = runSave().finally(() => {
        flushPromise = null;
      });
      await flushPromise;
    },
    async dispose(args) {
      disposed = true;
      if (debounceTimer) {
        clearTimeout(debounceTimer);
        debounceTimer = null;
      }

      if (args?.flushPending && latestValue !== null) {
        const validationError = options.validate(latestValue);
        if (!validationError) {
          await options.save(latestValue);
        }
      }
    },
    getSnapshot() {
      return snapshot;
    },
  };
}
