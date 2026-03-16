# Quickstart

This repo is the self-hostable CustomRouter product. The fastest path is local development first, then Cloudflare deployment.

## Local Development

Auth (login, signup, API keys) requires a database. The app uses **local D1 + KV emulation** when running `next dev` via OpenNext's `initOpenNextCloudflareForDev`. Seed the local DB **before** first run so login works:

```bash
npm install
cp .env.example .env.local
npm run db:seed          # Creates local D1 in apps/web/.wrangler (run once, or when schema changes)
npm run typecheck
npm run dev
```

Or use `npm run dev:seed` to seed and start in one shot.

If your goal is "run localhost and confirm login works", prefer the stable path:

```bash
npm run local:stable
BASE_URL=http://localhost:3010 npm run verify:admin
```

This avoids common `next dev` hydration/CSP issues and fails fast if UI login is broken.

**If login fails with "Server misconfigured"**: D1 bindings are missing. Ensure `db:seed` ran successfully; it creates `apps/web/.wrangler/` with the schema. OpenNext reads the same wrangler config, so both share that local D1.

Recommended local variables:

- `BYOK_ENCRYPTION_SECRET` for stored user upstream credentials (required)
- `ADMIN_SECRET` if you want to exercise privileged routes locally

Open `http://localhost:3000/admin`, then:

1. Create an account.
2. Add a gateway or BYOK upstream.
3. In **Routing**, create or edit named profiles. Each profile ID is API-facing and should describe the routing behavior it represents.
4. Use **Quick setup** to create a profile from a template, then bind any unresolved models to your synced gateway inventory.
5. Profile edits autosave automatically, including routing instructions, model pool changes, fallback selection, and router model selection.
6. Generate a router API key.
7. Send a request to `/api/v1/chat/completions` with a named profile ID such as `model: "planning-backend"`.

## Testing Before Deploy

You can verify the app without running a full dev server:

| Method | Command | Needs DB? | Use case |
|--------|---------|------------|----------|
| **Unit tests** | `npm run test` | No | Logic, routing, API handlers, components |
| **Type check** | `npm run typecheck` | No | Catch type errors before deploy |
| **Local dev** | `npm run dev:seed` or `db:seed` + `dev` | Yes | Full UI and API testing |
| **Preview (Worker)** | `npm run build` then `npx @opennextjs/cloudflare preview` | Yes | Test built worker locally |
| **Admin E2E** | `BASE_URL=http://localhost:3010 npm run verify:admin` | Yes | Verifies real UI login, Routing, API Keys |

`verify:admin` expects signup to be allowed unless you pass existing credentials:

```bash
VERIFY_EMAIL=you@example.com VERIFY_PASSWORD='your-pass' BASE_URL=http://localhost:3010 npm run verify:admin
```

Unit tests mock the database and external services, so they always pass regardless of D1 setup. Use them for CI and pre-deploy checks.

## Reliable UI Validation Loop

When validating UI changes in restricted browser environments (where `next dev` may fail to hydrate due CSP/eval restrictions), use a local production run:

```bash
npm run local:stable
BASE_URL=http://localhost:3010 npm run verify:admin
```

Then open `http://localhost:3010/admin`.

Why this helps:

- `next start` serves production bundles (no dev eval hooks), so client interactivity is more reliable.
- `REGISTRATION_MODE=open` avoids getting blocked by closed-registration state during local UX checks.
- You can keep Cloudflare out of the loop for fast iteration.

## If Local Starts Breaking Repeatedly

If auth/UI suddenly becomes flaky (unstyled pages, disabled buttons that never enable, dead tabs, chunk errors), follow the dedicated runbook:

- [Local Dev Troubleshooting](local-dev-troubleshooting.md)

Most issues come from stale/mismatched `.next` artifacts while an older `next start` process is still running. The runbook includes a clean reset workflow that restores a stable local state.

## Cloudflare Deployment

1. Create a D1 database and KV namespace.
2. Apply `infra/d1/schema.sql`, then any migrations in `infra/d1/migrations/`.
3. Configure bindings in `apps/web/wrangler.toml` and `apps/ingest-worker/wrangler.toml`.
4. Deploy the ingest worker.
5. Deploy the web app with OpenNext for Cloudflare.

See [deployment-cloudflare.md](deployment-cloudflare.md) for the full walkthrough.

## API Contract

Supported public endpoints:

- `POST /api/v1/chat/completions`
- `POST /api/v1/responses`
- `GET /api/v1/models`

Admin and user management routes remain self-hostable and are part of the public product.

## What Is Not In This Repo

This repo excludes the hosted landing site, pricing, billing, managed-service operations, backups, alerts, and internal support tooling. Those belong in a separate private system.
