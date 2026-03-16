"use client";

// ─────────────────────────────────────────────────────────────────────────────
// QuickstartPanel.tsx
//
// Dedicated tab for getting users integrated quickly:
// - Connection details (base URL + key)
// - Mode selector: smart routing vs direct gateway model
// - Integration tiles: JS SDK, Python, cURL, Cursor, Vercel AI SDK
// - Per-tile code snippets with copy buttons
// ─────────────────────────────────────────────────────────────────────────────

import React, { useEffect, useState } from "react";

import type { RouterProfile } from "@custom-router/core";

// ─── Types ────────────────────────────────────────────────────────────────────

type TileId = "js" | "python" | "curl" | "cursor" | "vercel";
type ModeId = "profile" | "direct";
type VercelSubTab = "stream" | "gen" | "route";

interface Props {
  profiles: RouterProfile[] | null;
  hasKeys: boolean;
}

// ─── Icons ────────────────────────────────────────────────────────────────────

function IconCopy({ size = 13 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  );
}

function IconCheck({ size = 13 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function IconInfo({ size = 15 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
    </svg>
  );
}

function IconKey({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="7.5" cy="15.5" r="5.5" /><path d="M21 2l-9.6 9.6" /><path d="M15.5 9.5l3 3L22 7l-3-3-3.5 3.5" />
    </svg>
  );
}

function IconLightning({ size = 15 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
    </svg>
  );
}

function IconGateway({ size = 15 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="7" width="20" height="10" rx="2" /><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2" />
    </svg>
  );
}

function IconTerminal({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="4 17 10 11 4 5" /><line x1="12" y1="19" x2="20" y2="19" />
    </svg>
  );
}

// ─── Sub-components ────────────────────────────────────────────────────────────

function CopyButton({
  id,
  copiedItem,
  onCopy,
  label = "Copy",
  size = "sm",
}: {
  id: string;
  copiedItem: string | null;
  onCopy: () => void;
  label?: string;
  size?: "sm" | "xs";
}) {
  const copied = copiedItem === id;
  const cls = size === "xs"
    ? "btn btn--ghost"
    : "btn btn--ghost btn--sm";
  return (
    <button
      className={cls}
      onClick={onCopy}
      disabled={copied}
      style={copied ? { color: "var(--success)", borderColor: "var(--success-dim)" } : undefined}
    >
      {copied ? <IconCheck /> : <IconCopy />}
      {copied ? "Copied" : label}
    </button>
  );
}

function CodeBlock({
  lang,
  code,
  copyId,
  copiedItem,
  onCopy,
}: {
  lang: string;
  code: string;
  copyId: string;
  copiedItem: string | null;
  onCopy: (id: string, value: string) => void;
}) {
  return (
    <div
      style={{
        borderRadius: "var(--radius-md)",
        background: "var(--bg-interactive)",
        border: "1px solid var(--border-default)",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0.4rem 0.5rem 0.4rem 1rem",
          borderBottom: "1px solid var(--border-subtle)",
          background: "rgba(255,255,255,0.02)",
        }}
      >
        <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.75rem", color: "var(--text-muted)" }}>
          {lang}
        </span>
        <CopyButton id={copyId} copiedItem={copiedItem} onCopy={() => onCopy(copyId, code)} />
      </div>
      <pre
        style={{
          margin: 0,
          padding: "1rem 1.25rem",
          overflowX: "auto",
          fontFamily: "var(--font-mono)",
          fontSize: "0.8125rem",
          color: "var(--text-primary)",
          lineHeight: 1.65,
        }}
      >
        {code}
      </pre>
    </div>
  );
}

function Callout({
  children,
  variant = "info",
}: {
  children: React.ReactNode;
  variant?: "info" | "success" | "warning";
}) {
  const colors: Record<typeof variant, { bg: string; border: string }> = {
    info:    { bg: "var(--accent-dim)",  border: "rgba(103,232,249,0.2)" },
    success: { bg: "var(--success-dim)", border: "rgba(52,211,153,0.2)" },
    warning: { bg: "var(--warning-dim)", border: "rgba(251,191,36,0.2)" },
  };
  const c = colors[variant];
  return (
    <div
      style={{
        display: "flex",
        gap: "0.625rem",
        alignItems: "flex-start",
        padding: "0.75rem 1rem",
        borderRadius: "var(--radius-md)",
        background: c.bg,
        border: `1px solid ${c.border}`,
        fontSize: "0.8375rem",
        lineHeight: 1.55,
        color: "var(--text-secondary)",
      }}
    >
      <div style={{ flexShrink: 0, marginTop: "1px" }}>
        <IconInfo />
      </div>
      <div style={{ flex: 1 }}>{children}</div>
    </div>
  );
}

function SectionDivider({ label }: { label: string }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: "0.75rem",
        margin: "1.5rem 0 1rem",
      }}
    >
      <div style={{ flex: 1, height: 1, background: "var(--border-subtle)" }} />
      <span
        style={{
          fontSize: "0.75rem",
          textTransform: "uppercase",
          letterSpacing: "0.08em",
          color: "var(--text-muted)",
          whiteSpace: "nowrap",
        }}
      >
        {label}
      </span>
      <div style={{ flex: 1, height: 1, background: "var(--border-subtle)" }} />
    </div>
  );
}

