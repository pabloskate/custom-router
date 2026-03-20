# CustomRouter Usage Guide

This guide covers how to run, configure, and call CustomRouter as an OpenAI-compatible routing proxy.

## 1) What this app does

CustomRouter receives OpenAI-style requests at `/api/v1` and decides whether to:

1. pass a request through unchanged when a direct gateway model is provided, or
2. run routing when `model` matches a named routing profile such as `planning-backend` or `cost-optimized`.

Routing is done by a cheap LLM classifier with sticky thread pinning and fallback logic, then proxying to your configured BYOK gateways.

## 2) Local runbook

### Required setup

1. Install dependencies.
   ```bash
   npm install
   ```
2. Create a local env file.
   ```bash
   cp .env.example .env.local
   ```
3. Set `BYOK_ENCRYPTION_SECRET` in `.env.local` (required for gateway encryption).
4. If you want to test password reset locally, set `PASSWORD_RESET_BASE_URL=http://localhost:3010` for the stable local flow or use your actual local dev port.
5. If you want real password reset email delivery, also set `RESEND_API_KEY` and `PASSWORD_RESET_FROM_EMAIL`.
6. Seed local D1.
   ```bash
   npm run db:seed
   ```

### Start locally

For reliable admin/UI validation, use:

```bash
npm run local:stable
BASE_URL=http://localhost:3010 npm run verify:admin
```

`local:stable` uses port `3010` and runs DB seed + production build + `next start` to avoid common hydration issues.

If you only want live development, use:

```bash
npm run dev -w @custom-router/web
```

### Recommended verification checks

- `npm run typecheck`
- `npm run test`
- `npm run test -w @custom-router/web`
- `npm run test -w @custom-router/core`
- `BASE_URL=http://localhost:3010 npm run verify:admin`

## 3) Environment and bindings

From `.env.example`, the important variables are:

- `BYOK_ENCRYPTION_SECRET` (required)
- `ADMIN_SECRET` (required for admin routes and ingest worker `/run`)
- `REGISTRATION_MODE` (`open`, `closed`, `invite`)
- `SESSION_COOKIE_SECURE` (`true` / `false`)
- `ROUTER_CLASSIFIER_MODEL` (optional default)
- `RESEND_API_KEY` (required if you want real password reset email delivery)
- `PASSWORD_RESET_FROM_EMAIL` (required if you want real password reset email delivery)
- `PASSWORD_RESET_BASE_URL` (required for password reset links; use `http://localhost:3010` locally or your canonical `https://...` app URL in production)

Cloudflare runtime bindings are read from:

- `ROUTER_DB` (D1)
- `ROUTER_KV` (KV)
- same vars above in Worker vars

Password reset behavior:

- If the three password reset email vars are set, the app sends reset emails through Resend.
- If email delivery vars are missing in non-production, the forgot-password flow returns a preview reset link instead.
- In production, reset email delivery requires a trusted `PASSWORD_RESET_BASE_URL`; the app does not fall back to the incoming request host.

For production setup and cron details, see [Deployment](./deployment-cloudflare.md).

## 4) Core concepts

### Routing model selection

- Routing only activates when `model` matches a named routing profile.
- Any model ID not matching a named profile performs passthrough.
- Profiles let you define separate routing policies while using stable, descriptive IDs like `planning-backend`.

### Profiles

`userConfig.profiles` is persisted on the account and exposed through `/api/v1/user/me`.

- Each profile owns its routed model pool, fallback model, router model, and routing instructions.
- Profile IDs are API-facing slugs and may only use lowercase letters, numbers, and hyphens.
- Fallback models must come from the profile's attached routed models.
- Router models may point to any synced gateway model, even when that classifier model is not part of the routed pool.
- The admin UI autosaves profile edits; there is no separate "Save profiles" action.

### Thread pinning and continuation behavior

- A successful routed turn writes a pin tied to a thread fingerprint.
- On continuation turns, routing can reuse that pin unless bypass rules apply.
- Routing frequency options:
  1. `smart` (default): reuse pin for quick continuation turns, but re-route after `smartPinTurns`.
  2. `every_message`: always re-route every turn, never write pins.
  3. `new_thread_only`: pin only controls new thread continuations.
