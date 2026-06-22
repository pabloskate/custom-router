import { describe, expect, it } from "vitest";

import {
  collectVisionModelOptions,
  modelSupportsVisionInput,
  normalizeVisionMode,
} from "./contracts";

describe("vision contracts", () => {
  it("detects image input from gateway model modality", () => {
    expect(modelSupportsVisionInput({ modality: "text,image->text" })).toBe(true);
    expect(modelSupportsVisionInput({ modality: "text,file->text,image" })).toBe(false);
    expect(modelSupportsVisionInput({ modality: undefined })).toBe(false);
  });

  it("collects vision-capable gateway model options", () => {
    const options = collectVisionModelOptions([
      {
        id: "gw_1",
        name: "Gateway",
        models: [
          { id: "text", name: "Text", modality: "text->text" },
          { id: "vision", name: "Vision", modality: "text,image->text" },
        ],
      },
    ]);

    expect(options).toEqual([
      {
        gatewayId: "gw_1",
        gatewayName: "Gateway",
        model: { id: "vision", name: "Vision", modality: "text,image->text" },
      },
    ]);
  });

  it("normalizes invalid modes to the screenshot default", () => {
    expect(normalizeVisionMode("ocr")).toBe("ocr");
    expect(normalizeVisionMode("invalid")).toBe("ui");
    expect(normalizeVisionMode(null)).toBe("ui");
  });
});