function ConnectionRow({
  label,
  value,
  copyId,
  copiedItem,
  onCopy,
  action,
}: {
  label: string;
  value: string;
  copyId?: string;
  copiedItem?: string | null;
  onCopy?: (id: string, value: string) => void;
  action?: React.ReactNode;
}) {
  return (
    <div
      className="qs-connection-row"
      style={{
        display: "flex",
        alignItems: "center",
        flexWrap: "wrap",
        gap: "0.5rem",
        padding: "0.625rem 0.875rem",
        background: "var(--bg-interactive)",
        border: "1px solid var(--border-default)",
        borderRadius: "var(--radius-md)",
      }}
    >
      <span
        style={{
          fontSize: "0.75rem",
          textTransform: "uppercase",
          letterSpacing: "0.07em",
          color: "var(--text-muted)",
          flexShrink: 0,
          minWidth: "4.5rem",
        }}
      >
        {label}
      </span>
      <code
        style={{
          flex: 1,
          fontFamily: "var(--font-mono)",
          fontSize: "0.8125rem",
          color: "var(--text-primary)",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
          minWidth: 0,
        }}
      >
        {value}
      </code>
      {copyId && onCopy && copiedItem !== undefined && (
        <CopyButton id={copyId} copiedItem={copiedItem} onCopy={() => onCopy(copyId, value)} />
      )}
      {action}
    </div>
  );
}

// ─── Tile definitions ─────────────────────────────────────────────────────────

const TILES: {
  id: TileId;
  name: string;
  tag: string;
  icon: React.ReactNode;
}[] = [
  {
    id: "js",
    name: "OpenAI SDK",
    tag: "Node / TS",
    icon: (
      <svg viewBox="0 0 32 32" width="22" height="22">
        <rect width="32" height="32" rx="4" fill="#f7df1e" />
        <text x="5" y="24" fontFamily="monospace" fontWeight="bold" fontSize="17" fill="#000">JS</text>
      </svg>
    ),
  },
  {
    id: "python",
    name: "OpenAI SDK",
    tag: "Python",
    icon: (
      <svg viewBox="0 0 32 32" width="22" height="22">
        <rect width="32" height="32" rx="4" fill="#3776ab" />
        <text x="5" y="24" fontFamily="monospace" fontWeight="bold" fontSize="15" fill="#fff">Py</text>
      </svg>
    ),
  },
  {
    id: "curl",
    name: "cURL",
    tag: "HTTP / REST",
    icon: <IconTerminal size={22} />,
  },
  {
    id: "cursor",
    name: "Cursor",
    tag: "AI IDE",
    icon: (
      <svg viewBox="0 0 32 32" width="22" height="22">
        <rect width="32" height="32" rx="4" fill="#1a1a2e" />
        <text x="3" y="22" fontFamily="monospace" fontWeight="bold" fontSize="11" fill="#67e8f9">cur</text>
      </svg>
    ),
  },
  {
    id: "vercel",
    name: "Vercel AI SDK",
    tag: "React / Next",
    icon: (
      <svg viewBox="0 0 32 32" width="22" height="22">
        <rect width="32" height="32" rx="4" fill="#000" />
        <polygon points="16,6 28,26 4,26" fill="white" />
      </svg>
    ),
  },
];

