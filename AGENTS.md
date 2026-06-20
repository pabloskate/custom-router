# AGENTS.md — AI Agent Navigation Guide

> **Start here.** This file is the authoritative map of this codebase for AI agents and new engineers. Read it before touching any file.

---

## What This Is

CustomRouter is a **highly customizable LLM routing proxy** deployed on Cloudflare Workers. It allows you to build a "composite model" by routing each request to the best underlying model based on:

1. A cheap frontier LLM classifier that reads the user's prompt
2. Thread stickiness (pinning a model for multi-turn conversations)
3. Runtime guardrails that circuit-break underperforming models

The router is **transparent** — it speaks OpenAI's API, so any SDK pointing at it works without modification. Set `model` to a saved profile ID such as `planning-backend`.

---

## Monorepo Layout

```
/
├── apps/
│   ├── web/              ← Next.js app: API routes + admin UI
│   └── ingest-worker/    ← Cloudflare cron: daily catalog refresh
├── packages/
│   ├── core/             ← Routing engine (framework-agnostic)
│   ├── data/             ← OpenRouter catalog adapter
│   └── vision-helper/    ← Local helper for screenshot/image descriptions
├── docs/                 ← Deployment guide, eval methodology
├── infra/d1/schema.sql   ← D1 database schema
├── .env.example          ← Required env vars (copy to .env.local)
└── AGENTS.md             ← This file
```

---

## Request Flow (happy path)

```
Client
  └─ POST /api/v1/chat/completions
       │
       ├─ [auth]     apps/web/app/api/v1/chat/completions/route.ts
       │               createRoutedEndpoint() → withBrowserSessionOrApiKeyAuth()
       │
       ├─ [route]    apps/web/src/lib/routing/router-service.ts  routeAndProxy()
       │               loads config + catalog from storage/repository.ts
       │               calls RouterEngine.decide()
       │                  └─ packages/core/src/router-engine.ts
       │                       checks thread pin (D1 via D1PinStore)
       │                       if no pin → calls frontier classifier
       │                          └─ apps/web/src/lib/routing/frontier-classifier.ts
       │               builds attempt list (skips guardrail-disabled models)
       │               calls OpenRouter for each attempt
       │               records guardrail event
       │               pins thread on success (if shouldPin)
       │               stores RoutingExplanation in D1
       │
       └─ Response with x-router-* headers attached
```

---

## Key Files — What Each One Does

### `apps/web/src/lib/`

| Path | Responsibility |
|------|---------------|
| `constants.ts` | **All magic numbers.** Guardrail thresholds, auth settings, classifier defaults. Edit here, not inline. |
| `schemas.ts` | Zod schemas for request body validation (chatCompletion, responses, routerConfig). |
| `auth/auth.ts` | API key auth, session auth, password hashing (PBKDF2), cookie building. See constants.ts for config. |
| `auth/route-helpers.ts` | Composable route middleware: `withApiKeyAuth`, `withSessionAuth`, `withCsrf`, `withDb`. Use in route handlers instead of repeating the auth pattern. |
| `auth/rate-limit.ts` | Sliding-window rate limiting via D1. Fails open if schema is not migrated. |
| `auth/csrf.ts` | Same-origin check for browser-facing mutation endpoints. |
| `auth/byok-crypto.ts` | BYOK encryption helpers for storing upstream credentials safely. |
| `auth/user-upstream-store.ts` | Persistence helpers for per-user upstream credentials. |
| `routing/router-service.ts` | Orchestrates one routed request end-to-end (config merge → decide → proxy → guardrail → pin). |
| `routing/guardrail-manager.ts` | In-process circuit breaker per model/provider. Three triggers: error rate, fallback rate, latency spike. |
| `routing/frontier-classifier.ts` | Calls a cheap LLM on OpenRouter to pick the best model. Returns null on any failure. |
| `docs/config-agent-deprecation.md` | Background on the retired Config Agent feature and why its runtime hooks were removed. |
| `storage/repository.ts` | `CloudflareRepository` (D1+KV) and `MemoryRepository` (local dev). `getRouterRepository()` auto-selects. |
| `storage/gateway-store.ts` | D1 helpers for user-configured upstream gateways and model catalogs. |
| `storage/vision-settings-store.ts` | D1 helpers for each user's selected sidecar vision gateway/model. |
| `storage/defaults.ts` | Default router config and classifier instructions. Execution model inventories are not hard-coded here. |
| `upstream/upstream.ts` | OpenAI-compatible upstream transport + URL normalization helpers. |
| `upstream/openrouter.ts` | Thin wrapper that proxies a request to OpenRouter and normalises the result. |
| `upstream/openrouter-models.ts` | Model catalog search and validation against OpenRouter's public models API. |
| `infra/runtime-bindings.ts` | Reads Cloudflare bindings from OpenNext / globalThis / process.env with multiple fallbacks. |
| `infra/http.ts` | `json()` response builder and `attachRouterHeaders()` for x-router-* response headers. |
| `infra/request-id.ts` | Generates `router_<uuid>` IDs used in headers + D1. |
| `infra/cloudflare-types.ts` | Minimal TypeScript types for D1Database and KVNamespace (avoids the full @cloudflare/workers-types dep). |

