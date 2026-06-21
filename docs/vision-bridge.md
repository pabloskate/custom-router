# CustomRouter Vision Helper

CustomRouter Vision adds a local helper for text-only agents that need image descriptions. The helper runs on the user's machine, reads local screenshots or image files, sends them to the organization's self-hosted CustomRouter instance as data URLs, and CustomRouter calls the selected vision-capable gateway model.

## Pieces

- Self-hosted endpoint: `POST /api/v1/vision/describe` on the user's CustomRouter domain
- Local helper installer: `GET /api/v1/vision/helper/install.sh`
- Local helper installer for Windows: `GET /api/v1/vision/helper/install.ps1`
- Local helper asset: `GET /vision-helper/customrouter-vision-helper.mjs`
- Admin UI: `Vision` tab

The endpoint is authenticated with any generated CustomRouter API key. The helper can run as a direct CLI command or as a standard stdio MCP server; it is not tied to any single agent client.

## Setup

Use this flow for a brand-new CustomRouter deployment:

1. Deploy CustomRouter on the organization's domain.
2. Open `Gateways`, add the provider or gateway that has the vision model, and sync models. Manual models also work if the model modality includes image input, such as `text,image->text`.
3. Open `Vision`.
4. Select the gateway and vision-capable model CustomRouter should use for screenshots and image descriptions.
5. Save the vision model.
6. Open `API Keys` and generate or choose the CustomRouter API key that should use this Vision configuration.

The important rule is that the API key identifies the CustomRouter account whose gateway and Vision settings are used. Common rollout patterns:

- Individual self-hosted or hosted use: the user configures their own gateway and Vision model, then uses their own API key.
- Hosted BYOK use: each user configures their own upstream credentials and Vision model, then uses their own API key.
- Organization-managed shared gateway: an admin configures a managed CustomRouter account once, then issues labeled API keys from that account to the people or agents that should use the shared Vision setup.

In the current schema, an API key from account A does not automatically use gateway or Vision settings from account B. A real org/team permissions layer would be a separate product feature.

Each individual user then does this on the machine running their MCP client:

1. Install the local helper from the organization's CustomRouter domain.

macOS/Linux:

```bash
curl -fsSL "https://your-customrouter-domain.example.com/api/v1/vision/helper/install.sh" | sh
```

Windows PowerShell:

```powershell
irm "https://your-customrouter-domain.example.com/api/v1/vision/helper/install.ps1" | iex
```

2. For MCP-capable clients, add this local server configuration:

macOS/Linux:

```json
{
  "mcpServers": {
    "customrouter-vision": {
      "command": "sh",
      "args": ["-lc", "exec node \"$HOME/.customrouter/vision-helper/customrouter-vision-helper.mjs\""],
      "env": {
        "CUSTOMROUTER_BASE_URL": "https://your-customrouter-domain.example.com",
        "CUSTOMROUTER_API_KEY": "ar_sk_..."
      }
    }
  }
}
```

Windows:

```json
{
  "mcpServers": {
    "customrouter-vision": {
      "command": "cmd.exe",
      "args": ["/c", "node \"%USERPROFILE%\\.customrouter\\vision-helper\\customrouter-vision-helper.mjs\""],
      "env": {
        "CUSTOMROUTER_BASE_URL": "https://your-customrouter-domain.example.com",
        "CUSTOMROUTER_API_KEY": "ar_sk_..."
      }
    }
  }
}
```

Replace:

- `https://your-customrouter-domain.example.com` with the organization's self-hosted CustomRouter origin.
- `CUSTOMROUTER_API_KEY` with the CustomRouter API key whose account should provide the Vision gateway and model settings.

The MCP server must run locally on the user's machine. That local process is what can read local files, clipboard images, and screenshots. The self-hosted CustomRouter endpoint cannot read local filesystem paths directly.

Users do not need the CustomRouter source repo in their working codebase. They only need Node.js 20+, the organization's CustomRouter URL, and an API key.

