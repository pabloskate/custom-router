#!/usr/bin/env node

// src/cli.ts
import { createInterface } from "node:readline";

// src/config.ts
var VISION_MODES = ["general", "ui", "ocr", "diagram"];
var DEFAULT_MAX_IMAGE_BYTES = 8 * 1024 * 1024;
function requireEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is required.`);
  }
  return value;
}
function parseMaxImageBytes() {
  const raw = process.env.CUSTOMROUTER_MAX_IMAGE_BYTES?.trim();
  if (!raw) {
    return DEFAULT_MAX_IMAGE_BYTES;
  }
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_MAX_IMAGE_BYTES;
}
function loadConfig() {
  return {
    apiKey: requireEnv("CUSTOMROUTER_API_KEY"),
    baseUrl: requireEnv("CUSTOMROUTER_BASE_URL").replace(/\/+$/, ""),
    maxImageBytes: parseMaxImageBytes()
  };
}
function normalizeMode(value) {
  return VISION_MODES.includes(value) ? value : "ui";
}

// src/customrouter-client.ts
async function describeWithCustomRouter(config, args) {
  const response = await fetch(`${config.baseUrl}/api/v1/vision/describe`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      images: args.images,
      mode: args.mode,
      question: args.question,
      context: args.context
    })
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const message = typeof payload?.error === "string" ? payload.error : `CustomRouter vision request failed (${response.status}).`;
    throw new Error(message);
  }
  if (typeof payload?.description !== "string" || payload.description.trim().length === 0) {
    throw new Error("CustomRouter returned an empty vision description.");
  }
  return {
    description: payload.description,
    gatewayId: typeof payload.gatewayId === "string" ? payload.gatewayId : void 0,
    mode: typeof payload.mode === "string" ? payload.mode : void 0,
    model: typeof payload.model === "string" ? payload.model : void 0
  };
}

// src/local-images.ts
import { createWriteStream } from "node:fs";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, extname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { execFile, spawn } from "node:child_process";
var MIME_BY_EXT = {
  ".bmp": "image/bmp",
  ".gif": "image/gif",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".tif": "image/tiff",
  ".tiff": "image/tiff",
  ".webp": "image/webp"
};
function execFileAsync(command, args) {
  return new Promise((resolvePromise, reject) => {
    execFile(command, args, (error, _stdout, stderr) => {
      if (error) {
        reject(new Error(stderr?.trim() || error.message));
        return;
      }
      resolvePromise();
    });
  });
}
function runOutputToFile(command, args, outputPath) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] });
    const output = createWriteStream(outputPath);
    let stderr = "";
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.stdout.pipe(output);
    child.on("error", reject);
    child.on("close", (code) => {
      output.end();
      if (code === 0) {
        resolvePromise();
      } else {
        reject(new Error(stderr.trim() || `${command} exited with code ${code}`));
      }
    });
  });
}
async function firstSuccessful(commands) {
  const errors = [];
  for (const command of commands) {
    try {
      await command();
      return;
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
    }
  }
  throw new Error(errors.join("; "));
}
function powershellEscape(value) {
  return value.replaceAll("'", "''");
}
async function createTempImagePath(name) {
  const dir = await mkdtemp(join(tmpdir(), "customrouter-vision-"));
  return {
    path: join(dir, name),
    cleanup: () => rm(dir, { force: true, recursive: true })
  };
}
function getPathFromSource(source) {
  if (source.startsWith("file://")) {
    return fileURLToPath(source);
  }
  return isAbsolute(source) ? source : resolve(process.cwd(), source);
}
function getMimeType(path) {
  return MIME_BY_EXT[extname(path).toLowerCase()] ?? "application/octet-stream";
}
function isRemoteImageReference(source) {
  return /^data:image\/[a-z0-9.+-]+;base64,/i.test(source) || /^https:\/\//i.test(source);
}
async function imageSourceToRequestImage(source, maxImageBytes) {
  const trimmed = source.trim();
  if (!trimmed) {
    throw new Error("source is required.");
  }
  if (isRemoteImageReference(trimmed)) {
    return trimmed;
  }
  if (/^https?:\/\//i.test(trimmed)) {
    throw new Error("Only HTTPS image URLs are accepted.");
  }
  const path = getPathFromSource(trimmed);
  const fileStat = await stat(path);
  if (!fileStat.isFile()) {
    throw new Error(`${path} is not a file.`);
  }
  if (fileStat.size > maxImageBytes) {
    throw new Error(`${basename(path)} is larger than the configured image limit.`);
  }
  const bytes = await readFile(path);
  return `data:${getMimeType(path)};base64,${bytes.toString("base64")}`;
}
async function readClipboardImage(maxImageBytes) {
  const temp = await createTempImagePath("clipboard.png");
  try {
    if (process.platform === "darwin") {
      const script = [
        `set outputPath to POSIX file "${temp.path}"`,
        "set pngData to the clipboard as \xABclass PNGf\xBB",
        "set fileRef to open for access outputPath with write permission",
        "set eof fileRef to 0",
        "write pngData to fileRef",
        "close access fileRef"
      ];
      await execFileAsync("osascript", script.flatMap((line) => ["-e", line]));
    } else if (process.platform === "win32") {
      const script = [
        "Add-Type -AssemblyName System.Windows.Forms",
        "Add-Type -AssemblyName System.Drawing",
        "$img = [System.Windows.Forms.Clipboard]::GetImage()",
        "if ($null -eq $img) { throw 'Clipboard does not contain an image.' }",
        `$img.Save('${powershellEscape(temp.path)}', [System.Drawing.Imaging.ImageFormat]::Png)`
      ].join("; ");
      await firstSuccessful([
        () => execFileAsync("powershell.exe", ["-Sta", "-NoProfile", "-Command", script]),
        () => execFileAsync("pwsh", ["-Sta", "-NoProfile", "-Command", script])
      ]);
    } else {
      await firstSuccessful([
        () => runOutputToFile("wl-paste", ["-n", "-t", "image/png"], temp.path),
        () => runOutputToFile("xclip", ["-selection", "clipboard", "-t", "image/png", "-o"], temp.path),
        () => runOutputToFile("xsel", ["--clipboard", "--output", "--mime-type", "image/png"], temp.path)
      ]);
    }
    return await imageSourceToRequestImage(temp.path, maxImageBytes);
  } finally {
    await temp.cleanup();
  }
}
async function captureScreenshot(maxImageBytes) {
  const temp = await createTempImagePath("screenshot.png");
  try {
    if (process.platform === "darwin") {
      await execFileAsync("screencapture", ["-x", temp.path]);
    } else if (process.platform === "win32") {
      const script = [
        "Add-Type -AssemblyName System.Windows.Forms",
        "Add-Type -AssemblyName System.Drawing",
        "$bounds = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds",
        "$bitmap = New-Object System.Drawing.Bitmap $bounds.Width, $bounds.Height",
        "$graphics = [System.Drawing.Graphics]::FromImage($bitmap)",
        "$graphics.CopyFromScreen($bounds.Location, [System.Drawing.Point]::Empty, $bounds.Size)",
        `$bitmap.Save('${powershellEscape(temp.path)}', [System.Drawing.Imaging.ImageFormat]::Png)`,
        "$graphics.Dispose()",
        "$bitmap.Dispose()"
      ].join("; ");
      await firstSuccessful([
        () => execFileAsync("powershell.exe", ["-NoProfile", "-Command", script]),
        () => execFileAsync("pwsh", ["-NoProfile", "-Command", script])
      ]);
    } else {
      await firstSuccessful([
        () => execFileAsync("gnome-screenshot", ["-f", temp.path]),
        () => execFileAsync("grim", [temp.path]),
        () => execFileAsync("spectacle", ["-b", "-n", "-o", temp.path]),
        () => execFileAsync("maim", [temp.path])
      ]);
    }
    return await imageSourceToRequestImage(temp.path, maxImageBytes);
  } finally {
    await temp.cleanup();
  }
}

// src/tools.ts
function getString(value) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : void 0;
}
function getObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}
function textResult(text, isError = false) {
  return {
    content: [{ type: "text", text }],
    ...isError ? { isError: true } : {}
  };
}
function formatResult(args) {
  const metadata = [
    args.model ? `model=${args.model}` : null,
    args.gatewayId ? `gateway=${args.gatewayId}` : null,
    args.mode ? `mode=${args.mode}` : null
  ].filter(Boolean).join(" ");
  return metadata ? `${args.description}

