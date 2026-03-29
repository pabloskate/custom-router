# Router Eval Runner

This runner evaluates router or direct-model quality using `docs/router_eval_spec.json`.

## Modes

- `router`: sends queries to your OpenAI-compatible router endpoint using a routed profile ID. By default the runner uses `planning-backend`, or `ROUTER_EVAL_MODEL` / `--model` if provided.
- `model`: sends queries directly to an OpenRouter model baseline.

## Quick Start

Dry-run (no network):

```bash
npm run eval:router:dry -- --limit 10
npm run eval:model:dry -- --model openai/gpt-5.2 --limit 10
```

Live router run (needs EVAL_* for judge scoring):

```bash
ROUTER_BASE_URL=http://localhost:3010 EVAL_BASE_URL=https://openrouter.ai/api/v1 EVAL_API_KEY=... npm run eval:router -- --model planning-backend --limit 20
```

Live model baseline:

```bash
EVAL_BASE_URL=https://openrouter.ai/api/v1 EVAL_API_KEY=... npm run eval:model -- --model openai/gpt-5.2 --limit 20
```

## Output

Reports are written to `docs/eval-results/`:

- `<run-id>.json`: full per-query output, judge notes, and component scores.
- `<run-id>.md`: summary report for fast review.

## Scoring

Per query score components:

- `task_success` (judge model)
- `factuality` (judge model)
- `safety` (judge model)
- `constraint_fit` (deterministic checks)
- `latency_cost_efficiency` (deterministic from latency + usage/cost)

Overall score uses weights from `docs/router_eval_spec.json`.

## Important Notes

- Judge model defaults to `openai/gpt-5.2`, override with `--judge-model`.
- Router mode expects endpoint: `POST /api/v1/chat/completions`.
- Router mode does not use `model: "auto"`; pass a saved routing profile ID such as `planning-backend`.
- If usage cost is absent from provider response, cost efficiency uses latency with neutral cost fallback.
