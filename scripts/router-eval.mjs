#!/usr/bin/env node

import { promises as fs } from "node:fs";
import path from "node:path";

const DEFAULT_SPEC_PATH = "docs/router_eval_spec.json";
const DEFAULT_REPORT_DIR = "docs/eval-results";

function getEvalUpstream() {
  const baseUrl = process.env.EVAL_BASE_URL?.trim();
  const apiKey = process.env.EVAL_API_KEY?.trim();
  if (!baseUrl || !apiKey) {
    throw new Error(
      "EVAL_BASE_URL and EVAL_API_KEY are required for model mode and judge scoring. Set them to your BYOK upstream (e.g. OpenRouter)."
    );
  }
  return { baseUrl: baseUrl.replace(/\/$/, ""), apiKey };
}

function parseArgs(argv) {
  const envModel = process.env.ROUTER_EVAL_MODEL?.trim();
  const args = {
    mode: "router",
    model: envModel || "",
    judgeModel: process.env.ROUTER_EVAL_JUDGE_MODEL || "openai/gpt-5.2",
    spec: DEFAULT_SPEC_PATH,
    outDir: DEFAULT_REPORT_DIR,
    limit: 60,
    dryRun: false,
    routerBaseUrl: process.env.ROUTER_BASE_URL || "http://localhost:3001",
    seed: "default"
  };

  for (let i = 2; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === "--dry-run") {
      args.dryRun = true;
      continue;
    }
    if (!token.startsWith("--")) {
      continue;
    }

    const key = token.slice(2);
    const value = argv[i + 1];
    if (!value || value.startsWith("--")) {
      continue;
    }

    if (key === "mode") args.mode = value;
    if (key === "model") args.model = value;
    if (key === "judge-model") args.judgeModel = value;
    if (key === "spec") args.spec = value;
    if (key === "out") args.outDir = value;
    if (key === "limit") args.limit = Number(value) || args.limit;
    if (key === "router-base-url") args.routerBaseUrl = value;
    if (key === "seed") args.seed = value;

    i += 1;
  }

  if (!["router", "model"].includes(args.mode)) {
    throw new Error(`Invalid mode: ${args.mode}. Use --mode router|model`);
  }

  if (!args.model) {
    args.model = args.mode === "router" ? "planning-backend" : "openai/gpt-5.2";
  }

  return args;
}

function clamp(value, min = 0, max = 1) {
  return Math.min(max, Math.max(min, value));
}

function scoreFormula(weights, components) {
  return (
    weights.task_success * components.task_success +
    weights.constraint_fit * components.constraint_fit +
    weights.safety * components.safety +
    weights.factuality * components.factuality +
    weights.latency_cost_efficiency * components.latency_cost_efficiency
  );
}

function extractText(value) {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) {
    return value
      .map((item) => {
        if (typeof item === "string") return item;
        if (item && typeof item === "object" && typeof item.text === "string") return item.text;
        return "";
      })
      .join("\n");
  }
  if (value && typeof value === "object" && typeof value.text === "string") {
    return value.text;
  }
  return "";
}

function extractAssistantText(payload) {
  if (payload && Array.isArray(payload.choices) && payload.choices[0]?.message) {
    return extractText(payload.choices[0].message.content);
  }

  if (payload && typeof payload.output_text === "string") {
    return payload.output_text;
  }

  if (payload && Array.isArray(payload.output)) {
    return payload.output
      .flatMap((item) => {
        if (!item || typeof item !== "object") return [];
        if (!Array.isArray(item.content)) return [];
        return item.content;
      })
      .map((part) => {
        if (part && typeof part === "object" && typeof part.text === "string") return part.text;
        return "";
      })
      .join("\n");
  }

  return "";
}

function parseNumberWords(input) {
  const map = {
    one: 1,
    two: 2,
    three: 3,
    four: 4,
    five: 5,
    six: 6,
    seven: 7,
    eight: 8,
    nine: 9,
    ten: 10
  };
  return map[input.toLowerCase()] || null;
}

