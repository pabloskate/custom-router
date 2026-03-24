# Complexity Audit: Core vs Extras

Date: 2026-03-24

## Core Thesis

CustomRouter's durable value is not "lots of routing-adjacent UX." Its real product is a multi-user, BYOK, OpenAI-compatible routing proxy that can explain its decisions and stay usable in both OSS and hosted form.

If trimmed aggressively, the OSS product should still let a user:

- create an account
- add a gateway
- generate an API key
- define routing profiles
- call `/api/v1/chat/completions`, `/api/v1/responses`, and `/api/v1/models`
- inspect why a request routed the way it did

Anything beyond that needs to prove it materially improves routing trust, multi-user viability, or time-to-first-route.

## Evidence Snapshot

Repository state was reviewed on 2026-03-24.

- `npm test` passed: 34 web test files, 147 web tests, plus 3 core test files and 45 core tests.
- `npm run typecheck` passed across `@custom-router/ingest-worker`, `@custom-router/web`, `@custom-router/core`, and `@custom-router/data`.
- Core routing entrypoints are smaller than the surrounding product shell:
  - runtime-core routes: 7
  - control-plane routes: 14
  - profile-builder routes: 3
- The biggest authored hotspots are not the router engine:
  - `apps/web/src/features/routing/components/RoutingProfilesEditor.tsx`: 1410 lines
  - `apps/web/src/features/routing/server/profile-builder-service.ts`: 1352 lines
  - `apps/web/src/features/routing/components/useRoutingProfilesEditor.ts`: 1314 lines
  - `apps/web/src/components/admin/QuickstartPanel.tsx`: 1199 lines
  - `apps/web/src/lib/routing-presets.ts`: 1159 lines
  - `apps/web/src/components/admin/GatewayPanel.tsx`: 955 lines
- Recent churn since 2025-12-01 is concentrated in product shell and setup surfaces as much as in the routing path:
  - `apps/web/src/components/admin/admin-tabs.tsx`: 20 touches
  - `apps/web/app/api/v1/user/me/route.ts`: 19 touches
  - `apps/web/src/lib/routing/router-service.ts`: 15 touches
  - `apps/web/src/components/admin/GatewayPanel.tsx`: 14 touches
  - `packages/core/src/router-engine.ts`: 14 touches
  - `packages/core/src/types.ts`: 14 touches

### Complexity Budgets

These buckets are approximate, non-overlapping slices of the current repo. They are directional, not accounting artifacts.

| Budget | Scoped files | Lines | Routes | Recent touches since 2025-12-01 | Read |
| --- | ---: | ---: | ---: | ---: | --- |
| Runtime core | 41 | 6,189 | 7 | 222 | Compact relative to its importance; still the real product center |
| Control plane | 48 | 7,888 | 14 | 236 | Already larger than the runtime it exists to manage |
| Setup / recommendation | 30 | 11,564 | 3 | 104 | Largest authored code budget despite not being critical-path runtime |
| Compatibility / overhead code | 29 | 3,466 | 0 | 126 | Necessary scaffolding plus some drift and legacy |
| Docs / eval noise | 25 | 39,881 | 0 | n/a | Mostly discovery noise, not runtime complexity |

## Scoring Legend

- `Necessity`: how required the subsystem is for the real product promise
- `Differentiation`: how much the subsystem contributes to CustomRouter's moat
- `Maintenance`: ongoing change cost
- `Coupling`: how many adjacent systems the subsystem drags in
- `Replaceability`: how easy it is to move out, simplify, or replace with docs/scripts

`High` is good for `Necessity` and `Differentiation`. `High` is expensive for `Maintenance` and `Coupling`. `High` means easier to move for `Replaceability`.

## Keep / Simplify / Cut / Defer Matrix

### Runtime Core

