# CustomRouter

CustomRouter is a self-hostable, OpenAI-compatible LLM routing proxy. Point any OpenAI SDK at your `/api/v1` base URL, send `model: "auto"`, and let the router choose the best upstream model using your rules, thread stickiness, and explainable fallbacks.

## Open-Core Boundary

This public repo contains the full self-hostable product:

- `apps/web` for the API routes and admin UI
- `apps/ingest-worker` for catalog refresh jobs
- `packages/core` for routing logic
- `packages/data` for catalog adapters
- `infra/d1` for the D1 schema and migrations

The following intentionally stay out of the public repo:

- marketing site, pricing, and billing
- hosted service provisioning and operations
- backups, alerts, support tooling, and internal runbooks

The commercial model is managed BYOK hosting and assisted self-hosting, not a separate closed router implementation.

Recommended repo split:

- `custom-router` for the public self-hostable product
- `custom-router-cloud` for the private marketing, billing, provisioning, and ops layer

## What Ships Here

- OpenAI-compatible endpoints:
  - `POST /api/v1/chat/completions`
  - `POST /api/v1/responses`
  - `GET /api/v1/models`
- User auth, BYOK credential storage, API keys, gateways, and admin configuration
- Routing explanations, thread pinning, classifier-based selection, and fallback behavior
- Cloudflare deployment path for D1, KV, Workers, and the ingest worker

## Web App Structure

`packages/core` remains the framework-agnostic routing engine. The Next.js app is now being organized around feature slices under `apps/web/src/features/*`:

- `routing` for routed endpoint/server seams
- `gateways` for gateway contracts and UI entrypoints
- `account-settings` for shared user settings DTOs
- `admin-shell` for admin state orchestration

`app/api/v1/**/route.ts` files stay in place for Next.js, but they should be thin adapters that call shared helpers or feature handlers rather than embedding auth, parsing, and orchestration logic inline.

## Runtime Behavior

- Routing activates for `model: "auto"` and named routing profiles. Explicit model IDs pass through unchanged.
- **Precedence:** Global fallback and router models apply to all profiles. Each profile can optionally override them via "Override global models" — when enabled, the profile’s fallback/router model values take precedence; when disabled, the profile inherits global defaults. The `auto` profile is always required and non-deletable.
- The first successful routed turn pins the selected model to the thread fingerprint for 1 hour. Continuations reuse that pin until a constraint breaks it or the cooldown window expires.
- Putting `$$route` in the latest user turn bypasses the active thread pin for that turn and forces a fresh routing decision.
- Tool-enabled threads can break a thread pin after the router detects its phase-complete sentinel. Non-tool threads ignore that sentinel and keep the existing pin.

## Failure Semantics

- If the classifier request fails, returns invalid JSON, or selects a model that is not in the allowed catalog, the router falls back to the configured default model.
- If the primary selected model fails upstream, the router tries the fallback chain and records the request as degraded.
- Requests fail fast when stored gateway or classifier BYOK credentials cannot be decrypted, when no gateway is configured, or when the server is missing its BYOK encryption secret.
- The first successfully decrypted gateway becomes the default upstream for routing and classifier traffic unless the user overrides the classifier base URL or key.

## Quick Start

```bash
npm install
npm run typecheck
npm run dev -w @custom-router/web
```

1. Copy `.env.example` to `.env.local`.
2. Set `BYOK_ENCRYPTION_SECRET` and add a gateway in the admin console.
3. Open `http://localhost:3000/admin`.
4. Create an account, add a gateway, generate an API key, and call `/api/v1` with `model: "auto"`.

## Self-Host Docs

- [Quickstart](docs/quickstart.md)
- [Local dev troubleshooting](docs/local-dev-troubleshooting.md)
- [Cloudflare deployment](docs/deployment-cloudflare.md)
- [Open-core boundary](docs/open-core.md)
- [Config Agent deprecation](docs/config-agent-deprecation.md)
- [Release process](docs/release-process.md)
- [Changelog](CHANGELOG.md)

## Development

```bash
npm run test
npm run typecheck
npm run build
```

Current automated coverage is strongest in `packages/core`. The web app remains lightly tested, so changes to routes and auth flows should be verified manually as well.

## Managed Hosting

Managed BYOK hosting is designed to run the same public product releases that ship from this repo. Hosted and self-hosted users should see the same public API contract and upgrade path.

## License

This repository is licensed under the GNU Affero General Public License v3.0 only. See [LICENSE](LICENSE).