### `apps/web/src/features/`

| Path | Responsibility |
|------|---------------|
| `routing/` | Feature-owned routing seams: routed endpoint factory, shared routing contracts, and router-service helper modules. |
| `gateways/` | Shared gateway DTOs and feature entrypoints for gateway UI/server work. |
| `account-settings/` | Shared user settings DTOs, hydration logic, and feature-owned server handlers for `/api/v1/user/me`. |
| `admin-shell/` | Admin shell state hook (`useAdminData`), tab registry/types, and the feature-owned shell entrypoint. |
| `routing-quickstart/` | Feature entrypoint for quickstart/integration guidance UI. |
| `playground/` | Feature entrypoint for routing playground UI. |
| `vision/` | Feature entrypoint for sidecar vision model settings, API-key endpoint behavior, and generic MCP setup UI. |

### `apps/web/app/api/v1/`

Every file is a Next.js route handler. Auth pattern (use route-helpers.ts):

```
GET  /api/v1/user/me           → withSessionAuth
PUT  /api/v1/user/me           → withSessionAuth + withCsrf
POST /api/v1/chat/completions  → withApiKeyAuth
POST /api/v1/responses         → withApiKeyAuth
GET  /api/v1/router/config     → verifyAdminSecret
PUT  /api/v1/router/config     → verifyAdminSecret
```

### `apps/web/src/components/`

| File | Responsibility |
|------|---------------|
| `admin-console.tsx` | Root shell — loads data, wires sub-components together |
| `AuthGate.tsx` | Login / signup form |
| `ApiKeyPanel.tsx` | Generate, list, revoke API keys |
| `RouterConfigPanel.tsx` | Conversation re-routing controls: routing frequency and trigger keywords. Autosaves without a manual save button. |
| `ProfilesPanel.tsx` | Alias for the routing profile editor. Create/edit named profiles, use quick setup presets, bind routed models, choose fallback/classifier bindings, and autosave changes. |

Admin compatibility rule:
- `apps/web/src/features/*` owns the real admin-shell, gateway, quickstart, playground, and account-settings server logic.
- `apps/web/src/components/admin/*` may exist as compatibility or presentation adapters. If a component file is just a re-export, follow it to the owning feature slice before editing behavior.

### `packages/core/src/`

| File | Responsibility |
|------|---------------|
| `types.ts` | All shared types: RouterConfig, CatalogItem, RouteDecision, RoutingExplanation, etc. |
| `router-engine.ts` | `RouterEngine.decide()` — stateless routing decision logic (exact profile match → pin check → classifier → fallback). Unmatched model IDs passthrough. Named profiles use their own routed pool, fallback/classifier bindings, and profile-scoped instructions. |
| `llm-router.ts` | Interface and helpers for the pluggable LLM classifier |
| `pin-store.ts` | `PinStore` interface + `InMemoryPinStore` |
| `index.ts` | Barrel export |

### `packages/data/src/`

Adapts OpenRouter's catalog API into `CatalogItem[]` that the router engine understands. Only used by the ingest-worker.

---

## Where Constants Live

**All magic numbers are in `apps/web/src/lib/constants.ts`.** Do not add literals to other files.

```
GUARDRAIL.*    — circuit breaker thresholds (error rate, fallback rate, latency)
AUTH.*         — PBKDF2 iterations, session TTL, cookie name, API key prefix
CLASSIFIER.*   — default model, temperature, max_tokens, OpenRouter URL
VISION.*       — sidecar image limits, default mode, prompt bounds
```

---

## Database (D1) — Table Summary

See `infra/d1/schema.sql` for full DDL.

| Table | Purpose |
|-------|---------|
| `users` | User accounts (name, email, hashed password, per-user router config) |
| `api_keys` | API keys (hash only, never raw), linked to users |
| `user_sessions` | HttpOnly session tokens (hash only) |
| `router_config` | Versioned system-wide router config blobs |
| `routing_explanations` | One row per routed request, queried by `/explanations/:id` |
| `ingestion_runs` | History of catalog ingest jobs |
| `thread_pins` | Active model pins per thread key |
| `rate_limit_counters` | Sliding window counters for IP rate limiting |

KV namespace (`ROUTER_KV`):
- `router:active:meta` → `{ version: string }`
- `router:active:catalog:<version>` → `CatalogItem[]` JSON blob

---

## Adding a New API Route

