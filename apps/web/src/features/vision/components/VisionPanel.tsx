"use client";

import { useEffect, useMemo, useState } from "react";

import type { GatewayInfo } from "@/src/features/gateways/contracts";
import {
  collectVisionModelOptions,
  modelSupportsVisionInput,
  type VisionMode,
  type VisionSettingsResponse,
} from "@/src/features/vision/contracts";

const MODE_OPTIONS: Array<{ value: VisionMode; label: string }> = [
  { value: "ui", label: "UI screenshots" },
  { value: "general", label: "General images" },
  { value: "ocr", label: "OCR text" },
  { value: "diagram", label: "Diagrams" },
];

interface VisionPanelProps {
  gateways: GatewayInfo[];
  onError?: (message?: string) => void;
  onStatus?: (message: string) => void;
}

function getInitialGatewayId(gateways: GatewayInfo[]): string {
  const option = collectVisionModelOptions(gateways)[0];
  return option?.gatewayId ?? "";
}

function getInitialModelId(gateways: GatewayInfo[], gatewayId: string): string {
  const gateway = gateways.find((entry) => entry.id === gatewayId);
  return gateway?.models.find(modelSupportsVisionInput)?.id ?? "";
}

function CopyButton({ value, onCopied }: { value: string; onCopied?: () => void }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    onCopied?.();
    window.setTimeout(() => setCopied(false), 1500);
  }

  return (
    <button type="button" className="btn btn--secondary btn--sm" onClick={handleCopy}>
      {copied ? "Copied" : "Copy"}
    </button>
  );
}

