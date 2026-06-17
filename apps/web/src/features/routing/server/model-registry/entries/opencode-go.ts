import type { ModelIntelligenceMetricFact, ModelIntelligenceModel, ProfileBuilderSource } from "../shared";
import { benchmarkClaimFact, fact, opencodeGoAvailabilityFacts } from "../shared";

const VERIFIED_AT = "2026-04-27";
const DEEPSEEK_V4_FLASH_OPENROUTER_VERIFIED_AT = "2026-06-17";

function currentSource(label: string, url: string): ProfileBuilderSource {
  return { label, url, verifiedAt: VERIFIED_AT };
}

function openRouterOperationalFacts(args: {
  contextWindow: number;
  inputPricePerMillion: number;
  outputPricePerMillion: number;
}): ModelIntelligenceMetricFact[] {
  const apiSource = currentSource("OpenRouter models API", "https://openrouter.ai/api/v1/models");
  return [
    fact({
      metricId: "openrouter_context_window_tokens",
      label: "OpenRouter context window",
      kind: "context",
      value: args.contextWindow,
      unit: "tokens",
      direction: "higher_better",
      source: apiSource,
    }),
    fact({
      metricId: "openrouter_input_price_per_million",
      label: "OpenRouter input price",
      kind: "cost",
      value: args.inputPricePerMillion,
      unit: "usd_per_million_tokens",
      direction: "lower_better",
      source: apiSource,
    }),
    fact({
      metricId: "openrouter_output_price_per_million",
      label: "OpenRouter output price",
      kind: "cost",
      value: args.outputPricePerMillion,
      unit: "usd_per_million_tokens",
      direction: "lower_better",
      source: apiSource,
    }),
  ];
}

function deepseekV4FlashOpenRouterOperationalFacts(): ModelIntelligenceMetricFact[] {
  const apiSource = {
    label: "OpenRouter models API",
    url: "https://openrouter.ai/api/v1/models",
    verifiedAt: DEEPSEEK_V4_FLASH_OPENROUTER_VERIFIED_AT,
  };
  return [
    fact({
      metricId: "openrouter_context_window_tokens",
      label: "OpenRouter context window",
      kind: "context",
      value: 1_048_576,
      unit: "tokens",
      direction: "higher_better",
      source: apiSource,
    }),
    fact({
      metricId: "openrouter_input_price_per_million",
      label: "OpenRouter input price",
      kind: "cost",
      value: 0.09,
      unit: "usd_per_million_tokens",
      direction: "lower_better",
      source: apiSource,
    }),
    fact({
      metricId: "openrouter_output_price_per_million",
      label: "OpenRouter output price",
      kind: "cost",
      value: 0.18,
      unit: "usd_per_million_tokens",
      direction: "lower_better",
      source: apiSource,
    }),
  ];
}

function artificialAnalysisSource(slug: string, label: string): ProfileBuilderSource {
  return currentSource(label, `https://artificialanalysis.ai/models/${slug}`);
}

function artificialAnalysisBenchmarkFact(args: {
  metricId: string;
  label: string;
  slug: string;
  sourceLabel: string;
  value: number;
  unit: string;
  note?: string;
}): ModelIntelligenceMetricFact {
  return benchmarkClaimFact({
    metricId: args.metricId,
    label: args.label,
    value: args.value,
    unit: args.unit,
    source: artificialAnalysisSource(args.slug, args.sourceLabel),
    note: args.note,
  });
}

