import { describe, expect, it } from "vitest";

import {
  buildVisionChatPayload,
  extractVisionDescriptionFromChatCompletion,
  getVisionImagesValidationFailure,
} from "./vision-service";

describe("vision service helpers", () => {
  it("builds OpenAI-compatible chat image payloads", () => {
    const payload = buildVisionChatPayload({
      images: ["data:image/png;base64,abc"],
      mode: "ui",
      modelId: "vision/model",
      question: "What is broken?",
      context: "Checkout page",
    });

    expect(payload).toMatchObject({
      model: "vision/model",
      temperature: 0,
      stream: false,
      messages: [
        { role: "system" },
        {
          role: "user",
          content: [
            { type: "text" },
            { type: "image_url", image_url: { url: "data:image/png;base64,abc" } },
          ],
        },
      ],
    });
  });

  it("extracts text from string and array chat completion content", () => {
    expect(extractVisionDescriptionFromChatCompletion({
      choices: [{ message: { content: "Plain text" } }],
    })).toBe("Plain text");

    expect(extractVisionDescriptionFromChatCompletion({
      choices: [{ message: { content: [{ text: "Part A" }, { text: "Part B" }] } }],
    })).toBe("Part A\nPart B");
  });

  it("rejects aggregate image data URLs that exceed the combined cap", () => {
    const image = `data:image/png;base64,${"a".repeat(6_100_000)}`;

    expect(getVisionImagesValidationFailure([image, image])).toEqual({
      error: "Combined image data URLs are too large.",
      status: 413,
    });
  });

  it("accepts multiple image references under the combined cap", () => {
    expect(getVisionImagesValidationFailure([
      "data:image/png;base64,abc",
      "https://example.com/screenshot.png",
    ])).toBeNull();
  });
});
