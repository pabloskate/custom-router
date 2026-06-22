import { describe, expect, it, vi } from "vitest";
import { RouterEngine } from "../src/router-engine";
import { buildThreadFingerprint } from "../src/threading";
import type { PinStore, RouterConfig, RouterProfile, RouterRequestLike, ThreadPin } from "../src/types";

// Mock PinStore
class MockPinStore implements PinStore {
    private pins = new Map<string, ThreadPin>();

    async get(threadKey: string): Promise<ThreadPin | null> {
        return this.pins.get(threadKey) ?? null;
    }

    async set(pin: ThreadPin): Promise<void> {
        this.pins.set(pin.threadKey, pin);
    }

    async clear(threadKey: string): Promise<void> {
        this.pins.delete(threadKey);
    }
}

describe("RouterEngine (LLM Router)", () => {
    const defaultConfig: RouterConfig = {
        version: "1",
        defaultModel: "openai/gpt-4o",
        globalBlocklist: [],
        routingInstructions: "Use claude-3-opus for math.",
        classifierModel: "openai/gpt-4o-mini"
    };

    const catalog = [
        { id: "openai/gpt-4o", name: "GPT-4o" },
        { id: "anthropic/claude-3-opus", name: "Claude 3 Opus" }
    ];
    const namedProfiles: RouterProfile[] = [
        {
            id: "planning-backend",
            name: "Planning Backend",
            routingInstructions: "Use claude-3-opus for math.",
        },
    ];

    function buildProfileThreadKey(request: RouterRequestLike): string {
        return buildThreadFingerprint({
            messages: request.messages,
            tools: request.tools,
            previousResponseId: request.previous_response_id,
            profileId: request.model,
        });
    }

    it("should bypass routing if specific model requested", async () => {
        const engine = new RouterEngine();
        const request: RouterRequestLike = { model: "anthropic/claude-3-opus" };

        const decision = await engine.decide({
            requestId: "req-1",
            request,
            config: defaultConfig,
            catalog,
            catalogVersion: "v1",
            pinStore: new MockPinStore()
        });

        expect(decision.mode).toBe("passthrough");
        expect(decision.selectedModel).toBe("anthropic/claude-3-opus");
        expect(decision.explanation.decisionReason).toBe("passthrough");
    });

    it("should call llmRouter when a named profile is requested and use the result", async () => {
        const mockLlmRouter = vi.fn().mockResolvedValue({
            selectedModel: "anthropic/claude-3-opus",
            confidence: 0.9,
            signals: ["math"]
        });

        const engine = new RouterEngine({ llmRouter: mockLlmRouter });
        const request: RouterRequestLike = {
            model: "planning-backend",
            messages: [{ role: "user", content: "What is 2+2?" }]
        };

        const decision = await engine.decide({
            requestId: "req-2",
            request,
            config: defaultConfig,
            catalog,
            catalogVersion: "v1",
            pinStore: new MockPinStore(),
            profiles: namedProfiles,
        });

        expect(mockLlmRouter).toHaveBeenCalledOnce();
        const args = mockLlmRouter.mock.calls[0]?.[0] as any;

        expect(args.routingInstructions).toBe("Use claude-3-opus for math.");
        expect(args.classifierModel).toBe("openai/gpt-4o-mini");
        expect(args.catalog).toBe(catalog);

        expect(decision.mode).toBe("routed");
        expect(decision.selectedModel).toBe("anthropic/claude-3-opus");
        expect(decision.explanation.decisionReason).toBe("initial_route");
        expect(decision.explanation.classificationConfidence).toBe(0.9);
    });

    it("uses the matched profile instructions instead of the legacy global instructions when profiles exist", async () => {
        const mockLlmRouter = vi.fn().mockResolvedValue({
            selectedModel: "anthropic/claude-3-opus",
            confidence: 0.92,
            signals: ["profile:planning-backend"],
        });

        const engine = new RouterEngine({ llmRouter: mockLlmRouter });
        await engine.decide({
            requestId: "req-planning-profile-instructions",
            request: {
                model: "planning-backend",
                messages: [{ role: "user", content: "Plan this migration." }]
            },
            config: defaultConfig,
            catalog,
            catalogVersion: "v1",
            pinStore: new MockPinStore(),
            profiles: [
                { id: "planning-backend", name: "Planning Backend", routingInstructions: "Use Claude for planning tasks." },
            ],
        });

        const args = mockLlmRouter.mock.calls[0]?.[0] as any;
        expect(args.routingInstructions).toBe("Use Claude for planning tasks.");
    });

    it("does not inherit shared routing instructions for named profiles without their own instructions", async () => {
        const mockLlmRouter = vi.fn().mockResolvedValue({
            selectedModel: "anthropic/claude-3-opus",
            confidence: 0.84,
            signals: ["profile:named"],
        });

        const engine = new RouterEngine({ llmRouter: mockLlmRouter });
        await engine.decide({
            requestId: "req-named-profile-no-inherit",
            request: {
                model: "auto-cheap",
                messages: [{ role: "user", content: "Pick a cheap model." }]
            },
            config: defaultConfig,
            catalog,
            catalogVersion: "v1",
            pinStore: new MockPinStore(),
            profiles: [
                { id: "planning-backend", name: "Planning Backend", routingInstructions: "Use Claude for planning tasks." },
                { id: "auto-cheap", name: "Cheap", classifierModel: "openai/gpt-4o-mini" },
            ],
        });

        const args = mockLlmRouter.mock.calls[0]?.[0] as any;
        expect(args.routingInstructions).toBeUndefined();
    });

    it("should pass responses input text to llmRouter prompt", async () => {
        const mockLlmRouter = vi.fn().mockResolvedValue({
            selectedModel: "anthropic/claude-3-opus",
            confidence: 0.91,
            signals: ["from_responses_input"]
        });

        const engine = new RouterEngine({ llmRouter: mockLlmRouter });
        const request: RouterRequestLike = {
            model: "planning-backend",
            input: "Use claude for this advanced reasoning task."
        };

        const decision = await engine.decide({
            requestId: "req-responses-input",
            request,
            config: defaultConfig,
            catalog,
            catalogVersion: "v1",
            pinStore: new MockPinStore(),
            profiles: namedProfiles,
        });

        expect(mockLlmRouter).toHaveBeenCalledOnce();
        const args = mockLlmRouter.mock.calls[0]?.[0] as any;
        expect(args.prompt).toContain("Use claude for this advanced reasoning task.");
        expect(decision.selectedModel).toBe("anthropic/claude-3-opus");
    });

    it("limits classifier candidates to vision-capable models for responses image inputs", async () => {
        const mockLlmRouter = vi.fn().mockResolvedValue({
            selectedModel: "openai/gpt-4o-vision",
            confidence: 0.93,
            signals: ["vision_required"],
        });

        const engine = new RouterEngine({ llmRouter: mockLlmRouter });
        await engine.decide({
            requestId: "req-responses-input-image",
            request: {
                model: "planning-backend",
                input: [
                    {
                        type: "message",
                        role: "user",
                        content: [
                            { type: "input_text", text: "Describe this image." },
                            { type: "input_image", detail: "auto", image_url: "https://example.com/photo.png" },
                        ],
                    },
                ],
            },
            config: defaultConfig,
            catalog: [
                { id: "openai/gpt-4o", name: "GPT-4o", modality: "text->text" },
                { id: "openai/gpt-4o-vision", name: "GPT-4o Vision", modality: "text,image->text" },
            ],
            catalogVersion: "v1",
            pinStore: new MockPinStore(),
            profiles: namedProfiles,
        });

        const args = mockLlmRouter.mock.calls[0]?.[0] as any;
        expect(args.catalog).toEqual([
            { id: "openai/gpt-4o-vision", name: "GPT-4o Vision", modality: "text,image->text" },
        ]);
    });

    it("forces image-output requests onto image-capable models when the default fallback is text-only", async () => {
        const engine = new RouterEngine();

        const decision = await engine.decide({
            requestId: "req-image-output-fallback",
            request: {
                model: "planning-backend",
                messages: [{ role: "user", content: "Generate a movie poster." }],
                modalities: ["image", "text"],
            } as RouterRequestLike,
            config: defaultConfig,
            catalog: [
                { id: "openai/gpt-4o", name: "GPT-4o", modality: "text->text" },
                { id: "openai/gpt-5-image", name: "GPT-5 Image", modality: "text,image->text,image" },
            ],
            catalogVersion: "v1",
            pinStore: new MockPinStore(),
            profiles: namedProfiles,
        });

        expect(decision.selectedModel).toBe("openai/gpt-5-image");
        expect(decision.switchReason).toBe("image_capability_override");
        expect(decision.explanation.notes).toContain(
            "Request requires image output but selected model cannot generate images. Forcing image-capable model: openai/gpt-5-image"
        );
    });

    it("should fallback to default model if llmRouter returns invalid model", async () => {
        const mockLlmRouter = vi.fn().mockResolvedValue({
            selectedModel: "fake/model-that-does-not-exist",
            confidence: 0.9,
            signals: []
        });

        const engine = new RouterEngine({ llmRouter: mockLlmRouter });

        const decision = await engine.decide({
            requestId: "req-3",
            request: { model: "planning-backend", messages: [] },
            config: defaultConfig,
            catalog,
            catalogVersion: "v1",
            pinStore: new MockPinStore(),
            profiles: namedProfiles,
        });

        expect(decision.selectedModel).toBe("openai/gpt-4o"); // fell back to default
        expect(decision.explanation.notes).toContain(
            "LLM router returned invalid model: fake/model-that-does-not-exist"
        );
    });

    it("should reuse pinned model for continuation requests", async () => {
        const engine = new RouterEngine();
        const pinStore = new MockPinStore();

        const request: RouterRequestLike = {
            model: "planning-backend",
            messages: [
                { role: "user", content: "Hello" },
                { role: "assistant", content: "Hi" },
                { role: "user", content: "Continuation" }
            ]
        };

        const threadKey = buildProfileThreadKey(request);

        await pinStore.set({
            threadKey,
            modelId: "anthropic/claude-3-opus",
            requestId: "old-req",
            pinnedAt: new Date().toISOString(),
            expiresAt: new Date(Date.now() + 10000).toISOString(),
            turnCount: 1
        });

        const decision = await engine.decide({
            requestId: "req-4",
            request,
            config: defaultConfig,
            catalog,
            catalogVersion: "v1",
            pinStore,
            profiles: namedProfiles,
        });

        expect(decision.pinUsed).toBe(true);
        expect(decision.selectedModel).toBe("anthropic/claude-3-opus");
        expect(decision.explanation.decisionReason).toBe("thread_pin");
    });

    it("should force re-route when latest user message starts with $$route", async () => {
        const mockLlmRouter = vi.fn().mockResolvedValue({
            selectedModel: "openai/gpt-4o",
            confidence: 0.88,
            signals: ["forced_route"],
        });
        const engine = new RouterEngine({ llmRouter: mockLlmRouter });
        const pinStore = new MockPinStore();

        const request: RouterRequestLike = {
            model: "planning-backend",
            messages: [
                { role: "user", content: "Use opus for planning" },
                { role: "assistant", content: "Plan drafted." },
                { role: "user", content: "$$route continue with implementation" },
            ],
        };

        const threadKey = buildProfileThreadKey(request);
        await pinStore.set({
            threadKey,
            modelId: "anthropic/claude-3-opus",
            requestId: "old-req",
            pinnedAt: new Date().toISOString(),
            expiresAt: new Date(Date.now() + 10000).toISOString(),
            turnCount: 2,
        });

        const decision = await engine.decide({
            requestId: "req-force-route",
            request,
            config: defaultConfig,
            catalog,
            catalogVersion: "v1",
            pinStore,
            profiles: namedProfiles,
        });

        expect(mockLlmRouter).toHaveBeenCalledOnce();
        expect(decision.pinUsed).toBe(false);
        expect(decision.explanation.decisionReason).toBe("initial_route");
        expect(decision.explanation.notes).toContain(
            "Force route directive detected in latest user message. Bypassing thread pin for this turn."
        );
    });

    it("honors the forceRoute decide override without mutating the request", async () => {
        const mockLlmRouter = vi.fn().mockResolvedValue({
            selectedModel: "openai/gpt-4o",
            confidence: 0.89,
            signals: ["forced_route_override"],
        });
        const engine = new RouterEngine({ llmRouter: mockLlmRouter });
        const pinStore = new MockPinStore();

        const request: RouterRequestLike = {
            model: "planning-backend",
            messages: [
                { role: "user", content: "Use opus for planning" },
                { role: "assistant", content: "Plan drafted." },
                { role: "user", content: "continue with implementation" },
            ],
        };

        const threadKey = buildProfileThreadKey(request);
        await pinStore.set({
            threadKey,
            modelId: "anthropic/claude-3-opus",
            requestId: "old-req",
            pinnedAt: new Date().toISOString(),
            expiresAt: new Date(Date.now() + 10000).toISOString(),
            turnCount: 2,
        });

        const decision = await engine.decide({
            requestId: "req-force-route-override",
            request,
            config: defaultConfig,
            catalog,
            catalogVersion: "v1",
            pinStore,
            profiles: namedProfiles,
            forceRoute: true,
        });

        expect(mockLlmRouter).toHaveBeenCalledOnce();
        expect(decision.pinUsed).toBe(false);
        expect(decision.explanation.decisionReason).toBe("initial_route");
        expect(decision.explanation.pinBypassReason).toBe("force_route");
        expect(decision.explanation.notes).toContain(
            "Router requested a fresh decision for this turn. Bypassing thread pin."
        );
    });

    it("should not force re-route when $$route appears only in older user messages", async () => {
        const mockLlmRouter = vi.fn().mockResolvedValue({
            selectedModel: "openai/gpt-4o",
            confidence: 0.9,
            signals: ["unused"],
        });
        const engine = new RouterEngine({ llmRouter: mockLlmRouter });
        const pinStore = new MockPinStore();

        const request: RouterRequestLike = {
            model: "planning-backend",
            messages: [
                { role: "user", content: "$$route" },
                { role: "assistant", content: "Switched." },
                { role: "user", content: "keep going" },
            ],
        };

        const threadKey = buildProfileThreadKey(request);
        await pinStore.set({
            threadKey,
            modelId: "anthropic/claude-3-opus",
            requestId: "old-req",
            pinnedAt: new Date().toISOString(),
            expiresAt: new Date(Date.now() + 10000).toISOString(),
            turnCount: 1,
        });

        const decision = await engine.decide({
            requestId: "req-no-force-route",
            request,
            config: defaultConfig,
            catalog,
            catalogVersion: "v1",
            pinStore,
            profiles: namedProfiles,
        });

        expect(mockLlmRouter).not.toHaveBeenCalled();
        expect(decision.pinUsed).toBe(true);
        expect(decision.selectedModel).toBe("anthropic/claude-3-opus");
        expect(decision.explanation.decisionReason).toBe("thread_pin");
    });

    it("re-evaluates on user continuations even when tools are available", async () => {
        const mockLlmRouter = vi.fn().mockResolvedValue({
            selectedModel: "openai/gpt-4o",
            confidence: 0.95,
            signals: ["phase_change"]
        });

        const engine = new RouterEngine({ llmRouter: mockLlmRouter });
        const pinStore = new MockPinStore();

        const request: RouterRequestLike = {
            model: "planning-backend",
            messages: [
                { role: "user", content: "Write a plan" },
                { role: "assistant", content: "Here is the plan. [PHASE_COMPLETE_SIGNAL]" },
                { role: "user", content: "Great, now write the code." }
            ],
            tools: [{ type: "function", function: { name: "apply_patch" } }]
        };

        const threadKey = buildProfileThreadKey(request);
        await pinStore.set({
            threadKey,
            modelId: "anthropic/claude-3-opus",
            requestId: "old-req",
            pinnedAt: new Date().toISOString(),
            expiresAt: new Date(Date.now() + 10000).toISOString(),
            turnCount: 2
        });

        const decision = await engine.decide({
            requestId: "req-phase-break",
            request,
            config: defaultConfig,
            catalog,
            catalogVersion: "v1",
            pinStore,
            profiles: namedProfiles,
        });

        expect(mockLlmRouter).toHaveBeenCalledOnce();
        expect(decision.pinUsed).toBe(false);
        expect(decision.selectedModel).toBe("anthropic/claude-3-opus");
        expect(decision.explanation.pinBypassReason).toBe("smart_pin_turn_limit");
        expect(decision.crossFamilySwitchBlocked).toBe(true);
        expect(decision.familyStickinessApplied).toBe(true);
    });

    it("re-evaluates once the next user continuation would exhaust the smart budget", async () => {
        const mockLlmRouter = vi.fn().mockResolvedValue({
            selectedModel: "openai/gpt-4o",
            confidence: 0.95,
            signals: ["phase_change"]
        });

        const engine = new RouterEngine({ llmRouter: mockLlmRouter });
        const pinStore = new MockPinStore();

        const request: RouterRequestLike = {
            model: "planning-backend",
            previous_response_id: "resp_phase_ignore",
            messages: [
                { role: "user", content: "Write a plan" },
                { role: "assistant", content: "Here is the plan. [PHASE_COMPLETE_SIGNAL]" },
                { role: "user", content: "Great, now write the code." }
            ]
        };

        const threadKey = buildProfileThreadKey(request);
        await pinStore.set({
            threadKey,
            modelId: "anthropic/claude-3-opus",
            requestId: "old-req",
            pinnedAt: new Date().toISOString(),
            expiresAt: new Date(Date.now() + 10000).toISOString(),
            turnCount: 2
        });

        const decision = await engine.decide({
            requestId: "req-phase-ignore",
            request,
            config: defaultConfig,
            catalog,
            catalogVersion: "v1",
            pinStore,
            profiles: namedProfiles,
        });

        expect(mockLlmRouter).toHaveBeenCalledOnce();
        expect(decision.pinUsed).toBe(false);
        expect(decision.selectedModel).toBe("anthropic/claude-3-opus");
        expect(decision.explanation.pinBypassReason).toBe("smart_pin_turn_limit");
        expect(decision.crossFamilySwitchBlocked).toBe(true);
        expect(decision.familyStickinessApplied).toBe(true);
    });

    it("uses the supplied config fallback for named profiles when the classifier does not return a model", async () => {
        const mockLlmRouter = vi.fn().mockResolvedValue(null);
        const engine = new RouterEngine({ llmRouter: mockLlmRouter });

        const decision = await engine.decide({
            requestId: "req-profile-override",
            request: { model: "auto-cheap", messages: [] },
            config: { ...defaultConfig, defaultModel: "anthropic/claude-3-opus" },
            catalog,
            catalogVersion: "v1",
            pinStore: new MockPinStore(),
            profiles: [
                { id: "planning-backend", name: "Planning Backend" },
                { id: "auto-cheap", name: "Cheap", defaultModel: "anthropic/claude-3-opus" },
            ],
        });

        expect(decision.selectedModel).toBe("anthropic/claude-3-opus");
        expect(decision.explanation.profileId).toBe("auto-cheap");
    });

    it("ignores profile-local defaultModel metadata inside RouterEngine and uses the resolved config fallback", async () => {
        const mockLlmRouter = vi.fn().mockResolvedValue(null);
        const engine = new RouterEngine({ llmRouter: mockLlmRouter });

        const decision = await engine.decide({
            requestId: "req-profile-no-override",
            request: { model: "auto-cheap", messages: [] },
            config: defaultConfig,
            catalog,
            catalogVersion: "v1",
            pinStore: new MockPinStore(),
            profiles: [
                { id: "planning-backend", name: "Planning Backend" },
                { id: "auto-cheap", name: "Cheap", defaultModel: "anthropic/claude-3-opus" },
            ],
        });

        expect(decision.selectedModel).toBe("openai/gpt-4o");
    });

    it("re-evaluates when smart pin turns have been exhausted", async () => {
        const mockLlmRouter = vi.fn().mockResolvedValue({
            selectedModel: "openai/gpt-4o",
            confidence: 0.9,
            signals: ["reroute"],
        });

        const engine = new RouterEngine({ llmRouter: mockLlmRouter });
        const pinStore = new MockPinStore();

        const messages: RouterRequestLike["messages"] = [
            { role: "user", content: "Write some code" },
            { role: "assistant", content: "Here is some code..." },
            { role: "user", content: "Continue the implementation" },
        ];
        const threadKey = buildProfileThreadKey({ model: "planning-backend", messages });

        await pinStore.set({
            threadKey,
            modelId: "anthropic/claude-3-opus",
            requestId: "old-req",
            pinnedAt: new Date().toISOString(),
            expiresAt: new Date(Date.now() + 10000).toISOString(),
            turnCount: 5,
        });

        const decision = await engine.decide({
            requestId: "req-sticky-pin",
            request: { model: "planning-backend", messages },
            config: { ...defaultConfig, smartPinTurns: 3 },
            catalog,
            catalogVersion: "v1",
            pinStore,
            profiles: namedProfiles,
        });

        expect(mockLlmRouter).toHaveBeenCalledOnce();
        expect(decision.pinUsed).toBe(false);
        expect(decision.selectedModel).toBe("anthropic/claude-3-opus");
        expect(decision.explanation.pinBypassReason).toBe("smart_pin_turn_limit");
        expect(decision.crossFamilySwitchBlocked).toBe(true);
        expect(decision.familyStickinessApplied).toBe(true);
    });

    it("stores the classifier-selected reroute budget for new smart pins", async () => {
        const mockLlmRouter = vi.fn().mockResolvedValue({
            selectedModel: "openai/gpt-4o",
            confidence: 0.82,
            signals: ["planning"],
            rerouteAfterTurns: 2,
        });

        const engine = new RouterEngine({ llmRouter: mockLlmRouter });
        const decision = await engine.decide({
            requestId: "req-smart-budget",
            request: { model: "planning-backend", messages: [{ role: "user", content: "Plan this migration." }] },
            config: defaultConfig,
            catalog,
            catalogVersion: "v1",
            pinStore: new MockPinStore(),
            profiles: namedProfiles,
        });

        expect(decision.pinRerouteAfterTurns).toBe(2);
        expect(decision.pinBudgetSource).toBe("classifier");
        expect(decision.pinTurnCount).toBeUndefined();
        expect(decision.explanation.pinConsumedUserTurns).toBe(0);
    });

    it("reroutes on the next user continuation when the smart pin budget is one", async () => {
        const mockLlmRouter = vi.fn().mockResolvedValue({
            selectedModel: "openai/gpt-4o",
            confidence: 0.86,
            signals: ["budget:1"],
        });

        const engine = new RouterEngine({ llmRouter: mockLlmRouter });
        const pinStore = new MockPinStore();
        const messages: RouterRequestLike["messages"] = [
            { role: "user", content: "Plan this task" },
            { role: "assistant", content: "Here is the plan." },
            { role: "user", content: "Now implement it." },
        ];
        const threadKey = buildProfileThreadKey({ model: "planning-backend", messages });

        await pinStore.set({
            threadKey,
            modelId: "anthropic/claude-3-opus",
            requestId: "old-req",
            pinnedAt: new Date().toISOString(),
            expiresAt: new Date(Date.now() + 10000).toISOString(),
            turnCount: 0,
            rerouteAfterTurns: 1,
            budgetSource: "classifier",
        });

        const decision = await engine.decide({
            requestId: "req-smart-budget-one",
            request: { model: "planning-backend", messages },
            config: defaultConfig,
            catalog,
            catalogVersion: "v1",
            pinStore,
            profiles: namedProfiles,
        });

        expect(mockLlmRouter).toHaveBeenCalledOnce();
        expect(decision.pinUsed).toBe(false);
        expect(decision.explanation.pinBypassReason).toBe("smart_pin_turn_limit");
    });

    it("reroutes only when the latest user message explicitly forces it", async () => {
        const mockLlmRouter = vi.fn().mockResolvedValue({
            selectedModel: "openai/gpt-4o",
            confidence: 0.9,
            signals: ["forced"],
        });

        const engine = new RouterEngine({ llmRouter: mockLlmRouter });
        const pinStore = new MockPinStore();

        const messages: RouterRequestLike["messages"] = [
            { role: "user", content: "Help me with a task" },
            { role: "assistant", content: "Sure, I can help." },
            { role: "user", content: "$$route switch for this turn" },
        ];
        const threadKey = buildProfileThreadKey({ model: "planning-backend", messages });

        await pinStore.set({
            threadKey,
            modelId: "anthropic/claude-3-opus",
            requestId: "old-req",
            pinnedAt: new Date().toISOString(),
            expiresAt: new Date(Date.now() + 10000).toISOString(),
            turnCount: 5,
        });

        const decision = await engine.decide({
            requestId: "req-force-reroute",
            request: { model: "planning-backend", messages },
            config: { ...defaultConfig, smartPinTurns: 3 },
            catalog,
            catalogVersion: "v1",
            pinStore,
            profiles: namedProfiles,
        });

        expect(mockLlmRouter).toHaveBeenCalledOnce();
        expect(decision.pinUsed).toBe(false);
        expect(decision.selectedModel).toBe("openai/gpt-4o");
        expect(decision.explanation.pinBypassReason).toBe("force_route");
    });

    it("every_message mode skips pin and always invokes classifier", async () => {
        const mockLlmRouter = vi.fn().mockResolvedValue({
            selectedModel: "openai/gpt-4o",
            confidence: 0.9,
            signals: ["every_message"],
        });

        const engine = new RouterEngine({ llmRouter: mockLlmRouter });
        const pinStore = new MockPinStore();

        const messages: RouterRequestLike["messages"] = [
            { role: "user", content: "Write some code" },
            { role: "assistant", content: "Here is some code..." },
            { role: "user", content: "Continue" },
        ];
        const threadKey = buildProfileThreadKey({ model: "planning-backend", messages });

        await pinStore.set({
            threadKey,
            modelId: "anthropic/claude-3-opus",
            requestId: "old-req",
            pinnedAt: new Date().toISOString(),
            expiresAt: new Date(Date.now() + 10000).toISOString(),
            turnCount: 3,
        });

        const decision = await engine.decide({
            requestId: "req-every-message",
            request: { model: "planning-backend", messages },
            config: { ...defaultConfig, routingFrequency: "every_message" },
            catalog,
            catalogVersion: "v1",
            pinStore,
            profiles: namedProfiles,
        });

        expect(mockLlmRouter).toHaveBeenCalledOnce();
        expect(decision.pinUsed).toBe(false);
        expect(decision.shouldPin).toBe(false);
        expect(decision.selectedModel).toBe("openai/gpt-4o");
        expect(decision.explanation.pinBypassReason).toBe("routing_frequency_every_message");
    });

    it("new_thread_only mode honors force-route and re-evaluates", async () => {
        const mockLlmRouter = vi.fn().mockResolvedValue({
            selectedModel: "openai/gpt-4o",
            confidence: 0.9,
            signals: ["forced_in_new_thread_only"],
        });

        const engine = new RouterEngine({ llmRouter: mockLlmRouter });
        const pinStore = new MockPinStore();

        const messages: RouterRequestLike["messages"] = [
            { role: "user", content: "Help me" },
            { role: "assistant", content: "Sure" },
            { role: "user", content: "$$route switch models" },
        ];
        const threadKey = buildProfileThreadKey({ model: "planning-backend", messages });

        await pinStore.set({
            threadKey,
            modelId: "anthropic/claude-3-opus",
            requestId: "old-req",
            pinnedAt: new Date().toISOString(),
            expiresAt: new Date(Date.now() + 10000).toISOString(),
            turnCount: 2,
        });

        const decision = await engine.decide({
            requestId: "req-new-thread-only",
            request: { model: "planning-backend", messages },
            config: { ...defaultConfig, routingFrequency: "new_thread_only" },
            catalog,
            catalogVersion: "v1",
            pinStore,
            profiles: namedProfiles,
        });

        expect(mockLlmRouter).toHaveBeenCalledOnce();
        expect(decision.pinUsed).toBe(false);
        expect(decision.selectedModel).toBe("openai/gpt-4o");
        expect(decision.explanation.pinBypassReason).toBe("force_route");
    });

    it("new_thread_only mode routes normally on a new thread", async () => {
        const mockLlmRouter = vi.fn().mockResolvedValue({
            selectedModel: "openai/gpt-4o",
            confidence: 0.85,
            signals: ["new_thread"],
        });

        const engine = new RouterEngine({ llmRouter: mockLlmRouter });

        const decision = await engine.decide({
            requestId: "req-new-thread-only-new",
            request: { model: "planning-backend", messages: [{ role: "user", content: "Hello" }] },
            config: { ...defaultConfig, routingFrequency: "new_thread_only" },
            catalog,
            catalogVersion: "v1",
            pinStore: new MockPinStore(),
            profiles: namedProfiles,
        });

        expect(mockLlmRouter).toHaveBeenCalledOnce();
        expect(decision.selectedModel).toBe("openai/gpt-4o");
        expect(decision.shouldPin).toBe(true);
    });

    it("custom trigger keyword bypasses pin in smart mode", async () => {
        const mockLlmRouter = vi.fn().mockResolvedValue({
            selectedModel: "openai/gpt-4o",
            confidence: 0.9,
            signals: ["custom_trigger"],
        });

        const engine = new RouterEngine({ llmRouter: mockLlmRouter });
        const pinStore = new MockPinStore();

        const messages: RouterRequestLike["messages"] = [
            { role: "user", content: "Help me" },
            { role: "assistant", content: "Sure" },
            { role: "user", content: "!switch use a faster model" },
        ];
        const threadKey = buildProfileThreadKey({ model: "planning-backend", messages });

        await pinStore.set({
            threadKey,
            modelId: "anthropic/claude-3-opus",
            requestId: "old-req",
            pinnedAt: new Date().toISOString(),
            expiresAt: new Date(Date.now() + 10000).toISOString(),
            turnCount: 2,
        });

        const decision = await engine.decide({
            requestId: "req-custom-trigger",
            request: { model: "planning-backend", messages },
            config: { ...defaultConfig, routeTriggerKeywords: ["!switch"] },
            catalog,
            catalogVersion: "v1",
            pinStore,
            profiles: namedProfiles,
        });

        expect(mockLlmRouter).toHaveBeenCalledOnce();
        expect(decision.pinUsed).toBe(false);
        expect(decision.selectedModel).toBe("openai/gpt-4o");
        expect(decision.explanation.pinBypassReason).toBe("force_route");
    });

    it("should force cache lock ignoring cooldowns during agent loops", async () => {
        const engine = new RouterEngine();
        const pinStore = new MockPinStore();

        const request: RouterRequestLike = {
            model: "planning-backend",
            messages: [
                { role: "user", content: "Do some work" },
                { role: "assistant", tool_calls: [{ id: "call_123", type: "function", function: { name: "get_weather", arguments: "{}" } }] }
            ]
        };

        const threadKey = buildProfileThreadKey(request);
        await pinStore.set({
            threadKey,
            modelId: "anthropic/claude-3-opus",
            requestId: "old-req",
            pinnedAt: new Date().toISOString(),
            expiresAt: new Date(Date.now() + 10000).toISOString(),
            turnCount: 10 // well past cooldown
        });

        const decision = await engine.decide({
            requestId: "req-agent-loop",
            request,
            config: { ...defaultConfig, smartPinTurns: 3 },
            catalog,
            catalogVersion: "v1",
            pinStore,
            profiles: namedProfiles,
        });

        // Agent loops should keep the pin without consuming the user-turn budget.
        expect(decision.pinUsed).toBe(true);
        expect(decision.selectedModel).toBe("anthropic/claude-3-opus");
        expect(decision.explanation.decisionReason).toBe("thread_pin");
        expect(decision.pinTurnCount).toBe(10);
    });

    it("blocks cross-family continuation switches by default", async () => {
        const mockLlmRouter = vi.fn().mockResolvedValue({
            selectedModel: "openai/gpt-5.2",
            confidence: 0.95,
            signals: ["family:openai"],
            stepClassification: {
                stepMode: "deliberate",
                complexity: "medium",
                stakes: "medium",
                latencySensitivity: "medium",
                toolNeed: "optional",
                expectedOutputSize: "medium",
                interactionHorizon: "multi_step",
            },
            rerouteAfterTurns: 1,
        });
        const engine = new RouterEngine({ llmRouter: mockLlmRouter });
        const pinStore = new MockPinStore();
        const policyCatalog = [
            { id: "anthropic/claude-3-opus", name: "Claude 3 Opus" },
            { id: "openai/gpt-5.2", name: "GPT-5.2" },
        ];
        const request: RouterRequestLike = {
            model: "planning-backend",
            messages: [
                { role: "user", content: "Plan the system." },
                { role: "assistant", content: "Here is the plan." },
                { role: "user", content: "Continue." },
            ],
        };
        const threadKey = buildProfileThreadKey(request);
        await pinStore.set({
            threadKey,
            modelId: "anthropic/claude-3-opus",
            familyId: "anthropic/claude-3-opus",
            requestId: "old-req",
            pinnedAt: new Date().toISOString(),
            expiresAt: new Date(Date.now() + 10000).toISOString(),
            turnCount: 1,
            rerouteAfterTurns: 1,
            reasoningEffort: "high",
            stepMode: "deliberate",
        });

        const decision = await engine.decide({
            requestId: "req-cross-family-blocked",
            request,
            config: { ...defaultConfig, smartPinTurns: 1 },
            catalog: policyCatalog,
            catalogVersion: "v1",
            pinStore,
            profiles: namedProfiles,
        });

        expect(decision.selectedModel).toBe("anthropic/claude-3-opus");
        expect(decision.selectedFamily).toBe("anthropic/claude-3-opus");
        expect(decision.crossFamilySwitchBlocked).toBe(true);
        expect(decision.familyStickinessApplied).toBe(true);
        expect(decision.switchReason).toBe("cross_family_switch_blocked_by_policy");
    });

    it("does not apply family stickiness when the active pin is invalid", async () => {
        const mockLlmRouter = vi.fn().mockResolvedValue({
            selectedModel: "openai/gpt-5.2",
            confidence: 0.95,
            signals: ["family:openai"],
            stepClassification: {
                stepMode: "deliberate",
                complexity: "medium",
                stakes: "medium",
                latencySensitivity: "medium",
                toolNeed: "optional",
                expectedOutputSize: "medium",
                interactionHorizon: "multi_step",
            },
        });
        const engine = new RouterEngine({ llmRouter: mockLlmRouter });
        const pinStore = new MockPinStore();
        const policyCatalog = [
            { id: "openai/gpt-5.2", name: "GPT-5.2" },
        ];
        const request: RouterRequestLike = {
            model: "planning-backend",
            messages: [
                { role: "user", content: "Plan the system." },
                { role: "assistant", content: "Here is the plan." },
                { role: "user", content: "Continue." },
            ],
        };
        const threadKey = buildProfileThreadKey(request);
        await pinStore.set({
            threadKey,
            modelId: "anthropic/claude-3-opus",
            familyId: "anthropic/claude-3-opus",
            requestId: "old-req",
            pinnedAt: new Date().toISOString(),
            expiresAt: new Date(Date.now() + 10000).toISOString(),
            turnCount: 1,
            rerouteAfterTurns: 1,
            reasoningEffort: "high",
            stepMode: "deliberate",
        });

        const decision = await engine.decide({
            requestId: "req-invalid-pin-family-switch",
            request,
            config: { ...defaultConfig, smartPinTurns: 1 },
            catalog: policyCatalog,
            catalogVersion: "v1",
            pinStore,
            profiles: namedProfiles,
        });

        expect(decision.selectedModel).toBe("openai/gpt-5.2");
        expect(decision.selectedFamily).toBe("openai/gpt-5.2");
        expect(decision.crossFamilySwitchBlocked).toBe(false);
        expect(decision.familyStickinessApplied).toBe(false);
        expect(decision.switchMode).toBe("switch_family");
    });

    it("allows explicit reroute to switch families mid-thread", async () => {
        const mockLlmRouter = vi.fn().mockResolvedValue({
            selectedModel: "openai/gpt-5.2",
            confidence: 0.93,
            signals: ["forced_reroute"],
            stepClassification: {
                stepMode: "deliberate",
                complexity: "medium",
                stakes: "medium",
                latencySensitivity: "medium",
                toolNeed: "optional",
                expectedOutputSize: "medium",
                interactionHorizon: "multi_step",
            },
        });
        const engine = new RouterEngine({ llmRouter: mockLlmRouter });
        const pinStore = new MockPinStore();
        const policyCatalog = [
            { id: "anthropic/claude-3-opus", name: "Claude 3 Opus" },
            { id: "openai/gpt-5.2", name: "GPT-5.2" },
        ];
        const messages: RouterRequestLike["messages"] = [
            { role: "user", content: "Plan the system." },
            { role: "assistant", content: "Here is the plan." },
            { role: "user", content: "$$route use something else" },
        ];
        const threadKey = buildProfileThreadKey({ model: "planning-backend", messages });
        await pinStore.set({
            threadKey,
            modelId: "anthropic/claude-3-opus",
            familyId: "anthropic/claude-3-opus",
            requestId: "old-req",
            pinnedAt: new Date().toISOString(),
            expiresAt: new Date(Date.now() + 10000).toISOString(),
            turnCount: 2,
            reasoningEffort: "high",
            stepMode: "deliberate",
        });

        const decision = await engine.decide({
            requestId: "req-cross-family-reroute",
            request: { model: "planning-backend", messages },
            config: defaultConfig,
            catalog: policyCatalog,
            catalogVersion: "v1",
            pinStore,
            profiles: namedProfiles,
        });

        expect(decision.selectedModel).toBe("openai/gpt-5.2");
        expect(decision.switchMode).toBe("switch_family");
        expect(decision.crossFamilySwitchBlocked).toBe(false);
    });

    it("downgrades within a family after planning transitions into a tool step", async () => {
        const mockLlmRouter = vi.fn().mockResolvedValue({
            selectedModel: "openai/gpt-5.2:xhigh",
            confidence: 0.9,
            signals: ["phase:execution"],
            stepClassification: {
                stepMode: "tool",
                complexity: "low",
                stakes: "low",
                latencySensitivity: "high",
                toolNeed: "required",
                expectedOutputSize: "short",
                interactionHorizon: "one_shot",
            },
            rerouteAfterTurns: 1,
        });
        const engine = new RouterEngine({ llmRouter: mockLlmRouter });
        const pinStore = new MockPinStore();
        const familyCatalog = [
            { id: "openai/gpt-5.2", name: "GPT-5.2", upstreamModelId: "openai/gpt-5.2", reasoningPreset: "none" as const },
            { id: "openai/gpt-5.2:high", name: "GPT-5.2 High", upstreamModelId: "openai/gpt-5.2", reasoningPreset: "high" as const },
            { id: "openai/gpt-5.2:xhigh", name: "GPT-5.2 Extra High", upstreamModelId: "openai/gpt-5.2", reasoningPreset: "xhigh" as const },
        ];
        const request: RouterRequestLike = {
            model: "planning-backend",
            messages: [
                { role: "user", content: "Plan the migration." },
                { role: "assistant", content: "Plan complete." },
                { role: "user", content: "Now just call the tool and edit the file." },
            ],
            tools: [{ type: "function", function: { name: "edit_file" } }],
        };
        const threadKey = buildProfileThreadKey(request);
        await pinStore.set({
            threadKey,
            modelId: "openai/gpt-5.2:xhigh",
            familyId: "openai/gpt-5.2",
            requestId: "old-req",
            pinnedAt: new Date().toISOString(),
            expiresAt: new Date(Date.now() + 10000).toISOString(),
            turnCount: 1,
            rerouteAfterTurns: 1,
            reasoningEffort: "xhigh",
            stepMode: "deliberate",
        });

        const decision = await engine.decide({
            requestId: "req-in-family-downgrade",
            request,
            config: { ...defaultConfig, smartPinTurns: 1 },
            catalog: familyCatalog,
            catalogVersion: "v1",
            pinStore,
            profiles: namedProfiles,
        });

        expect(decision.selectedFamily).toBe("openai/gpt-5.2");
        expect(decision.selectedModel).toBe("openai/gpt-5.2");
        expect(decision.selectedEffort).toBe("low");
        expect(decision.switchMode).toBe("shift_within_family");
    });

    it("raises the effort floor for critical-stakes work", async () => {
        const mockLlmRouter = vi.fn().mockResolvedValue({
            selectedModel: "openai/gpt-5.2",
            confidence: 0.92,
            signals: ["stakes:critical"],
            stepClassification: {
                stepMode: "deliberate",
                complexity: "medium",
                stakes: "critical",
                latencySensitivity: "medium",
                toolNeed: "optional",
                expectedOutputSize: "medium",
                interactionHorizon: "one_shot",
            },
        });
        const engine = new RouterEngine({ llmRouter: mockLlmRouter });
        const familyCatalog = [
            { id: "openai/gpt-5.2", name: "GPT-5.2", upstreamModelId: "openai/gpt-5.2", reasoningPreset: "none" as const },
            { id: "openai/gpt-5.2:xhigh", name: "GPT-5.2 Extra High", upstreamModelId: "openai/gpt-5.2", reasoningPreset: "xhigh" as const },
        ];

        const decision = await engine.decide({
            requestId: "req-critical-stakes",
            request: { model: "planning-backend", messages: [{ role: "user", content: "This is a critical safety decision." }] },
            config: defaultConfig,
            catalog: familyCatalog,
            catalogVersion: "v1",
            pinStore: new MockPinStore(),
            profiles: namedProfiles,
        });

        expect(decision.selectedEffort).toBe("xhigh");
        expect(decision.selectedModel).toBe("openai/gpt-5.2:xhigh");
    });

    it("can pin routing to provider-default effort without forcing an explicit reasoning param", async () => {
        const mockLlmRouter = vi.fn().mockResolvedValue({
            selectedModel: "google/gemini-2.5-pro:thinking",
            confidence: 0.85,
            signals: ["provider_default"],
            stepClassification: {
                stepMode: "deliberate",
                complexity: "medium",
                stakes: "medium",
                latencySensitivity: "medium",
                toolNeed: "optional",
                expectedOutputSize: "medium",
                interactionHorizon: "one_shot",
            },
        });
        const engine = new RouterEngine({ llmRouter: mockLlmRouter });
        const familyCatalog = [
            { id: "google/gemini-2.5-pro", name: "Gemini 2.5 Pro", upstreamModelId: "google/gemini-2.5-pro", reasoningPreset: "provider_default" as const },
            { id: "google/gemini-2.5-pro:thinking", name: "Gemini 2.5 Pro Thinking", upstreamModelId: "google/gemini-2.5-pro", reasoningPreset: "high" as const },
        ];
        const profiles: RouterProfile[] = [
            {
                id: "planning-backend",
                name: "Planning Backend",
                routingInstructions: "Use Gemini for planning.",
                reasoningPolicy: {
                    mode: "fixed_provider_default",
                },
            },
        ];

        const decision = await engine.decide({
            requestId: "req-provider-default-effort",
            request: { model: "planning-backend", messages: [{ role: "user", content: "Plan this carefully." }] },
            config: defaultConfig,
            catalog: familyCatalog,
            catalogVersion: "v1",
            pinStore: new MockPinStore(),
            profiles,
        });

        expect(decision.selectedEffort).toBe("provider_default");
        expect(decision.selectedModel).toBe("google/gemini-2.5-pro");
    });
});
