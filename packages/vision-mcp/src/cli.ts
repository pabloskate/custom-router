#!/usr/bin/env node
import { createInterface } from "node:readline";

import { callTool, TOOL_DEFINITIONS } from "./tools.js";

type JsonRpcId = number | string | null;

interface JsonRpcMessage {
  id?: JsonRpcId;
  jsonrpc?: string;
  method?: string;
  params?: unknown;
}

function writeJson(message: unknown): void {
  process.stdout.write(`${JSON.stringify(message)}\n`);
}

function writeError(id: JsonRpcId | undefined, code: number, message: string): void {
  if (id === undefined) {
    return;
  }
  writeJson({
    jsonrpc: "2.0",
    id,
    error: { code, message },
  });
}

async function handleMessage(message: JsonRpcMessage): Promise<void> {
  const id = message.id;
  const method = message.method;

  if (!method) {
    writeError(id, -32600, "Invalid request.");
    return;
  }

  if (method.startsWith("notifications/")) {
    return;
  }

  if (method === "initialize") {
    writeJson({
      jsonrpc: "2.0",
      id,
      result: {
        protocolVersion: "2025-06-18",
        capabilities: { tools: { listChanged: false } },
        serverInfo: {
          name: "customrouter-vision-mcp",
          version: "0.1.0",
        },
      },
    });
    return;
  }

  if (method === "ping") {
    writeJson({ jsonrpc: "2.0", id, result: {} });
    return;
  }

  if (method === "tools/list") {
    writeJson({
      jsonrpc: "2.0",
      id,
      result: { tools: TOOL_DEFINITIONS },
    });
    return;
  }

  if (method === "tools/call") {
    const params = message.params && typeof message.params === "object"
      ? message.params as { arguments?: unknown; name?: unknown }
      : {};
    if (typeof params.name !== "string") {
      writeError(id, -32602, "Tool name is required.");
      return;
    }

    const result = await callTool(params.name, params.arguments);
    writeJson({ jsonrpc: "2.0", id, result });
    return;
  }

  writeError(id, -32601, `Method not found: ${method}`);
}

function startMcpServer(): void {
  const input = createInterface({
    input: process.stdin,
    crlfDelay: Infinity,
  });

  input.on("line", (line) => {
    if (!line.trim()) {
      return;
    }

    void (async () => {
      try {
        const parsed = JSON.parse(line) as JsonRpcMessage;
        await handleMessage(parsed);
      } catch (error) {
        process.stderr.write(`customrouter-vision-mcp error: ${error instanceof Error ? error.message : String(error)}\n`);
      }
    })();
  });
}

async function runDirectDescribe(args: string[]): Promise<void> {
  const source = args[0];
  if (!source) {
    throw new Error("Usage: customrouter-vision-mcp describe <image-path-or-url>");
  }
  const result = await callTool("describe_image", { source });
  process.stdout.write(`${result.content[0]?.text ?? ""}\n`);
  if (result.isError) {
    process.exitCode = 1;
  }
}

async function main(): Promise<void> {
  const [command, ...args] = process.argv.slice(2);
  if (!command || command === "mcp") {
    startMcpServer();
    return;
  }

  if (command === "describe") {
    await runDirectDescribe(args);
    return;
  }

  throw new Error(`Unknown command: ${command}`);
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
