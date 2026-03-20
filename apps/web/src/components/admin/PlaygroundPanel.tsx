"use client";

// ─────────────────────────────────────────────────────────────────────────────
// PlaygroundPanel.tsx
//
// Integrated chat playground for testing routing decisions.
// A compact, admin-optimized version of the chat tester with:
// - Quick model selection for named routing profiles
// - Router Test Mode (default): shows only the routing decision, no LLM response
// - Full Chat Mode: streams the actual model response
// - Message history with routing metadata
// - Request preview for debugging
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState, useRef, useEffect, useCallback } from "react";
import type { RouterProfile } from "@custom-router/core";
import type { RouteInspectResult } from "@/src/features/routing/contracts";
import {
  formatRoutingConfidence,
  readRoutedResponseMetadata,
} from "@/src/features/playground/routing-metadata";

type RouteResult = RouteInspectResult;

type Message = {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  model?: string;
  routedModel?: string;
  routingConfidence?: number;
  requestTime?: number;
  routeResult?: RouteResult;
};

type StreamChunk = {
  choices?: Array<{
    delta?: { content?: string };
    finish_reason?: string;
  }>;
  model?: string;
};

async function readResponsePayload(response: Response): Promise<{ json: any | null; text: string | null }> {
  const rawText = await response.text();
  if (!rawText) {
    return { json: null, text: null };
  }

  try {
    return { json: JSON.parse(rawText), text: rawText };
  } catch {
    return { json: null, text: rawText };
  }
}

// ─── Icons ───────────────────────────────────────────────────────────────────
function IconSend({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <svg className={className} style={style} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" />
    </svg>
  );
}

function IconClear({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <svg className={className} style={style} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    </svg>
  );
}

function IconBot({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <svg className={className} style={style} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="11" width="18" height="10" rx="2" /><circle cx="12" cy="5" r="2" /><path d="M12 7v4" /><line x1="8" y1="16" x2="8" y2="16" /><line x1="16" y1="16" x2="16" y2="16" />
    </svg>
  );
}

function IconUser({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <svg className={className} style={style} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" />
    </svg>
  );
}

function IconModel({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <svg className={className} style={style} width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="3" width="20" height="14" rx="2" ry="2" /><line x1="8" y1="21" x2="16" y2="21" /><line x1="12" y1="17" x2="12" y2="21" />
    </svg>
  );
}

function IconTime({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <svg className={className} style={style} width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
    </svg>
  );
}

function IconSparkles({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <svg className={className} style={style} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z" /><path d="M5 3v4" /><path d="M19 17v4" /><path d="M3 5h4" /><path d="M17 19h4" />
    </svg>
  );
}

function IconRoute({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <svg className={className} style={style} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="6" cy="19" r="3" /><path d="M9 19h8.5a3.5 3.5 0 0 0 0-7h-11a3.5 3.5 0 0 1 0-7H15" /><circle cx="18" cy="5" r="3" />
    </svg>
  );
}

function IconArrowRight({ style }: { style?: React.CSSProperties }) {
  return (
    <svg style={style} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 12h14" /><path d="m12 5 7 7-7 7" />
    </svg>
  );
}

// ─── Components ──────────────────────────────────────────────────────────────

function DECISION_REASON_LABEL(reason: string): string {
  const labels: Record<string, string> = {
    initial_route: "Classifier",
    thread_pin: "Pinned thread",
    fallback_default: "Default fallback",
    fallback_after_failure: "Fallback (failure)",
    passthrough: "Passthrough",
    forced: "Forced",
  };
  return labels[reason] ?? reason;
}

