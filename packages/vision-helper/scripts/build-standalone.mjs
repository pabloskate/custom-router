import { mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { build } from "esbuild";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const packageRoot = resolve(scriptDir, "..");
const repoRoot = resolve(packageRoot, "../..");
const outfile = resolve(repoRoot, "apps/web/public/vision-helper/customrouter-vision-helper.mjs");

await mkdir(dirname(outfile), { recursive: true });
await build({
  bundle: true,
  entryPoints: [resolve(packageRoot, "src/cli.ts")],
  format: "esm",
  outfile,
  platform: "node",
  target: "node20",
});

console.log(`Wrote ${outfile}`);