- You can configure `smart_pin_turns` in `/api/v1/user/me`.

### Force reroute

You can force classifier selection on a turn by adding `$$route` in the latest user message. You can also configure custom route keywords via `route_trigger_keywords`.

### Guardrails

Guardrails run per worker instance and can disable a model temporarily after degraded behavior:

- 5-min error rate > 3%
- 10-min fallback rate > 8%
- latency P95 spike > 80% above daily baseline

They require minimum sample sizes before triggering and cool down for 30 minutes.

### Catalog behavior

Routing catalog resolution order for each request:

1. User gateway catalogs (all registered gateways, `catalogFilter` + blocklist applied)
2. user `custom_catalog`
3. system catalog in D1/KV

## 5) Build your account and get API access

1. Open `/admin` in a browser.
2. Register or login.
3. Add at least one gateway under `Gateways`.
4. In `Routing`, create at least one named profile such as `planning-backend`.
5. Generate an API key under `API Keys`.
6. Start using that profile ID in chat/completions calls.

### API key notes

- Generated format is `ar_sk_...`.
- Keys are shown only once at creation.
- Revoking keeps past keys unusable from the time revoked.

## 6) Request auth modes

### API clients (SDKs, curl, script)

Use `Authorization: Bearer <api_key>`.

### Browser session routes

UI calls `/api/v1/user/*` and some adminless browser routes using session cookie `auto_router_session`.

### Admin secret routes

Use either:

- `Authorization: Bearer <ADMIN_SECRET>`
- or `x-admin-secret: <ADMIN_SECRET>`

## 7) API contract by endpoint

### OpenAI-style endpoints

#### `POST /api/v1/chat/completions`

Authenticated by API key or browser session.

Example:

```bash
curl -sS "$BASE/api/v1/chat/completions" \
  -H "Authorization: Bearer $CUSTOM_ROUTER_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "planning-backend",
    "messages": [{"role": "user", "content": "Draft a short architecture decision for event-driven sync."}]
  }'
```

Use a named routing profile such as `"planning-backend"` or `"cost-optimized"`.

OpenAI SDK example:

```ts
import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.CUSTOM_ROUTER_KEY!,
  baseURL: `${process.env.CUSTOM_ROUTER_BASE_URL}/v1`,
});

const response = await client.chat.completions.create({
  model: "planning-backend",
  messages: [{ role: "user", content: "Summarize the latest RFC in one paragraph." }],
});
```

#### `POST /api/v1/responses`

Authenticated by API key or browser session.

#### `POST /api/v1/completions`

Authenticated by API key or browser session.

### Response behavior

On routed success responses, the upstream provider payload is forwarded as-is.
Diagnostic headers may also be attached on routed success responses:

- `x-router-model-selected`
- `x-router-score-version`
- `x-router-request-id`
- `x-router-degraded` when a fallback model was served after live failure
- `x-router-confidence` when the final served model came directly from a real classifier decision

`x-router-confidence` is a heuristic `0-1` classifier score, not a guarantee. It is omitted for passthrough requests, reused pins, default fallback routing, and live failover-selected fallback responses.

For richer diagnostic metadata, use `/api/v1/router/inspect` or stored explanations.

#### `GET /api/v1/models`

Authenticated by API key only.

Returns OpenAI `models` list including:

- profile IDs
- all reachable gateway model IDs

### Routing debug route

#### `POST /api/v1/router/inspect`

Same auth as routing endpoints.

Returns routing decision metadata without proxying upstream:

- `selectedModel`
- `classificationConfidence` when a real classifier decision was used
- `fallbackModels`
- `decisionReason`
- `classifierInvoked`
- `classifierModel`
- `latencyMs`

Headers:
- `x-router-request-id` for trace correlation.

### Routed request failure and explanation lookup

- On some routing failures, responses include `request_id` in JSON.
- You can fetch the stored explanation when you have the request id:

`GET /api/v1/router/explanations/{requestId}`

Admin auth required.

