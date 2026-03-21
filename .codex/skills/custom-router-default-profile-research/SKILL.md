---
name: custom-router-default-profile-research
description: Add or update benchmark-backed default routing profile presets for CustomRouter. Use when Codex needs to create a new quick-setup routing profile, refresh stale preset model choices, re-select classifier or default models after benchmark, pricing, availability, or capability changes, or prepare evidence for edits in the model registry and apps/web/src/lib/routing-presets.ts.
---

# CustomRouter Default Profile Research

Use this skill for repo-local preset work in `/Users/pablomartinez/Downloads/auto router`.

## Required Workflow

1. Confirm the seam before changing anything.
   - The canonical research seam is `/Users/pablomartinez/Downloads/auto router/apps/web/src/features/routing/server/model-registry.ts`.
   - V1 preset-consumer seam is named quick-setup/default routing profile presets in `/Users/pablomartinez/Downloads/auto router/apps/web/src/lib/routing-presets.ts`.
   - Use the existing preset-binding/editor flow in `/Users/pablomartinez/Downloads/auto router/apps/web/src/features/routing/profiles-editor-utils.ts`.
   - Do not expand into `/Users/pablomartinez/Downloads/auto router/apps/web/src/lib/storage/defaults.ts` unless the user explicitly asks for legacy fallback cleanup.

2. Load repo guardrails before mutating repo code.
   - Read `/Users/pablomartinez/Downloads/auto router/.codex/skills/custom-router-feature-consistency/SKILL.md`.
   - Read `/Users/pablomartinez/Downloads/auto router/.codex/skills/custom-router-routing-safety/SKILL.md`.
   - Treat those skills as mandatory whenever this skill edits app code or tests.

3. Rebuild the evidence packet from live sources on every run.
   - Read `references/source-registry.md`.
   - Verify availability, pricing, context, and modality live before making a recommendation.
   - Use `node scripts/fetch_openrouter_snapshot.mjs <model-id>...` for OpenRouter inventory snapshots instead of hand-copying provider facts.
   - Use absolute dates in notes and claims.

4. Define the profile thesis before choosing models.
   - State the user jobs-to-be-done, primary tradeoff, required capabilities, and unacceptable compromises.
   - Map the profile thesis to benchmark families in `/Users/pablomartinez/Downloads/auto router/docs/router_eval_spec.json`.
   - Use `references/profile-research-playbook.md` for the scoring process.

5. Choose the preset shape with explicit evidence.
   - Update the model registry first when facts, rankings, pricing, latency, or gateway support have changed.
   - Select the routed pool, default model, primary classifier model, and one classifier fallback candidate.
   - Use `references/classifier-rubric.md` to rank classifier candidates.
   - Record rejected alternatives and why they lost.
   - Keep volatile benchmark numbers and prices out of long-lived preset copy unless the current change explicitly needs them. Prefer stable capability language in preset descriptions, model hints, and routing instructions.

6. Follow the required repo mutation path.
   - Update `/Users/pablomartinez/Downloads/auto router/apps/web/src/features/routing/server/model-registry.ts` when the recommendation knowledge changed.
   - Update `/Users/pablomartinez/Downloads/auto router/apps/web/src/lib/routing-presets.ts`.
   - Update focused tests beside the preset/editor seam.
   - Touch docs only if quick-setup behavior, user-facing workflow, or evaluation guidance changes.
   - Do not invent a new preset shape; stay inside the existing `RoutingPreset` contract.

7. Validate the result.
   - Run focused tests first.
   - Run `npm run test -w @custom-router/web`.
   - Run `npm run test -w @custom-router/core`.
   - Run `npm run typecheck`.
   - Run `npm run eval:router:dry`.
   - When live credentials are available, run a small live comparison with the existing eval runner: chosen default model vs top rejected alternative, then a router-level eval on representative prompts for the profile thesis.

## Evidence Packet

Before editing repo code, fill out `references/preset-change-template.md` in the working notes or chat.

The packet must include:
- verification date
- profile goal and target task families
- model registry entries touched
- selected routed pool
- default model
- primary classifier and classifier fallback candidate
- source URLs
- benchmark notes
- OpenRouter pricing/context snapshot
- rejected models
- planned repo changes
- validation plan

Do not skip the packet. The point of this skill is repeatable research, not one-off intuition.

## Failure Checks

Reject or revise the preset if any of these checks fail:
- the classifier model is not currently available on the target gateway
- the default model lacks a required capability for the profile thesis
- a benchmark claim cannot be live-verified on the current date
- a preset model ID no longer resolves through current OpenRouter inventory
- two sources disagree on a provider fact and the conflict is not documented

## Resources

- `references/source-registry.md`
  - Read first on every run. It defines canonical live sources and trust boundaries.
- `references/profile-research-playbook.md`
  - Read when shaping the profile thesis, benchmark mapping, shortlist, and scoring.
- `references/classifier-rubric.md`
  - Read before selecting the classifier model.
- `references/preset-change-template.md`
  - Use to build the dated evidence packet before repo edits.
- `scripts/fetch_openrouter_snapshot.mjs`
  - Fetch a normalized OpenRouter model comparison table for selected model IDs.

## Quick Commands

Fetch an OpenRouter snapshot:

```bash
node '/Users/pablomartinez/Downloads/auto router/.codex/skills/custom-router-default-profile-research/scripts/fetch_openrouter_snapshot.mjs' anthropic/claude-sonnet-4.6 google/gemini-3.1-flash-lite-preview
```

Validate this skill folder:

```bash
python3 '/Users/pablomartinez/.codex/skills/.system/skill-creator/scripts/quick_validate.py' '/Users/pablomartinez/Downloads/auto router/.codex/skills/custom-router-default-profile-research'
```
