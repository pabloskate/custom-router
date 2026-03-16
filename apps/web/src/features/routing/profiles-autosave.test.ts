import { describe, expect, it, vi } from "vitest";

import { createAutosaveQueue } from "./profiles-autosave";

describe("createAutosaveQueue", () => {
  it("coalesces rapid edits into one save of the latest value", async () => {
    vi.useFakeTimers();
    const save = vi.fn(async (_value: string) => true);
    const queue = createAutosaveQueue<string>({
      debounceMs: 100,
      validate: () => null,
      save,
    });

    queue.update("first");
    queue.update("second");
    queue.update("third");

    await vi.advanceTimersByTimeAsync(100);

    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith("third");
    expect(queue.getSnapshot().state).toBe("saved");
    await queue.dispose();
    vi.useRealTimers();
  });

  it("blocks invalid drafts and reports validation state", async () => {
    vi.useFakeTimers();
    const save = vi.fn(async (_value: string) => true);
    const queue = createAutosaveQueue<string>({
      debounceMs: 100,
      validate: (value) => value.includes("bad") ? "Invalid draft" : null,
      save,
    });

    queue.update("bad-draft");
    await vi.advanceTimersByTimeAsync(100);

    expect(save).not.toHaveBeenCalled();
    expect(queue.getSnapshot()).toEqual({
      state: "invalid",
      message: "Invalid draft",
    });
    await queue.dispose();
    vi.useRealTimers();
  });

  it("queues a follow-up save when edits arrive during an in-flight save", async () => {
    vi.useFakeTimers();
    const firstSave = {
      resolve: null as ((value: boolean) => void) | null,
    };
    const save = vi.fn(async (_value: string) => true);
    save.mockImplementationOnce(
      () =>
        new Promise<boolean>((resolve) => {
          firstSave.resolve = resolve;
        }),
    );
    save.mockResolvedValueOnce(true);

    const queue = createAutosaveQueue<string>({
      debounceMs: 100,
      validate: () => null,
      save,
    });

    queue.update("first");
    await vi.advanceTimersByTimeAsync(100);
    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenLastCalledWith("first");

    queue.update("second");
    await vi.advanceTimersByTimeAsync(100);
    expect(save).toHaveBeenCalledTimes(1);

    if (!firstSave.resolve) {
      throw new Error("First save did not start.");
    }
    firstSave.resolve(true);
    await Promise.resolve();
    await Promise.resolve();

    expect(save).toHaveBeenCalledTimes(2);
    expect(save).toHaveBeenLastCalledWith("second");
    expect(queue.getSnapshot().state).toBe("saved");
    await queue.dispose();
    vi.useRealTimers();
  });
});
