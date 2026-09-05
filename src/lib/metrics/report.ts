/**
 * Assembles the IntegrityReport for a run from stored per-variant metrics and
 * the institution's ThresholdSet. Pure: no clock beyond `computedAt`, no store.
 *
 * Gates (CLAUDE.md): release is gated on P1, P2, P4 individually; P3 is a
 * provisional proxy and always advisory; J is context, never the gate.
 */
import type {
  Check,
  IntegrityReport,
  JudgeSample,
  Property,
  Run,
  ThresholdSet,
  Variant,
  VariantMetrics,
} from "@shared/types";
import { JOINT_WEIGHTS, PROPERTY_LABELS, SIGMA_CEILING } from "@shared/thresholds";
import { DEFAULT_ADVANCED } from "@shared/types";
import { METRICS_VERSION } from "./version";
import { fleschReadingEase, stepCount, typeTokenRatio } from "./flesch";
import { pairwiseJaccard4Mean } from "./ngram";
import { pairwiseCosineMean } from "./cosine";
import { stripSharedBoilerplate } from "./boilerplate";
import { clamp01, mean, median, stddev } from "./stats";

/** Bar geometry: the x-axis span each metric is drawn against. */
const BAR_SPAN = { cosine: 0.6, fleschSigma: 25 } as const;

/** Variants that count toward set-level metrics and can be named as outliers. */
export function isScorable(v: Variant): boolean {
  return v.status !== "rejected" && !v.error;
}

/** Per-variant metrics that need no LLM call. */
export function computeVariantMetrics(
  text: string,
  adaptedSolution: string,
): Omit<VariantMetrics, "equivalence" | "judgeSamples"> {
  return {
    fleschEase: fleschReadingEase(text),
    lexicalComplexity: typeTokenRatio(text),
    stepCount: stepCount(adaptedSolution),
    solutionFleschEase: fleschReadingEase(adaptedSolution),
  };
}

/**
 * P2 aggregation: per dimension, median across samples; mean across dimensions;
 * normalise (x − 1) / 4 from the 1..5 scale; clamp to [0, 1]. null if no samples
 * or no numeric scores.
 */
export function aggregateJudge(samples: JudgeSample[]): number | null {
  if (samples.length === 0) return null;
  const dims = new Set<string>();
  for (const s of samples) for (const k of Object.keys(s.dimensionScores ?? {})) dims.add(k);
  const medians: number[] = [];
  for (const d of dims) {
    const vals: number[] = [];
    for (const s of samples) {
      const v = s.dimensionScores?.[d];
      if (typeof v === "number" && Number.isFinite(v)) vals.push(v);
    }
    if (vals.length > 0) medians.push(median(vals));
  }
  if (medians.length === 0) return null;
  return clamp01((mean(medians) - 1) / 4);
}

export interface OutlierContext {
  fleschMean: number;
  fleschSigma: number;
  p4Fails: boolean;
  p2Fails: boolean;
  p2Threshold: number;
  /** Wave 6c: k in "more than k·σ harder than the mean" (default 1.0) */
  sigma?: number;
  /** Wave 6c: always name at least this many hardest when P4 fails (default 3) */
  minNamed?: number;
}

/** Report-time options (wave 6c). */
export interface ReportOptions {
  outlierSigma?: number;
  outlierMinNamed?: number;
  /** Step count of the canonical solution, for the P3 step-mismatch advisory */
  canonicalStepCount?: number | null;
}

/**
 * Variants named by a failing check, unique, in original order.
 *  - P4 fails: fleschEase < mean − 1.0·σ (harder to read than the set), and
 *    always at least the three lowest-Flesch variants.
 *  - P2 fails: equivalence < threshold.
 * Rejected / errored variants are never named.
 */
export function detectOutliers(variants: Variant[], report: OutlierContext): string[] {
  const eligible = variants.filter(isScorable);
  const named = new Set<string>();

  if (report.p4Fails && eligible.length > 0) {
    const k = report.sigma ?? DEFAULT_ADVANCED.outlierSigma;
    const minNamed = report.minNamed ?? DEFAULT_ADVANCED.outlierMinNamed;
    const cutoff = report.fleschMean - k * report.fleschSigma;
    for (const v of eligible) if (v.metrics.fleschEase < cutoff) named.add(v.id);
    const lowest = [...eligible].sort((a, b) => a.metrics.fleschEase - b.metrics.fleschEase);
    for (const v of lowest.slice(0, Math.max(0, minNamed))) named.add(v.id);
  }

  if (report.p2Fails) {
    for (const v of eligible) {
      const e = v.metrics.equivalence;
      if (e !== null && e < report.p2Threshold) named.add(v.id);
    }
  }

  return eligible.filter((v) => named.has(v.id)).map((v) => v.id);
}