function CodeBlock({ label, value, onCopied }: { label: string; value: string; onCopied?: () => void }) {
  return (
    <div style={{ display: "grid", gap: "var(--space-2)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: "var(--space-3)", alignItems: "center" }}>
        <span className="form-label" style={{ margin: 0 }}>{label}</span>
        <CopyButton value={value} onCopied={onCopied} />
      </div>
      <pre
        className="input input--mono"
        style={{
          height: "auto",
          margin: 0,
          overflowX: "auto",
          padding: "var(--space-4)",
          whiteSpace: "pre-wrap",
        }}
      >
        {value}
      </pre>
    </div>
  );
}

export function VisionPanel({ gateways, onError, onStatus }: VisionPanelProps) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [gatewayId, setGatewayId] = useState(() => getInitialGatewayId(gateways));
  const [modelId, setModelId] = useState(() => getInitialModelId(gateways, getInitialGatewayId(gateways)));
  const [defaultMode, setDefaultMode] = useState<VisionMode>("ui");
  const [routerBaseUrl, setRouterBaseUrl] = useState("https://your-router.example.com");

  const visionOptions = useMemo(() => collectVisionModelOptions(gateways), [gateways]);
  const selectedGateway = gateways.find((gateway) => gateway.id === gatewayId) ?? null;
  const selectedGatewayModels = selectedGateway?.models.filter(modelSupportsVisionInput) ?? [];
  const hasVisionModels = visionOptions.length > 0;

  useEffect(() => {
    async function loadSettings() {
      setLoading(true);
      const response = await fetch("/api/v1/user/vision", { cache: "no-store" });
      if (!response.ok) {
        setLoading(false);
        onError?.("Failed to load vision settings.");
        return;
      }

      const payload = await response.json() as VisionSettingsResponse;
      if (payload.settings) {
        setGatewayId(payload.settings.gateway_id);
        setModelId(payload.settings.model_id);
        setDefaultMode(payload.settings.default_mode);
      } else {
        const initialGatewayId = getInitialGatewayId(gateways);
        setGatewayId(initialGatewayId);
        setModelId(getInitialModelId(gateways, initialGatewayId));
      }
      setLoading(false);
    }

    void loadSettings();
  }, [gateways, onError]);

  useEffect(() => {
    setRouterBaseUrl(window.location.origin);
  }, []);

  function handleGatewayChange(nextGatewayId: string) {
    setGatewayId(nextGatewayId);
    setModelId(getInitialModelId(gateways, nextGatewayId));
  }

  async function handleSave() {
    if (!gatewayId || !modelId) {
      onError?.("Select a vision-capable model first.");
      return;
    }

    setSaving(true);
    onError?.(undefined);
    const response = await fetch("/api/v1/user/vision", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        gateway_id: gatewayId,
        model_id: modelId,
        default_mode: defaultMode,
      }),
    });

    if (!response.ok) {
      const payload = await response.json().catch(() => ({ error: "Failed to save vision settings." })) as { error?: string };
      onError?.(payload.error ?? "Failed to save vision settings.");
      setSaving(false);
      return;
    }

    onStatus?.("Vision settings saved");
    setSaving(false);
  }

  const endpointSnippet = [
    "curl -X POST \"$CUSTOMROUTER_BASE_URL/api/v1/vision/describe\" \\",
    "  -H \"Authorization: Bearer $CUSTOMROUTER_API_KEY\" \\",
    "  -H \"Content-Type: application/json\" \\",
    "  -d '{",
    "    \"image\": \"data:image/png;base64,...\",",
    "    \"mode\": \"ui\",",
    "    \"question\": \"Describe this screenshot for a text-only coding agent.\"",
    "  }'",
  ].join("\n");

  const mcpSnippet = [
    "{",
    "  \"mcpServers\": {",
    "    \"customrouter-vision\": {",
    "      \"command\": \"npx\",",
    "      \"args\": [\"-y\", \"@custom-router/vision-mcp\"],",
    "      \"env\": {",
    `        "CUSTOMROUTER_BASE_URL": "${routerBaseUrl}",`,
    "        \"CUSTOMROUTER_API_KEY\": \"cr_...\"",
    "      }",
    "    }",
    "  }",
    "}",
  ].join("\n");

  const rulesSnippet = [
    "When the user references an image, screenshot, diagram, visual UI issue, or asks what something looks like, call the available CustomRouter vision MCP tool before answering.",
    "If a local file path is provided, call describe_image.",
    "If no file path is provided and the user references a recent screenshot, call describe_clipboard.",
    "If the user asks to inspect the current screen, call capture_screenshot.",
    "Do not claim that images cannot be viewed until the vision tool has failed.",
  ].join("\n");

  return (
    <div className="animate-fade-in" style={{ display: "grid", gap: "var(--space-6)" }}>
      <div className="card">
        <div className="card-header">
          <h3>Vision Model</h3>
          {hasVisionModels && (
            <div className="badge badge--success">
              <span className="status-dot status-dot--success" />
              {visionOptions.length} available
            </div>
          )}
        </div>
        <div className="card-body" style={{ display: "grid", gap: "var(--space-4)" }}>
          {!hasVisionModels ? (
            <div className="badge badge--danger">
              <span className="status-dot status-dot--danger" />
              No synced gateway models advertise image input
            </div>
          ) : (
            <>
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Gateway</label>
                  <select
                    className="input"
                    value={gatewayId}
                    disabled={loading || saving}
                    onChange={(event) => handleGatewayChange(event.target.value)}
                  >
                    {gateways
                      .filter((gateway) => gateway.models.some(modelSupportsVisionInput))
                      .map((gateway) => (
                        <option key={gateway.id} value={gateway.id}>{gateway.name}</option>
                      ))}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Model</label>
                  <select
                    className="input input--mono"
                    value={modelId}
                    disabled={loading || saving || !selectedGateway}
                    onChange={(event) => setModelId(event.target.value)}
                  >
                    {selectedGatewayModels.map((model) => (
                      <option key={model.id} value={model.id}>{model.name ?? model.id}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Default Mode</label>
                <select
                  className="input"
                  value={defaultMode}
                  disabled={loading || saving}
                  onChange={(event) => setDefaultMode(event.target.value as VisionMode)}
                >
                  {MODE_OPTIONS.map((mode) => (
                    <option key={mode.value} value={mode.value}>{mode.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <button type="button" className="btn btn--primary btn--sm" disabled={loading || saving} onClick={handleSave}>
                  {saving ? "Saving..." : "Save vision model"}
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <h3>Generic MCP Bridge</h3>
        </div>
        <div className="card-body" style={{ display: "grid", gap: "var(--space-5)" }}>
          <CodeBlock label="Local MCP server configuration" value={mcpSnippet} onCopied={() => onStatus?.("MCP configuration copied")} />
          <CodeBlock label="Agent instruction snippet" value={rulesSnippet} onCopied={() => onStatus?.("Vision rules copied")} />
          <CodeBlock label="Direct endpoint call" value={endpointSnippet} onCopied={() => onStatus?.("Endpoint example copied")} />
        </div>
      </div>
    </div>
  );
}