// ─── Cursor guide ─────────────────────────────────────────────────────────────

function CursorGuide({
  baseUrl,
  profileIds,
  copiedItem,
  onCopy,
}: {
  baseUrl: string;
  profileIds: string[];
  copiedItem: string | null;
  onCopy: (id: string, value: string) => void;
}) {
  const displayedProfileIds = profileIds.length > 0 ? profileIds : ["your-profile-id"];
  const steps = [
    {
      num: "1",
      title: "Open Cursor Settings",
      desc: (
        <>
          Go to <strong>Cursor → Settings → Models</strong> (or press{" "}
          <code
            style={{
              padding: "0.05rem 0.35rem",
              background: "var(--bg-interactive)",
              border: "1px solid var(--border-subtle)",
              borderRadius: "4px",
              fontSize: "0.8125rem",
            }}
          >
            ⌘,
          </code>{" "}
          and search "models").
        </>
      ),
    },
    {
      num: "2",
      title: 'Set "Override OpenAI Base URL"',
      desc: (
        <>
          Scroll to the OpenAI section and paste your router base URL:
          <div style={{ marginTop: "0.5rem" }}>
            <ConnectionRow
              label="Base URL"
              value={baseUrl}
              copyId="cursor-base-url"
              copiedItem={copiedItem}
              onCopy={onCopy}
            />
          </div>
        </>
      ),
    },
    {
      num: "3",
      title: "Enter your API key",
      desc: "Paste your CustomRouter API key in the OpenAI API Key field.",
    },
    {
      num: "4",
      title: "Add model names",
      desc: (
        <>
          Under Custom Models, add any of these. Cursor sends them to your router
          which handles the actual model selection.
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: "0.5rem",
              marginTop: "0.625rem",
            }}
          >
            {displayedProfileIds.map((id, index) => (
              <span
                key={id}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  padding: "0.2rem 0.65rem",
                  borderRadius: "9999px",
                  fontFamily: "var(--font-mono)",
                  fontSize: "0.8125rem",
                  background: index === 0 ? "var(--accent-dim)" : "var(--bg-interactive)",
                  border: `1px solid ${index === 0 ? "rgba(103,232,249,0.3)" : "var(--border-default)"}`,
                  color: index === 0 ? "var(--accent)" : "var(--text-secondary)",
                }}
              >
                {id}
              </span>
            ))}
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                padding: "0.2rem 0.65rem",
                borderRadius: "9999px",
                fontFamily: "var(--font-mono)",
                fontSize: "0.8125rem",
                background: "var(--bg-interactive)",
                border: "1px solid var(--border-default)",
                color: "var(--text-secondary)",
              }}
            >
              gpt-4o
            </span>
          </div>
        </>
      ),
    },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
      {steps.map((step, i) => (
        <div
          key={step.num}
          style={{
            display: "flex",
            gap: "1rem",
            paddingBottom: i < steps.length - 1 ? "1.5rem" : 0,
            position: "relative",
          }}
        >
          {/* Connector line */}
          {i < steps.length - 1 && (
            <div
              style={{
                position: "absolute",
                left: 15,
                top: 32,
                bottom: 0,
                width: 1,
                background: "var(--border-subtle)",
              }}
            />
          )}
          <div
            style={{
              width: 32,
              height: 32,
              borderRadius: "50%",
              background: "var(--bg-interactive)",
              border: "1.5px solid var(--border-default)",
              display: "grid",
              placeItems: "center",
              fontSize: "0.75rem",
              fontWeight: 600,
              color: "var(--text-muted)",
              flexShrink: 0,
            }}
          >
            {step.num}
          </div>
          <div style={{ flex: 1, paddingTop: "0.375rem" }}>
            <div
              style={{
                fontSize: "0.875rem",
                fontWeight: 600,
                marginBottom: "0.25rem",
                color: "var(--text-primary)",
              }}
            >
              {step.title}
            </div>
            <div
              style={{
                fontSize: "0.8125rem",
                color: "var(--text-muted)",
                lineHeight: 1.55,
              }}
            >
              {step.desc}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Vercel AI SDK snippet panel ──────────────────────────────────────────────

function VercelSnippet({
  baseUrl,
  profileId,
  copiedItem,
  onCopy,
}: {
  baseUrl: string;
  profileId: string;
  copiedItem: string | null;
  onCopy: (id: string, value: string) => void;
}) {
  const [tab, setTab] = useState<VercelSubTab>("stream");

  const streamCode = `import { createOpenAI } from "@ai-sdk/openai";
import { streamText } from "ai";

const router = createOpenAI({
  apiKey: process.env.CUSTOM_ROUTER_API_KEY,
  baseURL: "${baseUrl}",
});

// Route through a named profile in a Next.js Server Action / Route Handler
const result = await streamText({
  model: router("${profileId}"),
  prompt: "Write a haiku about distributed systems.",
});

return result.toDataStreamResponse();`;

  const genCode = `import { createOpenAI } from "@ai-sdk/openai";
import { generateText } from "ai";

const router = createOpenAI({
  apiKey: process.env.CUSTOM_ROUTER_API_KEY,
  baseURL: "${baseUrl}",
});

const { text } = await generateText({
  model: router("${profileId}"),
  prompt: "Summarize this article in 3 bullet points.",
});`;

  const routeCode = `import { createOpenAI } from "@ai-sdk/openai";
import { streamText } from "ai";

const router = createOpenAI({
  apiKey: process.env.CUSTOM_ROUTER_API_KEY,
  baseURL: "${baseUrl}",
});

export async function POST(req: Request) {
  const { messages } = await req.json();

  const result = await streamText({
    model: router("${profileId}"),
    messages,
  });

  return result.toDataStreamResponse();
}`;

  const tabs: { id: VercelSubTab; label: string }[] = [
    { id: "stream", label: "streamText" },
    { id: "gen",    label: "generateText" },
    { id: "route",  label: "Route Handler" },
  ];

  const snippets: Record<VercelSubTab, { code: string; lang: string }> = {
    stream: { code: streamCode, lang: "typescript" },
    gen:    { code: genCode,    lang: "typescript" },
    route:  { code: routeCode,  lang: "typescript — app/api/chat/route.ts" },
  };

  return (
    <div>
      <Callout>
        Uses the <strong>Vercel AI SDK&apos;s</strong>{" "}
        <code
          style={{
            padding: "0.05rem 0.35rem",
            background: "var(--bg-interactive)",
            borderRadius: 4,
            fontSize: "0.8125rem",
          }}
        >
          createOpenAI
        </code>{" "}
        provider with a custom <code
          style={{
            padding: "0.05rem 0.35rem",
            background: "var(--bg-interactive)",
            borderRadius: 4,
            fontSize: "0.8125rem",
          }}
        >
          baseURL
        </code>
        . Works with{" "}
        <code
          style={{
            padding: "0.05rem 0.35rem",
            background: "var(--bg-interactive)",
            borderRadius: 4,
            fontSize: "0.8125rem",
          }}
        >
          streamText
        </code>
        ,{" "}
        <code
          style={{
            padding: "0.05rem 0.35rem",
            background: "var(--bg-interactive)",
            borderRadius: 4,
            fontSize: "0.8125rem",
          }}
        >
          generateText
        </code>
        , and all other AI SDK helpers.
      </Callout>
      <div
        style={{
          display: "flex",
          gap: "0.25rem",
          margin: "0.875rem 0 0.625rem",
          borderBottom: "1px solid var(--border-subtle)",
          overflowX: "auto",
        }}
      >
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            style={{
              padding: "0.375rem 0.75rem",
              fontSize: "0.8125rem",
              color: tab === t.id ? "var(--accent)" : "var(--text-muted)",
              borderBottom: `2px solid ${tab === t.id ? "var(--accent)" : "transparent"}`,
              marginBottom: -1,
              background: "none",
              border: "none",
              borderBottomWidth: 2,
              borderBottomStyle: "solid",
              cursor: "pointer",
              fontFamily: "var(--font-sans)",
              transition: "color 150ms ease",
              flexShrink: 0,
              whiteSpace: "nowrap",
            }}
          >
            {t.label}
          </button>
        ))}
      </div>
      <CodeBlock
        lang={snippets[tab].lang}
        code={snippets[tab].code}
        copyId={`vercel-${tab}`}
        copiedItem={copiedItem}
        onCopy={onCopy}
      />
    </div>
  );
}

