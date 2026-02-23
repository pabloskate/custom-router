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

    it("should force re-route when latest user message starts with #route", async () => {
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
                { role: "user", content: "#route continue with implementation" },
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
            "Force route directive detected in latest user message (#route). Bypassing thread pin for this turn."
        );
    });

    it("should not force re-route when #route appears only in older user messages", async () => {
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
                { role: "user", content: "#route" },
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

    it("should break cache lock if phase complete signal is detected", async () => {
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
            ]
        };

        const threadKey = buildThreadFingerprint({ messages: request.messages });
        await pinStore.set({
            threadKey,
            modelId: "anthropic/claude-3-haiku",
            requestId: "old-req",
            pinnedAt: new Date().toISOString(),
            expiresAt: new Date(Date.now() + 10000).toISOString(),
            turnCount: 2
        });

        const decision = await engine.decide({
            requestId: "req-phase-break",
            request,
            config: { ...defaultConfig, phaseCompleteSignal: "[PHASE_COMPLETE_SIGNAL]" },
            catalog,
            catalogVersion: "v1",
            pinStore
        });

        expect(mockLlmRouter).toHaveBeenCalledOnce();
        expect(decision.pinUsed).toBe(false);
        expect(decision.selectedModel).toBe("openai/gpt-4o");
        expect(decision.explanation.decisionReason).toBe("initial_route");
        expect(decision.explanation.notes).toContain("Phase complete signal detected. Breaking cache lock for routing.");
    });

    // ── Bug Replication Tests ──────────────────────────────────────────────────
    //
    // BUG: Once a model is pinned, it can never change even after pin cooldown
    // expires. Two compounding issues cause this:
    //
    //   1. router-engine.ts: when pin cooldown expires (`turnCount >= cooldownTurns`)
    //      and `pinUsed = false`, the engine still passes `currentModel: activePin.modelId`
    //      to the classifier. The classifier's STATUS QUO BIAS then forces it to
    //      return the same model, which gets re-pinned — creating an infinite lock.
    //
    //   2. frontier-router-classifier.ts: the STATUS QUO BIAS prompt uses "MUST"
    //      language ("You MUST select this exact same model AGAIN"), which overrides
    //      the user's explicit request to switch models.

    it("[BUG] passes expired pin model as currentModel, letting status quo bias re-lock it", async () => {
        const capturedArgs: any[] = [];
        const mockLlmRouter = vi.fn().mockImplementation(async (args) => {
            capturedArgs.push(args);
            // Simulate what the classifier does when STATUS QUO BIAS applies:
            // it returns the SAME model that was passed as currentModel.
            return {
                selectedModel: args.currentModel ?? "openai/gpt-4o",
                confidence: 0.9,
                signals: ["status_quo_bias"],
            };
        });

        const engine = new RouterEngine({ llmRouter: mockLlmRouter });
        const pinStore = new MockPinStore();

        const messages: RouterRequestLike["messages"] = [
            { role: "user", content: "Write some code" },
            { role: "assistant", content: "Here is some code..." },
            { role: "user", content: "Now use gpt-4o instead for the next part" },
        ];
        const threadKey = buildThreadFingerprint({ messages });

        // Pin is at cooldownTurns (= 3), so it should have EXPIRED and triggered re-evaluation
        await pinStore.set({
            threadKey,
            modelId: "anthropic/claude-3-opus", // the originally-pinned model
            requestId: "old-req",
            pinnedAt: new Date().toISOString(),
            expiresAt: new Date(Date.now() + 10000).toISOString(),
            turnCount: 3, // equal to cooldownTurns=3 → pin expired
        });

        const decision = await engine.decide({
            requestId: "req-bug-1",
            request: { model: "auto", messages },
            config: { ...defaultConfig, cooldownTurns: 3 },
            catalog,
            catalogVersion: "v1",
            pinStore,
        });

        // The classifier WAS called (pin expired) — good
        expect(mockLlmRouter).toHaveBeenCalledOnce();

        // BUG: currentModel is passed as the expired pin's model, feeding the status quo bias
        // This should be undefined/null when the pin has expired and we want fresh evaluation
        const classifierArgs = capturedArgs[0];
        expect(classifierArgs.currentModel).toBeUndefined(); // FAILS before fix

        // Because of the bug, the model is still claude-3-opus even though the user
        // asked for gpt-4o — it never actually re-routes
        expect(decision.selectedModel).not.toBe("anthropic/claude-3-opus"); // FAILS before fix
    });

    it("[BUG] user explicitly requests a different model in chat but status quo bias ignores it", async () => {
        // When a user says "use model X" in the conversation body, the classifier
        // rule #2 says "If the user specifically asks for a model that exists in the
        // catalog, use it." But the CRITICAL STATUS QUO BIAS overrides this with
        // "MUST select this exact same model AGAIN". This test proves the classifier
        // receives the right signal but the currentModel hint overwhelms it.
        const capturedArgs: any[] = [];
        const mockLlmRouter = vi.fn().mockImplementation(async (args) => {
            capturedArgs.push(args);
            // Simulate the status quo bias winning: returns currentModel, not the user's requested model
            return {
                selectedModel: args.currentModel ?? "openai/gpt-4o",
                confidence: 0.9,
                signals: ["status_quo_bias_override"],
            };
        });

        const engine = new RouterEngine({ llmRouter: mockLlmRouter });
        const pinStore = new MockPinStore();

        const messages: RouterRequestLike["messages"] = [
            { role: "user", content: "Help me with a task" },
            { role: "assistant", content: "Sure, I can help." },
            { role: "user", content: "Actually switch to openai/gpt-4o for this" },
        ];
        const threadKey = buildThreadFingerprint({ messages });

        // Pin expired (turnCount >= cooldownTurns)
        await pinStore.set({
            threadKey,
            modelId: "anthropic/claude-3-opus",
            requestId: "old-req",
            pinnedAt: new Date().toISOString(),
            expiresAt: new Date(Date.now() + 10000).toISOString(),
            turnCount: 5, // well past cooldown
        });

        const decision = await engine.decide({
            requestId: "req-bug-2",
            request: { model: "auto", messages },
            config: { ...defaultConfig, cooldownTurns: 3 },
            catalog,
            catalogVersion: "v1",
            pinStore,
        });

        expect(mockLlmRouter).toHaveBeenCalledOnce();

        // After fix: currentModel must NOT be passed when pin cooldown is expired,
        // so the classifier can make a fresh decision based on the user's instructions.
        const classifierArgs = capturedArgs[0];
        expect(classifierArgs.currentModel).toBeUndefined(); // FAILS before fix
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