1. Create `apps/web/app/api/v1/<resource>/route.ts`
2. Keep the route file as an adapter only. It should choose a handler, call one helper, and return a response.
3. Use `route-helpers.ts` for auth/body parsing — do not repeat the pattern inline:
   ```ts
   export async function GET(request: Request) {
     return withSessionAuth(request, async (auth, bindings) => {
       return json({ ... });
     });
   }
   ```
4. For routed OpenAI-compatible endpoints, use `createRoutedEndpoint(...)` instead of hand-rolling auth + schema + gateway loading.
5. Validate the request body with a Zod schema from `schemas.ts` or `parseJsonBody(...)`.
6. Use `getRouterRepository()` for D1/KV access

Route rule:
- Outside `app/api/v1/auth/*` and `app/api/v1/admin/verify/route.ts`, do not import `authenticateSession`, `authenticateRequest`, `isSameOriginRequest`, or `verifyAdminSecret` directly inside route files.
- If a route grows beyond simple wiring, move the request parsing and business logic into `apps/web/src/features/<feature>/server/*` and keep the route handler as the auth/CSRF adapter only.

---

## Adding a New Guardrail Trigger

All guardrail logic is in `apps/web/src/lib/routing/guardrail-manager.ts`. Thresholds are in `constants.ts`. Add a new trigger by:

1. Adding a constant to `GUARDRAIL` in `constants.ts`
2. Computing the metric in `recordEvent()` in `routing/guardrail-manager.ts`
3. Setting `disableByNew = ...` and OR-ing it into the final `if` statement

---

## Local Development

```bash
npm install
npm run local:env              # Creates .env.local with a local BYOK secret
npm run db:seed                  # Creates local D1 + applies schema (required for login/signup)
npm run typecheck
npm run dev -w @custom-router/web  # starts Next.js on localhost:3000
```

Auth (users, sessions, API keys) requires D1. BYOK persistence requires `BYOK_ENCRYPTION_SECRET`; run `npm run local:env` to generate a local-only value. With `initOpenNextCloudflareForDev` in next.config, local D1/KV emulation runs when using `next dev`; run `npm run db:seed` once to create the schema. Without it, login/signup returns 500 "Server misconfigured."

Copy `.env.example` → `.env.local` manually only when you need custom env values beyond the generated local defaults.

### Localhost Reliability Policy (for agents)

When a user asks to "run localhost" and expects login/admin to work, follow this exact workflow:

```bash
# 1) Start stable local mode (kills stale next processes, rebuilds, starts on :3010)
npm run local:stable

# 2) Prove UI login works before claiming done
BASE_URL=http://localhost:3010 npm run verify:admin
```

Rules:
- Do not assume `http://localhost:3000`; verify the bound port from terminal output.
- Do not claim success based only on API curl checks.
- `verify:admin` (UI login + session + Routing/API Keys checks) is required proof.
- If `verify:admin` fails, treat localhost as broken and keep debugging.

## Safe Search Targets

- Prefer searching in `apps/web/app/api/v1`, `apps/web/src/features`, `apps/web/src/lib`, `packages/core/src`, `docs`, and `infra`.
- Treat `apps/web/src/components/admin` as a compatibility/presentation layer first; many behavioral entrypoints now live in the matching feature slice.
- Ignore generated and local artifact folders when orienting yourself: `.next`, `.open-next`, `.wrangler`, and screenshot/debug dumps under `scripts/`.

---

## Tests

```bash
npm run test -w @custom-router/core
npm run test -w @custom-router/web
```

Core tests live in `packages/core/test/`. They cover `RouterEngine` and thread fingerprinting.
Web tests live alongside the app code under `apps/web/app/api/v1/`, `apps/web/src/lib/routing/`, and `apps/web/src/components/`.

Architecture guardrails are also tested in `apps/web/src/architecture/feature-boundaries.test.ts`.

## Repo-Local Skills

This repo now includes local skills under `.codex/skills/`:

- `custom-router-feature-consistency`
- `custom-router-routing-safety`
- `custom-router-release-guard`

Use them when touching feature seams, routing behavior, or release/deploy work.

## Agent-Scoped Docs

The root `AGENTS.md` is the starting map. More specific guidance lives closer to the code:

- `docs/ARCHITECTURE.md` — dependency direction, route rules, data ownership, verification policy
- `apps/web/AGENTS.md` — Next.js app, route adapter, and feature-slice rules
- `apps/web/src/features/routing/AGENTS.md` — runtime routing and profile setup rules
- `packages/core/AGENTS.md` — framework-agnostic routing engine rules
- `packages/data/AGENTS.md` — catalog adapter rules

When a scoped `AGENTS.md` applies, read it before editing that subtree.

---

## Deployment

See `docs/deployment-cloudflare.md`.