| Subsystem | Outcome | Necessity | Differentiation | Maintenance | Coupling | Replaceability | Judgment |
| --- | --- | --- | --- | --- | --- | --- | --- |
| OpenAI-compatible routed endpoints and shared routed-endpoint factory | Keep | High | High | Medium | Medium | Low | This is the public contract. It is central and thin enough to justify itself. |
| Core router engine: profile match, pinning, fallback, family stickiness, reasoning selection | Keep | High | High | Medium | Medium | Low | This is the product. Trimming should narrow options, not remove the engine. |
| Runtime orchestration: `router-service`, classifier context, attempt ordering, persistence | Simplify | High | High | High | High | Medium | Valuable, but the logic still spans too many helpers and config branches for the amount of work it does. |
| Explainability loop: inspect dry-run, explanations, headers, routing history | Keep | High | Medium | Medium | Medium | Medium | Directly improves trust and debugging, which is one of the few extras that clearly earns its cost. |

### Control Plane / Product Shell

| Subsystem | Outcome | Necessity | Differentiation | Maintenance | Coupling | Replaceability | Judgment |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Multi-user auth, sessions, logout, password reset, API keys | Keep | High | Medium | Medium | Medium | Low | Multi-user OSS support is required, and hosted parity depends on this baseline. |
| Gateway / BYOK management | Keep | High | High | Medium | Medium | Low | Without gateway CRUD and credential handling, the router is unusable. |
| `user/me` omnibus route plus settings hydration | Simplify | High | Low | High | High | Medium | It has become a mixed account, routing, legacy-reset, and classifier-settings blob. Split account data from routing settings. |
| Admin shell, tab registry, empty extension seam | Simplify | Medium | Low | Medium | Medium | High | Useful structure, but today it behaves more like a framework than a product need. |
| Invite codes and registration gating | Defer/Externalize | Low | Low | Medium | Medium | High | Useful for hosted rollout control, but not required for the OSS router baseline if bootstrap signup still exists. |
| Orphaned admin surface such as `CatalogEditorPanel` | Cut | Low | Low | Medium | Low | High | Unwired panels are pure carrying cost and should not live in the defended product surface. |

### Setup / Recommendation Layer

| Subsystem | Outcome | Necessity | Differentiation | Maintenance | Coupling | Replaceability | Judgment |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Routing profiles as stored product capability | Keep | High | High | Medium | Medium | Low | Named routed profiles are part of the actual product promise. |
| Current routing profile editor UX, autosave flow, and state machine | Simplify | High | Medium | High | High | Medium | Keep profile editing, but the present editor stack is the largest UI hotspot in the repo and is too elaborate for the underlying schema. |
| Hard-coded routing presets catalog | Defer/Externalize | Medium | Low | High | Medium | High | Templates help onboarding, but a benchmark-backed preset library inside the app is expensive to keep fresh and not core runtime value. |
| Profile builder run flow and async apply pipeline | Cut | Low | Low | High | High | High | This is a second product inside the product. It improves onboarding, not routing correctness or trust. |
| Model registry and profile-builder knowledge layer | Defer/Externalize | Low | Medium | High | Medium | High | Useful research input, but it is explicitly not the runtime source of truth and should not live on the hot product path. |
| Quickstart panel | Defer/Externalize | Medium | Low | High | Low | High | A 1,199-line panel is documentation wearing UI clothes. Move most of this value back to docs and examples. |
| Playground | Simplify | Medium | Medium | Medium | Low | Medium | A thin request/inspect tool is valuable. The current panel can shrink without hurting the debugging loop. |
| Recent logs / routing history UI | Keep | Medium | Medium | Low | Low | Medium | Small and directly tied to trust. This is one of the few shell features that clearly pays rent. |

### Compatibility / Overhead

| Subsystem | Outcome | Necessity | Differentiation | Maintenance | Coupling | Replaceability | Judgment |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Repository layer, system-config path, per-user config path, legacy reset handling | Simplify | Medium | Low | Medium | High | Medium | The abstraction is useful, but the current system-vs-user split adds drift and recovery logic that bleeds into unrelated flows. |
| Ingest worker, `packages/data`, global catalog path | Simplify | Medium | Low | Medium | Medium | High | Make this optional or clearly secondary. Runtime routing already leans heavily on user gateway inventory and saved profiles. |
| Eval runner, handoff docs, and checked-in eval artifacts | Defer/Externalize | Low | Medium | Low runtime / High repo-noise | Low | High | Useful for research and release work, but they should not dominate repo discovery. |
| Deprecated shims and placeholder extension seams such as `model-intelligence.ts`, empty `admin-extensions`, thin re-export wrappers | Cut | Low | Low | Low | Medium | High | Delete until there is a real extension or compatibility consumer. Placeholder architecture is still complexity. |