export interface CheckInputs {
  cosineMean: number;
  equivalenceMean: number;
  rubricProxySigma: number;
  fleschSigma: number;
  fleschMean: number;
  /** Variants named by the P4 rule (used for the note's k and grade gap). */
  p4Outliers: Variant[];
  /** Variant ids named by the P2 rule. */
  p2Outliers: string[];
  /** Wave 6c: versions whose adapted solution's step count differs from the canonical by > 2 */
  stepMismatch?: number;
  /** Wave 6c (v3): shared lines removed before P1 metrics */
  boilerplateLinesRemoved?: number;
}

const fmt = (x: number, d: number) => (Number.isFinite(x) ? x.toFixed(d) : "—");

/** The four Check objects, wording per the mockup. */
export function buildChecks(inputs: CheckInputs, thresholds: ThresholdSet): Record<Property, Check> {
  const { cosineMean, equivalenceMean, rubricProxySigma, fleschSigma, fleschMean } = inputs;

  const p1Pass = cosineMean <= thresholds.p1Cosine;
  const p2Pass = equivalenceMean >= thresholds.p2Equivalence;
  const p4Pass = fleschSigma <= thresholds.p4FleschSigma;

  let p4Note: string | null = null;
  if (!p4Pass) {
    const k = inputs.p4Outliers.length;
    const outlierMean = mean(inputs.p4Outliers.map((v) => v.metrics.fleschEase));
    const g = Math.max(1, Math.round((fleschMean - outlierMean) / 10));
    p4Note = `${k} versions read ${g} grade levels above the rest. Regenerate those ${k}, or loosen the jargon register.`;
  }

  return {
    p1: {
      property: "p1",
      label: PROPERTY_LABELS.p1.label,
      metricLabel: `cosine ${fmt(cosineMean, 3)}`,
      detail:
        PROPERTY_LABELS.p1.tooltip +
        (inputs.boilerplateLinesRemoved
          ? `. Computed on the scenario text after removing ${inputs.boilerplateLinesRemoved} line${inputs.boilerplateLinesRemoved === 1 ? "" : "s"} shared by most versions`
          : ""),
      value: cosineMean,
      threshold: thresholds.p1Cosine,
      barFill: clamp01(1 - cosineMean / BAR_SPAN.cosine),
      barTick: 1 - thresholds.p1Cosine / BAR_SPAN.cosine,
      gate: p1Pass ? "pass" : "fail",
      note: p1Pass
        ? null
        : "Versions are too alike to deter copying. Add a surface dimension or raise the version count.",
    },
    p2: {
      property: "p2",
      label: PROPERTY_LABELS.p2.label,
      metricLabel: `equivalence ${fmt(equivalenceMean, 3)}`,
      detail: PROPERTY_LABELS.p2.tooltip,
      value: equivalenceMean,
      threshold: thresholds.p2Equivalence,
      barFill: clamp01(equivalenceMean),
      barTick: thresholds.p2Equivalence,
      gate: p2Pass ? "pass" : "fail",
      note: p2Pass
        ? null
        : `${inputs.p2Outliers.length} versions drift from the construct. Regenerate the named versions.`,
    },
    p3: {
      property: "p3",
      label: PROPERTY_LABELS.p3.label,
      metricLabel: "provisional proxy",
      detail: PROPERTY_LABELS.p3.tooltip,
      value: rubricProxySigma,
      threshold: null,
      barFill: clamp01(1 - rubricProxySigma / SIGMA_CEILING.rubricProxy),
      barTick: null,
      gate: "advisory",
      note:
        inputs.stepMismatch && inputs.stepMismatch > 0
          ? `Measured by proxy. ${inputs.stepMismatch} version${inputs.stepMismatch === 1 ? "'s" : "s'"} adapted solution${inputs.stepMismatch === 1 ? " has" : "s have"} a different number of steps from the canonical answer. Spot-check those against the rubric before release.`
          : "Measured by proxy. Spot-check three versions against the rubric before release.",
    },
    p4: {
      property: "p4",
      label: PROPERTY_LABELS.p4.label,
      metricLabel: `σ Flesch ${fmt(fleschSigma, 1)}`,
      detail: PROPERTY_LABELS.p4.tooltip,
      value: fleschSigma,
      threshold: thresholds.p4FleschSigma,
      barFill: clamp01(1 - fleschSigma / BAR_SPAN.fleschSigma),
      barTick: 1 - thresholds.p4FleschSigma / BAR_SPAN.fleschSigma,
      gate: p4Pass ? "pass" : "fail",
      note: p4Note,
    },
  };
}

