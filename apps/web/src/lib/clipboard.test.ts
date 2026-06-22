import { afterEach, describe, expect, it, vi } from "vitest";

import { CLIPBOARD_COPY_ERROR, copyTextToClipboard } from "./clipboard";

const originalNavigator = globalThis.navigator;

afterEach(() => {
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: originalNavigator,
  });
});

describe("copyTextToClipboard", () => {
  it("returns success when the browser clipboard write succeeds", async () => {
    const writeText = vi.fn(async () => undefined);
    Object.defineProperty(globalThis, "navigator", {
      configurable: true,
      value: { clipboard: { writeText } },
    });

    await expect(copyTextToClipboard("hello")).resolves.toEqual({ ok: true });
    expect(writeText).toHaveBeenCalledWith("hello");
  });

  it("returns a stable error when clipboard access is unavailable", async () => {
    Object.defineProperty(globalThis, "navigator", {
      configurable: true,
      value: {},
    });

    await expect(copyTextToClipboard("hello")).resolves.toEqual({
      ok: false,
      error: CLIPBOARD_COPY_ERROR,
    });
  });

  it("returns a stable error when clipboard access rejects", async () => {
    Object.defineProperty(globalThis, "navigator", {
      configurable: true,
      value: { clipboard: { writeText: vi.fn(async () => { throw new Error("denied"); }) } },
    });

    await expect(copyTextToClipboard("hello")).resolves.toEqual({
      ok: false,
      error: CLIPBOARD_COPY_ERROR,
    });
  });
});
