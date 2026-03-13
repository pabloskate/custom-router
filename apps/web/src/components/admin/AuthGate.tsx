"use client";

// ─────────────────────────────────────────────────────────────────────────────
// AuthGate.tsx
//
// Login/signup with registration-mode awareness:
// - "open"   → normal login + signup tabs
// - "closed" → login only (signup hidden unless first user)
// - "invite" → signup shows an invite code field
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useState } from "react";

interface Props {
  onAuthenticated: () => void;
}

interface RegistrationStatus {
  mode: "open" | "closed" | "invite";
  signupAllowed: boolean;
  firstUser: boolean;
  requiresInviteCode: boolean;
}

// ─── Icons ───────────────────────────────────────────────────────────────────
function IconLock({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <svg className={className} style={style} width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
    </svg>
  );
}

function IconUser({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <svg className={className} style={style} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
    </svg>
  );
}

function IconMail({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <svg className={className} style={style} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/>
    </svg>
  );
}

function IconKey({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <svg className={className} style={style} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="7.5" cy="15.5" r="5.5"/><path d="M21 2l-9.6 9.6"/><path d="M15.5 9.5l3 3L22 7l-3-3-3.5 3.5"/>
    </svg>
  );
}

function IconArrowRight({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <svg className={className} style={style} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/>
    </svg>
  );
}

function IconUserPlus({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <svg className={className} style={style} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/><line x1="20" y1="8" x2="20" y2="14"/><line x1="23" y1="11" x2="17" y2="11"/>
    </svg>
  );
}

function IconTicket({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <svg className={className} style={style} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2Z"/>
      <path d="M13 5v2"/><path d="M13 17v2"/><path d="M13 11v2"/>
    </svg>
  );
}

