# CustomRouter Architecture

This document is the stable architecture source of truth. `AGENTS.md` is the navigation guide; this file defines the boundaries that should not drift.

## Product Shape

CustomRouter is a modular monolith with two deployables:

- `apps/web`: Next.js App Router application, OpenAI-compatible API routes, admin UI, and Cloudflare Worker deployment through OpenNext.
- `apps/ingest-worker`: Cloudflare cron worker for catalog ingestion.

Shared packages:

- `packages/core`: framework-agnostic routing engine and shared routing types.
- `packages/data`: OpenRouter catalog ingestion adapters.
- `packages/vision-mcp`: generic local stdio MCP bridge that reads local images/screenshots and calls the CustomRouter vision endpoint.

Infrastructure:

- `infra/d1/schema.sql`: canonical D1 schema for fresh installs.
- `infra/d1/migrations`: idempotent upgrade scripts for existing installs.

## Dependency Direction

Allowed direction:

1. `app/**` route/page files call feature or lib entrypoints.
2. `src/features/**` owns product behavior, feature DTOs, feature UI, and feature server handlers.
3. `src/lib/**` owns cross-feature primitives: auth, storage, infra, upstream transport, schemas, constants.
4. `packages/core` has no dependency on `apps/web`.
5. `packages/data` may depend on `packages/core` types, but not on `apps/web`.

Avoid reverse imports from `src/lib` into feature UI, and avoid route files importing low-level auth/session functions directly.

## Route Handler Rule

`apps/web/app/api/v1/**/route.ts` files are adapters. They should:

- choose the exported handler or factory
- apply `withSessionAuth`, `withApiKeyAuth`, `withBrowserSessionOrApiKeyAuth`, `withAdminAuth`, `withCsrf`, `withDb`, or `parseJsonBody`
- return a `Response`

Routed OpenAI-compatible endpoints must use `createRoutedEndpoint`.

When a route needs real logic, move that logic into `apps/web/src/features/<feature>/server/*`.

## Runtime Routing Path

The main request path is:

1. Next.js API route under `apps/web/app/api/v1`
2. routed endpoint factory in `apps/web/src/features/routing/server/create-routed-endpoint.ts`
3. `routeAndProxy` in `apps/web/src/lib/routing/router-service.ts`
4. routing server helpers in `apps/web/src/features/routing/server`
5. `RouterEngine` in `packages/core/src/router-engine.ts`
6. upstream transport in `apps/web/src/lib/upstream`
7. explanation/pin persistence through `apps/web/src/lib/storage`

`router-service.ts` should remain the top-level orchestrator. New routing sub-behavior belongs in focused modules under `apps/web/src/features/routing/server`.

## Feature Ownership

- `features/routing`: routed endpoint factory, runtime routing helpers, profile editing, profile-builder setup work, and routing contracts.
- `features/gateways`: gateway contracts, gateway UI, gateway-model utilities, recommendations.
- `features/account-settings`: `/api/v1/user/me` contracts and server handlers.
- `features/admin-shell`: admin shell state, tab registry, save queue.
- `features/playground`: inspect/chat playground UI.
- `features/routing-quickstart`: quickstart UI.
- `features/routing-logs`: recent routing history UI.
- `features/vision`: sidecar vision model settings, API-key vision endpoint handlers, and generic MCP setup UI.

`src/components/admin/*` is allowed to contain compatibility re-exports and small presentation components. If behavior is feature-owned, edit the feature slice first.

## Data Ownership

- D1/KV access is centralized through `apps/web/src/lib/storage`.
- User gateway rows and encrypted BYOK credentials are storage concerns, exposed to features through public DTO helpers.
- `packages/core` receives plain configs/catalogs/pin stores and never knows about D1, KV, Cloudflare bindings, or HTTP.

## Setup Intelligence

Routing presets, model registry data, and profile-builder flows are setup/product-shell concerns. They are not the runtime execution source of truth. Runtime routing uses saved profiles plus live gateway inventory.

Because model availability and benchmark quality drift quickly, setup intelligence should stay easy to refresh, prove, or remove. Do not couple runtime routing correctness to hard-coded recommendation data.

## Verification

Required release checks:

```bash
npm run test
npm run typecheck
npm run build
```

For local admin/login/gateway/user-settings changes:

```bash
npm run local:stable
BASE_URL=http://localhost:3010 npm run verify:admin
```

For quick environment diagnosis:

```bash
npm run doctor:agent
```