### Admin/system endpoints

All require admin secret.

#### `POST /api/v1/admin/verify`

Used by admin bootstrap / tooling to confirm admin secret.

#### `GET /api/v1/router/config`

Retrieve system config.

#### `PUT /api/v1/router/config`

Update system defaults. Body is validated by `routerConfigSchema` and includes:

- `version`
- `defaultModel`
- `classifierModel`
- `globalBlocklist`
- `routingInstructions`

#### `GET /api/v1/router/catalog`

Get active system catalog.

#### `POST /api/v1/router/catalog`

Append/replace one catalog entry by `id`.

#### `DELETE /api/v1/router/catalog/{modelId}`

Remove catalog item from system catalog.

#### `GET /api/v1/router/runs`

List recent catalog ingestion runs.

#### `GET /api/v1/router/scorecard/current`

Returns current scorecard/catalog baseline data (currently catalog payload in this build).
This endpoint is currently public (no admin auth).

#### `GET /api/v1/router/kv-debug`

Debug helper for KV presence and admin diagnostics.

### User/session routes

These are cookie-auth routes for admin UI flows.

#### `GET /api/v1/user/me`

Returns account config snapshot.

#### `PUT /api/v1/user/me`

Update user routing config, profiles, and optional BYOK classifier credentials.

Notable keys include:

- `preferred_models`
- `blocklist`
- `default_model`
- `classifier_model`
- `routing_instructions`
- `custom_catalog`
- `profiles`
- `route_trigger_keywords`
- `routing_frequency`
- `smart_pin_turns`
- `classifier_base_url`
- `classifier_api_key`
- `clear_classifier_api_key`

#### `GET /api/v1/user/keys`

List API keys (id, prefix, label, revoked state).

#### `POST /api/v1/user/keys`

Create API key. Optional body fields:

- `rotate: true`
- `label`

Response includes raw key once and `note`.

#### `DELETE /api/v1/user/keys?keyId=<id>`

Revoke or delete (`action=delete`) one key.

#### `GET /api/v1/user/gateways`

List configured gateways.

#### `POST /api/v1/user/gateways`

Create a gateway.

Payload:
- `name`
- `baseUrl`
- `apiKey`

#### `GET /api/v1/user/gateways/{gatewayId}`

Fetch one gateway.

#### `PATCH /api/v1/user/gateways/{gatewayId}`

Update gateway (`name`, `baseUrl`, `apiKey`, `models`).

#### `DELETE /api/v1/user/gateways/{gatewayId}`

Delete one gateway.

#### `GET /api/v1/user/gateways/{gatewayId}/fetch-models`

Proxy `/models` from that gateway and normalize model IDs.

#### `GET /api/v1/user/invites`

List invite codes.

#### `POST /api/v1/user/invites`

Create invite code. Optional:
- `uses`
- `expires_in_hours`

#### `DELETE /api/v1/user/invites?codeId=<id>`

Revoke invite.

### Auth routes

#### `POST /api/v1/auth/signup`

Create account (subject to registration mode and rate limits).

#### `POST /api/v1/auth/login`

Create browser session cookie.

#### `POST /api/v1/auth/logout`

Destroy session cookie.

#### `GET /api/v1/auth/registration-status`

Show whether signup is open.

## 8) Ingest worker

`apps/ingest-worker` exposes `POST /run` with `Authorization: Bearer <ADMIN_SECRET>`.

Current worker build marks ingestion disabled (BYOK-only mode) and returns a structured error.

## 9) Troubleshooting and support checks

- If auth/login fails with `Server misconfigured`, confirm local DB seed and secret values.
- If routing returns empty failures around catalog or model IDs, confirm gateways are decrypted and active model IDs exist.
- If UI appears broken locally, use the stable flow and confirm `BASE_URL` (typically `http://localhost:3010`).
- For remote deploy sanity:
  - `npm run check:schema:remote`
  - `BASE_URL=https://... npm run verify:admin:remote`

For admin and routing diagnostics, pair `BASE_URL/api/v1/router/inspect` with `GET /api/v1/router/explanations/{id}`.
