---
name: custom-router-routing-safety
description: Use when changing routing, classifier, fallback, guardrail, pinning, or inspect-mode behavior in CustomRouter. Enforces the repo’s routing safety checks and test coverage expectations.
---

# CustomRouter Routing Safety

Use this skill for changes touching:

- `packages/core`
- `apps/web/src/lib/routing`
- `apps/web/src/features/routing`
- request routing, classifier selection, fallback ordering, guardrails, or thread pins

## Checklist

1. Preserve external API behavior.
   - `/api/v1/chat/completions`
   - `/api/v1/responses`
   - `/api/v1/completions`
   - `/api/v1/router/inspect`

2. Check all routing modes.
   - passthrough explicit model
   - routed request with classifier
   - classifier failure with fallback
   - classifier failure without fallback
   - dry-run inspect path

3. Check gateway and credential paths.
   - missing gateway
   - undecryptable gateway key
   - dedicated classifier key/base URL mismatch
   - classifier resolved through gateway ownership

4. Check thread behavior.
   - new thread
   - continuation pin reuse
   - force-route bypass
   - invalid pin after catalog changes

5. Check degraded behavior.
   - primary upstream failure
   - fallback selected after failure
   - guardrail-disabled models still leave one attempt

## Validation

- Run:
  - `npm run test -w @custom-router/core`
  - `npm run test -w @custom-router/web`
  - `npm run typecheck`
- Prefer adding focused tests beside the extracted routing modules before changing broad end-to-end tests.
