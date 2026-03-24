// ─────────────────────────────────────────────────────────────────────────────
// constants.ts
//
// Central home for every magic number and hard-coded string in the web app.
// Import from here instead of scattering literals across files.
// ─────────────────────────────────────────────────────────────────────────────

// ── Guardrail Thresholds ──────────────────────────────────────────────────────
//
// Guardrails temporarily disable a model/provider when observed performance
// metrics breach configured limits. State is in-process (Map) so it resets on
// worker restart — this is intentional: a fresh worker should give models a
// clean slate.
//
// How it works:
//   1. Every routed request records an event (ok, latencyMs, fallback).
//   2. After each event, three checks run against rolling windows:
//      a. 5-min error rate  > ERROR_RATE_LIMIT
//      b. 10-min fallback rate > FALLBACK_RATE_LIMIT
//      c. 5-min P95 latency  > day P95 * LATENCY_DEGRADATION_FACTOR
//   3. If any check fires AND the sample is large enough (MIN_EVENTS), the
//      model is disabled for COOLDOWN_MS.
//   4. Events older than MAX_AGE_MS are pruned to keep memory bounded.

export const GUARDRAIL = {
  // Rolling window sizes
  FIVE_MIN_MS: 5 * 60 * 1000,
  TEN_MIN_MS: 10 * 60 * 1000,
  DAY_MS: 24 * 60 * 60 * 1000,

  // How long a model stays disabled after a threshold breach
  COOLDOWN_MS: 30 * 60 * 1000,

  // Minimum sample size before any threshold check is evaluated.
  // Avoids false positives during warm-up.
  MIN_EVENTS: 50,

  // Disable if 5-min error rate (non-2xx responses) exceeds 3 %
  ERROR_RATE_LIMIT: 0.03,

  // Disable if 10-min fallback rate (requests that fell through to a backup
  // model) exceeds 8 %
  FALLBACK_RATE_LIMIT: 0.08,

  // Disable if recent P95 latency is 80 % worse than the day baseline.
  // Formula: fiveMinP95 > dayP95 * LATENCY_DEGRADATION_FACTOR
  LATENCY_DEGRADATION_FACTOR: 1.8,

  // Minimum latency sample sizes for the latency check
  MIN_DAY_LATENCY_SAMPLES: 50,
  MIN_RECENT_LATENCY_SAMPLES: 20,
} as const;

// ── Authentication ────────────────────────────────────────────────────────────

export const AUTH = {
  // Prefix on every user-visible API key. Change requires a migration.
  API_KEY_PREFIX: "ar_sk_",

  // How many characters of the key are stored as the "prefix" for display
  // (e.g. "ar_sk_1a2b3c…"). Covers the literal prefix + a few hex chars.
  API_KEY_DISPLAY_PREFIX_LENGTH: 12,

  // PBKDF2-SHA256 iterations. NIST SP 800-132 recommends ≥ 10 000; 100 000
  // is the current recommended minimum for password hashing.
  PBKDF2_ITERATIONS: 100_000,

  // Shared password policy for signup and reset flows.
  PASSWORD_MIN_LENGTH: 8,

  // Session cookie lifetime
  SESSION_TTL_MS: 1000 * 60 * 60 * 24 * 30,      // 30 days
  SESSION_MAX_AGE_SECONDS: 60 * 60 * 24 * 30,     // 30 days
  SESSION_COOKIE_NAME: "auto_router_session",

  // Password reset token settings.
  PASSWORD_RESET_TOKEN_BYTES: 32,
  PASSWORD_RESET_TTL_MS: 15 * 60 * 1000,
  PASSWORD_RESET_REQUEST_IP_MAX: 8,
  PASSWORD_RESET_REQUEST_WINDOW_SECONDS: 15 * 60,
  PASSWORD_RESET_EMAIL_IP_MAX: 5,
  PASSWORD_RESET_EMAIL_IP_WINDOW_SECONDS: 60 * 60,
  PASSWORD_RESET_CONFIRM_IP_MAX: 12,
  PASSWORD_RESET_CONFIRM_WINDOW_SECONDS: 15 * 60,

  // Minimum length required for BYOK encryption secret material.
  BYOK_ENCRYPTION_SECRET_MIN_LENGTH: 16,

  // AES-GCM nonce size for encrypted BYOK credential blobs.
  BYOK_AES_GCM_IV_BYTES: 12,
} as const;

