import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  imageSourceToRequestImage,
  isRemoteImageReference,
  normalizeMacClipboardError,
  normalizeMacScreenshotError,
} from "../src/local-images.js";

describe("local image handling", () => {
  it("passes through data image URLs and HTTPS URLs", async () => {
    expect(isRemoteImageReference("data:image/png;base64,abc")).toBe(true);
    expect(isRemoteImageReference("https://example.com/image.png")).toBe(true);
    expect(await imageSourceToRequestImage("data:image/png;base64,abc", 1024)).toBe("data:image/png;base64,abc");
  });

  it("converts a local image path to a data URL", async () => {
    const dir = await mkdtemp(join(tmpdir(), "customrouter-vision-test-"));
    const imagePath = join(dir, "sample.png");
    try {
      await writeFile(imagePath, Buffer.from([0x89, 0x50, 0x4e, 0x47]));
      const dataUrl = await imageSourceToRequestImage(imagePath, 1024);
      expect(dataUrl).toBe("data:image/png;base64,iVBORw==");
    } finally {
      await rm(dir, { force: true, recursive: true });
    }
  });

  it("rejects non-HTTPS URLs", async () => {
    await expect(imageSourceToRequestImage("http://example.com/image.png", 1024))
      .rejects
      .toThrow("Only HTTPS image URLs are accepted.");
  });

  it("normalizes macOS empty clipboard errors", () => {
    const error = normalizeMacClipboardError(new Error("136:165: execution error: Can't make some data into the expected type. (-1700)"));

    expect(error.message).toBe("Clipboard does not contain an image.");
  });

  it("normalizes macOS screen recording permission errors", () => {
    const error = normalizeMacScreenshotError(new Error("screencapture: could not create image from display"));

    expect(error.message).toBe("Screen capture failed. On macOS, grant Screen Recording permission to the terminal or MCP host app, then retry.");
  });
});
