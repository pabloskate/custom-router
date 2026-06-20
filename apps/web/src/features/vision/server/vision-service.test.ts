import { describe, expect, it } from "vitest";

import {
  buildVisionChatPayload,
  extractVisionDescriptionFromChatCompletion,
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
});
