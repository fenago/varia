/**
 * Pilot results from varia_paper_v1.pdf (Tables 2 and 3). Static reference data
 * for the Trade-off surface page and the tooltips on the Generate page.
 */

export type PilotConditionKind = "frontier" | "ablation" | "reference";

export interface PilotCondition {
  key: string;
  /** Legend number on the Pareto chart (1–6), null for references */
  legend: number | null;
  name: string;
  kind: PilotConditionKind;
  joint: number;
  failure: number;
  cosine: number;
  equivalence: number;
  ngram: number;
  fleschSigma: number;
  /** For references: the plain-language failure mode drawn on the chart */
  chartNote?: string;
}

export const PILOT_CONDITIONS: PilotCondition[] = [
  { key: "no-construct-map-cot", legend: 3, name: "No-construct-map CoT", kind: "ablation", joint: 0.877, failure: 0.123, cosine: 0.079, equivalence: 0.95, ngram: 0.052, fleschSigma: 6.26 },
  { key: "structured-cot", legend: 2, name: "Structured chain-of-thought", kind: "frontier", joint: 0.876, failure: 0.124, cosine: 0.095, equivalence: 0.96, ngram: 0.088, fleschSigma: 5.47 },
  { key: "zero-shot", legend: 1, name: "Zero-shot", kind: "frontier", joint: 0.867, failure: 0.133, cosine: 0.086, equivalence: 0.968, ngram: 0.077, fleschSigma: 6.69 },
  { key: "dimension-preserving", legend: 4, name: "Dimension-preserving", kind: "frontier", joint: 0.819, failure: 0.181, cosine: 0.053, equivalence: 0.909, ngram: 0.014, fleschSigma: 11.29 },
  { key: "no-negative-anchors", legend: 6, name: "No-negative-anchors few-shot", kind: "ablation", joint: 0.807, failure: 0.193, cosine: 0.048, equivalence: 0.816, ngram: 0.02, fleschSigma: 10.38 },
  { key: "few-shot", legend: 5, name: "Few-shot", kind: "frontier", joint: 0.806, failure: 0.194, cosine: 0.051, equivalence: 0.838, ngram: 0.027, fleschSigma: 10.73 },
  { key: "llama-3.2-3b", legend: null, name: "Llama 3.2 3B Instruct", kind: "reference", joint: 0.552, failure: 0.448, cosine: 0.513, equivalence: 0.517, ngram: 0.533, fleschSigma: 5.28, chartNote: "Llama 3.2 3B — near-duplicate versions" },
  { key: "gpt-2-small", legend: null, name: "GPT-2 small", kind: "reference", joint: 0.497, failure: 0.503, cosine: 0.052, equivalence: 0.04, ngram: 0.0, fleschSigma: 44.88, chartNote: "GPT-2 small — degenerate output" },
];

export const PILOT_META = {
  variants: 600,
  cells: 60,
  frontierModels: ["Claude Opus 4.7", "GPT-5.5", "Gemini 3.1 Pro Preview"],
  judge: "Claude Sonnet 4.6",
  judgeSamples: 5,
  nPerCell: 10,
  seed: 42,
  citation: "Lee, E. (2026). VARIA: Benchmarking Frontier LLMs on Construct-Equivalent Assessment Variant Generation. Miami Dade College.",
};

export const RECOMMENDED_BY_COURSE_TYPE = [
  {
    title: "High-stakes credentialling",
    body: "Zero-shot or structured CoT. Highest equivalence, tightest difficulty parity.",
  },
  {
    title: "Large-enrolment formative",
    body: "Few-shot with negative anchors, or dimension-preserving. Buys surface separation; rubric validation absorbs the equivalence cost.",
  },
  {
    title: "Any course",
    body: "A frontier generator. All four strategies sit on the same side of a 30–38 point capability gap.",
  },
];
