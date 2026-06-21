import { createWriteStream } from "node:fs";
import type { Dirent } from "node:fs";
import { mkdtemp, readFile, readdir, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, extname, isAbsolute, join, parse, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { execFile, spawn } from "node:child_process";

const MIME_BY_EXT: Record<string, string> = {
  ".bmp": "image/bmp",
  ".gif": "image/gif",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".tif": "image/tiff",
  ".tiff": "image/tiff",
  ".webp": "image/webp",
};

function execFileAsync(command: string, args: string[]): Promise<void> {
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

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function normalizeMacClipboardError(error: unknown): Error {
  const message = getErrorMessage(error);
  if (
    message.includes("-1700") ||
    /expected type/i.test(message) ||
    /clipboard does not contain an image/i.test(message)
  ) {
    return new Error("Clipboard does not contain an image.");
  }
  return error instanceof Error ? error : new Error(message);
}

export function normalizeMacScreenshotError(error: unknown): Error {
  const message = getErrorMessage(error);
  if (/could not create image from display/i.test(message)) {
    return new Error("Screen capture failed. On macOS, grant Screen Recording permission to the terminal or MCP host app, then retry.");
  }
  return error instanceof Error ? error : new Error(message);
}

function runOutputToFile(command: string, args: string[], outputPath: string): Promise<void> {
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

async function firstSuccessful(commands: Array<() => Promise<void>>): Promise<void> {
  const errors: string[] = [];
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

function powershellEscape(value: string): string {
  return value.replaceAll("'", "''");
}

async function createTempImagePath(name: string): Promise<{ cleanup: () => Promise<void>; path: string }> {
  const dir = await mkdtemp(join(tmpdir(), "customrouter-vision-"));
  return {
    path: join(dir, name),
    cleanup: () => rm(dir, { force: true, recursive: true }),
  };
}

function getPathFromSource(source: string): string {
  if (source.startsWith("file://")) {
    return fileURLToPath(source);
  }
  return isAbsolute(source) ? source : resolve(process.cwd(), source);
}

function getMimeType(path: string): string {
  return MIME_BY_EXT[extname(path).toLowerCase()] ?? "application/octet-stream";
}

function isNotFoundError(error: unknown): boolean {
  return error instanceof Error && (error as NodeJS.ErrnoException).code === "ENOENT";
}

function canonicalizePathSegment(value: string): string {
  return value.normalize("NFC").replace(/\p{Zs}/gu, " ");
}

async function findUnicodeSpaceInsensitiveEntry(parent: string, segment: string): Promise<string | null> {
  let entries: Dirent[];
  try {
    entries = await readdir(parent, { withFileTypes: true });
  } catch {
    return null;
  }

  const target = canonicalizePathSegment(segment);
  const matches = entries.filter((entry) => canonicalizePathSegment(entry.name) === target);
  if (matches.length === 0) {
    return null;
  }

  const normalizedTarget = segment.normalize("NFC");
  const preferred = matches.find((entry) => entry.name.normalize("NFC") === normalizedTarget) ?? matches[0];
  if (!preferred) {
    return null;
  }
  return join(parent, preferred.name);
}

export async function resolveExistingPath(sourcePath: string): Promise<string> {
  try {
    await stat(sourcePath);
    return sourcePath;
  } catch (error) {
    if (!isNotFoundError(error)) {
      throw error;
    }
  }

  const parsed = parse(sourcePath);
  const segments = sourcePath
    .slice(parsed.root.length)
    .split(/[\\/]+/)
    .filter((segment) => segment.length > 0);
  let current = parsed.root || ".";

  for (const segment of segments) {
    const directPath = join(current, segment);
    try {
      await stat(directPath);
      current = directPath;
      continue;
    } catch (error) {
      if (!isNotFoundError(error)) {
        throw error;
      }
    }

    const matchedPath = await findUnicodeSpaceInsensitiveEntry(current, segment);
    if (!matchedPath) {
      return sourcePath;
    }
    current = matchedPath;
  }

  return current;
}

export function isRemoteImageReference(source: string): boolean {
  return /^data:image\/[a-z0-9.+-]+;base64,/i.test(source) || /^https:\/\//i.test(source);
}

export async function imageSourceToRequestImage(source: string, maxImageBytes: number): Promise<string> {
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

  const path = await resolveExistingPath(getPathFromSource(trimmed));
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

export async function readClipboardImage(maxImageBytes: number): Promise<string> {
  const temp = await createTempImagePath("clipboard.png");
  try {
    if (process.platform === "darwin") {
      const script = [
        `set outputPath to POSIX file "${temp.path}"`,
        "try",
        "set pngData to the clipboard as «class PNGf»",
        "on error",
        "error \"Clipboard does not contain an image.\"",
        "end try",
        "set fileRef to open for access outputPath with write permission",
        "set eof fileRef to 0",
        "write pngData to fileRef",
        "close access fileRef",
      ];
      try {
        await execFileAsync("osascript", script.flatMap((line) => ["-e", line]));
      } catch (error) {
        throw normalizeMacClipboardError(error);
      }
    } else if (process.platform === "win32") {
      const script = [
        "Add-Type -AssemblyName System.Windows.Forms",
        "Add-Type -AssemblyName System.Drawing",
        "$img = [System.Windows.Forms.Clipboard]::GetImage()",
        "if ($null -eq $img) { throw 'Clipboard does not contain an image.' }",
        `$img.Save('${powershellEscape(temp.path)}', [System.Drawing.Imaging.ImageFormat]::Png)`,
      ].join("; ");
      await firstSuccessful([
        () => execFileAsync("powershell.exe", ["-Sta", "-NoProfile", "-Command", script]),
        () => execFileAsync("pwsh", ["-Sta", "-NoProfile", "-Command", script]),
      ]);
    } else {
      await firstSuccessful([
        () => runOutputToFile("wl-paste", ["-n", "-t", "image/png"], temp.path),
        () => runOutputToFile("xclip", ["-selection", "clipboard", "-t", "image/png", "-o"], temp.path),
        () => runOutputToFile("xsel", ["--clipboard", "--output", "--mime-type", "image/png"], temp.path),
      ]);
    }

    return await imageSourceToRequestImage(temp.path, maxImageBytes);
  } finally {
    await temp.cleanup();
  }
}

export async function captureScreenshot(maxImageBytes: number): Promise<string> {
  const temp = await createTempImagePath("screenshot.png");
  try {
    if (process.platform === "darwin") {
      try {
        await execFileAsync("screencapture", ["-x", temp.path]);
      } catch (error) {
        throw normalizeMacScreenshotError(error);
      }
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
        "$bitmap.Dispose()",
      ].join("; ");
      await firstSuccessful([
        () => execFileAsync("powershell.exe", ["-NoProfile", "-Command", script]),
        () => execFileAsync("pwsh", ["-NoProfile", "-Command", script]),
      ]);
    } else {
      await firstSuccessful([
        () => execFileAsync("gnome-screenshot", ["-f", temp.path]),
        () => execFileAsync("grim", [temp.path]),
        () => execFileAsync("spectacle", ["-b", "-n", "-o", temp.path]),
        () => execFileAsync("maim", [temp.path]),
      ]);
    }

    return await imageSourceToRequestImage(temp.path, maxImageBytes);
  } finally {
    await temp.cleanup();
  }
}