// ─── Main panel ───────────────────────────────────────────────────────────────

export function QuickstartPanel({ profiles, hasKeys }: Props) {
  const [baseUrl, setBaseUrl] = useState("/api/v1");
  const [selectedTile, setSelectedTile] = useState<TileId>("js");
  const [selectedMode, setSelectedMode] = useState<ModeId>("profile");
  const [copiedItem, setCopiedItem] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window !== "undefined") {
      setBaseUrl(`${window.location.origin}/api/v1`);
    }
  }, []);

  const profileIds = Array.from(new Set((profiles ?? []).map((p) => p.id))).sort((a, b) => a.localeCompare(b));
  const defaultProfileId = profileIds[0] ?? "your-profile-id";

  async function copy(id: string, value: string) {
    await navigator.clipboard.writeText(value);
    setCopiedItem(id);
    setTimeout(() => setCopiedItem((c) => (c === id ? null : c)), 2000);
  }

  // ── Code snippets (depend on baseUrl) ──────────────────────────────

  const jsCode = `import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.CUSTOM_ROUTER_API_KEY,
  baseURL: "${baseUrl}",
});

// Route through a named profile
const res = await client.chat.completions.create({
  model: "${defaultProfileId}",
  messages: [{ role: "user", content: "Write a hello world in Python." }],
});

// Or call a gateway model directly
const direct = await client.chat.completions.create({
  model: "openai/gpt-4o",
  messages: [{ role: "user", content: "Summarize this text..." }],
});`;

  const pythonCode = `from openai import OpenAI
import os

client = OpenAI(
    api_key=os.environ["CUSTOM_ROUTER_API_KEY"],
    base_url="${baseUrl}",
)

# Named profile routing
response = client.chat.completions.create(
    model="${defaultProfileId}",
    messages=[{"role": "user", "content": "Write hello world in Python."}],
)

# Or use a specific gateway model directly
response = client.chat.completions.create(
    model="openai/gpt-4o",
    messages=[{"role": "user", "content": "Explain quantum entanglement."}],
)`;