function extractRequestedCount(prompt) {
  const numMatch = prompt.match(/\b(\d+)\s+(bullets?|questions?|options?|examples?)\b/i);
  if (numMatch) return Number(numMatch[1]);

  const wordMatch = prompt.match(/\b(one|two|three|four|five|six|seven|eight|nine|ten)\s+(bullets?|questions?|options?|examples?)\b/i);
  if (wordMatch) return parseNumberWords(wordMatch[1]);

  return null;
}

function countListItems(answer) {
  const lines = answer.split("\n").map((line) => line.trim());
  return lines.filter((line) => /^[-*]\s+/.test(line) || /^\d+[.)]\s+/.test(line)).length;
}

function deterministicConstraintScore(query, answer) {
  let score = 0.6;
  const fmt = query.format_strictness;

  if (fmt === "json") {
    try {
      JSON.parse(answer);
      score += 0.3;
    } catch {
      score -= 0.5;
    }
  }

  if (fmt === "structured_list") {
    const items = countListItems(answer);
    if (items >= 2) score += 0.2;
    else score -= 0.2;
  }

  if (fmt === "structured_table") {
    if (answer.includes("|") || answer.includes("\t")) score += 0.2;
    else score -= 0.2;
  }

  if (fmt === "structured_schedule") {
    if (/\b\d{1,2}(:\d{2})?\s?(am|pm)\b/i.test(answer) || /\b\d{1,2}:\d{2}\b/.test(answer)) {
      score += 0.2;
    } else {
      score -= 0.2;
    }
  }

  if (fmt === "code") {
    if (answer.includes("```")) score += 0.2;
    else score -= 0.1;
  }

  const requestedCount = extractRequestedCount(query.prompt);
  if (requestedCount !== null) {
    const actual = countListItems(answer);
    if (actual === requestedCount) score += 0.2;
    else if (actual > 0) score -= 0.1;
    else score -= 0.2;
  }

  if (/two examples and one analogy/i.test(query.prompt)) {
    const examples = (answer.match(/example/gi) || []).length;
    const analogy = (answer.match(/analogy/gi) || []).length;
    if (examples >= 2 && analogy >= 1) score += 0.2;
    else score -= 0.2;
  }

  return Number(clamp(score).toFixed(4));
}

function latencyTargetMs(query) {
  if (query.latency_sensitivity === "high") return 2500;
  if (query.latency_sensitivity === "medium") return 6000;
  return 12000;
}

function costTargetUsd(query) {
  if (query.stakes === "critical") return 0.12;
  if (query.stakes === "high") return 0.08;
  if (query.stakes === "medium") return 0.04;
  return 0.02;
}

function latencyCostScore(query, latencyMs, costUsd) {
  const lTarget = latencyTargetMs(query);
  const cTarget = costTargetUsd(query);

  const latencyScore = latencyMs <= lTarget ? 1 : clamp(lTarget / Math.max(latencyMs, 1));

  let costScore = 0.6;
  if (typeof costUsd === "number" && Number.isFinite(costUsd) && costUsd >= 0) {
    costScore = costUsd <= cTarget ? 1 : clamp(cTarget / Math.max(costUsd, 0.000001));
  }

  return Number(clamp(0.6 * latencyScore + 0.4 * costScore).toFixed(4));
}

async function callEvalChat({ baseUrl, apiKey, model, prompt, temperature = 0, maxTokens = 1200 }) {
  const url = `${baseUrl}/chat/completions`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model,
      messages: [{ role: "user", content: prompt }],
      temperature,
      max_tokens: maxTokens,
      response_format: { type: "json_object" }
    })
  });

  const bodyText = await response.text();
  if (!response.ok) {
    throw new Error(`Eval upstream error (${response.status}): ${bodyText.slice(0, 500)}`);
  }

  return JSON.parse(bodyText);
}

function parseUsage(rawPayload) {
  const usage = rawPayload?.usage || {};
  const totalTokens = Number(usage.total_tokens || usage.totalTokens || 0);
  const promptTokens = Number(usage.prompt_tokens || usage.input_tokens || usage.promptTokens || 0);
  const completionTokens = Number(usage.completion_tokens || usage.output_tokens || usage.completionTokens || 0);

  let costUsd = null;
  const usageCost = usage.total_cost || usage.cost || usage.totalCost;
  if (typeof usageCost === "number" && Number.isFinite(usageCost)) {
    costUsd = usageCost;
  }

  return {
    totalTokens,
    promptTokens,
    completionTokens,
    costUsd
  };
}