// ─── Main Component ──────────────────────────────────────────────────────────
export function AuthGate({ onAuthenticated }: Props) {
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const [inviteCode, setInviteCode] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [regStatus, setRegStatus] = useState<RegistrationStatus | null>(null);

  useEffect(() => {
    fetch("/api/v1/auth/registration-status")
      .then((r) => r.json() as Promise<RegistrationStatus>)
      .then(setRegStatus)
      .catch(() => {
        // Fallback: assume open so the UI is still usable
        setRegStatus({ mode: "open", signupAllowed: true, firstUser: false, requiresInviteCode: false });
      });
  }, []);

  // Default to signup when this is the first user (better UX; no tab click needed)
  useEffect(() => {
    if (regStatus?.firstUser && mode === "login") {
      setMode("signup");
    }
  }, [regStatus?.firstUser]);

  const signupAvailable = regStatus?.signupAllowed ?? true;

  async function handleSubmit() {
    setError("");
    setLoading(true);

    const endpoint = mode === "login" ? "/api/v1/auth/login" : "/api/v1/auth/signup";

    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ...form,
          ...(mode === "signup" && inviteCode ? { invite_code: inviteCode } : {}),
        }),
      });

      const data = await res.json() as { error?: string };

      if (res.ok) {
        onAuthenticated();
      } else {
        setError(data.error || "Authentication failed. Please try again.");
      }
    } catch {
      setError("Network error. Please check your connection.");
    } finally {
      setLoading(false);
    }
  }

  function toggleMode() {
    setMode(mode === "login" ? "signup" : "login");
    setError("");
    setForm({ name: "", email: "", password: "" });
    setInviteCode("");
  }

  const isLogin = mode === "login";

  return (
    <div
      style={{
        minHeight: "calc(100vh - 200px)",
        display: "grid",
        placeItems: "center",
        padding: "var(--space-6)",
      }}
    >
      <div
        className="animate-fade-in"
        style={{
          width: "100%",
          maxWidth: 420,
        }}
      >
        {/* Logo / Icon */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            marginBottom: "var(--space-8)",
          }}
        >
          <div
            style={{
              width: 80,
              height: 80,
              borderRadius: "var(--radius-xl)",
              background: "var(--accent-dim)",
              display: "grid",
              placeItems: "center",
              marginBottom: "var(--space-5)",
            }}
          >
            <IconLock style={{ color: "var(--accent)" } as any} />
          </div>
          <h1
            style={{
              fontSize: "1.5rem",
              fontWeight: 700,
              color: "var(--text-primary)",
              marginBottom: "var(--space-2)",
              textAlign: "center",
            }}
          >
            {isLogin ? "Welcome Back" : regStatus?.firstUser ? "Set Up Your Instance" : "Create Account"}
          </h1>
          <p
            style={{
              fontSize: "0.9375rem",
              color: "var(--text-muted)",
              textAlign: "center",
            }}
          >
            {isLogin
              ? "Sign in to access your CustomRouter dashboard"
              : regStatus?.firstUser
                ? "Create the first account to get started"
                : "Sign up to start routing your LLM requests"}
          </p>
        </div>

        {/* Form Card */}
        <div
          className="card"
          style={{
            background: "var(--bg-surface)",
            border: "1px solid var(--border-subtle)",
          }}
        >
          {/* Mode Toggle */}
          <div
            style={{
              display: "flex",
              padding: "var(--space-2)",
              borderBottom: "1px solid var(--border-subtle)",
            }}
          >
            <button
              className={`tab ${isLogin ? "tab--active" : ""}`}
              onClick={() => !isLogin && toggleMode()}
              style={{ flex: 1, justifyContent: "center" }}
            >
              Sign In
            </button>
            {signupAvailable && (
              <button
                className={`tab ${!isLogin ? "tab--active" : ""}`}
                onClick={() => isLogin && toggleMode()}
                style={{ flex: 1, justifyContent: "center" }}
              >
                Sign Up
              </button>
            )}
          </div>

          {/* Form Fields */}
          <div style={{ padding: "var(--space-6)" }}>
            {/* Registration closed message */}
            {!isLogin && !signupAvailable && (
              <div
                className="alert alert--warning"
                style={{ marginBottom: "var(--space-5)" }}
              >
                Registration is closed. Contact an administrator for access.
              </div>
            )}

            <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-5)" }}>
              {/* Name Field - Signup Only */}
              {!isLogin && (
                <div className="form-group">
                  <label className="form-label">
                    <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
                      <IconUser style={{ width: 14, height: 14 } as any} />
                      Full Name
                    </div>
                  </label>
                  <input
                    className="input"
                    type="text"
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    placeholder="Your name"
                    autoComplete="name"
                    disabled={loading}
                  />
                </div>
              )}

              {/* Invite Code Field - Signup + invite mode only */}
              {!isLogin && regStatus?.requiresInviteCode && (
                <div className="form-group">
                  <label className="form-label">
                    <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
                      <IconTicket style={{ width: 14, height: 14 } as any} />
                      Invite Code
                    </div>
                  </label>
                  <input
                    className="input"
                    type="text"
                    value={inviteCode}
                    onChange={(e) => setInviteCode(e.target.value)}
                    placeholder="Enter your invite code"
                    disabled={loading}
                  />
                </div>
              )}

              {/* Email Field */}
              <div className="form-group">
                <label className="form-label">
                  <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
                    <IconMail style={{ width: 14, height: 14 } as any} />
                    Email Address
                  </div>
                </label>
                <input
                  className="input"
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  placeholder="you@example.com"
                  autoComplete="email"
                  disabled={loading}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      const passwordInput = document.getElementById("password-input") as HTMLInputElement;
                      passwordInput?.focus();
                    }
                  }}
                />
              </div>

              {/* Password Field */}
              <div className="form-group">
                <label className="form-label">
                  <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
                    <IconKey style={{ width: 14, height: 14 } as any} />
                    Password
                  </div>
                </label>
                <input
                  id="password-input"
                  className="input"
                  type="password"
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  placeholder="••••••••"
                  autoComplete={isLogin ? "current-password" : "new-password"}
                  disabled={loading}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      void handleSubmit();
                    }
                  }}
                />
              </div>
            </div>

            {/* Error Alert */}
            {error && (
              <div
                className="alert alert--danger"
                style={{ marginTop: "var(--space-5)" }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
                </svg>
                {error}
              </div>
            )}

            {/* Submit Button */}
            <button
              className="btn btn--primary"
              style={{
                width: "100%",
                marginTop: "var(--space-6)",
                justifyContent: "center",
              }}
              onClick={() => void handleSubmit()}
              disabled={
                loading ||
                !form.email ||
                !form.password ||
                (!isLogin && !form.name) ||
                (!isLogin && regStatus?.requiresInviteCode && !inviteCode)
              }
            >
              {loading ? (
                <>
                  <svg
                    className="animate-spin"
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                  </svg>
                  {isLogin ? "Signing in..." : "Creating account..."}
                </>
              ) : (
                <>
                  {isLogin ? <IconArrowRight /> : <IconUserPlus />}
                  {isLogin ? "Sign In" : "Create Account"}
                </>
              )}
            </button>
          </div>
        </div>

        {/* Help Text */}
        <p
          style={{
            fontSize: "0.8125rem",
            color: "var(--text-muted)",
            textAlign: "center",
            marginTop: "var(--space-6)",
          }}
        >
          By continuing, you agree to the{" "}
          <a href="/terms" style={{ color: "var(--accent)", textDecoration: "none" }}>
            Terms of Service
          </a>{" "}
          and{" "}
          <a href="/privacy" style={{ color: "var(--accent)", textDecoration: "none" }}>
            Privacy Policy
          </a>
          .
        </p>
      </div>
    </div>
  );
}