const curlCode = `# Named profile routing
curl ${baseUrl}/chat/completions \\
  -H "Authorization: Bearer $CUSTOM_ROUTER_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "${defaultProfileId}",
    "messages": [{"role": "user", "content": "Write hello world in Python."}]
  }'

# Direct to a specific model
curl ${baseUrl}/chat/completions \\
  -H "Authorization: Bearer $CUSTOM_ROUTER_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "anthropic/claude-3-5-sonnet",
    "messages": [{"role": "user", "content": "Hello!"}]
  }'`;

  // ── Mode card styles ───────────────────────────────────────────────

  function modeCardStyle(id: ModeId): React.CSSProperties {
    const active = selectedMode === id;
    return {
      padding: "0.875rem 1rem",
      borderRadius: "var(--radius-md)",
      border: `1.5px solid ${active ? "var(--accent)" : "var(--border-default)"}`,
      background: active ? "var(--accent-dim)" : "var(--bg-elevated)",
      cursor: "pointer",
      transition: "all 150ms ease",
      flex: 1,
      minWidth: "min(100%, 220px)",
    };
  }

  // ─── Render ─────────────────────────────────────────────────────────

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>

      {/* ── 1. Connection details ── */}
      <div className="card">
        <div className="card-header">
          <h3>Connection details</h3>
          <span className="badge badge--info">OpenAI-compatible</span>
        </div>
        <div className="card-body" style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
          {!hasKeys && (
            <div style={{ marginBottom: "0.25rem" }}>
              <Callout variant="warning">
                <strong>No API keys yet.</strong>{" "}
                Head to the{" "}
                <strong>API Keys</strong>{" "}
                tab to generate one, then come back here.
              </Callout>
            </div>
          )}
          <ConnectionRow
            label="Base URL"
            value={baseUrl}
            copyId="conn-base-url"
            copiedItem={copiedItem}
            onCopy={copy}
          />
          <ConnectionRow
            label="API Key"
            value="See API Keys tab"
            action={
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "0.35rem",
                  fontSize: "0.8125rem",
                  color: "var(--text-muted)",
                }}
              >
                <IconKey />
                Manage in API Keys tab
              </span>
            }
          />
        </div>
      </div>

      {/* ── 2. Model mode selector ── */}
      <div className="card">
        <div className="card-header">
          <h3>How do you want to use models?</h3>
        </div>
        <div className="card-body">
          <div className="qs-mode-cards" style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
            <div className="qs-mode-card" style={modeCardStyle("profile")} onClick={() => setSelectedMode("profile")}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "0.5rem",
                  fontWeight: 600,
                  fontSize: "0.875rem",
                  marginBottom: "0.375rem",
                  color: selectedMode === "profile" ? "var(--accent)" : "var(--text-primary)",
                }}
              >
                <IconLightning />
                Named profile routing
              </div>
              <p
                style={{
                  margin: 0,
                  fontSize: "0.8125rem",
                  color: "var(--text-muted)",
                  lineHeight: 1.55,
                }}
              >
                Set{" "}
                <code
                  style={{
                    padding: "0.05rem 0.3rem",
                    background: "var(--bg-interactive)",
                    borderRadius: 4,
                    fontSize: "0.8125rem",
                    color: "var(--accent)",
                  }}
                >
                  {`model: "${defaultProfileId}"`}
                </code>{" "}
                — the router applies the rules and model pool attached to that profile ID.
              </p>
            </div>

            {/* Direct model */}
            <div className="qs-mode-card" style={modeCardStyle("direct")} onClick={() => setSelectedMode("direct")}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "0.5rem",
                  fontWeight: 600,
                  fontSize: "0.875rem",
                  marginBottom: "0.375rem",
                  color: selectedMode === "direct" ? "var(--accent)" : "var(--text-primary)",
                }}
              >
                <IconGateway />
                Direct gateway model
              </div>
              <p
                style={{
                  margin: 0,
                  fontSize: "0.8125rem",
                  color: "var(--text-muted)",
                  lineHeight: 1.55,
                }}
              >
                Pass any model ID from your configured gateways —{" "}
                <code
                  style={{
                    padding: "0.05rem 0.3rem",
                    background: "var(--bg-interactive)",
                    borderRadius: 4,
                    fontSize: "0.8125rem",
                    color: "var(--text-secondary)",
                  }}
                >
                  gpt-4o
                </code>
                ,{" "}
                <code
                  style={{
                    padding: "0.05rem 0.3rem",
                    background: "var(--bg-interactive)",
                    borderRadius: 4,
                    fontSize: "0.8125rem",
                    color: "var(--text-secondary)",
                  }}
                >
                  claude-3-5-sonnet
                </code>
                , etc. The router proxies it directly with unified auth.
              </p>
            </div>
          </div>

          {/* Routing profiles list */}
          {selectedMode === "profile" && (
            <div
              style={{
                marginTop: "1rem",
                padding: "0.875rem 1rem",
                background: "var(--bg-elevated)",
                borderRadius: "var(--radius-md)",
                border: "1px solid var(--border-subtle)",
              }}
            >
              <p
                style={{
                  fontSize: "0.8125rem",
                  color: "var(--text-muted)",
                  marginBottom: "0.625rem",
                }}
              >
                Use any of these named profile IDs as the{" "}
                <code
                  style={{
                    padding: "0.05rem 0.3rem",
                    background: "var(--bg-interactive)",
                    borderRadius: 4,
                    fontSize: "0.8125rem",
                    color: "var(--accent)",
                  }}
                >
                  model
                </code>{" "}
                field. Routing only activates when you call one of these IDs.
              </p>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
                {(profileIds.length > 0 ? profileIds : ["Create a profile first"]).map((id, index) => (
                  <span
                    key={id}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      padding: "0.2rem 0.65rem",
                      borderRadius: "9999px",
                      fontFamily: "var(--font-mono)",
                      fontSize: "0.8125rem",
                      background: index === 0 && profileIds.length > 0 ? "var(--accent-dim)" : "var(--bg-interactive)",
                      border: `1px solid ${index === 0 && profileIds.length > 0 ? "rgba(103,232,249,0.3)" : "var(--border-default)"}`,
                      color: index === 0 && profileIds.length > 0 ? "var(--accent)" : "var(--text-secondary)",
                    }}
                  >
                    {id}
                  </span>
                ))}
              </div>
              {profileIds.length > 0 ? (
                <p style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: "0.5rem" }}>
                  Manage profiles in the{" "}
                  <strong style={{ color: "var(--text-secondary)" }}>Routing</strong> tab.
                </p>
              ) : (
                <div style={{ marginTop: "0.75rem" }}>
                  <Callout variant="warning">
                    Create your first named profile in the <strong>Routing</strong> tab before using routed requests. Until then, the examples below use a placeholder profile ID.
                  </Callout>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── 3. Integration tiles + snippets ── */}
      <div className="card">
        <div className="card-header">
          <h3>Choose your integration</h3>
        </div>
        <div className="card-body">

          {/* Tile grid */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(110px, 1fr))",
              gap: "0.625rem",
            }}
          >
            {TILES.map((tile) => {
              const active = selectedTile === tile.id;
              return (
                <button
                  key={tile.id}
                  onClick={() => setSelectedTile(tile.id)}
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    gap: "0.5rem",
                    padding: "0.875rem 0.625rem",
                    borderRadius: "var(--radius-lg)",
                    border: `1.5px solid ${active ? "var(--accent)" : "var(--border-default)"}`,
                    background: active ? "var(--accent-dim)" : "var(--bg-elevated)",
                    cursor: "pointer",
                    textAlign: "center",
                    transition: "all 150ms ease",
                    boxShadow: active ? "0 0 14px var(--accent-glow)" : "none",
                    fontFamily: "var(--font-sans)",
                  }}
                >
                  <div
                    style={{
                      width: 40,
                      height: 40,
                      borderRadius: "var(--radius-md)",
                      display: "grid",
                      placeItems: "center",
                      background: active ? "rgba(103,232,249,0.12)" : "var(--bg-interactive)",
                      border: `1px solid ${active ? "rgba(103,232,249,0.25)" : "var(--border-subtle)"}`,
                      color: active ? "var(--accent)" : "var(--text-muted)",
                      transition: "all 150ms ease",
                    }}
                  >
                    {tile.icon}
                  </div>
                  <div
                    style={{
                      fontSize: "0.8125rem",
                      fontWeight: 500,
                      color: active ? "var(--accent)" : "var(--text-secondary)",
                    }}
                  >
                    {tile.name}
                  </div>
                  <div
                    style={{
                      fontSize: "0.6875rem",
                      color: "var(--text-muted)",
                      background: "var(--bg-interactive)",
                      borderRadius: "4px",
                      padding: "0.1rem 0.4rem",
                    }}
                  >
                    {tile.tag}
                  </div>
                </button>
              );
            })}
          </div>

          {/* Snippet area */}
          <div style={{ marginTop: "1.25rem" }}>
            {selectedTile === "js" && (
              <div>
                <Callout>
                  Uses the standard <strong>openai</strong> npm package — no custom SDK needed.
                  Just change <code style={{ padding: "0.05rem 0.35rem", background: "var(--bg-interactive)", borderRadius: 4, fontSize: "0.8125rem" }}>baseURL</code>.
                  Works with any OpenAI-compatible library.
                </Callout>
                <div style={{ marginTop: "0.75rem" }}>
                  <CodeBlock
                    lang="typescript"
                    code={jsCode}
                    copyId="snippet-js"
                    copiedItem={copiedItem}
                    onCopy={copy}
                  />
                </div>
              </div>
            )}

            {selectedTile === "python" && (
              <div>
                <Callout>
                  Uses the standard <strong>openai</strong> Python package. Drop-in compatible with LangChain, LlamaIndex, and any OpenAI-compatible library.
                </Callout>
                <div style={{ marginTop: "0.75rem" }}>
                  <CodeBlock
                    lang="python"
                    code={pythonCode}
                    copyId="snippet-python"
                    copiedItem={copiedItem}
                    onCopy={copy}
                  />
                </div>
              </div>
            )}

            {selectedTile === "curl" && (
              <div>
                <CodeBlock
                  lang="bash"
                  code={curlCode}
                  copyId="snippet-curl"
                  copiedItem={copiedItem}
                  onCopy={copy}
                />
                <div style={{ marginTop: "0.75rem" }}>
                  <Callout>
                    List all available models:{" "}
                    <code style={{ padding: "0.05rem 0.35rem", background: "var(--bg-interactive)", borderRadius: 4, fontSize: "0.8125rem" }}>
                      GET {baseUrl}/models
                    </code>
                  </Callout>
                </div>
              </div>
            )}

            {selectedTile === "cursor" && (
              <div>
                <div style={{ marginBottom: "1rem" }}>
                  <Callout variant="success">
                    Cursor supports custom OpenAI-compatible endpoints. Point it at your router to use{" "}
                    <strong>any gateway model or routing profile</strong> from inside the editor.
                  </Callout>
                </div>
                <CursorGuide
                  baseUrl={baseUrl}
                  profileIds={profileIds}
                  copiedItem={copiedItem}
                  onCopy={copy}
                />
              </div>
            )}

            {selectedTile === "vercel" && (
              <VercelSnippet
                baseUrl={baseUrl}
                profileId={defaultProfileId}
                copiedItem={copiedItem}
                onCopy={copy}
              />
            )}
          </div>

          <SectionDivider label="What models can I use?" />
          <Callout>
            Any model registered across your gateways — OpenRouter, OpenAI, Groq, Mistral, Anthropic, and more.
            Use{" "}
            <code style={{ padding: "0.05rem 0.35rem", background: "var(--bg-interactive)", borderRadius: 4, fontSize: "0.8125rem" }}>
              GET /api/v1/models
            </code>{" "}
            for a live list, or browse the <strong>Gateways</strong> tab to configure providers.
          </Callout>
        </div>
      </div>
    </div>
  );
}
