---
name: custom-router-release-guard
description: Use for release, deploy, or pre-merge verification work in CustomRouter. Enforces the repo’s release checks, admin-flow proof, and schema/docs consistency rules.
---

# CustomRouter Release Guard

Use this skill before shipping or approving changes.

## Required checks

Run in this order:

1. `npm run test`
2. `npm run typecheck`
3. `npm run build`

If auth, admin UI, gateways, or user settings changed:

4. `npm run local:stable`
5. `BASE_URL=http://localhost:3010 npm run verify:admin`

## Consistency checks

- If `infra/d1/schema.sql` or migrations changed, verify the relevant docs changed too.
- If feature structure moved, update `AGENTS.md`.
- If public behavior changed, update `README.md` or the relevant doc and changelog entry.

## Do not sign off if

- tests are red
- typecheck is red
- route handlers bypass the shared helper layer without a good reason
- admin verification was skipped after auth/admin changes