async function runCandidateQuery({ args, prompt }) {
  if (args.mode === "router") {
    const url = `${args.routerBaseUrl.replace(/\/$/, "")}/api/v1/chat/completions`;
    const startedAt = Date.now();
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: args.model,
        messages: [{ role: "user", content: prompt }],
        stream: false
      })
    });

    const latencyMs = Date.now() - startedAt;
    const bodyText = await response.text();
    if (!response.ok) {
      throw new Error(`Router error (${response.status}): ${bodyText.slice(0, 500)}`);
    }

    const payload = JSON.parse(bodyText);
    const content = extractAssistantText(payload);
    const usage = parseUsage(payload);

    return {
      content,
      latencyMs,
      selectedModel: response.headers.get("x-router-model-selected") || "unknown",
      selectedProfile: response.headers.get("x-router-profile") || null,
      selectedCategory: response.headers.get("x-router-category") || null,
      degraded: (response.headers.get("x-router-degraded") || "false") === "true",
      usage
    };
  }

  const { baseUrl, apiKey } = getEvalUpstream();

  const startedAt = Date.now();
  const chatUrl = `${baseUrl}/chat/completions`;
  const response = await fetch(chatUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: args.model,
      messages: [{ role: "user", content: prompt }],
      temperature: 0.2,
      max_tokens: 1200
    })
  });

  const latencyMs = Date.now() - startedAt;
  const bodyText = await response.text();
  if (!response.ok) {
    throw new Error(`Model call error (${response.status}): ${bodyText.slice(0, 500)}`);
  }

  const payload = JSON.parse(bodyText);
  const content = extractAssistantText(payload);
  const usage = parseUsage(payload);

  return {
    content,
    latencyMs,
    selectedModel: args.model,
    selectedProfile: null,
    selectedCategory: null,
    degraded: false,
    usage
  };
}

function buildJudgePrompt({ query, answer }) {
  return `You are evaluating a single AI response quality.

Query:
${query.prompt}

Query metadata:
${JSON.stringify({
  stakes: query.stakes,
  truth_requirement: query.truth_requirement,
  format_strictness: query.format_strictness,
  benchmark_families: query.benchmark_families,
  success_criteria: query.success_criteria
}, null, 2)}

Assistant answer:
${answer}

Return JSON only:
{
  "task_success": 0-1,
  "factuality": 0-1,
  "safety": 0-1,
  "notes": "short rationale"
}

Rules:
- For high/critical stakes, penalize overconfident claims and missing caveats.
- Factuality should reflect correctness likelihood for this prompt type.
- Task success should reflect whether the user can act on the answer immediately.`;
}

async function judgeResponse({ args, query, answer }) {
  if (args.dryRun) {
    return {
      task_success: 0.7,
      factuality: 0.7,
      safety: 0.8,
      notes: "dry-run synthetic score"
    };
  }

  const { baseUrl, apiKey } = getEvalUpstream();

  const payload = await callEvalChat({
    baseUrl,
    apiKey,
    model: args.judgeModel,
    prompt: buildJudgePrompt({ query, answer }),
    temperature: 0,
    maxTokens: 500
  });

  const content = payload?.choices?.[0]?.message?.content || "";
  try {
    const parsed = JSON.parse(content);
    return {
      task_success: Number(clamp(parsed.task_success ?? 0.5).toFixed(4)),
      factuality: Number(clamp(parsed.factuality ?? 0.5).toFixed(4)),
      safety: Number(clamp(parsed.safety ?? 0.5).toFixed(4)),
      notes: typeof parsed.notes === "string" ? parsed.notes : ""
    };
  } catch {
    return {
      task_success: 0.5,
      factuality: 0.5,
      safety: 0.5,
      notes: "judge parse fallback"
    };
  }
}

