# Profile Research Playbook

Use this workflow every time you add or refresh a preset in `/Users/pablomartinez/Downloads/auto router/apps/web/src/lib/routing-presets.ts`.
Update `/Users/pablomartinez/Downloads/auto router/apps/web/src/features/routing/server/model-registry.ts` first when the underlying model facts changed.

## 1. Define The Profile Thesis

Write four lines before looking at models:

- `Profile thesis:` the product promise in one sentence
- `Primary tradeoff:` quality, speed, cost, depth, agentic execution, or multimodality
- `Required capabilities:` must-have abilities
- `Unacceptable compromises:` what would make the profile misleading

Example:

```text
Profile thesis: Fast coding preset for daily implementation work with good enough agentic support.
Primary tradeoff: Speed and cost over frontier-max quality.
Required capabilities: coding reliability, strong instruction following, reasonable context window.
Unacceptable compromises: text-only model for screenshot-driven debugging, or a slow premium default.
```

## 2. Map To Router Eval Families

Use `/Users/pablomartinez/Downloads/auto router/docs/router_eval_spec.json`.

Pick the top 2-4 benchmark families that actually matter for this preset. Typical mappings:

- General balanced: `instruction_following`, `factual_reasoning`, `long_context_synthesis`, `practicality`
- Speed-first: `latency_cost_efficiency`, `instruction_following`, `structured_output`
- Coding-fast: `coding_agentic`, `instruction_following`, `latency_cost_efficiency`
- Premium agentic coding: `coding_agentic`, `planning_optimization`, `structured_output`, `long_context_synthesis`
- Research-heavy: `factual_reasoning`, `long_context_synthesis`, `reasoning_tradeoff`, `structured_output`

If you cannot name the benchmark families, the profile thesis is still underspecified.

## 3. Build The Shortlist

Apply hard filters first:

- available on OpenRouter now
- appropriate modality for the profile
- enough context for likely inputs
- price compatible with the profile thesis
- not obviously disqualified by latency or weak benchmark fit

Shortlist 3-7 routed candidates. Keep at least one rejected premium option and one rejected budget option in your notes.

## 4. Score The Candidates

Score each shortlisted model from `0` to `3` on:

- quality
- speed
- cost efficiency
- reliability
- tool use or agentic fit
- vision fit
- long-context fit

Use `N/A` only when a dimension truly does not matter for the preset.

Example score row:

| Model | Quality | Speed | Cost | Reliability | Tool Use | Vision | Long Context | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `model/id` | 3 | 2 | 2 | 3 | 1 | N/A | 2 | Cite evidence and date |

Do not average blindly. Weight scores according to the profile thesis.

## 5. Choose The Preset Shape

Make four decisions explicitly:

1. `models`
   - The routed pool should contain differentiated roles, not near-duplicates with no routing reason.
2. `defaultModel`
   - This is the safest general answer when routing rules are ambiguous.
3. `classifierModel`
   - Use the classifier rubric. Cheapest is not enough.
4. `routingInstructions`
   - Convert the thesis into stable task-routing rules.

Also record:

- one classifier fallback candidate
- top rejected default-model candidate
- why each rejection lost

## 6. Write Stable Preset Copy

In `routing-presets.ts`:

- prefer durable capability language
- use benchmark numbers only when they materially clarify a tradeoff
- avoid price claims unless the exact number is part of the product value
- do not leave unsupported leaderboard claims in long-lived copy

Good:

```text
Best for large codebase analysis and long-context read-heavy tasks.
```

Risky:

```text
Exactly 77.8% on benchmark X and $0.72 per million forever.
```

## 7. Apply The Repo Changes

When mutating repo code:

1. update `/Users/pablomartinez/Downloads/auto router/apps/web/src/features/routing/server/model-registry.ts` when recommendation facts or gateway mappings changed
2. update `/Users/pablomartinez/Downloads/auto router/apps/web/src/lib/routing-presets.ts`
3. update focused tests at the preset/editor seam
4. update docs only if quick-setup behavior changed

Do not add a new runtime shape or new preset plumbing unless the user explicitly changed scope.

## 8. Validate

Always run:

```bash
npm run test -w @custom-router/web
npm run test -w @custom-router/core
npm run typecheck
npm run eval:router:dry
```

Run focused tests first when possible.

When live credentials are available, compare:

- chosen default model vs top rejected alternative
- router-level eval for representative prompts from the profile thesis
