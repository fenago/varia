import type { Property, Strategy, ThreatProfile, ThresholdSet } from "./types";

/** Institution defaults, as shown on the compliance console. */
export const DEFAULT_THRESHOLDS: ThresholdSet = {
  version: 2,
  setAt: "2026-08-28T16:15:00-04:00",
  setBy: "Assessment office",
  p1Cosine: 0.15,
  p2Equivalence: 0.9,
  p3: "advisory",
  p4FleschSigma: 8.0,
};

/** Frontier band from the pilot, shown for context next to J. */
export const FRONTIER_BAND: [number, number] = [0.81, 0.88];

/** How the app words each property. Keep in sync with the Design notes table. */
export const PROPERTY_LABELS: Record<
  Property,
  {
    paper: string;
    label: string;
    measuredBy: string;
    gateText: string;
    tooltip: string;
    ifFails: string;
    whatYouDo: string;
  }
> = {
  p1: {
    paper: "P1 Surface diversity",
    label: "Versions look different",
    measuredBy: "Pairwise embedding cosine, 4-gram overlap",
    gateText: "cosine ≤ 0.15",
    tooltip: "P1 — mean pairwise TF-IDF n-gram cosine (pilot proxy for all-mpnet-base-v2), τdiv ≤ 0.15",
    ifFails: "Two students could swap answers and both score well.",
    whatYouDo: "Add a surface dimension, or raise the version count.",
  },
  p2: {
    paper: "P2 Construct equivalence",
    label: "Same skill measured",
    measuredBy: "LLM judge, 5-sample self-consistency",
    gateText: "≥ 0.90",
    tooltip: "P2 — LLM judge construct equivalence, median of 5 self-consistency samples, τeq ≥ 0.90",
    ifFails: "Some versions quietly test a different competency than your rubric grades.",
    whatYouDo: "Tighten the construct description, regenerate the flagged versions.",
  },
  p3: {
    paper: "P3 Rubric stability",
    label: "One rubric grades them all",
    measuredBy: "Canonical-solution dispersion (proxy)",
    gateText: "advisory",
    tooltip: "P3 — approximated by cross-variant readability dispersion of the canonical solution; full rubric re-application is pre-registered, not yet implemented",
    ifFails: "Your criteria may not map cleanly onto some scenarios.",
    whatYouDo: "Spot-check three versions against the rubric by hand.",
  },
  p4: {
    paper: "P4 Difficulty parity",
    label: "Equally hard to read",
    measuredBy: "σ Flesch reading-ease",
    gateText: "≤ 8.0",
    tooltip: "P4 — standard deviation of Flesch reading-ease across the variant set, τdiff ≤ 8.0",
    ifFails: "A few students got a materially harder task — an appeal risk.",
    whatYouDo: "Regenerate the named versions. The report lists them.",
  },
};

export const STRATEGY_LABELS: Record<Strategy, string> = {
  "zero-shot": "Zero-shot",
  "few-shot": "Few-shot with anchors",
  "structured-cot": "Structured chain-of-thought",
  "dimension-preserving": "Dimension-preserving",
};

/** Threat profile → strategy, per paper §6. */
export const THREAT_TO_STRATEGY: Record<Exclude<ThreatProfile, "manual">, Strategy> = {
  "high-stakes": "structured-cot",
  "copy-at-scale": "dimension-preserving",
};

export const THREAT_OPTIONS: {
  id: ThreatProfile;
  title: string;
  description: string;
}[] = [
  {
    id: "high-stakes",
    title: "A student passing off someone else's answer as their own",
    description:
      "High-stakes credentialling. Prioritises measuring the same skill and equal difficulty. → structured chain-of-thought, construct equivalence 0.96, σFlesch 5.5",
  },
  {
    id: "copy-at-scale",
    title: "Answers circulating in a group chat, copy-pasted at scale",
    description:
      "Large-enrolment formative work. Prioritises maximum surface separation. → dimension-preserving generation, cosine 0.05, difficulty drift accepted",
  },
  {
    id: "manual",
    title: "Let me set the strategy myself",
    description: "Zero-shot · few-shot with anchors · structured CoT · dimension-preserving",
  },
];

/** Joint score weights, equal by default (paper headline configuration). */
export const JOINT_WEIGHTS = { p1: 0.25, p2: 0.25, p3: 0.25, p4: 0.25 } as const;

/** Normalisation ceilings for σ components of J (σ̃ = min(σ/ceiling, 1)). */
export const SIGMA_CEILING = { flesch: 45, rubricProxy: 45 } as const;

/** Rough cost model for the estimate on the Generate page (USD). */
export const COST_MODEL = {
  perVariantGeneration: 0.006,
  perJudgeSample: 0.0025,
  perVariantSeconds: 20,
} as const;

/** Pill vocabulary → CSS class. */
export const PILL_CLASS: Record<Gate | "watch", string> = {
  pass: "va-pass",
  fail: "va-fail",
  advisory: "va-watch",
  watch: "va-watch",
};
type Gate = "pass" | "fail" | "advisory";