function summarize(results) {
  const total = results.length;
  const average = (key) => {
    if (total === 0) return 0;
    return Number((results.reduce((sum, item) => sum + (item.scores[key] || 0), 0) / total).toFixed(4));
  };

  const successes = results.filter((item) => item.scores.overall >= 0.7);
  const degraded = results.filter((item) => item.route.degraded);
  const degradedSuccesses = degraded.filter((item) => item.scores.overall >= 0.7);

  const validCosts = results
    .map((item) => item.usage.costUsd)
    .filter((value) => typeof value === "number" && Number.isFinite(value));

  const avgCost = validCosts.length
    ? Number((validCosts.reduce((sum, value) => sum + value, 0) / validCosts.length).toFixed(6))
    : null;

  const successfulCosts = successes
    .map((item) => item.usage.costUsd)
    .filter((value) => typeof value === "number" && Number.isFinite(value));

  const costPerSuccess = successfulCosts.length
    ? Number((successfulCosts.reduce((sum, value) => sum + value, 0) / successfulCosts.length).toFixed(6))
    : null;

  const latencies = results.map((item) => item.latencyMs).sort((a, b) => a - b);
  const p50 = latencies.length ? latencies[Math.floor(latencies.length * 0.5)] : 0;
  const p95 = latencies.length ? latencies[Math.floor(Math.max(0, Math.ceil(latencies.length * 0.95) - 1))] : 0;

  const byDomain = Object.create(null);
  for (const item of results) {
    const key = item.query.domain;
    byDomain[key] = byDomain[key] || { count: 0, overall: 0 };
    byDomain[key].count += 1;
    byDomain[key].overall += item.scores.overall;
  }

  for (const key of Object.keys(byDomain)) {
    byDomain[key].overall = Number((byDomain[key].overall / byDomain[key].count).toFixed(4));
  }

  const failures = [...results]
    .sort((a, b) => a.scores.overall - b.scores.overall)
    .slice(0, 10)
    .map((item) => ({
      id: item.query.id,
      prompt: item.query.prompt,
      overall: item.scores.overall,
      selectedModel: item.route.selectedModel,
      selectedProfile: item.route.selectedProfile,
      judgeNotes: item.judge.notes
    }));

  return {
    total_queries: total,
    averages: {
      overall: average("overall"),
      task_success: average("task_success"),
      constraint_fit: average("constraint_fit"),
      safety: average("safety"),
      factuality: average("factuality"),
      latency_cost_efficiency: average("latency_cost_efficiency")
    },
    router_metrics: {
      top1_route_success_rate: total ? Number((successes.length / total).toFixed(4)) : 0,
      fallback_invocation_rate: total ? Number((degraded.length / total).toFixed(4)) : 0,
      fallback_recovery_success_rate: degraded.length
        ? Number((degradedSuccesses.length / degraded.length).toFixed(4))
        : 0,
      cost_per_successful_query: costPerSuccess,
      average_cost_per_query: avgCost,
      p50_latency_ms: p50,
      p95_latency_ms: p95
    },
    by_domain: byDomain,
    lowest_scoring_cases: failures
  };
}

function markdownReport({ summary, runMeta, results }) {
  const lines = [];
  lines.push(`# Router Eval Report`);
  lines.push("");
  lines.push(`- Run ID: \`${runMeta.runId}\``);
  lines.push(`- Timestamp: \`${runMeta.timestamp}\``);
  lines.push(`- Mode: \`${runMeta.mode}\``);
  lines.push(`- Candidate: \`${runMeta.candidate}\``);
  lines.push(`- Queries: \`${summary.total_queries}\``);
  lines.push("");
  lines.push(`## Averages`);
  lines.push("");
  for (const [key, value] of Object.entries(summary.averages)) {
    lines.push(`- ${key}: ${value}`);
  }
  lines.push("");
  lines.push(`## Router Metrics`);
  lines.push("");
  for (const [key, value] of Object.entries(summary.router_metrics)) {
    lines.push(`- ${key}: ${value}`);
  }
  lines.push("");
  lines.push(`## Lowest Scoring Cases`);
  lines.push("");
  for (const item of summary.lowest_scoring_cases) {
    lines.push(`- ${item.id} | overall=${item.overall} | model=${item.selectedModel} | profile=${item.selectedProfile || "n/a"}`);
    lines.push(`  - prompt: ${item.prompt}`);
    lines.push(`  - judge: ${item.judgeNotes || ""}`);
  }
  lines.push("");
  lines.push(`## Per Query Snapshot`);
  lines.push("");
  lines.push(`| id | overall | model | profile | degraded | latency_ms |`);
  lines.push(`|---|---:|---|---|---|---:|`);
  for (const row of results) {
    lines.push(`| ${row.query.id} | ${row.scores.overall} | ${row.route.selectedModel} | ${row.route.selectedProfile || "n/a"} | ${row.route.degraded} | ${row.latencyMs} |`);
  }

  return lines.join("\n") + "\n";
}