export const OPENCODE_GO_REGISTRY_ENTRIES: readonly ModelIntelligenceModel[] = [
  {
    id: "moonshotai/kimi-k2.6",
    name: "Kimi K2.6",
    supportedGateways: ["opencode-go"],
    modality: "text,image->text",
    openSource: true,
    structuredOutput: true,
    toolUse: true,
    vision: true,
    contextWindow: 256_000,
    lastVerified: VERIFIED_AT,
    metrics: [
      ...opencodeGoAvailabilityFacts("kimi-k2.6"),
      ...openRouterOperationalFacts({
        contextWindow: 256_000,
        inputPricePerMillion: 0.7448,
        outputPricePerMillion: 4.655,
      }),
      artificialAnalysisBenchmarkFact({
        metricId: "artificial_analysis_intelligence_index",
        label: "Artificial Analysis Intelligence Index",
        slug: "kimi-k2-6",
        sourceLabel: "Artificial Analysis - Kimi K2.6",
        value: 54,
        unit: "index",
      }),
      artificialAnalysisBenchmarkFact({
        metricId: "artificial_analysis_coding_index",
        label: "Artificial Analysis Coding Index",
        slug: "kimi-k2-6",
        sourceLabel: "Artificial Analysis - Kimi K2.6",
        value: 47,
        unit: "index",
        note: "User-provided Artificial Analysis screenshot captured on 2026-04-27 shows Kimi K2.6 tied with DeepSeek V4 Pro at the top of the selected coding-index set.",
      }),
    ],
    lenses: [
      {
        lens: "open_source",
        rank: 2,
        rationale: "Strongest current OpenCode Go default candidate by overall quality and coding-index balance, while still preserving open-model deployment.",
      },
      {
        lens: "coding_quality",
        rank: 2,
        rationale: "Best safe default in the OpenCode Go shortlist for everyday implementation and long-horizon coding.",
      },
      {
        lens: "frontend_ui",
        rank: 5,
        rationale: "Kimi K2.6 carries the only current vision-capable signal in the OpenCode Go shortlist via the OpenRouter model metadata.",
      },
    ],
    derived: {
      taskFamilies: ["coding", "agentic_coding", "general", "multimodal"],
      strengths: ["Strong coding-index result", "Good default for ambiguous implementation work", "Vision-capable model metadata", "Open weights"],
      caveats: ["Higher Go quota burn than DeepSeek V4 Flash or MiniMax M2.7", "Use a cheaper model for tiny edits and hot-path routing"],
      whenToUse: "Default OpenCode Go lane for ordinary implementation, bug fixing, frontend work, and ambiguous coding requests where quality matters more than preserving request limits.",
      profileBuilder: {
        contextBand: "long",
        costTier: "premium",
        quality: 3,
        speed: 2,
        cost: 1,
        reliability: 2,
      },
    },
  },
  {
    id: "deepseek/deepseek-v4-pro",
    name: "DeepSeek V4 Pro",
    supportedGateways: ["openrouter", "opencode-go"],
    modality: "text->text",
    openSource: true,
    structuredOutput: true,
    toolUse: true,
    vision: false,
    contextWindow: 1_048_576,
    lastVerified: VERIFIED_AT,
    metrics: [
      ...opencodeGoAvailabilityFacts("deepseek-v4-pro"),
      ...openRouterOperationalFacts({
        contextWindow: 1_048_576,
        inputPricePerMillion: 0.435,
        outputPricePerMillion: 0.87,
      }),
      artificialAnalysisBenchmarkFact({
        metricId: "artificial_analysis_intelligence_index",
        label: "Artificial Analysis Intelligence Index",
        slug: "deepseek-v4-pro",
        sourceLabel: "Artificial Analysis - DeepSeek V4 Pro",
        value: 52,
        unit: "index",
      }),
      artificialAnalysisBenchmarkFact({
        metricId: "artificial_analysis_gdpval_aa",
        label: "Artificial Analysis GDPval-AA",
        slug: "deepseek-v4-pro",
        sourceLabel: "Artificial Analysis - DeepSeek V4 Pro",
        value: 1554,
        unit: "elo",
        note: "Artificial Analysis article published April 2026 identifies DeepSeek V4 Pro as the leading open-weight model on GDPval-AA.",
      }),
      artificialAnalysisBenchmarkFact({
        metricId: "artificial_analysis_non_hallucination_rate",
        label: "Artificial Analysis non-hallucination rate",
        slug: "deepseek-v4-pro",
        sourceLabel: "Artificial Analysis - DeepSeek V4 Pro",
        value: 6,
        unit: "percent",
        note: "User-provided Artificial Analysis screenshot captured on 2026-04-27 shows a very low non-hallucination rate; route factual open-ended questions carefully.",
      }),
    ],
    lenses: [
      {
        lens: "long_context",
        rank: 6,
        rationale: "Best OpenCode Go lane for large repo context and deep multi-step work because it exposes a 1M-class context window.",
      },
      {
        lens: "coding_quality",
        rank: 3,
        rationale: "Strong hard-task and agentic benchmark profile, but less safe than Kimi for ambiguous factual or support-style prompts.",
      },
      {
        lens: "open_source",
        rank: 3,
        rationale: "High-end open-weight reasoning and coding option with a large context window.",
      },
    ],
    derived: {
      taskFamilies: ["coding", "agentic_coding", "long_context", "research"],
      strengths: ["1M-class context", "Strong agentic benchmark result", "Good hard-problem escalation lane", "Open weights"],
      caveats: ["Very low non-hallucination benchmark signal", "Use when outputs can be checked against code, tests, or provided context"],
      whenToUse: "Hard repo-wide debugging, multi-step planning, deep refactors, and large-context engineering work where the answer can be grounded in code or supplied artifacts.",
      profileBuilder: {
        contextBand: "ultra",
        costTier: "efficient",
        quality: 3,
        speed: 1,
        cost: 2,
        reliability: 1,
      },
    },
  },
  {
    id: "deepseek/deepseek-v4-flash",
    name: "DeepSeek V4 Flash",
    supportedGateways: ["opencode-go"],
    modality: "text->text",
    openSource: true,
    structuredOutput: true,
    toolUse: true,
    vision: false,
    contextWindow: 1_048_576,
    lastVerified: VERIFIED_AT,
    metrics: [
      ...opencodeGoAvailabilityFacts("deepseek-v4-flash"),
      ...deepseekV4FlashOpenRouterOperationalFacts(),
      artificialAnalysisBenchmarkFact({
        metricId: "artificial_analysis_intelligence_index",
        label: "Artificial Analysis Intelligence Index",
        slug: "deepseek-v4-flash",
        sourceLabel: "Artificial Analysis - DeepSeek V4 Flash",
        value: 47,
        unit: "index",
      }),
      fact({
        metricId: "artificial_analysis_cost_to_run_index",
        label: "Artificial Analysis index cost",
        kind: "cost",
        value: 113,
        unit: "usd",
        direction: "lower_better",
        source: artificialAnalysisSource("deepseek-v4-flash", "Artificial Analysis - DeepSeek V4 Flash"),
        note: "Artificial Analysis article published April 2026 reports DeepSeek V4 Flash as much cheaper than V4 Pro on the Intelligence Index run.",
      }),
    ],
    lenses: [
      {
        lens: "classifier_candidate",
        rank: 3,
        rationale: "Best OpenCode Go hot-path router candidate: cheap, 1M-class context, structured-output capable, and explicitly positioned as the Flash member of the V4 family.",
      },
      {
        lens: "budget_text",
        rank: 1,
        rationale: "Best OpenCode Go high-volume text lane for tiny patches, routing, and simple coding turns.",
      },
      {
        lens: "long_context",
        rank: 7,
        rationale: "Useful 1M-class context fallback when the user asks for speed or quota preservation over maximum depth.",
      },
    ],
    derived: {
      taskFamilies: ["coding", "agentic_coding", "long_context", "support"],
      strengths: ["Very cheap OpenCode Go lane", "1M-class context", "Best router-model economics in the shortlist", "Open weights"],
      caveats: ["Below DeepSeek V4 Pro and Kimi K2.6 on hard quality", "Weak non-hallucination benchmark signal"],
      whenToUse: "Classifier routing, simple code edits, small fixes, lint/test assistance, and high-volume text tasks where preserving OpenCode Go request limits matters.",
      profileBuilder: {
        contextBand: "ultra",
        costTier: "budget",
        quality: 2,
        speed: 3,
        cost: 3,
        reliability: 1,
      },
    },
  },
  {
    id: "z-ai/glm-5.1",
    name: "GLM 5.1",
    supportedGateways: ["opencode-go"],
    modality: "text->text",
    openSource: true,
    structuredOutput: true,
    toolUse: true,
    vision: false,
    contextWindow: 202_752,
    lastVerified: VERIFIED_AT,
    metrics: [
      ...opencodeGoAvailabilityFacts("glm-5.1"),
      ...openRouterOperationalFacts({
        contextWindow: 202_752,
        inputPricePerMillion: 1.05,
        outputPricePerMillion: 3.5,
      }),
      artificialAnalysisBenchmarkFact({
        metricId: "artificial_analysis_intelligence_index",
        label: "Artificial Analysis Intelligence Index",
        slug: "glm-5-1",
        sourceLabel: "Artificial Analysis - GLM 5.1",
        value: 51,
        unit: "index",
      }),
      artificialAnalysisBenchmarkFact({
        metricId: "artificial_analysis_t2_bench_telecom",
        label: "Artificial Analysis tau2-Bench Telecom",
        slug: "glm-5-1",
        sourceLabel: "Artificial Analysis - GLM 5.1",
        value: 98,
        unit: "percent",
        note: "User-provided Artificial Analysis screenshot captured on 2026-04-27 shows GLM 5.1 leading the selected tau2-Bench Telecom set.",
      }),
    ],
    lenses: [
      {
        lens: "structured_output",
        rank: 2,
        rationale: "Strong OpenCode Go option for stricter plans, exact instructions, and workflow-style tasks.",
      },
      {
        lens: "coding_quality",
        rank: 4,
        rationale: "Good architecture and review lane when you want a deliberate text-only model instead of the Kimi default.",
      },
      {
        lens: "open_source",
        rank: 4,
        rationale: "Current GLM family option for OpenCode Go with strong structured workflow evidence.",
      },
    ],
    derived: {
      taskFamilies: ["coding", "agentic_coding", "general", "support"],
      strengths: ["Strong instruction and workflow benchmark signal", "Good architecture/review fit", "Structured-output capable", "Open weights"],
      caveats: ["Higher Go quota burn than DeepSeek V4 Flash or MiniMax M2.7", "Text-only"],
      whenToUse: "Architecture reviews, migration plans, careful step-by-step implementation guidance, and strict workflow or structured-output tasks.",
      profileBuilder: {
        contextBand: "long",
        costTier: "premium",
        quality: 3,
        speed: 2,
        cost: 1,
        reliability: 2,
      },
    },
  },
];