export function RouteCard({ result, latencyMs }: { result: RouteResult; latencyMs?: number }) {
  const ms = result.latencyMs ?? latencyMs;
  const isPinned = result.isContinuation || result.pinUsed;
  const formattedConfidence = formatRoutingConfidence(result.classificationConfidence);
  const pinBudgetLabel =
    typeof result.pinRerouteAfterTurns === "number"
      ? `${result.pinRerouteAfterTurns} future user turn${result.pinRerouteAfterTurns === 1 ? "" : "s"}`
      : null;
  const pinConsumedLabel =
    typeof result.pinConsumedUserTurns === "number"
      ? `${result.pinConsumedUserTurns} consumed`
      : null;
  const pinBudgetSourceLabel =
    result.pinBudgetSource === "classifier"
      ? "Classifier"
      : result.pinBudgetSource === "default"
        ? "Default"
        : null;

  return (
    <div
      style={{
        background: "var(--bg-elevated)",
        border: "1px solid var(--border-subtle)",
        borderRadius: "var(--radius-lg)",
        padding: "var(--space-4) var(--space-5)",
        display: "flex",
        flexDirection: "column",
        gap: "var(--space-3)",
        maxWidth: "480px",
      }}
    >
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
        <IconRoute style={{ color: "var(--accent)", flexShrink: 0 } as React.CSSProperties} />
        <span style={{ fontSize: "0.75rem", fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
          Routing Decision
        </span>
        {ms != null && (
          <span style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: "3px", fontSize: "0.75rem", color: "var(--text-muted)" }}>
            <IconTime />
            {ms}ms
          </span>
        )}
      </div>

      {/* Selected model — prominent */}
      <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
        <IconArrowRight style={{ color: "var(--accent)", flexShrink: 0 } as React.CSSProperties} />
        <span
          style={{
            fontFamily: "var(--font-mono, monospace)",
            fontSize: "0.9375rem",
            fontWeight: 700,
            color: "var(--text-primary)",
            wordBreak: "break-all",
          }}
        >
          {result.selectedModel}
        </span>
      </div>

      {/* Metadata grid */}
      <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "var(--space-1) var(--space-4)", alignItems: "center" }}>
        <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>Decision</span>
        <span>
          <span
            className={`badge ${result.decisionReason === "initial_route" ? "badge--info" : result.decisionReason === "thread_pin" ? "badge--warning" : "badge--default"}`}
            style={{ fontSize: "0.6875rem" }}
          >
            {DECISION_REASON_LABEL(result.decisionReason)}
          </span>
        </span>

        {result.classifierInvoked && result.classifierModel && (
          <>
            <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>Classifier</span>
            <span style={{ fontFamily: "var(--font-mono, monospace)", fontSize: "0.75rem", color: "var(--text-secondary)" }}>
              {result.classifierModel}
            </span>
          </>
        )}

        {formattedConfidence && (
          <>
            <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>Confidence</span>
            <span style={{ fontFamily: "var(--font-mono, monospace)", fontSize: "0.75rem", color: "var(--text-secondary)" }}>
              {formattedConfidence}
            </span>
          </>
        )}

        {isPinned && (
          <>
            <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>Thread</span>
            <span style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>
              {result.isContinuation ? "Continuation" : "Newly pinned"}
            </span>
          </>
        )}

        {pinBudgetLabel && (
          <>
            <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>Smart budget</span>
            <span style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>
              {pinBudgetLabel}
            </span>
          </>
        )}

        {pinConsumedLabel && (
          <>
            <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>User turns</span>
            <span style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>
              {pinConsumedLabel}
            </span>
          </>
        )}

        {pinBudgetSourceLabel && (
          <>
            <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>Budget source</span>
            <span style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>
              {pinBudgetSourceLabel}
            </span>
          </>
        )}

        {result.isAgentLoop && (
          <>
            <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>Loop handling</span>
            <span style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>
              Agent/tool loop ignored for Smart budget
            </span>
          </>
        )}

        {result.fallbackModels.length > 0 && (
          <>
            <span style={{ fontSize: "0.75rem", color: "var(--text-muted)", alignSelf: "start" }}>Fallbacks</span>
            <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
              {result.fallbackModels.map((m) => (
                <span key={m} style={{ fontFamily: "var(--font-mono, monospace)", fontSize: "0.75rem", color: "var(--text-muted)" }}>
                  {m}
                </span>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export function MessageBubble({
  message,
  isStreaming,
}: {
  message: Message;
  isStreaming?: boolean;
}) {
  const isUser = message.role === "user";
  const formattedConfidence = formatRoutingConfidence(message.routingConfidence);

  if (message.routeResult) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)", alignSelf: "flex-start", maxWidth: "95%" }}>
        <RouteCard result={message.routeResult} />
      </div>
    );
  }

  return (
    <div
      className={`message-bubble message-bubble--${message.role}`}
      style={{
        maxWidth: isUser ? "85%" : "95%",
      }}
    >
      {/* Meta Header */}
      <div className="message-meta">
        <span style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
          {isUser ? <IconUser /> : <IconBot />}
          <span className="message-role">{message.role}</span>
        </span>

        {message.routedModel && (
          <span className="message-model">
            <IconModel />
            {message.routedModel}
          </span>
        )}

        {formattedConfidence && (
          <span style={{ color: "var(--text-muted)", fontSize: "0.75rem", fontFamily: "var(--font-mono, monospace)" }}>
            confidence {formattedConfidence}
          </span>
        )}

        {message.requestTime && (
          <span style={{ display: "flex", alignItems: "center", gap: "4px", color: "var(--text-muted)" }}>
            <IconTime />
            {message.requestTime}ms
          </span>
        )}

        {isStreaming && (
          <span className="badge badge--info animate-pulse" style={{ fontSize: "0.625rem" }}>
            streaming...
          </span>
        )}
      </div>

      {/* Content */}
      <div className="message-content">{message.content}</div>
    </div>
  );
}

function EmptyState({ routerTestMode }: { routerTestMode: boolean }) {
  return (
    <div className="empty-state" style={{ padding: "var(--space-8) var(--space-6)" }}>
      <div
        style={{
          width: 56,
          height: 56,
          borderRadius: "var(--radius-xl)",
          background: "var(--accent-dim)",
          display: "grid",
          placeItems: "center",
        }}
      >
        {routerTestMode
          ? <IconRoute style={{ width: 24, height: 24, color: "var(--accent)" } as any} />
          : <IconSparkles style={{ width: 24, height: 24, color: "var(--accent)" } as any} />
        }
      </div>
      <div className="empty-state-title">
        {routerTestMode ? "Test Your Router" : "Chat Playground"}
      </div>
      <p className="empty-state-desc">
        {routerTestMode
          ? "Enter a prompt to see which model would be selected — no tokens spent on the response."
          : "Send a message to see which model the router selects and get a full response."}
      </p>
    </div>
  );
}

// ─── Mode Toggle ─────────────────────────────────────────────────────────────
function ModeToggle({ routerTestMode, onChange }: { routerTestMode: boolean; onChange: (v: boolean) => void }) {
  return (
    <div
      style={{
        display: "inline-flex",
        borderRadius: "var(--radius-lg)",
        border: "1px solid var(--border-subtle)",
        overflow: "hidden",
        fontSize: "0.8125rem",
        background: "var(--bg-surface)",
      }}
    >
      <button
        type="button"
        onClick={() => onChange(true)}
        style={{
          padding: "6px 14px",
          border: "none",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          gap: "6px",
          fontWeight: routerTestMode ? 600 : 400,
          background: routerTestMode ? "var(--accent)" : "transparent",
          color: routerTestMode ? "var(--accent-foreground)" : "var(--text-secondary)",
          transition: "background 0.15s, color 0.15s",
        }}
      >
        <IconRoute style={{ width: 13, height: 13 } as React.CSSProperties} />
        Router Test
      </button>
      <button
        type="button"
        onClick={() => onChange(false)}
        style={{
          padding: "6px 14px",
          border: "none",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          gap: "6px",
          fontWeight: !routerTestMode ? 600 : 400,
          background: !routerTestMode ? "var(--accent)" : "transparent",
          color: !routerTestMode ? "var(--accent-foreground)" : "var(--text-secondary)",
          transition: "background 0.15s, color 0.15s",
        }}
      >
        <IconSparkles style={{ width: 13, height: 13 } as React.CSSProperties} />
        Full Chat
      </button>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export function PlaygroundPanel({ profiles }: { profiles?: RouterProfile[] | null }) {
  const profileOptions = (profiles ?? []).map((profile) => ({
    id: profile.id,
    label: profile.name ? `${profile.id} (${profile.name})` : profile.id,
  }));
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [model, setModel] = useState(profileOptions[0]?.id ?? "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentStream, setCurrentStream] = useState("");
  const [routerTestMode, setRouterTestMode] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const streaming = true;

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, currentStream]);

  useEffect(() => {
    if (!model && profileOptions[0]?.id) {
      setModel(profileOptions[0].id);
      return;
    }

    if (model && !profileOptions.some((profile) => profile.id === model)) {
      setModel(profileOptions[0]?.id ?? "");
    }
  }, [model, profileOptions]);

  const handleSubmit = useCallback(async () => {
    if (!input.trim() || loading || !model) return;

    const userMessage: Message = {
      id: `user-${Date.now()}`,
      role: "user",
      content: input.trim(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setLoading(true);
    setError(null);
    setCurrentStream("");

    const conversationMessages = [...messages, userMessage]
      .filter((m) => m.role !== "system")
      .map((m) => ({ role: m.role, content: m.content }));

    try {
      const startTime = Date.now();

      if (routerTestMode) {
        // ── Router Test Mode: call inspect endpoint, return routing decision only ──
        const response = await fetch("/api/v1/router/inspect", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ model, messages: conversationMessages }),
        });
        const payload = await readResponsePayload(response);

        if (!response.ok) {
          const errorMessage =
            (payload.json && typeof payload.json === "object" && typeof payload.json.error === "string" && payload.json.error) ||
            payload.text ||
            `HTTP ${response.status}`;
          throw new Error(errorMessage);
        }

        if (!payload.json) {
          throw new Error(`Inspect request returned an empty response (HTTP ${response.status}).`);
        }

        const routeResult = payload.json as RouteResult;
        const resultMessage: Message = {
          id: `route-${Date.now()}`,
          role: "assistant",
          content: "",
          model,
          routeResult,
          requestTime: Date.now() - startTime,
        };
        setMessages((prev) => [...prev, resultMessage]);
      } else {
        // ── Full Chat Mode: stream the actual model response ──
        const response = await fetch("/api/v1/chat/completions", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ model, messages: conversationMessages, stream: streaming }),
        });
        const routedResponseMetadata = readRoutedResponseMetadata(response.headers);

        if (!response.ok) {
          const payload = await readResponsePayload(response);
          const errorMessage =
            (payload.json && typeof payload.json === "object" && typeof payload.json.error === "string" && payload.json.error) ||
            payload.text ||
            `HTTP ${response.status}`;
          throw new Error(errorMessage);
        }

        if (streaming && response.body) {
          const reader = response.body.getReader();
          const decoder = new TextDecoder();
          let fullContent = "";
          let routedModel = routedResponseMetadata.routedModel;

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const chunk = decoder.decode(value);
            const lines = chunk.split("\n").filter((l) => l.trim());

            for (const line of lines) {
              if (line.startsWith("data: ")) {
                const data = line.slice(6);
                if (data === "[DONE]") continue;

                try {
                  const parsed: StreamChunk = JSON.parse(data);
                  const content = parsed.choices?.[0]?.delta?.content;
                  if (content) fullContent += content;
                  if (parsed.model && !routedModel) routedModel = parsed.model;
                  setCurrentStream(fullContent);
                } catch {
                  // Skip malformed chunks
                }
              }
            }
          }

          const assistantMessage: Message = {
            id: `assistant-${Date.now()}`,
            role: "assistant",
            content: fullContent,
            model,
            routedModel,
            routingConfidence: routedResponseMetadata.classificationConfidence,
            requestTime: Date.now() - startTime,
          };
          setMessages((prev) => [...prev, assistantMessage]);
          setCurrentStream("");
        } else {
          const payload = await readResponsePayload(response);
          if (!payload.json) {
            throw new Error(`Chat request returned an empty response (HTTP ${response.status}).`);
          }

          const data = payload.json as {
            choices?: Array<{ message?: { content?: string } }>;
            model?: string;
          };
          const assistantMessage: Message = {
            id: `assistant-${Date.now()}`,
            role: "assistant",
            content: data.choices?.[0]?.message?.content || "",
            model,
            routedModel: routedResponseMetadata.routedModel ?? data.model,
            routingConfidence: routedResponseMetadata.classificationConfidence,
            requestTime: Date.now() - startTime,
          };
          setMessages((prev) => [...prev, assistantMessage]);
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Request failed");
    } finally {
      setLoading(false);
    }
  }, [input, loading, model, messages, streaming, routerTestMode]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void handleSubmit();
    }
  };

  return (
    <div className="animate-fade-in">
      {/* Configuration Bar */}
      <div
        className="card"
        style={{
          marginBottom: "var(--space-4)",
        }}
      >
        <div className="card-body">
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: "var(--space-4)",
              alignItems: "flex-end",
            }}
          >
            {/* Mode toggle */}
            <div className="form-group" style={{ minWidth: 0 }}>
              <label className="form-label">Mode</label>
              <ModeToggle routerTestMode={routerTestMode} onChange={setRouterTestMode} />
            </div>

            {/* Model */}
            <div className="form-group" style={{ flex: 1, minWidth: 180 }}>
              <label className="form-label">Routing profile</label>
              <select
                className="input"
                value={model}
                onChange={(e) => setModel(e.target.value)}
                disabled={profileOptions.length === 0}
              >
                {profileOptions.length === 0 ? (
                  <option value="">Create a routing profile first</option>
                ) : (
                  profileOptions.map((profile) => (
                    <option key={profile.id} value={profile.id}>
                      {profile.label}
                    </option>
                  ))
                )}
              </select>
              {profileOptions.length === 0 ? (
                <p
                  style={{
                    margin: "0.5rem 0 0",
                    fontSize: "0.75rem",
                    color: "var(--text-muted)",
                  }}
                >
                  Create a named routing profile in the Routing tab before using the playground.
                </p>
              ) : null}
            </div>
          </div>
        </div>
      </div>

      {/* Chat Area */}
      <div
        className="card"
        style={{
          minHeight: 400,
          display: "flex",
          flexDirection: "column",
        }}
      >
        {/* Messages */}
        <div style={{ flex: 1, overflow: "hidden" }}>
          {messages.length === 0 && !currentStream ? (
            <EmptyState routerTestMode={routerTestMode} />
          ) : (
            <div
              className="chat-messages"
              style={{
                maxHeight: 500,
              }}
            >
              {messages.map((msg) => (
                <MessageBubble key={msg.id} message={msg} />
              ))}
              {currentStream && (
                <MessageBubble
                  message={{
                    id: "streaming",
                    role: "assistant",
                    content: currentStream,
                  }}
                  isStreaming
                />
              )}
              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        {/* Error Banner */}
        {error && (
          <div
            className="alert alert--danger"
            style={{
              margin: "0 var(--space-5) var(--space-4)",
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            {error}
          </div>
        )}

        {/* Input Area */}
        <div
          className="chat-input"
          style={{
            borderTop: "1px solid var(--border-subtle)",
            background: "var(--bg-elevated)",
          }}
        >
          <textarea
            className="input"
            style={{
              flex: 1,
              minHeight: 44,
              maxHeight: 120,
              resize: "none",
              background: "var(--bg-surface)",
            }}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={
              routerTestMode
                ? "Ask something to see how it would be routed... (Enter to inspect)"
                : "Type a message... (Enter to send, Shift+Enter for new line)"
            }
            disabled={loading}
            rows={2}
          />
          <button
            className="btn btn--primary"
            onClick={handleSubmit}
            disabled={loading || !input.trim() || !model}
            style={{ alignSelf: "flex-end" }}
          >
            {loading ? (
              <svg className="animate-spin" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 12a9 9 0 1 1-6.219-8.56" />
              </svg>
            ) : routerTestMode ? (
              <IconRoute />
            ) : (
              <IconSend />
            )}
            {loading ? (routerTestMode ? "Routing..." : "Sending...") : (routerTestMode ? "Inspect" : "Send")}
          </button>
        </div>
      </div>

      {/* Request Preview */}
      {messages.length > 0 && (
        <div className="card mt-4" style={{ minWidth: 0, maxWidth: "100%" }}>
          <div className="card-header">
            <h4 style={{ fontSize: "0.875rem", fontWeight: 600 }}>Last Request</h4>
          </div>
          <div className="card-body playground-request-preview" style={{ padding: 0, minWidth: 0, maxWidth: "100%" }}>
            <pre
              className="code-block playground-request-code"
              style={{
                margin: 0,
                borderRadius: 0,
                fontSize: "0.75rem",
                maxHeight: 200,
                maxWidth: "100%",
              }}
            >
              {JSON.stringify(
                {
                  model,
                  messages: messages
                    .filter((m) => m.role !== "system")
                    .map((m) => ({ role: m.role, content: m.content })),
                  ...(routerTestMode ? {} : { stream: streaming }),
                },
                null,
                2
              )}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}