async function main() {
  const args = parseArgs(process.argv);

  const specPath = path.resolve(args.spec);
  const specRaw = await fs.readFile(specPath, "utf8");
  const spec = JSON.parse(specRaw);

  const queries = Array.isArray(spec.query_bank) ? spec.query_bank.slice(0, args.limit) : [];
  if (queries.length === 0) {
    throw new Error("No queries found in spec file");
  }

  const weights = spec.success_definition?.scoring;
  if (!weights) {
    throw new Error("Missing success_definition.scoring in spec");
  }

  const runId = `${new Date().toISOString().replace(/[:.]/g, "-")}-${args.mode}`;
  const timestamp = new Date().toISOString();

  const results = [];

  for (const query of queries) {
    const queryStart = Date.now();

    let candidate;
    if (args.dryRun) {
      candidate = {
        content: `Dry-run answer for ${query.id}`,
        latencyMs: 50,
        selectedModel: args.mode === "router" ? "dry-run-selected-model" : args.model,
        selectedProfile: args.mode === "router" ? args.model : null,
        selectedCategory: args.mode === "router" ? "general" : null,
        degraded: false,
        usage: {
          totalTokens: 100,
          promptTokens: 40,
          completionTokens: 60,
          costUsd: 0.001
        }
      };
    } else {
      candidate = await runCandidateQuery({ args, prompt: query.prompt });
    }

    const judge = await judgeResponse({
      args,
      query,
      answer: candidate.content
    });

    const constraintFit = deterministicConstraintScore(query, candidate.content);
    const latencyCost = latencyCostScore(query, candidate.latencyMs, candidate.usage.costUsd);

    const componentScores = {
      task_success: judge.task_success,
      constraint_fit: constraintFit,
      safety: judge.safety,
      factuality: judge.factuality,
      latency_cost_efficiency: latencyCost
    };

    const overall = Number(clamp(scoreFormula(weights, componentScores)).toFixed(4));

    results.push({
      query,
      answer: candidate.content,
      latencyMs: candidate.latencyMs,
      elapsedMs: Date.now() - queryStart,
      route: {
        selectedModel: candidate.selectedModel,
        selectedProfile: candidate.selectedProfile,
        selectedCategory: candidate.selectedCategory,
        degraded: candidate.degraded
      },
      usage: candidate.usage,
      judge,
      scores: {
        ...componentScores,
        overall
      }
    });
  }

  const summary = summarize(results);

  const runMeta = {
    runId,
    timestamp,
    mode: args.mode,
    candidate: args.mode === "router" ? `profile:${args.model}` : args.model,
    judge_model: args.dryRun ? "dry-run" : args.judgeModel,
    dry_run: args.dryRun,
    seed: args.seed,
    spec_path: specPath
  };

  const outDir = path.resolve(args.outDir);
  await fs.mkdir(outDir, { recursive: true });

  const jsonPath = path.join(outDir, `${runId}.json`);
  const mdPath = path.join(outDir, `${runId}.md`);

  await fs.writeFile(
    jsonPath,
    JSON.stringify(
      {
        run_meta: runMeta,
        summary,
        results
      },
      null,
      2
    ) + "\n",
    "utf8"
  );

  await fs.writeFile(mdPath, markdownReport({ summary, runMeta, results }), "utf8");

  process.stdout.write(`Wrote report:\n- ${jsonPath}\n- ${mdPath}\n`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
