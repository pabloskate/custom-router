import type { ChatMessage, RouterTool, ThreadFingerprintInput } from "./types";

const FORCE_ROUTE_KEYWORD = "$$route";

export function hasImagePayload(messages: ChatMessage[] = []): boolean {
  for (const message of messages) {
    if (Array.isArray(message.content)) {
      for (const part of message.content) {
        if (part && typeof part === "object") {
          const type = (part as { type?: unknown }).type;
          if (type === "image_url" || type === "image") {
            return true;
          }
        }
      }
    }
  }
  return false;
}

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
    try {
      return JSON.stringify(content);
    } catch {
      return "";
    }
  }

  return "";
}

function hasForceRouteDirective(text: string, keywords: string[]): boolean {
  const trimmed = text.trim();
  for (const keyword of keywords) {
    const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    if (new RegExp(`^${escaped}(?:\\s|$)`, "i").test(trimmed)) {
      return true;
    }
  }
  return false;
}

function getLatestUserMessageText(messages: ChatMessage[] = []): string | null {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const message = messages[i];
    if (message?.role !== "user") {
      continue;
    }

    const text = contentToText(message.content).trim();
    return text.length > 0 ? text : null;
  }

  return null;
}

function getLatestUserInputText(input: unknown): string | null {
  if (typeof input === "string") {
    const text = input.trim();
    return text.length > 0 ? text : null;
  }

  if (Array.isArray(input)) {
    for (let i = input.length - 1; i >= 0; i -= 1) {
      const item = input[i];

      if (typeof item === "string") {
        const text = item.trim();
        if (text.length > 0) return text;
        continue;
      }

      if (!item || typeof item !== "object") {
        continue;
      }

      const obj = item as Record<string, unknown>;
      const type = obj.type;
      const role = obj.role;

      if (type === "message") {
        if (role !== "user") continue;
        const text = contentToText(obj.content).trim();
        if (text.length > 0) return text;
        continue;
      }

      if (type === "input_text" || type === "text") {
        const text =
          typeof obj.text === "string"
            ? obj.text.trim()
            : contentToText(obj.content ?? obj.text).trim();
        if (text.length > 0) return text;
        continue;
      }

      if (role === "user") {
        const text = contentToText(obj.content ?? obj.text).trim();
        if (text.length > 0) return text;
      }
    }

    return null;
  }

  if (input && typeof input === "object") {
    const obj = input as Record<string, unknown>;
    const role = obj.role;
    const type = obj.type;

    if (type === "message" && role !== "user") {
      return null;
    }

    if (role && role !== "user" && type !== "input_text" && type !== "text") {
      return null;
    }

    const text = contentToText(obj.content ?? obj.text).trim();
    return text.length > 0 ? text : null;
  }

  return null;
}

export function hasForceRouteRequest(args: {
  messages?: ChatMessage[];
  input?: unknown;
  triggerKeywords?: string[];
}): boolean {
  const latestUserText =
    args.input === undefined
      ? getLatestUserMessageText(args.messages)
      : getLatestUserInputText(args.input);

  if (!latestUserText) {
    return false;
  }

  const keywords = [FORCE_ROUTE_KEYWORD, ...(args.triggerKeywords ?? [])];
  return hasForceRouteDirective(latestUserText, keywords);
}

export function isAgentLoop(messages: ChatMessage[] = []): boolean {
  if (messages.length === 0) return false;

  const lastMessage = messages[messages.length - 1];

  if (lastMessage?.role === "tool") {
    return true;
  }

  if (lastMessage?.role === "assistant" && Array.isArray(lastMessage.tool_calls) && lastMessage.tool_calls.length > 0) {
    return true;
  }

  return false;
}

function normalizeText(text: string): string {
  return text.toLowerCase().replace(/\s+/g, " ").trim();
}

function fnv1a32(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = (hash >>> 0) * 0x01000193;
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function stableToolSignature(tools: RouterTool[] = []): string {
  const signatures = tools
    .map((tool) => ({
      type: tool.type ?? "function",
      name: tool.function?.name ?? ""
    }))
    .sort((a, b) => `${a.type}:${a.name}`.localeCompare(`${b.type}:${b.name}`));

  return signatures.map((item) => `${item.type}:${item.name}`).join("|");
}

function extractEarlyContext(messages: ChatMessage[] = []): string {
  const system = messages.find((message) => message.role === "system");
  const users: ChatMessage[] = [];
  let hitAssistantOrTool = false;

  for (const message of messages) {
    if (message.role === "assistant" || message.role === "tool") {
      hitAssistantOrTool = true;
      break;
    }

    if (message.role === "user") {
      users.push(message);
    }

    if (users.length >= 2) {
      break;
    }
  }

  if (!hitAssistantOrTool && users.length === 0) {
    users.push(...messages.filter((message) => message.role === "user").slice(0, 1));
  }

  const parts: string[] = [];

  if (system) {
    parts.push(`system:${normalizeText(contentToText(system.content))}`);
  }

  for (const [index, message] of users.entries()) {
    parts.push(`user${index}:${normalizeText(contentToText(message.content))}`);
  }

  return parts.join("\n");
}

export function hasAssistantOrToolMessages(messages: ChatMessage[] = []): boolean {
  return messages.some((message) => message.role === "assistant" || message.role === "tool");
}

export function isContinuationRequest(input: ThreadFingerprintInput): boolean {
  if (input.previousResponseId) {
    return true;
  }

  return hasAssistantOrToolMessages(input.messages);
}

export function buildThreadFingerprint(input: ThreadFingerprintInput): string {
  const previousResponseId = input.previousResponseId?.trim();
  if (previousResponseId) {
    // Append profile segment so the same response chain under two different
    // profiles never shares a pin.
    const profileSegment = input.profileId ? `:p:${input.profileId}` : "";
    return `response:${previousResponseId}${profileSegment}`;
  }

  const context = extractEarlyContext(input.messages);
  const tools = stableToolSignature(input.tools);
  // Include profileId in hash payload — same conversation, different profile = different pin.
  const profileSegment = input.profileId ? `\nprofile:${input.profileId}` : "";
  const payload = `${context}\ntools:${tools}${profileSegment}`;

  return `thread:${fnv1a32(payload)}`;
}

export function isNewConversation(input: ThreadFingerprintInput): boolean {
  return !isContinuationRequest(input);
}