---
${metadata}` : args.description;
}
async function describeImages(args) {
  const config = loadConfig();
  const images = await Promise.all(args.images.map((source) => imageSourceToRequestImage(source, config.maxImageBytes)));
  const result = await describeWithCustomRouter(config, {
    context: args.context,
    images,
    mode: normalizeMode(args.mode),
    question: args.question
  });
  return textResult(formatResult(result));
}
async function callTool(name, rawArguments) {
  const args = getObject(rawArguments);
  try {
    if (name === "describe_image") {
      const source = getString(args.source);
      if (!source) {
        throw new Error("source is required.");
      }
      return await describeImages({
        context: getString(args.context),
        images: [source],
        mode: args.mode,
        question: getString(args.question)
      });
    }
    if (name === "describe_clipboard") {
      const config = loadConfig();
      const image = await readClipboardImage(config.maxImageBytes);
      const result = await describeWithCustomRouter(config, {
        context: getString(args.context),
        images: [image],
        mode: normalizeMode(args.mode),
        question: getString(args.question)
      });
      return textResult(formatResult(result));
    }
    if (name === "capture_screenshot") {
      const config = loadConfig();
      const image = await captureScreenshot(config.maxImageBytes);
      const result = await describeWithCustomRouter(config, {
        context: getString(args.context),
        images: [image],
        mode: normalizeMode(args.mode),
        question: getString(args.question)
      });
      return textResult(formatResult(result));
    }
    if (name === "compare_images") {
      const sourceA = getString(args.source_a);
      const sourceB = getString(args.source_b);
      if (!sourceA || !sourceB) {
        throw new Error("source_a and source_b are required.");
      }
      return await describeImages({
        context: getString(args.context),
        images: [sourceA, sourceB],
        mode: args.mode,
        question: getString(args.task) ?? "Compare these images and describe important similarities, differences, and visible text."
      });
    }
    if (name === "vision_status") {
      const config = loadConfig();
      return textResult(JSON.stringify({
        baseUrl: config.baseUrl,
        hasApiKey: config.apiKey.length > 0,
        maxImageBytes: config.maxImageBytes,
        tools: ["describe_image", "describe_clipboard", "capture_screenshot", "compare_images"]
      }, null, 2));
    }
    if (name === "vision_rules") {
      return textResult([
        "When the user references an image, screenshot, diagram, visual UI issue, or asks what something looks like, call the CustomRouter vision MCP tool before answering.",
        "If a local file path is provided, call describe_image.",
        "If no file path is provided and the user references a recent screenshot, call describe_clipboard.",
        "If the user asks to inspect the current screen, call capture_screenshot.",
        "Do not claim that images cannot be viewed until the vision tool has failed."
      ].join("\n"));
    }
    throw new Error(`Unknown tool: ${name}`);
  } catch (error) {
    return textResult(error instanceof Error ? error.message : String(error), true);
  }
}
var TOOL_DEFINITIONS = [
  {
    name: "describe_image",
    description: "Describe a local image file, file:// URL, HTTPS URL, or data URL using the configured CustomRouter vision model.",
    inputSchema: {
      type: "object",
      properties: {
        source: { type: "string", description: "Local path, file:// URL, HTTPS URL, or data:image/... URL." },
        mode: { type: "string", enum: ["general", "ui", "ocr", "diagram"], default: "ui" },
        question: { type: "string" },
        context: { type: "string" }
      },
      required: ["source"],
      additionalProperties: false
    }
  },
  {
    name: "describe_clipboard",
    description: "Describe the current clipboard image using the configured CustomRouter vision model.",
    inputSchema: {
      type: "object",
      properties: {
        mode: { type: "string", enum: ["general", "ui", "ocr", "diagram"], default: "ui" },
        question: { type: "string" },
        context: { type: "string" }
      },
      additionalProperties: false
    }
  },
  {
    name: "capture_screenshot",
    description: "Capture the current screen locally and describe it using the configured CustomRouter vision model.",
    inputSchema: {
      type: "object",
      properties: {
        mode: { type: "string", enum: ["general", "ui", "ocr", "diagram"], default: "ui" },
        question: { type: "string" },
        context: { type: "string" }
      },
      additionalProperties: false
    }
  },
  {
    name: "compare_images",
    description: "Compare two local image files, HTTPS URLs, or data URLs using the configured CustomRouter vision model.",
    inputSchema: {
      type: "object",
      properties: {
        source_a: { type: "string" },
        source_b: { type: "string" },
        mode: { type: "string", enum: ["general", "ui", "ocr", "diagram"], default: "ui" },
        task: { type: "string" },
        context: { type: "string" }
      },
      required: ["source_a", "source_b"],
      additionalProperties: false
    }
  },
  {
    name: "vision_status",
    description: "Return local CustomRouter vision bridge configuration status.",
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false
    }
  },
  {
    name: "vision_rules",
    description: "Return generic agent instructions for when to call the vision tools.",
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false
    }
  }
];

// src/cli.ts
function writeJson(message) {
  process.stdout.write(`${JSON.stringify(message)}
