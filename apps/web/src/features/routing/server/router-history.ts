import type { AuthResult } from "@/src/lib/auth";
import { json } from "@/src/lib/infra";
import { requestId as makeRequestId } from "@/src/lib/infra/request-id";
import { ROUTER_HISTORY } from "@/src/lib/constants";
import { getRouterRepository } from "@/src/lib/storage";
import type { RecentModelUsageEntry } from "@/src/features/routing/contracts";

function getDecisionLabel(decisionReason: string): string {
  switch (decisionReason) {
    case "initial_route":
      return "Classifier";
    case "thread_pin":
      return "Pinned thread";
    case "fallback_after_failure":
      return "Fallback";
    case "fallback_default":
      return "Default fallback";
    case "passthrough":
      return "Passthrough";
    case "pin_invalid":
      return "Pin invalid";
    default:
      return decisionReason;
  }
}

function getLastUserMessageContent(messages: Array<{ role?: string; content?: unknown }> | undefined): string | null {
  if (!Array.isArray(messages)) {
    return null;
  }

  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message?.role !== "user") {
      continue;
    }

    return typeof message.content === "string" ? message.content : null;
  }

  return null;
}

function containsExactInspectTrigger(content: string | null): boolean {
  if (!content) {
    return false;
  }

  return content.split(/\s+/).some((token) => token.trim() === ROUTER_HISTORY.INSPECT_TRIGGER);
}

function formatHistoryEntry(entry: RecentModelUsageEntry, index: number): string {
  return `${index + 1}. ${entry.createdAt} | ${entry.requestedModel} -> ${entry.selectedModel} | ${getDecisionLabel(entry.decisionReason)}`;
}

export function isInspectHistoryRequest(args: {
  apiPath: string;
  body: { messages?: Array<{ role?: string; content?: unknown }> };
}): boolean {
  if (args.apiPath !== "/chat/completions") {
    return false;
  }

  return containsExactInspectTrigger(getLastUserMessageContent(args.body.messages));
}

export async function getRecentModelUsage(args: {
  userId: string;
  limit?: number;
}): Promise<RecentModelUsageEntry[]> {
  const repository = getRouterRepository();
  return repository.listRecentModelUsage(args.userId, args.limit ?? ROUTER_HISTORY.DEFAULT_LIMIT);
}

function buildInspectHistoryContent(entries: RecentModelUsageEntry[]): string {
  if (entries.length === 0) {
    return "No routed model history was found for the last 48 hours.";
  }

  return [
    `Recent routed models (last ${entries.length} requests):`,
    ...entries.map(formatHistoryEntry),
  ].join("\n");
}

function buildInspectHistoryJsonResponse(args: {
  requestId: string;
  content: string;
}): Response {
  return json(
    {
      id: args.requestId,
      object: "chat.completion",
      created: Math.floor(Date.now() / 1000),
      choices: [
        {
          index: 0,
          message: {
            role: "assistant",
            content: args.content,
          },
          finish_reason: "stop",
        },
      ],
    },
    200,
    {
      "cache-control": "no-store",
      "x-router-request-id": args.requestId,
    },
  );
}

function buildInspectHistoryStreamResponse(args: {
  requestId: string;
  content: string;
}): Response {
  const created = Math.floor(Date.now() / 1000);
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(`data: ${JSON.stringify({
        id: args.requestId,
        object: "chat.completion.chunk",
        created,
        choices: [
          {
            index: 0,
            delta: {
              role: "assistant",
              content: args.content,
            },
            finish_reason: null,
          },
        ],
      })}\n\n`));
      controller.enqueue(encoder.encode(`data: ${JSON.stringify({
        id: args.requestId,
        object: "chat.completion.chunk",
        created,
        choices: [
          {
            index: 0,
            delta: {},
            finish_reason: "stop",
          },
        ],
      })}\n\n`));
      controller.enqueue(encoder.encode("data: [DONE]\n\n"));
      controller.close();
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      "cache-control": "no-store",
      "content-type": "text/event-stream; charset=utf-8",
      "x-router-request-id": args.requestId,
    },
  });
}

export async function buildInspectHistoryResponse(args: {
  auth: AuthResult;
  stream: boolean;
}): Promise<Response> {
  const requestId = makeRequestId("router");
  const entries = await getRecentModelUsage({
    userId: args.auth.userId,
    limit: ROUTER_HISTORY.DEFAULT_LIMIT,
  });
  const content = buildInspectHistoryContent(entries);

  if (args.stream) {
    return buildInspectHistoryStreamResponse({
      requestId,
      content,
    });
  }

  return buildInspectHistoryJsonResponse({
    requestId,
    content,
  });
}