Some MCP clients route dragged image attachments only to models with native image input. With a text-only model, the client may reject the attachment before the model can call a vision tool, and any temporary screenshot file path may be deleted before `describe_image` can read it. For reliable screenshot use, copy the screenshot to the clipboard or provide a stable file path. On macOS, `Cmd+Ctrl+Shift+4` copies a selected screenshot to the clipboard instead of saving it as a temporary file.

Recent macOS screenshot filenames may contain a narrow no-break space (`U+202F`) before `AM` or `PM`. If a client or model rewrites that character as a normal space, the helper retries local file resolution by matching path segments against the actual directory entries with Unicode-space-insensitive comparison.

For shell-capable agents or a quick manual check, the same helper can run directly:

```bash
CUSTOMROUTER_BASE_URL="https://your-customrouter-domain.example.com" \
CUSTOMROUTER_API_KEY="ar_sk_..." \
node "$HOME/.customrouter/vision-helper/customrouter-vision-helper.mjs" describe ./screenshot.png
```

Windows PowerShell:

```powershell
$env:CUSTOMROUTER_BASE_URL = "https://your-customrouter-domain.example.com"
$env:CUSTOMROUTER_API_KEY = "ar_sk_..."
node "$HOME\.customrouter\vision-helper\customrouter-vision-helper.mjs" describe .\screenshot.png
```

## How Agents Should Use It

Add these generic instructions to the MCP client's agent/system instructions if the client does not automatically discover tool usage from descriptions:

```text
When the user references an image, screenshot, diagram, visual UI issue, or asks what something looks like, call the CustomRouter vision MCP tool before answering.
If a local file path is provided, call describe_image.
If no stable file path is provided and the user references a recent screenshot or current screen, call describe_screen.
If the user explicitly asks about the clipboard, call describe_clipboard.
Do not claim that images cannot be viewed until the vision tool has failed.
```

## MCP Tools

- `describe_image`: accepts a local path, `file://` URL, HTTPS URL, or `data:image/...` URL.
- `describe_clipboard`: reads the current local clipboard image.
- `capture_screenshot`: captures the current screen locally.
- `describe_screen`: reads the clipboard image if present; otherwise captures the current screen and describes it.
- `compare_images`: compares two images.
- `vision_status`: checks local bridge configuration.
- `vision_rules`: returns generic agent instructions for when to call the tools.

## Direct Endpoint

```bash
curl -X POST "$CUSTOMROUTER_BASE_URL/api/v1/vision/describe" \
  -H "Authorization: Bearer $CUSTOMROUTER_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "image": "data:image/png;base64,...",
    "mode": "ui",
    "question": "Describe this screenshot for a text-only coding agent."
  }'
```

The self-hosted endpoint accepts HTTPS image URLs and `data:image/...` base64 URLs. Local file paths must go through the local helper first.

## Troubleshooting

- `CUSTOMROUTER_API_KEY is required.`: set the environment variable in the MCP server config.
- `CUSTOMROUTER_BASE_URL is required.`: set it to the CustomRouter deployment origin, without `/api`.
- `No vision model configured.`: the API key belongs to a CustomRouter account that has not saved Vision settings. Configure Vision for that account, or use a key from an account that already has the intended Vision gateway and model settings.
- `No synced gateway models advertise image input`: sync the gateway models, or manually add a model with modality like `text,image->text`.
- `Only HTTPS image URLs are accepted.`: use HTTPS URLs, data URLs, or local file paths through `describe_image`.
- `ENOENT` for a visible macOS screenshot file: update the helper and rerun the request. Version `0.1.2` and later recover common Unicode-space mismatches in screenshot filenames.
- `Clipboard does not contain an image.`: copy a screenshot to the clipboard first, or call `describe_screen` so the helper can try screen capture.
- `Screen capture failed. On macOS, grant Screen Recording permission...`: open System Settings → Privacy & Security → Screen Recording and enable the terminal or MCP host app, then restart that app.