`);
}
function writeError(id, code, message) {
  if (id === void 0) {
    return;
  }
  writeJson({
    jsonrpc: "2.0",
    id,
    error: { code, message }
  });
}
async function handleMessage(message) {
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
          name: "customrouter-vision-helper",
          version: "0.1.0"
        }
      }
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
      result: { tools: TOOL_DEFINITIONS }
    });
    return;
  }
  if (method === "tools/call") {
    const params = message.params && typeof message.params === "object" ? message.params : {};
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
function startMcpServer() {
  const input = createInterface({
    input: process.stdin,
    crlfDelay: Infinity
  });
  input.on("line", (line) => {
    if (!line.trim()) {
      return;
    }
    void (async () => {
      try {
        const parsed = JSON.parse(line);
        await handleMessage(parsed);
      } catch (error) {
        process.stderr.write(`customrouter-vision-helper error: ${error instanceof Error ? error.message : String(error)}
`);
      }
    })();
  });
}
async function runDirectDescribe(args) {
  const source = args[0];
  if (!source) {
    throw new Error("Usage: customrouter-vision-helper describe <image-path-or-url>");
  }
  const result = await callTool("describe_image", { source });
  process.stdout.write(`${result.content[0]?.text ?? ""}
`);
  if (result.isError) {
    process.exitCode = 1;
  }
}
async function main() {
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
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}
`);
  process.exitCode = 1;
});
