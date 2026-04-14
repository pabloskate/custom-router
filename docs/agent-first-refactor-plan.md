# Agent-First Refactor Plan

Date: 2026-03-30

## Why this plan exists

The app has accrued random failures and hidden coupling that make debugging expensive for both humans and agents. This plan turns refactoring into a staged, verifiable program instead of a risky rewrite.

## Principles

1. **No big-bang rewrite.** Prefer vertical slices with measurable outcomes.
2. **One seam per concern.** Route adapters stay thin; business logic lives in feature/server modules.
3. **Every phase has proof.** Each phase adds checks that prevent regression.
4. **Agent discoverability first.** The shortest path from issue → fix must be explicit in docs and scripts.

## Phase roadmap

### Phase 0 — Baseline and safety net (1–2 days)

Goals:
- Make current instability visible in one command.
- Capture "known broken" signals before moving code.

Deliverables:
- Add `npm run doctor:agent` for local triage and consistent incident intake.
- Record baseline outputs from `typecheck`, `test`, and `verify:admin`.
- Keep `docs/agent-friendliness-audit.md` as source of truth for drift.

Exit criteria:
- New contributors can run one command and know whether their environment is valid.
- Team can distinguish environment failures from product regressions quickly.

### Phase 1 — Route adapter normalization (2–4 days)

Goals:
- Remove inline auth/body parsing from API route files.
- Make route handlers predictable enough for safe codemods.

Deliverables:
- Adopt `route-helpers.ts` in all v1 route handlers (except documented exceptions).
- Add `withAdminAuth` and schema parsing helper where missing.
- Add architecture test coverage for route-import boundaries.

Exit criteria:
- Route files become <80 lines and mostly wiring.
- Auth behavior and error responses are consistent across endpoints.

### Phase 2 — Router orchestration split (4–7 days)

Goals:
- Reduce `router-service.ts` coupling by extracting clear modules.

Deliverables:
- Keep one top-level orchestrator (`routeAndProxy`) only.
- Move attempt planning, upstream execution, response rewrite, and persistence into focused modules.
- Ensure feature-owned contracts in `apps/web/src/features/routing/server` are the only import path for routed endpoints.

Exit criteria:
- Each module has unit tests for happy path + fallback + failure path.
- No module exceeds agreed complexity budget (for example, max 250 lines per file unless justified).

### Phase 3 — Deterministic admin/playground flows (3–5 days)

Goals:
- Stabilize the highest-friction user and agent workflows.

Deliverables:
- Ensure `npm run local:stable` + `npm run verify:admin` is green in a clean checkout.
- Add focused integration checks for playground inspect flow and profile autosave.
- Remove stale local artifacts from tracked workspace and document safe search targets.

Exit criteria:
- Local verification scripts fail only for real regressions, not startup flakiness.
- Agents can reproduce admin/playground issues with one documented command sequence.

### Phase 4 — Release guard automation (1–2 days)

Goals:
- Enforce release policy in automation, not memory.

Deliverables:
- CI gate for `test`, `typecheck`, `build`, and selected smoke checks.
- Migration/docs consistency check for schema-changing PRs.
- Release checklist with pass/fail evidence links.

Exit criteria:
- Merge to main is blocked when safety checks fail.
- Deployment docs match the actual release path.

## Definition of done for the full refactor

- Agents can locate relevant files for any issue class in under 2 hops from `AGENTS.md`.
- "Run this to verify" commands are stable and documented.
- Routing changes are isolated behind feature contracts with test coverage.
- Route handlers are adapters, not business logic containers.
- CI and local checks align (what passes locally passes in CI).

## Execution notes

- Start with high-churn surfaces: `playground`, `router-service`, and route handlers under `app/api/v1`.
- Prefer moving code without behavior changes first, then improve behavior behind tests.
- Track each phase as a PR stack to keep reviewable scope.
