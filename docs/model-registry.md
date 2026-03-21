# Model Registry Vocabulary

This repo now reserves different words for different model datasets.

## Terms

- `inventory`
  - Executable models that a user can route to right now through a configured gateway.
  - Source of truth for live routing.
  - Built from synced gateway models and profile-bound gateway selections.

- `registry`
  - Research-backed canonical model knowledge used for setup, recommendations, and profile generation.
  - Stores benchmark facts, pricing, latency, strengths, caveats, verification dates, and gateway mappings.
  - Must not be treated as the executable routing source of truth.

- `gateway mapping`
  - A mapping from one canonical registry model to a gateway-specific deployment.
  - Includes the gateway preset, the concrete gateway model ID, the gateway-facing display name, and gateway-scoped operational facts when they have been verified.

## Rules

- There should never be a hard-coded execution catalog.
- Runtime routing should intersect live inventory with recommendation logic, not route directly from registry entries.
- Quick setup, setup agents, and routing-profile recommendation flows should use the registry first, then bind to available inventory.
- If a model exists in the registry but not in live inventory, it can inform recommendations but cannot be routed.
- Setup/profile agents should prefer explicit registry evidence such as gateway-scoped operational facts, capability flags, benchmark metrics, lens rankings, caveats, and per-entry verification notes over generic `whenToUse` prose.

## Current Module Map

- Recommendation registry:
  - [model-registry.ts](/Users/pablomartinez/Documents/Custom Router/OSS/apps/web/src/features/routing/server/model-registry.ts)
- Profile-builder adapter over the registry:
  - [profile-builder-knowledge.ts](/Users/pablomartinez/Documents/Custom Router/OSS/apps/web/src/features/routing/server/profile-builder-knowledge.ts)
- Runtime routing inventory resolution:
  - [router-context.ts](/Users/pablomartinez/Documents/Custom Router/OSS/apps/web/src/features/routing/server/router-context.ts)

## Naming Guidance

- Use `registry` for research-backed canonical model knowledge.
- Use `inventory` for deployable gateway/account-scoped model lists.
- Avoid naming recommendation datasets `catalog`; that term is too easy to confuse with executable routing data.