/** Equal-weight joint score J = Σ w·component, σ̃ = min(σ/ceiling, 1). */
export function jointScore(
  cosineMean: number,
  equivalenceMean: number,
  rubricProxySigma: number,
  fleschSigma: number,
): number {
  const sR = Math.min(rubricProxySigma / SIGMA_CEILING.rubricProxy, 1);
  const sF = Math.min(fleschSigma / SIGMA_CEILING.flesch, 1);
  return clamp01(
    JOINT_WEIGHTS.p1 * (1 - cosineMean) +
      JOINT_WEIGHTS.p2 * equivalenceMean +
      JOINT_WEIGHTS.p3 * (1 - sR) +
      JOINT_WEIGHTS.p4 * (1 - sF),
  );
}

/** Full integrity report for a run against a threshold set. */
export function computeReport(run: Run, thresholds: ThresholdSet, opts: ReportOptions = {}): IntegrityReport {
  const scorable = run.variants.filter(isScorable);
  const stripped = stripSharedBoilerplate(scorable.map((v) => v.text));
  const boilerplateLinesRemoved = stripped.removedLines.length;
  const sigma = opts.outlierSigma ?? run.advanced?.outlierSigma ?? DEFAULT_ADVANCED.outlierSigma;
  const minNamed = opts.outlierMinNamed ?? run.advanced?.outlierMinNamed ?? DEFAULT_ADVANCED.outlierMinNamed;
  const stepMismatch =
    opts.canonicalStepCount == null
      ? 0
      : scorable.filter((v) => Math.abs(v.metrics.stepCount - (opts.canonicalStepCount as number)) > 2).length;
  const texts = stripped.texts;

  const cosineMean = pairwiseCosineMean(texts);
  const ngramOverlapMean = pairwiseJaccard4Mean(texts);

  const eqs = scorable
    .map((v) => v.metrics.equivalence)
    .filter((e): e is number => e !== null && Number.isFinite(e));
  const equivalenceMean = eqs.length > 0 ? mean(eqs) : 0;

  const flesch = scorable.map((v) => v.metrics.fleschEase);
  const fleschMean = mean(flesch);
  const fleschSigma = stddev(flesch, true);
  const rubricProxySigma = stddev(
    scorable.map((v) => v.metrics.solutionFleschEase),
    true,
  );

  const joint = jointScore(cosineMean, equivalenceMean, rubricProxySigma, fleschSigma);
  const failure = 1 - joint;

  const p2Fails = equivalenceMean < thresholds.p2Equivalence;
  const p4Fails = fleschSigma > thresholds.p4FleschSigma;
  const base = { fleschMean, fleschSigma, p2Threshold: thresholds.p2Equivalence, sigma, minNamed };
  const p4Ids = detectOutliers(run.variants, { ...base, p4Fails, p2Fails: false });
  const p2Ids = detectOutliers(run.variants, { ...base, p4Fails: false, p2Fails });
  const p4Set = new Set(p4Ids);

  const checks = buildChecks(
    {
      cosineMean,
      equivalenceMean,
      rubricProxySigma,
      fleschSigma,
      fleschMean,
      p4Outliers: scorable.filter((v) => p4Set.has(v.id)),
      p2Outliers: p2Ids,
      stepMismatch,
      boilerplateLinesRemoved,
    },
    thresholds,
  );

  const outliers = detectOutliers(run.variants, { ...base, p4Fails, p2Fails });

  return {
    runId: run.id,
    computedAt: new Date().toISOString(),
    thresholdsVersion: thresholds.version,
    metricsVersion: METRICS_VERSION,
    boilerplateLinesRemoved,
    cosineMean,
    ngramOverlapMean,
    equivalenceMean,
    rubricProxySigma,
    fleschSigma,
    fleschMean,
    joint,
    failure,
    checks,
    outliers,
    releasable: checks.p1.gate === "pass" && checks.p2.gate === "pass" && checks.p4.gate === "pass",
  };
}

/**
 * Copies of `variants` with `flags` set from the report: `p4Outlier` when P4
 * failed and the variant is named by the P4 rule; `p2Low` when P2 failed and
 * the variant's equivalence is below the P2 threshold. Both false on pass.
 */
export function applyFlags(variants: Variant[], report: IntegrityReport, opts: Pick<ReportOptions, "outlierSigma" | "outlierMinNamed"> = {}): Variant[] {
  const p4Fails = report.checks.p4.gate === "fail";
  const p2Fails = report.checks.p2.gate === "fail";
  const p2Threshold = report.checks.p2.threshold ?? 0;
  const base = {
    fleschMean: report.fleschMean,
    fleschSigma: report.fleschSigma,
    p2Threshold,
    sigma: opts.outlierSigma,
    minNamed: opts.outlierMinNamed,
  };
  const p4Set = new Set(detectOutliers(variants, { ...base, p4Fails, p2Fails: false }));
  const p2Set = new Set(detectOutliers(variants, { ...base, p4Fails: false, p2Fails }));
  return variants.map((v) => ({
    ...v,
    flags: { p4Outlier: p4Set.has(v.id), p2Low: p2Set.has(v.id) },
  }));
}
