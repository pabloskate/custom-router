# Routing Server Map

This folder holds the server-side seams for routing, recommendation, and setup work.

## Runtime Routing

- `router-context.ts`
  - Resolves live user inventory, profiles, and effective runtime config.
- `router-classifier-context.ts`
  - Resolves the classifier model, gateway, and credentials for routed requests.
- `router-decision.ts`
  - Bridges runtime config into `RouterEngine` classifier calls and explanation helpers.
- `router-attempts.ts`, `router-persistence.ts`
  - Attempt shaping and persistence helpers around routed requests.

## Recommendation / Setup

- `model-registry/`
  - Research-backed model registry used only for setup and profile recommendations.
  - `shared.ts`: schema, metric helpers, source helpers.
  - `entries/`: grouped registry entries so agents do not need to open one giant file.
  - `index.ts`: assembles the registry and exposes lookup/list helpers.
- `profile-builder-knowledge.ts`
  - Adapter that turns registry entries into setup-agent-friendly knowledge objects.
- `profile-builder-service.ts`
  - Deterministic scoring, executor prompt building, run orchestration, and draft profile application.
- `profile-builder-store.ts`
  - Persistence for setup/profile-builder runs.

## Compatibility

- `model-intelligence.ts`
  - Deprecated shim that re-exports the registry under the older name.

## Mental Model

- Runtime routing uses live gateway inventory plus saved profiles.
- Setup/profile generation uses the registry plus live inventory intersection.
- The registry is not an execution source of truth.
