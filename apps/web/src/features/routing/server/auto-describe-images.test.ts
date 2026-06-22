import { describe, expect, it, vi } from "vitest";

import {
  buildAutoDescribedRequestBody,
  getLatestUserImageCandidate,
  resolveAutoDescribeImagesPlan,
  shouldAutoDescribeAttempt,
} from "./auto-describe-images";

vi.mock("@/src/features/vision/server/vision-service", async () => {
  const actual = await vi.importActual<typeof import("@/src/features/vision/server/vision-service")>(
    "@/src/features/vision/server/vision-service"
  );
  return {
    ...actual,
    describeImagesViaVisionModel: vi.fn(async () => ({
      ok: true,
      description: "A checkout form with a red card error.",
    })),
  };
});

describe("auto describe images", () => {
  it("detects and rewrites latest chat user image parts", async () => {
    const body = {
      model: "planning-backend",
      messages: [
        { role: "system", content: "You are concise." },
        {
          role: "user",
          content: [
            { type: "text", text: "What is wrong here?" },
            { type: "image_url", image_url: { url: "data:image/png;base64,abc" } },
          ],
        },
      ],
    } as const;

    const candidate = getLatestUserImageCandidate(body as any);

    expect(candidate?.images).toEqual(["data:image/png;base64,abc"]);
    expect(candidate?.question).toBe("What is wrong here?");

    const rewritten = candidate?.rewrite("The submit button is disabled.") as any;
    expect(rewritten.messages[1].content).toEqual([
      { type: "text", text: "What is wrong here?" },
      {
        type: "text",
        text: expect.stringContaining("The submit button is disabled."),
      },
    ]);
  });

  it("does not make a plan when only an older user message has an image", () => {
    const candidate = getLatestUserImageCandidate({
      model: "planning-backend",
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: "Old screenshot" },
            { type: "image_url", image_url: { url: "data:image/png;base64,abc" } },
          ],
        },
        { role: "assistant", content: "I see it." },
        { role: "user", content: "Continue without looking again." },
      ],
    } as any);

    expect(candidate).toBeNull();
  });

  it("marks candidates with other images as ineligible for a routing plan", () => {
    const gatewayMap = new Map([
      ["gw_vision", { baseUrl: "https://gateway.example/v1", apiKey: "vision-key" }],
    ]);

    const plan = resolveAutoDescribeImagesPlan({
      body: {
        model: "planning-backend",
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: "Old screenshot" },
              { type: "image_url", image_url: { url: "data:image/png;base64,old" } },
            ],
          },
          { role: "assistant", content: "I see it." },
          {
            role: "user",
            content: [
              { type: "text", text: "Now this one?" },
              { type: "image_url", image_url: { url: "data:image/png;base64,new" } },
            ],
          },
        ],
      } as any,
      gatewayMap,
      gatewayRows: [
        {
          id: "gw_vision",
          baseUrl: "https://gateway.example/v1",
          apiKeyEnc: "enc",
          models: [{ id: "vision/model", name: "Vision", modality: "text,image->text" }],
        },
      ],
      settings: {
        gatewayId: "gw_vision",
        modelId: "vision/model",
        defaultMode: "ui",
        autoDescribeImagesEnabled: true,
        updatedAt: "2026-06-21T00:00:00.000Z",
      },
    });

    expect(plan).toBeNull();
  });

  it("rewrites responses input for text-only attempts", async () => {
    const plan = resolveAutoDescribeImagesPlan({
      body: {
        model: "planning-backend",
        input: [
          {
            type: "message",
            role: "user",
            content: [
              { type: "input_text", text: "Read this error." },
              { type: "input_image", image_url: "https://example.com/error.png" },
            ],
          },
        ],
      } as any,
      gatewayMap: new Map([
        ["gw_vision", { baseUrl: "https://gateway.example/v1", apiKey: "vision-key" }],
      ]),
      gatewayRows: [
        {
          id: "gw_vision",
          baseUrl: "https://gateway.example/v1",
          apiKeyEnc: "enc",
          models: [{ id: "vision/model", name: "Vision", modality: "text,image->text" }],
        },
      ],
      settings: {
        gatewayId: "gw_vision",
        modelId: "vision/model",
        defaultMode: "ui",
        autoDescribeImagesEnabled: true,
        updatedAt: "2026-06-21T00:00:00.000Z",
      },
    });

    expect(plan).not.toBeNull();
    expect(shouldAutoDescribeAttempt({
      catalog: [
        { id: "text/model", name: "Text", modality: "text->text" },
        { id: "vision/model", name: "Vision", modality: "text,image->text" },
      ],
      modelId: "text/model",
      plan,
    })).toBe(true);
    expect(shouldAutoDescribeAttempt({
      catalog: [
        { id: "text/model", name: "Text", modality: "text->text" },
        { id: "vision/model", name: "Vision", modality: "text,image->text" },
      ],
      modelId: "vision/model",
      plan,
    })).toBe(false);

    const result = await buildAutoDescribedRequestBody({ plan: plan! });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect((result.body.input as any[])[0].content).toEqual([
        { type: "input_text", text: "Read this error." },
        {
          type: "input_text",
          text: expect.stringContaining("A checkout form with a red card error."),
        },
      ]);
    }
  });
});