## What Is Truly Valuable

These areas clearly earn their complexity:

- OpenAI-compatible runtime routing
- profile-based routing with fallback and pinning
- explainability and inspectability
- multi-user auth and API-key support
- gateway/BYOK management

These are the pieces that make the product both usable and defensible.

## False Core Areas

These areas look important because they are large, recent, or polished, but they are not the real core:

- Profile builder flow: large, active, and elaborate, but it is onboarding sugar rather than routing capability.
- Model registry and research-backed knowledge: valuable as reference material, not as app runtime.
- Hard-coded preset freshness work: chases model-market drift more than it improves the router itself.
- Quickstart and Playground polish: feels like product completeness, but most of the value can live in docs plus a thinner inspect tool.
- Invite mode and invite management: closer to provisioning policy than to router functionality.
- Placeholder extension seams and deprecated shims: architecture shape without present-day payoff.

## Top 5 Complexity Reductions By Payoff

1. Remove the profile-builder runtime from the main app.
   - Impact: drops 3 routes, the 1,352-line `profile-builder-service`, async run persistence, and a large conceptual branch of the product.
   - Replacement: docs, JSON templates, or an optional external assistant/skill.

2. Replace the preset catalog with a very small starter set outside the hot app path.
   - Impact: shrinks the 1,159-line preset library and removes recurring "keep model picks fresh" work from the main product.
   - Replacement: 2 to 3 maintained starter templates in docs or versioned JSON files.

3. Collapse the routing-profile editor to a smaller CRUD surface.
   - Impact: attacks the biggest authored UI hotspot: `RoutingProfilesEditor.tsx` plus `useRoutingProfilesEditor.ts` and supporting helpers.
   - Replacement: simpler forms with fewer modal states, less autosave machinery, and fewer hidden transitions.

4. Split account/auth settings from routing settings and flatten the admin shell.
   - Impact: reduces coupling around `user/me`, `admin-tabs`, and the "everything in one shell" pattern.
   - Replacement: smaller route contracts and a less framework-like admin layout.

5. Move eval artifacts and research docs out of the default source-tree path.
   - Impact: removes nearly 40k lines of repo-discovery noise without touching runtime behavior.
   - Replacement: generated artifacts, release attachments, or a dedicated research folder outside the default navigation path.

## Minimum Lovable OSS Product After Trimming

If CustomRouter were trimmed to the smallest strong source-of-truth OSS product, it would include:

- signup, login, logout, and basic password reset
- gateway CRUD with encrypted BYOK storage and model sync
- API-key management
- routing profiles with:
  - profile ID
  - model pool
  - fallback model
  - classifier model
  - routing instructions
- runtime routing with fallback, pinning, and explanations
- `chat/completions`, `responses`, and `models`
- inspect dry-run, routing headers, explanation fetch, and recent routing history
- docs-first onboarding rather than UI-heavy setup assistants

It would not need to include, by default:

- profile-builder runs
- a large benchmark-backed preset catalog
- invite-code management
- a heavy quickstart UI
- checked-in eval result artifacts
- dormant panels or placeholder extension systems

## Recommended Trim Order

1. Delete dead and placeholder surface first.
   - Remove orphaned panels and deprecated shims.

2. Externalize setup intelligence next.
   - Move profile builder, model registry, and rich presets out of the main app path.

3. Shrink profile authoring.
   - Keep the profile capability, replace the current editor stack with a smaller implementation.

4. Split control-plane responsibilities.
   - Separate account/auth concerns from routing settings and simplify the admin shell.

5. Revisit runtime orchestration last.
   - Once the surrounding shell is smaller, collapse runtime branching and repository drift where it still exists.

## Bottom Line

CustomRouter is not overbuilt in its routing engine. It is overbuilt around the engine.

The repo's best complexity reductions are not "make the router dumber." They are:

- stop shipping onboarding intelligence as product runtime
- stop treating documentation and templates as app UI
- stop carrying placeholder and legacy control-plane surface

The strongest version of this project is a smaller, clearer multi-user routing proxy with strong explainability, not a full routing IDE.
