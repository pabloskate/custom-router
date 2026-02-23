import {
    type ChatMessage,
    type LlmRoutingResult,
    type RouterTool,
    type CatalogItem
} from "./types";

export type LlmRouterFunction = (args: {
    prompt: string;
    catalog: CatalogItem[];
    routingInstructions?: string;
    classifierModel?: string;
    currentModel?: string;
}) => Promise<LlmRoutingResult | null>;

const PROMPT_WINDOW_USER_MESSAGES = 6;
const PROMPT_WINDOW_MAX_CHARS = 12_000;

function contentToText(content: unknown): string {
    if (typeof content === "string") {
        return content;
    }

    if (Array.isArray(content)) {
        return content
            .map((item) => {
                if (typeof item === "string") {
                    return item;
                }

                if (item && typeof item === "object" && "text" in item) {
                    const text = (item as { text?: unknown }).text;
                    return typeof text === "string" ? text : "";
                }

                return "";
            })
            .join(" ");
    }

    if (content && typeof content === "object") {
        if ("text" in content) {
            const text = (content as { text?: unknown }).text;
            return typeof text === "string" ? text : "";
        }

        try {
            return JSON.stringify(content);
        } catch {
            return "";
        }
    }

    return "";
}

type PromptRole = "user" | "system";
interface PromptEntry {
    role: PromptRole;
    text: string;
}

function normalizePromptRole(role: unknown): PromptRole | null {
    if (role === "user") return "user";
    if (role === "system" || role === "developer") return "system";
    return null;
}

function buildEntriesFromMessages(messages: ChatMessage[] = []): PromptEntry[] {
    return messages
        .map((message) => {
            const role = normalizePromptRole(message.role);
            if (!role) return null;
            const text = contentToText(message.content).trim();
            return text ? { role, text } : null;
        })
        .filter((entry): entry is PromptEntry => entry !== null);
}

function buildEntriesFromResponsesInput(input: unknown): PromptEntry[] {
    if (typeof input === "string") {
        const text = input.trim();
        return text ? [{ role: "user", text }] : [];
    }

    if (Array.isArray(input)) {
        const entries: PromptEntry[] = [];

        for (const item of input) {
            if (typeof item === "string") {
                const text = item.trim();
                if (text) entries.push({ role: "user", text });
                continue;
            }

            if (!item || typeof item !== "object") {
                continue;
            }

            const obj = item as Record<string, unknown>;
            const role = normalizePromptRole(obj.role);

            // OpenAI Responses API item format: { type: "message", role, content }
            if (obj.type === "message") {
                const text = contentToText(obj.content).trim();
                if (role && text) entries.push({ role, text });
                continue;
            }

            // OpenAI Responses API text item format: { type: "input_text", text }
            if (obj.type === "input_text" || obj.type === "text") {
                const text = typeof obj.text === "string" ? obj.text.trim() : "";
                if (text) entries.push({ role: role ?? "user", text });
                continue;
            }

            // Generic role/content object fallback.
            if (role) {
                const text = contentToText(obj.content ?? obj.text).trim();
                if (text) entries.push({ role, text });
            }
        }

        return entries;
    }

    if (input && typeof input === "object") {
        const obj = input as Record<string, unknown>;
        const role = normalizePromptRole(obj.role) ?? "user";
        const text = contentToText(obj.content ?? obj.text).trim();
        return text ? [{ role, text }] : [];
    }

    return [];
}

export function buildPromptWindow(args: {
    messages?: ChatMessage[];
    input?: unknown;
} = {}): string {
    const entries = [
        ...buildEntriesFromMessages(args.messages ?? []),
        ...buildEntriesFromResponsesInput(args.input),
    ];

    if (entries.length === 0) {
        return "";
    }

    const latestSystem = [...entries].reverse().find((entry) => entry.role === "system");
    const recentUsers = entries.filter((entry) => entry.role === "user").slice(-PROMPT_WINDOW_USER_MESSAGES);
    const selected: PromptEntry[] = [...(latestSystem ? [latestSystem] : []), ...recentUsers];

    const prompt = selected
        .map((entry) => entry.text)
        .join("\n")
        .trim();

    if (prompt.length <= PROMPT_WINDOW_MAX_CHARS) {
        return prompt;
    }

    // Preserve the latest user intent when truncating large histories.
    return prompt.slice(-PROMPT_WINDOW_MAX_CHARS).trim();
}
