const HELPER_ASSET_PATH = "/vision-helper/customrouter-vision-helper.mjs";
const INSTALL_PATH = "$HOME/.customrouter/vision-helper/customrouter-vision-helper.mjs";

function shellSingleQuote(value: string): string {
  return `'${value.replaceAll("'", "'\"'\"'")}'`;
}

export function buildVisionHelperInstallScript(request: Request): string {
  const origin = new URL(request.url).origin;
  const bridgeUrl = `${origin}${HELPER_ASSET_PATH}`;

  return `#!/usr/bin/env sh
set -eu

if ! command -v node >/dev/null 2>&1; then
  echo "CustomRouter Vision Helper requires Node.js 20 or newer." >&2
  exit 1
fi

NODE_MAJOR="$(node -p "Number(process.versions.node.split('.')[0])")"
if [ "$NODE_MAJOR" -lt 20 ]; then
  echo "CustomRouter Vision Helper requires Node.js 20 or newer. Current version: $(node --version)" >&2
  exit 1
fi

INSTALL_DIR="\${CUSTOMROUTER_VISION_HELPER_DIR:-$HOME/.customrouter/vision-helper}"
BRIDGE_PATH="$INSTALL_DIR/customrouter-vision-helper.mjs"
BRIDGE_URL=${shellSingleQuote(bridgeUrl)}

mkdir -p "$INSTALL_DIR"

if command -v curl >/dev/null 2>&1; then
  curl -fsSL "$BRIDGE_URL" -o "$BRIDGE_PATH"
elif command -v python3 >/dev/null 2>&1; then
  BRIDGE_URL="$BRIDGE_URL" BRIDGE_PATH="$BRIDGE_PATH" python3 - <<'PY'
import os
import urllib.request

urllib.request.urlretrieve(os.environ["BRIDGE_URL"], os.environ["BRIDGE_PATH"])
PY
else
  echo "Install failed: curl or python3 is required to download the helper." >&2
  exit 1
fi

chmod 755 "$BRIDGE_PATH"

echo "CustomRouter Vision Helper installed:"
echo "  $BRIDGE_PATH"
echo
echo "Use this MCP command:"
echo "  sh -lc 'exec node \\"$BRIDGE_PATH\\"'"
`;
}

export function handleGetVisionHelperInstallScript(request: Request): Response {
  return new Response(buildVisionHelperInstallScript(request), {
    headers: {
      "cache-control": "no-store",
      "content-type": "text/x-shellscript; charset=utf-8",
    },
  });
}

export const DEFAULT_VISION_HELPER_INSTALL_PATH = INSTALL_PATH;
