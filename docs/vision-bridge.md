# CustomRouter Vision Bridge

CustomRouter Vision adds a local MCP bridge for text-only agents that need image descriptions. The local bridge reads local screenshots or image files, sends them to CustomRouter as data URLs, and CustomRouter calls the user's selected vision-capable gateway model.

## Pieces

- Hosted endpoint: `POST /api/v1/vision/describe`
- Local MCP package: `@custom-router/vision-mcp`
- Admin UI: `Vision` tab

The hosted endpoint is authenticated with any generated CustomRouter API key. The MCP package is generic and uses standard stdio MCP JSON-RPC; it is not tied to any single MCP client.

## Setup

Use this flow for a brand-new CustomRouter user:

1. Create or sign in to a CustomRouter account.
2. Open `Gateways`, add the provider or gateway that has the vision model, and sync models. Manual models also work if the model modality includes image input, such as `text,image->text`.
3. Open `Vision`.
4. Select the gateway and vision-capable model CustomRouter should use for screenshots and image descriptions.
5. Save the vision model.
6. Open `API Keys` and generate a CustomRouter API key, or reuse an existing generated key.
7. Add the local MCP server configuration below to any MCP client that supports stdio MCP servers.

```json
{
  "mcpServers": {
    "customrouter-vision": {
      "command": "npx",
      "args": ["-y", "@custom-router/vision-mcp"],
      "env": {
        "CUSTOMROUTER_BASE_URL": "https://your-router.example.com",
        "CUSTOMROUTER_API_KEY": "cr_..."
      }
    }
  }
}
```

Replace:

- `CUSTOMROUTER_BASE_URL` with the URL where CustomRouter is running, for example `https://router.example.com` or `http://localhost:3010`.
- `CUSTOMROUTER_API_KEY` with the generated CustomRouter API key.

The MCP server must run locally on the user's machine. That local process is what can read local files, clipboard images, and screenshots. The hosted CustomRouter endpoint cannot read local filesystem paths directly.

## How Agents Should Use It

Add these generic instructions to the MCP client's agent/system instructions if the client does not automatically discover tool usage from descriptions:

```text
When the user references an image, screenshot, diagram, visual UI issue, or asks what something looks like, call the CustomRouter vision MCP tool before answering.
If a local file path is provided, call describe_image.
If no file path is provided and the user references a recent screenshot, call describe_clipboard.
If the user asks to inspect the current screen, call capture_screenshot.
Do not claim that images cannot be viewed until the vision tool has failed.
```

## MCP Tools

- `describe_image`: accepts a local path, `file://` URL, HTTPS URL, or `data:image/...` URL.
- `describe_clipboard`: reads the current local clipboard image.
- `capture_screenshot`: captures the current screen locally.
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

The hosted endpoint accepts HTTPS image URLs and `data:image/...` base64 URLs. Local file paths must go through the local MCP bridge first.

## Troubleshooting

- `CUSTOMROUTER_API_KEY is required.`: set the environment variable in the MCP server config.
- `CUSTOMROUTER_BASE_URL is required.`: set it to the CustomRouter deployment origin, without `/api`.
- `No vision model configured.`: open `Vision`, choose a vision-capable gateway model, and save.
- `No synced gateway models advertise image input`: sync the gateway models, or manually add a model with modality like `text,image->text`.
- `Only HTTPS image URLs are accepted.`: use HTTPS URLs, data URLs, or local file paths through `describe_image`.
- Local screenshot or clipboard tools fail: the MCP server is local, but the operating system may require screen recording or clipboard permissions for the terminal/MCP host app.
