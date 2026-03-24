import { describe, expect, it, vi } from "vitest";
import { routeWithFrontierModel } from "./frontier-classifier";

describe("routeWithFrontierModel", () => {
  const catalog = [
    { id: "openai/gpt-5.2", reasoningPreset: "none" },
    { id: "openai/gpt-5.2:high", reasoningPreset: "high" },
    { id: "openai/gpt-5.2:xhigh", reasoningPreset: "xhigh" },
  ];

  it("uses strict json_schema response format first", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [{ message: { content: JSON.stringify({ selectedModel: "openai/gpt-5.2" }) } }],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    );

    await routeWithFrontierModel({
      apiKey: "test",
      baseUrl: "https://openrouter.ai/api/v1",
      model: "openai/gpt-5-mini",
      input: "what was trumps latest tweet",
      catalog,
      supportsReasoningEffort: true,
      fetchImpl,
    });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const firstCall = fetchImpl.mock.calls[0];
    expect(firstCall).toBeDefined();
    const body = JSON.parse((firstCall?.[1] as RequestInit).body as string);
    expect(body.response_format.type).toBe("json_schema");
    expect(body.response_format.json_schema.schema.properties.selectedModel.enum).toEqual(
      catalog.map((m) => m.id)
    );
    expect(body.response_format.json_schema.schema.properties.stepClassification).toBeDefined();
    expect(body.max_tokens).toBeUndefined();
    expect(body.reasoning).toEqual({ effort: "none", exclude: true });
    expect(body.messages[0].content).toContain("reasoning:xhigh");
    expect(body.messages[0].content).toContain("Return the smallest valid JSON object");
  });

  it("falls back to json_object when schema mode is rejected", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(new Response("{}", { status: 400, headers: { "Content-Type": "application/json" } }))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            choices: [{ message: { content: JSON.stringify({ selectedModel: "openai/gpt-5.2:high" }) } }],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        )
      );

    const result = await routeWithFrontierModel({
      apiKey: "test",
      baseUrl: "https://openrouter.ai/api/v1",
      model: "openai/gpt-5-mini",
      input: "what was trumps latest tweet",
      catalog,
      supportsReasoningEffort: true,
      fetchImpl,
    });

    expect(fetchImpl).toHaveBeenCalledTimes(2);
    const secondCall = fetchImpl.mock.calls[1];
    expect(secondCall).toBeDefined();
    const fallbackBody = JSON.parse((secondCall?.[1] as RequestInit).body as string);
    expect(fallbackBody.response_format).toEqual({ type: "json_object" });
    expect(fallbackBody.reasoning).toEqual({ effort: "none", exclude: true });
    expect(result?.selectedModel).toBe("openai/gpt-5.2:high");
  });

  it("omits reasoning controls for classifier gateways without reasoning support", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [{ message: { content: JSON.stringify({ selectedModel: "openai/gpt-5.2" }) } }],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    );

    await routeWithFrontierModel({
      apiKey: "test",
      baseUrl: "https://gateway.example/v1",
      model: "openai/gpt-5-mini",
      input: "route this",
      catalog,
      supportsReasoningEffort: false,
      fetchImpl,
    });

    const firstCall = fetchImpl.mock.calls[0];
    expect(firstCall).toBeDefined();
    const body = JSON.parse((firstCall?.[1] as RequestInit).body as string);
    expect(body.max_tokens).toBeUndefined();
    expect(body.reasoning).toBeUndefined();
  });

  it("rejects parsed models not present in catalog", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [{ message: { content: JSON.stringify({ selectedModel: "openai/gpt-5.2:online" }) } }],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    );

    const result = await routeWithFrontierModel({
      apiKey: "test",
      baseUrl: "https://openrouter.ai/api/v1",
      model: "openai/gpt-5-mini",
      input: "what was trumps latest tweet",
      catalog,
      fetchImpl,
    });

    expect(result).toBeNull();
  });

  it("parses typed step classification when the classifier returns it", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [{
            message: {
              content: JSON.stringify({
                selectedModel: "openai/gpt-5.2:xhigh",
                stepClassification: {
                  stepMode: "deliberate",
                  complexity: "high",
                  stakes: "critical",
                  latencySensitivity: "medium",
                  toolNeed: "optional",
                  expectedOutputSize: "medium",
                  interactionHorizon: "multi_step",
                },
              }),
            },
          }],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    );

    const result = await routeWithFrontierModel({
      apiKey: "test",
      baseUrl: "https://openrouter.ai/api/v1",
      model: "openai/gpt-5-mini",
      input: "Need a critical decision review.",
      catalog,
      fetchImpl,
    });

    expect(result?.stepClassification?.stakes).toBe("critical");
    expect(result?.stepClassification?.interactionHorizon).toBe("multi_step");
  });
});
