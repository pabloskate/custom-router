import type { ModelIntelligenceMetricFact, ModelIntelligenceModel, ProfileBuilderSource } from "../shared";
import { benchmarkClaimFact, fact } from "../shared";

const VERIFIED_AT = "2026-06-17";

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

function artificialAnalysisSource(slug: string, label: string): ProfileBuilderSource {
  return currentSource(label, `https://artificialanalysis.ai/models/${slug}`);
}

function openRouterModelSource(modelId: string, label: string): ProfileBuilderSource {
  return currentSource(label, `https://openrouter.ai/${modelId}`);
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

export const OSS_FRONTIER_REGISTRY_ENTRIES: readonly ModelIntelligenceModel[] = [
  {
    id: "z-ai/glm-5.2",
    name: "GLM 5.2",
    supportedGateways: ["openrouter"],
    modality: "text->text",
    openSource: true,
    structuredOutput: true,
    toolUse: true,
    vision: false,
    contextWindow: 1_048_576,
    lastVerified: VERIFIED_AT,
    metrics: [
      ...openRouterOperationalFacts({
        contextWindow: 1_048_576,
        inputPricePerMillion: 1.4,
        outputPricePerMillion: 4.4,
      }),
      artificialAnalysisBenchmarkFact({
        metricId: "artificial_analysis_intelligence_index",
        label: "Artificial Analysis Intelligence Index",
        slug: "glm-5-2",
        sourceLabel: "Artificial Analysis - GLM-5.2",
        value: 51,
        unit: "index",
        note: "Artificial Analysis search result on 2026-06-17 identifies the current GLM-5.2 reasoning page and score.",
      }),
      benchmarkClaimFact({
        metricId: "openrouter_agentic_coding_positioning",
        label: "OpenRouter model positioning",
        value: "long-horizon agent workflows, project-level software engineering, and complex multi-step automation",
        unit: "description",
        source: openRouterModelSource("z-ai/glm-5.2", "OpenRouter - GLM 5.2"),
      }),
    ],
    lenses: [
      {
        lens: "coding_quality",
        rank: 1,
        rationale: "Best OSS-frontier escalation lane in this preset for project-level software engineering and complex multi-step planning.",
      },
      {
        lens: "long_context",
        rank: 2,
        rationale: "1M-class context with explicit long-horizon agent workflow positioning.",
      },
      {
        lens: "open_source",
        rank: 1,
        rationale: "Current GLM flagship open-weight model for complex coding and planning tasks.",
      },
    ],
    derived: {
      taskFamilies: ["coding", "agentic_coding", "long_context", "research"],
      strengths: ["Complex planning", "Project-level software engineering", "1M-class context", "Open weights"],
      caveats: ["Text-only deployable ID", "Pricier than MiniMax M3 and DeepSeek V4 Flash"],
      whenToUse: "Complex coding, architecture planning, difficult refactors, and long-horizon agent work where deliberate text reasoning matters more than vision or minimum cost.",
      profileBuilder: {
        contextBand: "ultra",
        costTier: "mid",
        quality: 3,
        speed: 2,
        cost: 1,
        reliability: 2,
      },
    },
  },
  {
    id: "moonshotai/kimi-k2.7-code",
    name: "Kimi K2.7 Code",
    supportedGateways: ["openrouter"],
    modality: "text,image->text",
    openSource: true,
    structuredOutput: true,
    toolUse: true,
    vision: true,
    contextWindow: 262_144,
    lastVerified: VERIFIED_AT,
    metrics: [
      ...openRouterOperationalFacts({
        contextWindow: 262_144,
        inputPricePerMillion: 0.74,
        outputPricePerMillion: 3.5,
      }),
      benchmarkClaimFact({
        metricId: "openrouter_multimodal_coding_positioning",
        label: "OpenRouter model positioning",
        value: "native multimodal coding model for end-to-end programming, long-horizon coding, agentic decomposition, and multi-turn dialogue",
        unit: "description",
        source: openRouterModelSource("moonshotai/kimi-k2.7-code", "OpenRouter - Kimi K2.7 Code"),
      }),
    ],
    lenses: [
      {
        lens: "frontend_ui",
        rank: 1,
        rationale: "Vision-capable coding specialist selected for screenshots, UI implementation, and less-complex multimodal coding tasks.",
      },
      {
        lens: "multimodal",
        rank: 2,
        rationale: "Native text-plus-image coding model with enough context for most frontend and visual debugging loops.",
      },
      {
        lens: "coding_value",
        rank: 2,
        rationale: "Coding-focused model with lower cost than premium closed frontier models while retaining vision.",
      },
    ],
    derived: {
      taskFamilies: ["coding", "agentic_coding", "multimodal"],
      strengths: ["Vision-capable coding", "Frontend/UI implementation", "Agentic coding decomposition", "Open weights"],
      caveats: ["New model with limited independent benchmark coverage in this run", "Shorter context than GLM 5.2 and MiniMax M3"],
      whenToUse: "Vision-related coding, screenshot debugging, UI/frontend implementation, and ordinary coding tasks that do not need GLM 5.2's deeper planning lane.",
      profileBuilder: {
        contextBand: "long",
        costTier: "efficient",
        quality: 3,
        speed: 2,
        cost: 2,
        reliability: 2,
      },
    },
  },
  {
    id: "minimax/minimax-m3",
    name: "MiniMax M3",
    supportedGateways: ["openrouter"],
    modality: "text,image,video->text",
    openSource: false,
    structuredOutput: true,
    toolUse: true,
    vision: true,
    contextWindow: 1_048_576,
    lastVerified: VERIFIED_AT,
    metrics: [
      ...openRouterOperationalFacts({
        contextWindow: 1_048_576,
        inputPricePerMillion: 0.3,
        outputPricePerMillion: 1.2,
      }),
      artificialAnalysisBenchmarkFact({
        metricId: "artificial_analysis_intelligence_index",
        label: "Artificial Analysis Intelligence Index",
        slug: "minimax-m3",
        sourceLabel: "Artificial Analysis - MiniMax-M3",
        value: 55,
        unit: "index",
        note: "Artificial Analysis search result on 2026-06-17 reports MiniMax-M3 scoring 55 on the Intelligence Index.",
      }),
      benchmarkClaimFact({
        metricId: "openrouter_agentic_long_context_positioning",
        label: "OpenRouter model positioning",
        value: "1M-token multimodal model suited for long-horizon agentic work, coding, and tool use",
        unit: "description",
        source: openRouterModelSource("minimax/minimax-m3", "OpenRouter - MiniMax M3"),
      }),
    ],
    lenses: [
      {
        lens: "research",
        rank: 1,
        rationale: "Best fit in this preset for codebase research, repository Q&A, and broad synthesis because it combines 1M context, low cost, and multimodal inputs.",
      },
      {
        lens: "long_context",
        rank: 1,
        rationale: "1M-class context at the lowest output price in the routed pool.",
      },
      {
        lens: "coding_value",
        rank: 1,
        rationale: "Strong general intelligence and coding positioning at MiniMax M2.7-like pricing.",
      },
    ],
    derived: {
      taskFamilies: ["coding", "agentic_coding", "research", "long_context", "multimodal"],
      strengths: ["Codebase research", "1M-context synthesis", "Low-cost multimodal context", "Tool-use positioning"],
      caveats: ["Not the deepest planning lane versus GLM 5.2", "Use Kimi for visual implementation rather than broad codebase Q&A"],
      whenToUse: "Codebase research, repository questions, large-context synthesis, and broad code/document reading before implementation decisions.",
      profileBuilder: {
        contextBand: "ultra",
        costTier: "efficient",
        quality: 3,
        speed: 2,
        cost: 3,
        reliability: 2,
      },
    },
  },
];
