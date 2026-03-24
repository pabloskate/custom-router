"use client";

// ─────────────────────────────────────────────────────────────────────────────
// AuthGate.tsx
//
// Login/signup with registration-mode awareness:
// - "open"   → normal login + signup tabs
// - "closed" → login only (signup hidden unless first user)
// - "invite" → signup shows an invite code field
// ─────────────────────────────────────────────────────────────────────────────

import Image from "next/image";
import { useEffect, useState } from "react";
import type { RegistrationMode } from "@/src/lib/constants";
import { AUTH } from "@/src/lib/constants";

interface Props {
  onAuthenticated: () => void;
  initialRegistrationStatus?: RegistrationStatus | null;
}

interface RegistrationStatus {
  mode: RegistrationMode;
  signupAllowed: boolean;
  firstUser: boolean;
  requiresInviteCode: boolean;
}

interface ForgotPasswordResponse {
  error?: string;
  message?: string;
  reset_url?: string;
  reset_token?: string;
}

// ─── Icons ───────────────────────────────────────────────────────────────────
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
export function AuthGate({ onAuthenticated, initialRegistrationStatus = null }: Props) {
  const [mode, setMode] = useState<"login" | "signup" | "forgot" | "reset">("login");
  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const [inviteCode, setInviteCode] = useState("");
  const [forgotEmail, setForgotEmail] = useState("");
  const [resetForm, setResetForm] = useState({ token: "", password: "", confirmPassword: "" });
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [resetPreviewUrl, setResetPreviewUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [regStatus, setRegStatus] = useState<RegistrationStatus | null>(initialRegistrationStatus);

  function clearResetTokenFromUrl() {
    if (typeof window === "undefined") {
      return;
    }

    const url = new URL(window.location.href);
    if (!url.searchParams.has("reset_token")) {
      return;
    }

    url.searchParams.delete("reset_token");
    window.history.replaceState({}, "", url.toString());
  }

  function switchMode(nextMode: "login" | "signup" | "forgot" | "reset") {
    if (nextMode !== "reset") {
      clearResetTokenFromUrl();
    }

    setMode(nextMode);
    setError("");
    setMessage("");
    setResetPreviewUrl("");

    if (nextMode === "signup") {
      setInviteCode("");
    }
  }

  useEffect(() => {
    if (regStatus) {
      return;
    }

    fetch("/api/v1/auth/registration-status")
      .then((r) => r.json() as Promise<RegistrationStatus>)
      .then(setRegStatus)
      .catch(() => {
        // Fallback: assume open so the UI is still usable
        setRegStatus({ mode: "open", signupAllowed: true, firstUser: false, requiresInviteCode: false });
      });
  }, [regStatus]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const resetToken = new URLSearchParams(window.location.search).get("reset_token");
    if (!resetToken) {
      return;
    }

    setMode("reset");
    setMessage("Choose a new password to finish resetting your account.");
    setResetForm((current) => ({ ...current, token: resetToken }));
  }, []);

  // Default to signup when this is the first user (better UX; no tab click needed)
  useEffect(() => {
    if (regStatus?.firstUser && mode === "login") {
      setMode("signup");
    }
  }, [regStatus?.firstUser, mode]);

  const signupAvailable = regStatus?.signupAllowed ?? false;
  const isLogin = mode === "login";
  const isSignup = mode === "signup";
  const isForgot = mode === "forgot";
  const isReset = mode === "reset";
  const isSignInMode = isLogin || isForgot || isReset;

  async function handleAuthSubmit() {
    setError("");
    setMessage("");
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

  async function handleForgotPassword() {
    setError("");
    setMessage("");
    setResetPreviewUrl("");
    setLoading(true);

    try {
      const res = await fetch("/api/v1/auth/forgot-password", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: forgotEmail }),
      });

      const data = await res.json() as ForgotPasswordResponse;

      if (!res.ok) {
        setError(data.error || "Unable to start password reset. Please try again.");
        return;
      }

      setMessage(
        data.message || "If an account with that email exists, password reset instructions have been sent."
      );

      if (data.reset_token) {
        setResetPreviewUrl(data.reset_url || "");
        setResetForm({ token: data.reset_token, password: "", confirmPassword: "" });
        setMode("reset");
      }
    } catch {
      setError("Network error. Please check your connection.");
    } finally {
      setLoading(false);
    }
  }

  async function handleResetPassword() {
    setError("");
    setMessage("");

    if (!resetForm.token) {
      setError("Enter the reset token from your email or preview link.");
      return;
    }

    if (resetForm.password.length < AUTH.PASSWORD_MIN_LENGTH) {
      setError(`Password must be at least ${AUTH.PASSWORD_MIN_LENGTH} characters long.`);
      return;
    }

    if (resetForm.password !== resetForm.confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);

    try {
      const res = await fetch("/api/v1/auth/reset-password", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          token: resetForm.token,
          password: resetForm.password,
        }),
      });

      const data = await res.json() as { error?: string };

      if (!res.ok) {
        setError(data.error || "Unable to reset your password. Request a new link and try again.");
        return;
      }

      clearResetTokenFromUrl();
      onAuthenticated();
    } catch {
      setError("Network error. Please check your connection.");
    } finally {
      setLoading(false);
    }
  }

  const heading = isLogin
    ? "Welcome Back"
    : isSignup
      ? (regStatus?.firstUser ? "Set Up Your Instance" : "Create Account")
      : isForgot
        ? "Reset Your Password"
        : "Choose a New Password";

  const subheading = isLogin
    ? "Sign in to access your CustomRouter dashboard"
    : isSignup
      ? (regStatus?.firstUser
          ? "Create the first account to get started"
          : "Sign up to start routing your LLM requests")
      : isForgot
        ? "Enter your email and we will send reset instructions if the account exists"
        : "Paste your reset token or open the reset link to finish signing in";

  const emailInputId = isForgot ? "forgot-email" : isLogin ? "login-email" : "signup-email";
  const passwordInputId = isLogin ? "password-input" : "signup-password";
  const emailAutoComplete = isLogin ? "username" : "email";

  function handleCredentialSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (loading) {
      return;
    }

    if (isForgot) {
      void handleForgotPassword();
      return;
    }

    if (isReset) {
      void handleResetPassword();
      return;
    }

    void handleAuthSubmit();
  }

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
              width: 96,
              height: 96,
              marginBottom: "var(--space-5)",
            }}
          >
            <Image
              src="/brand/custom-router-mark.webp"
              alt="CustomRouter"
              width={96}
              height={96}
              priority
              style={{ width: "100%", height: "auto" }}
            />
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
            {heading}
          </h1>
          <p
            style={{
              fontSize: "0.9375rem",
              color: "var(--text-muted)",
              textAlign: "center",
            }}
          >
            {subheading}
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
              type="button"
              className={`tab ${isSignInMode ? "tab--active" : ""}`}
              onClick={() => {
                if (!isLogin) {
                  switchMode("login");
                }
              }}
              style={{ flex: 1, justifyContent: "center" }}
            >
              Sign In
            </button>
            {signupAvailable && (
              <button
                type="button"
                className={`tab ${isSignup ? "tab--active" : ""}`}
                onClick={() => {
                  if (!isSignup) {
                    switchMode("signup");
                  }
                }}
                style={{ flex: 1, justifyContent: "center" }}
              >
                Sign Up
              </button>
            )}
          </div>

          {/* Form Fields */}
          <form key={mode} onSubmit={handleCredentialSubmit} autoComplete="on" style={{ padding: "var(--space-6)" }}>
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
              {isSignup && (
                <div className="form-group">
                  <label className="form-label" htmlFor="signup-name">
                    <span style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
                      <IconUser style={{ width: 14, height: 14 } as any} />
                      Full Name
                    </span>
                  </label>
                  <input
                    id="signup-name"
                    name="name"
                    className="input"
                    type="text"
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    placeholder="Your name"
                    autoComplete="name"
                    required
                    disabled={loading}
                  />
                </div>
              )}

              {/* Invite Code Field - Signup + invite mode only */}
              {isSignup && regStatus?.requiresInviteCode && (
                <div className="form-group">
                  <label className="form-label" htmlFor="signup-invite-code">
                    <span style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
                      <IconTicket style={{ width: 14, height: 14 } as any} />
                      Invite Code
                    </span>
                  </label>
                  <input
                    id="signup-invite-code"
                    name="inviteCode"
                    className="input"
                    type="text"
                    value={inviteCode}
                    onChange={(e) => setInviteCode(e.target.value)}
                    placeholder="Enter your invite code"
                    required
                    disabled={loading}
                  />
                </div>
              )}

              {/* Email Field */}
              {!isReset && (
                <div className="form-group">
                  <label className="form-label" htmlFor={emailInputId}>
                    <span style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
                      <IconMail style={{ width: 14, height: 14 } as any} />
                      Email Address
                    </span>
                  </label>
                  <input
                    id={emailInputId}
                    name={isLogin ? "username" : "email"}
                    className="input"
                    type="email"
                    value={isForgot ? forgotEmail : form.email}
                    onChange={(e) => {
                      const nextEmail = e.target.value;
                      if (isForgot) {
                        setForgotEmail(nextEmail);
                      } else {
                        setForm({ ...form, email: nextEmail });
                      }
                    }}
                    placeholder="you@example.com"
                    autoComplete={emailAutoComplete}
                    autoCapitalize="none"
                    spellCheck={false}
                    inputMode="email"
                    required
                    disabled={loading}
                  />
                </div>
              )}

              {(isLogin || isSignup) && (
                <div className="form-group">
                  <label className="form-label" htmlFor={passwordInputId}>
                    <span style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
                      <IconKey style={{ width: 14, height: 14 } as any} />
                      Password
                    </span>
                  </label>
                  <input
                    id={passwordInputId}
                    name={isLogin ? "password" : "newPassword"}
                    className="input"
                    type="password"
                    value={form.password}
                    onChange={(e) => setForm({ ...form, password: e.target.value })}
                    placeholder="••••••••"
                    autoComplete={isLogin ? "current-password" : "new-password"}
                    autoCapitalize="none"
                    spellCheck={false}
                    required
                    disabled={loading}
                  />
                </div>
              )}

              {isLogin && (
                <button
                  type="button"
                  onClick={() => {
                    setForgotEmail(form.email);
                    switchMode("forgot");
                  }}
                  disabled={loading}
                  style={{
                    alignSelf: "flex-start",
                    background: "none",
                    border: "none",
                    color: "var(--accent)",
                    padding: 0,
                    fontSize: "0.875rem",
                    cursor: "pointer",
                  }}
                >
                  Forgot your password?
                </button>
              )}

              {isReset && (
                <>
                  <div className="form-group">
                    <label className="form-label" htmlFor="reset-token">
                      <span style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
                        <IconKey style={{ width: 14, height: 14 } as any} />
                        Reset Token
                      </span>
                    </label>
                    <input
                      id="reset-token"
                      name="resetToken"
                      className="input"
                      type="text"
                      value={resetForm.token}
                      onChange={(e) => setResetForm({ ...resetForm, token: e.target.value })}
                      placeholder="Paste the token from your reset link"
                      autoComplete="one-time-code"
                      autoCapitalize="none"
                      spellCheck={false}
                      required
                      disabled={loading}
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label" htmlFor="reset-new-password">
                      <span style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
                        <IconKey style={{ width: 14, height: 14 } as any} />
                        New Password
                      </span>
                    </label>
                    <input
                      id="reset-new-password"
                      name="newPassword"
                      className="input"
                      type="password"
                      value={resetForm.password}
                      onChange={(e) => setResetForm({ ...resetForm, password: e.target.value })}
                      placeholder="••••••••"
                      autoComplete="new-password"
                      autoCapitalize="none"
                      spellCheck={false}
                      minLength={AUTH.PASSWORD_MIN_LENGTH}
                      required
                      disabled={loading}
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label" htmlFor="reset-confirm-password">
                      <span style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
                        <IconKey style={{ width: 14, height: 14 } as any} />
                        Confirm Password
                      </span>
                    </label>
                    <input
                      id="reset-confirm-password"
                      name="confirmPassword"
                      className="input"
                      type="password"
                      value={resetForm.confirmPassword}
                      onChange={(e) => setResetForm({ ...resetForm, confirmPassword: e.target.value })}
                      placeholder="••••••••"
                      autoComplete="new-password"
                      autoCapitalize="none"
                      spellCheck={false}
                      minLength={AUTH.PASSWORD_MIN_LENGTH}
                      required
                      disabled={loading}
                    />
                  </div>
                </>
              )}
            </div>

            {message && (
              <div
                style={{
                  marginTop: "var(--space-5)",
                  padding: "var(--space-4)",
                  borderRadius: "var(--radius-lg)",
                  background: "var(--accent-dim)",
                  border: "1px solid var(--border-subtle)",
                  color: "var(--text-primary)",
                  fontSize: "0.875rem",
                }}
              >
                {message}
              </div>
            )}

            {resetPreviewUrl && (
              <div
                style={{
                  marginTop: "var(--space-4)",
                  padding: "var(--space-4)",
                  borderRadius: "var(--radius-lg)",
                  background: "var(--bg-subtle)",
                  border: "1px solid var(--border-subtle)",
                  color: "var(--text-muted)",
                  fontSize: "0.8125rem",
                }}
              >
                Local preview link:{" "}
                <a href={resetPreviewUrl} style={{ color: "var(--accent)", textDecoration: "none" }}>
                  Open reset link
                </a>
              </div>
            )}

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
              type="submit"
              className="btn btn--primary"
              style={{
                width: "100%",
                marginTop: "var(--space-6)",
                justifyContent: "center",
              }}
              disabled={
                loading ||
                (isLogin && (!form.email || !form.password)) ||
                (isSignup && (!form.email || !form.password || !form.name || (regStatus?.requiresInviteCode && !inviteCode))) ||
                (isForgot && !forgotEmail) ||
                (isReset && (!resetForm.token || !resetForm.password || !resetForm.confirmPassword))
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
                  {isLogin
                    ? "Signing in..."
                    : isSignup
                      ? "Creating account..."
                      : isForgot
                        ? "Sending reset link..."
                        : "Resetting password..."}
                </>
              ) : (
                <>
                  {(isLogin || isReset) ? <IconArrowRight /> : <IconUserPlus />}
                  {isLogin
                    ? "Sign In"
                    : isSignup
                      ? "Create Account"
                      : isForgot
                        ? "Send Reset Link"
                        : "Reset Password"}
                </>
              )}
            </button>

            {(isForgot || isReset) && (
              <button
                type="button"
                className="btn btn--ghost"
                style={{
                  width: "100%",
                  marginTop: "var(--space-3)",
                  justifyContent: "center",
                }}
                onClick={() => {
                  switchMode("login");
                  setResetForm({ token: "", password: "", confirmPassword: "" });
                }}
                disabled={loading}
              >
                Back to Sign In
              </button>
            )}

            {isForgot && (
              <button
                type="button"
                className="btn btn--ghost"
                style={{
                  width: "100%",
                  marginTop: "var(--space-3)",
                  justifyContent: "center",
                }}
                onClick={() => {
                  setResetForm((current) => ({ ...current, token: "" }));
                  switchMode("reset");
                }}
                disabled={loading}
              >
                I already have a reset token
              </button>
            )}
          </form>
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