// ── Registration Gating ─────────────────────────────────────────────────────
//
// Controls who can create accounts on a self-hosted instance.
// Default is "closed" so fresh deployments are secure out of the box.
// The first user is always allowed regardless of mode (initial setup).

export const REGISTRATION = {
  MODES: ["open", "closed", "invite"] as const,
  DEFAULT_MODE: "closed" as const,
  INVITE_CODE_LENGTH: 24,
  DEFAULT_USES: 1,
  DEFAULT_EXPIRES_MS: 7 * 24 * 60 * 60 * 1000, // 7 days
} as const;

export type RegistrationMode = (typeof REGISTRATION.MODES)[number];

// ── LLM Classifier ────────────────────────────────────────────────────────────
//
// The frontier classifier is a cheap, fast LLM that reads the user's request
// and picks the best model from the catalog. It is only invoked when the router
// engine decides it cannot make the decision with heuristics alone.

export const CLASSIFIER = {
  // Force deterministic output so routing decisions stay reproducible.
  TEMPERATURE: 0,
} as const;

export const SMART_PIN = {
  MIN_USER_TURNS: 1,
  MAX_USER_TURNS: 6,
  DEFAULT_USER_TURNS: 3,
} as const;

// ── Router Data Cache ────────────────────────────────────────────────────────
//
// In-worker cache TTLs for repository reads. These reduce D1/KV round-trips
// on hot isolates while keeping config/catalog freshness bounded.

export const ROUTER_CACHE = {
  CONFIG_TTL_MS: 10 * 1000,
  CATALOG_TTL_MS: 10 * 1000,
} as const;

export const ROUTER_HISTORY = {
  DEFAULT_LIMIT: 20,
  MAX_LIMIT: 50,
  RETENTION_MS: 48 * 60 * 60 * 1000,
  INSPECT_TRIGGER: "$$inspect",
} as const;

// ── Upstream (OpenAI-compatible) Transport ──────────────────────────────────

export const UPSTREAM = {
  // Default upstream when no per-request override is provided.
  DEFAULT_BASE_URL: "https://openrouter.ai/api/v1",

  // Internal tracing header attached to upstream requests.
  REQUEST_ID_HEADER: "X-Router-Request-Id",

  // OpenRouter-specific metadata header; sent only when host is openrouter.ai.
  OPENROUTER_TITLE_HEADER: "X-Title",
  OPENROUTER_TITLE_VALUE: "custom-router",
} as const;

// ── Open Source Metadata ────────────────────────────────────────────────────

export const OSS = {
  REPO_URL: "https://github.com/pabloskate/custom-router",
  LICENSE_URL: "https://github.com/pabloskate/custom-router/blob/main/LICENSE",
  README_URL: "https://github.com/pabloskate/custom-router/blob/main/README.md",
  QUICKSTART_URL: "https://github.com/pabloskate/custom-router/blob/main/docs/quickstart.md",
  DEPLOYMENT_URL: "https://github.com/pabloskate/custom-router/blob/main/docs/deployment-cloudflare.md",
  RELEASE_PROCESS_URL: "https://github.com/pabloskate/custom-router/blob/main/docs/release-process.md",
  SCHEMA_URL: "https://github.com/pabloskate/custom-router/blob/main/infra/d1/schema.sql",
  SECURITY_POLICY_URL: "https://github.com/pabloskate/custom-router/blob/main/SECURITY.md",
  SECURITY_ADVISORY_URL: "https://github.com/pabloskate/custom-router/security/advisories/new",
  MAINTAINER_PROFILE_URL: "https://github.com/pabloskate",
} as const;
