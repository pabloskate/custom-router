---
name: custom-router-feature-consistency
description: Use when changing a feature in this repo. Keeps CustomRouter changes aligned across feature modules, thin route adapters, shared contracts, tests, and docs so frontend/backend drift does not reappear.
---

# CustomRouter Feature Consistency

Use this skill for any feature work in `/Users/pablomartinez/Downloads/auto router`.

## Required workflow

1. Identify the owning feature slice first.
   - `src/features/routing`
   - `src/features/gateways`
   - `src/features/account-settings`
   - `src/features/admin-shell`
   - compatibility adapters may still exist under `src/components/admin` or `src/lib`

2. Keep route handlers thin.
   - `app/api/v1/**/route.ts` files should choose a handler, call a helper, and return a response.
   - Prefer `withSessionAuth`, `withApiKeyAuth`, `withBrowserSessionOrApiKeyAuth`, `withAdminAuth`, `withCsrf`, and `parseJsonBody`.
   - Routed endpoints should use `createRoutedEndpoint`.

3. Do not redefine shared DTOs in UI components.
   - Reuse `RouterProfile` from `@custom-router/core`.
   - Reuse gateway/user/inspect contracts from feature contract files.

4. Update the whole feature, not just one surface.
   - client component or hook
   - route or server helper
   - shared contracts/types
   - tests
   - docs when behavior or structure changes

## Validation

- Run the narrowest relevant test first.
- Before finishing, run:
  - `npm run test -w @custom-router/web`
  - `npm run typecheck -w @custom-router/web`
- If auth/admin behavior changed, also run:
  - `BASE_URL=http://localhost:3010 npm run verify:admin`

## Red flags

- Route files importing `authenticateSession`, `authenticateRequest`, `isSameOriginRequest`, or `verifyAdminSecret`
- Feature DTOs imported from a component file
- Copy-pasted request parsing across multiple routes
- New large admin state flows added to `admin-shell` instead of a feature hook
