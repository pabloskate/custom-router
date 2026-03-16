import { describe, expect, it, vi } from "vitest";
import { RouterEngine } from "../src/router-engine";
import { buildThreadFingerprint } from "../src/threading";
import type { PinStore, RouterConfig, RouterRequestLike, ThreadPin } from "../src/types";

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

    it("should call llmRouter when model=auto and use the result", async () => {
        const mockLlmRouter = vi.fn().mockResolvedValue({
            selectedModel: "anthropic/claude-3-opus",
            confidence: 0.9,
            signals: ["math"]
        });

        const engine = new RouterEngine({ llmRouter: mockLlmRouter });
        const request: RouterRequestLike = {
            model: "auto",
            messages: [{ role: "user", content: "What is 2+2?" }]
        };

        const decision = await engine.decide({
            requestId: "req-2",
            request,
            config: defaultConfig,
            catalog,
            catalogVersion: "v1",
            pinStore: new MockPinStore()
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

    it("should pass responses input text to llmRouter prompt", async () => {
        const mockLlmRouter = vi.fn().mockResolvedValue({
            selectedModel: "anthropic/claude-3-opus",
            confidence: 0.91,
            signals: ["from_responses_input"]
        });

        const engine = new RouterEngine({ llmRouter: mockLlmRouter });
        const request: RouterRequestLike = {
            model: "auto",
            input: "Use claude for this advanced reasoning task."
        };

        const decision = await engine.decide({
            requestId: "req-responses-input",
            request,
            config: defaultConfig,
            catalog,
            catalogVersion: "v1",
            pinStore: new MockPinStore()
        });

        expect(mockLlmRouter).toHaveBeenCalledOnce();
        const args = mockLlmRouter.mock.calls[0]?.[0] as any;
        expect(args.prompt).toContain("Use claude for this advanced reasoning task.");
        expect(decision.selectedModel).toBe("anthropic/claude-3-opus");
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
            request: { model: "auto", messages: [] },
            config: defaultConfig,
            catalog,
            catalogVersion: "v1",
            pinStore: new MockPinStore()
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
            model: "auto",
            messages: [
                { role: "user", content: "Hello" },
                { role: "assistant", content: "Hi" },
                { role: "user", content: "Continuation" }
            ]
        };

        const threadKey = buildThreadFingerprint({ messages: request.messages });

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
            pinStore
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
            model: "auto",
            messages: [
                { role: "user", content: "Use opus for planning" },
                { role: "assistant", content: "Plan drafted." },
                { role: "user", content: "$$route continue with implementation" },
            ],
        };

        const threadKey = buildThreadFingerprint({ messages: request.messages });
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
        });

        expect(mockLlmRouter).toHaveBeenCalledOnce();
        expect(decision.pinUsed).toBe(false);
        expect(decision.explanation.decisionReason).toBe("initial_route");
        expect(decision.explanation.notes).toContain(
            "Force route directive detected in latest user message. Bypassing thread pin for this turn."
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
            model: "auto",
            messages: [
                { role: "user", content: "$$route" },
                { role: "assistant", content: "Switched." },
                { role: "user", content: "keep going" },
            ],
        };

        const threadKey = buildThreadFingerprint({ messages: request.messages });
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
        });

        expect(mockLlmRouter).not.toHaveBeenCalled();
        expect(decision.pinUsed).toBe(true);
        expect(decision.selectedModel).toBe("anthropic/claude-3-opus");
        expect(decision.explanation.decisionReason).toBe("thread_pin");
    });

    it("keeps the pin in tool-enabled continuation threads", async () => {
        const mockLlmRouter = vi.fn().mockResolvedValue({
            selectedModel: "openai/gpt-4o",
            confidence: 0.95,
            signals: ["phase_change"]
        });

        const engine = new RouterEngine({ llmRouter: mockLlmRouter });
        const pinStore = new MockPinStore();

        const request: RouterRequestLike = {
            model: "auto",
            messages: [
                { role: "user", content: "Write a plan" },
                { role: "assistant", content: "Here is the plan. [PHASE_COMPLETE_SIGNAL]" },
                { role: "user", content: "Great, now write the code." }
            ],
            tools: [{ type: "function", function: { name: "apply_patch" } }]
        };

        const threadKey = buildThreadFingerprint({ messages: request.messages, tools: request.tools });
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
            pinStore
        });

        expect(mockLlmRouter).not.toHaveBeenCalled();
        expect(decision.pinUsed).toBe(true);
        expect(decision.selectedModel).toBe("anthropic/claude-3-opus");
        expect(decision.explanation.decisionReason).toBe("thread_pin");
        expect(decision.explanation.notes).toContain("Reused pinned model from thread: anthropic/claude-3-opus. Turn count: 2 -> 3");
    });

    it("keeps the pin for non-tool continuation requests", async () => {
        const mockLlmRouter = vi.fn().mockResolvedValue({
            selectedModel: "openai/gpt-4o",
            confidence: 0.95,
            signals: ["phase_change"]
        });

        const engine = new RouterEngine({ llmRouter: mockLlmRouter });
        const pinStore = new MockPinStore();

        const request: RouterRequestLike = {
            model: "auto",
            previous_response_id: "resp_phase_ignore",
            messages: [
                { role: "user", content: "Write a plan" },
                { role: "assistant", content: "Here is the plan. [PHASE_COMPLETE_SIGNAL]" },
                { role: "user", content: "Great, now write the code." }
            ]
        };

        const threadKey = buildThreadFingerprint({ previousResponseId: request.previous_response_id });
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
            pinStore
        });

        expect(mockLlmRouter).not.toHaveBeenCalled();
        expect(decision.pinUsed).toBe(true);
        expect(decision.selectedModel).toBe("anthropic/claude-3-opus");
        expect(decision.explanation.decisionReason).toBe("thread_pin");
        expect(decision.explanation.notes).toContain("Reused pinned model from thread: anthropic/claude-3-opus. Turn count: 2 -> 3");
    });

    it("should use profile defaultModel when overrideModels is true and matched profile has defaultModel", async () => {
        const mockLlmRouter = vi.fn().mockResolvedValue({ selectedModel: "anthropic/claude-3-opus", confidence: 0.9, signals: [] });
        const engine = new RouterEngine({ llmRouter: mockLlmRouter });

        const decision = await engine.decide({
            requestId: "req-profile-override",
            request: { model: "auto-cheap", messages: [] },
            config: defaultConfig,
            catalog,
            catalogVersion: "v1",
            pinStore: new MockPinStore(),
            profiles: [
                { id: "auto", name: "Auto" },
                { id: "auto-cheap", name: "Cheap", overrideModels: true, defaultModel: "anthropic/claude-3-opus" },
            ],
        });

        expect(decision.selectedModel).toBe("anthropic/claude-3-opus");
        expect(decision.explanation.profileId).toBe("auto-cheap");
    });

    it("should use global defaultModel when profile has overrideModels false even if profile has defaultModel", async () => {
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
                { id: "auto", name: "Auto" },
                { id: "auto-cheap", name: "Cheap", overrideModels: false, defaultModel: "anthropic/claude-3-opus" },
            ],
        });

        expect(decision.selectedModel).toBe("openai/gpt-4o");
    });

    it("keeps the pin even after cooldownTurns has been exceeded", async () => {
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
        const threadKey = buildThreadFingerprint({ messages });

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
            request: { model: "auto", messages },
            config: { ...defaultConfig, cooldownTurns: 3 },
            catalog,
            catalogVersion: "v1",
            pinStore,
        });

        expect(mockLlmRouter).not.toHaveBeenCalled();
        expect(decision.pinUsed).toBe(true);
        expect(decision.selectedModel).toBe("anthropic/claude-3-opus");
        expect(decision.pinTurnCount).toBe(6);
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
        const threadKey = buildThreadFingerprint({ messages });

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
            request: { model: "auto", messages },
            config: { ...defaultConfig, cooldownTurns: 3 },
            catalog,
            catalogVersion: "v1",
            pinStore,
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
        const threadKey = buildThreadFingerprint({ messages });

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
            request: { model: "auto", messages },
            config: { ...defaultConfig, routingFrequency: "every_message" },
            catalog,
            catalogVersion: "v1",
            pinStore,
        });

        expect(mockLlmRouter).toHaveBeenCalledOnce();
        expect(decision.pinUsed).toBe(false);
        expect(decision.shouldPin).toBe(false);
        expect(decision.selectedModel).toBe("openai/gpt-4o");
        expect(decision.explanation.pinBypassReason).toBe("routing_frequency_every_message");
    });

    it("new_thread_only mode suppresses force-route and keeps pin", async () => {
        const mockLlmRouter = vi.fn().mockResolvedValue({
            selectedModel: "openai/gpt-4o",
            confidence: 0.9,
            signals: ["should_not_run"],
        });

        const engine = new RouterEngine({ llmRouter: mockLlmRouter });
        const pinStore = new MockPinStore();

        const messages: RouterRequestLike["messages"] = [
            { role: "user", content: "Help me" },
            { role: "assistant", content: "Sure" },
            { role: "user", content: "$$route switch models" },
        ];
        const threadKey = buildThreadFingerprint({ messages });

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
            request: { model: "auto", messages },
            config: { ...defaultConfig, routingFrequency: "new_thread_only" },
            catalog,
            catalogVersion: "v1",
            pinStore,
        });

        expect(mockLlmRouter).not.toHaveBeenCalled();
        expect(decision.pinUsed).toBe(true);
        expect(decision.selectedModel).toBe("anthropic/claude-3-opus");
        expect(decision.explanation.notes).toEqual(
            expect.arrayContaining([expect.stringContaining("ignored")])
        );
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
            request: { model: "auto", messages: [{ role: "user", content: "Hello" }] },
            config: { ...defaultConfig, routingFrequency: "new_thread_only" },
            catalog,
            catalogVersion: "v1",
            pinStore: new MockPinStore(),
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
        const threadKey = buildThreadFingerprint({ messages });

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
            request: { model: "auto", messages },
            config: { ...defaultConfig, routeTriggerKeywords: ["!switch"] },
            catalog,
            catalogVersion: "v1",
            pinStore,
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
            model: "auto",
            messages: [
                { role: "user", content: "Do some work" },
                { role: "assistant", tool_calls: [{ id: "call_123", type: "function", function: { name: "get_weather", arguments: "{}" } }] }
            ]
        };

        const threadKey = buildThreadFingerprint({ messages: request.messages });
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
            config: { ...defaultConfig, cooldownTurns: 3 },
            catalog,
            catalogVersion: "v1",
            pinStore
        });

        // The agent loop logic should bypass llm router entirely, keep the pin, increment turnCount
        expect(decision.pinUsed).toBe(true);
        expect(decision.selectedModel).toBe("anthropic/claude-3-opus");
        expect(decision.explanation.decisionReason).toBe("thread_pin");
        expect(decision.pinTurnCount).toBe(11); // 10 + 1
    });
});
