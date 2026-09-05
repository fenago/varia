import type { JudgeSample, Run, Variant } from "@shared/types";
import { DEFAULT_THRESHOLDS } from "@shared/thresholds";
import {
  aggregateJudge,
  applyFlags,
  buildChecks,
  computeReport,
  computeVariantMetrics,
  detectOutliers,
  jointScore,
} from "./report";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function mkVariant(
  id: string,
  fleschEase: number,
  equivalence: number | null,
  text: string,
  extra: Partial<Variant> = {},
): Variant {
  return {
    id,
    runId: "run-1",
    studentId: null,
    text,
    adaptedSolution: "1. Read the card.\n2. Note the gap.\n3. Write it up.",
    surfaceAssignment: {},
    metrics: {
      fleschEase,
      lexicalComplexity: 0.7,
      stepCount: 3,
      solutionFleschEase: 50 + (fleschEase - 50) / 4,
      equivalence,
      judgeSamples: [],
    },
    flags: { p4Outlier: false, p2Low: false },
    status: "draft",
    generation: 1,
    ...extra,
  };
}

/** Six disjoint-vocabulary texts so P1 passes trivially. */
const TEXTS = [
  "alpha beta gamma delta epsilon zeta eta theta iota kappa",
  "lambda mu nu xi omicron pi rho sigma tau upsilon",
  "phi chi psi omega aleph beth gimel daleth he vav",
  "zayin het tet yod kaf lamed mem nun samekh ayin",
  "pe tsadi qof resh shin tav apple banana cherry date",
  "elderberry fig grape honeydew kiwi lemon mango nectarine orange papaya",
];

/** Flesch values: mean 57.5, population σ ≈ 16.31 (> 8.0 → P4 fails). */
const FLESCH = [70, 68, 72, 40, 30, 65];

function mkRun(variants: Variant[]): Run {
  return {
    id: "run-1",
    blueprintId: "bp-1",
    blueprintName: "Model card audit",
    courseId: "c-1",
    strategy: "structured-cot",
    threatProfile: "high-stakes",
    generatorModel: "claude-opus-5",
    judgeModel: "claude-sonnet-5",
    judgeSamples: 5,
    n: variants.length,
    enabledDimensions: ["domain", "stakeholder"],
    mode: "demo",
    status: "scoring",
    progress: { phase: "scoring", done: variants.length, total: variants.length, message: "" },
    startedAt: "2026-09-04T10:00:00Z",
    finishedAt: null,
    variants,
    report: null,
    release: null,
    costEstimateUsd: 0.1,
    estMinutes: 1,
  };
}

function sixVariants(): Variant[] {
  return FLESCH.map((f, i) => mkVariant(`v-0${i + 1}`, f, 0.95, TEXTS[i]));
}

// ---------------------------------------------------------------------------

describe("computeVariantMetrics", () => {
  it("returns the four LLM-free metrics", () => {
    const m = computeVariantMetrics(
      "The cat sat on the mat. The dog ran.",
      "1. Feed the cat.\n2. Walk the dog.\nDone.",
    );
    expect(m.fleschEase).toBeGreaterThan(90);
    expect(m.lexicalComplexity).toBeCloseTo(7 / 9, 10);
    expect(m.stepCount).toBe(2);
    expect(m.solutionFleschEase).toBeGreaterThan(0);
  });
});

describe("aggregateJudge", () => {
  it("null when no samples", () => {
    expect(aggregateJudge([])).toBeNull();
  });

  it("median per dimension across 5 samples, mean across dims, normalised", () => {
    const s = (a: number, b: number): JudgeSample => ({
      dimensionScores: { "critical reading": a, "evidence use": b },
      rationale: "",
    });
    // dim A: [5,5,1,5,5] → median 5 (outlier sample ignored); dim B: [3,4,3,4,5] → median 4
    const samples = [s(5, 3), s(5, 4), s(1, 3), s(5, 4), s(5, 5)];
    // mean(5, 4) = 4.5 → (4.5 − 1) / 4 = 0.875
    expect(aggregateJudge(samples)).toBeCloseTo(0.875, 10);
  });

  it("clamps to [0, 1] and returns 1 for all-5s, 0 for all-1s", () => {
    const all = (v: number): JudgeSample[] =>
      Array.from({ length: 5 }, () => ({ dimensionScores: { d1: v, d2: v }, rationale: "" }));
    expect(aggregateJudge(all(5))).toBe(1);
    expect(aggregateJudge(all(1))).toBe(0);
  });

  it("ignores non-numeric scores; null if nothing numeric", () => {
    const bad = [{ dimensionScores: { d1: Number.NaN }, rationale: "" }];
    expect(aggregateJudge(bad)).toBeNull();
  });
});

describe("detectOutliers", () => {
  const base = { fleschMean: 57.5, fleschSigma: 16.31, p2Threshold: 0.9 };

  it("P4 fail: below mean − σ plus at least the three hardest, original order", () => {
    const ids = detectOutliers(sixVariants(), { ...base, p4Fails: true, p2Fails: false });
    // cutoff 41.19 → v-04 (40), v-05 (30); three lowest: v-05, v-04, v-06 (65)
    expect(ids).toEqual(["v-04", "v-05", "v-06"]);
  });

  it("P4 fail: names three even when none is more than σ below the mean", () => {
    const vs = [60, 61, 62, 63, 64, 65].map((f, i) => mkVariant(`v-${i}`, f, 0.95, TEXTS[i]));
    const ids = detectOutliers(vs, { fleschMean: 62.5, fleschSigma: 20, p4Fails: true, p2Fails: false, p2Threshold: 0.9 });
    expect(ids).toEqual(["v-0", "v-1", "v-2"]);
  });

  it("P2 fail: equivalence below threshold; null equivalence never named", () => {
    const vs = sixVariants();
    vs[1].metrics.equivalence = 0.8;
    vs[3].metrics.equivalence = 0.89;
    vs[5].metrics.equivalence = null;
    const ids = detectOutliers(vs, { ...base, p4Fails: false, p2Fails: true });
    expect(ids).toEqual(["v-02", "v-04"]);
  });

  it("nothing named when both gates pass; rejected/errored variants never named", () => {
    const vs = sixVariants();
    expect(detectOutliers(vs, { ...base, p4Fails: false, p2Fails: false })).toEqual([]);
    vs.push(mkVariant("v-07", -20, 0.2, "zzz", { status: "rejected" }));
    vs.push(mkVariant("v-08", -30, 0.2, "yyy", { error: "refusal" }));
    const ids = detectOutliers(vs, { ...base, p4Fails: true, p2Fails: true });
    expect(ids).not.toContain("v-07");
    expect(ids).not.toContain("v-08");
  });
});

describe("jointScore", () => {
  it("equal weights, σ̃ = min(σ/45, 1)", () => {
    expect(jointScore(0, 1, 0, 0)).toBeCloseTo(1, 10);
    expect(jointScore(1, 0, 45, 45)).toBeCloseTo(0, 10);
    expect(jointScore(1, 0, 900, 900)).toBeCloseTo(0, 10);
    expect(jointScore(0.1, 0.95, 9, 4.5)).toBeCloseTo(
      0.25 * 0.9 + 0.25 * 0.95 + 0.25 * (1 - 0.2) + 0.25 * (1 - 0.1),
      10,
    );
  });
});

describe("buildChecks", () => {
  const inputs = {
    cosineMean: 0.095,
    equivalenceMean: 0.96,
    rubricProxySigma: 9,
    fleschSigma: 5.5,
    fleschMean: 60,
    p4Outliers: [],
    p2Outliers: [],
  };

  it("labels, metric labels, bar geometry on an all-pass set", () => {
    const c = buildChecks(inputs, DEFAULT_THRESHOLDS);
    expect(c.p1.label).toBe("Versions look different");
    expect(c.p1.metricLabel).toBe("cosine 0.095");
    expect(c.p2.metricLabel).toBe("equivalence 0.960");
    expect(c.p3.metricLabel).toBe("provisional proxy");
    expect(c.p4.metricLabel).toBe("σ Flesch 5.5");
    expect(c.p1.gate).toBe("pass");
    expect(c.p2.gate).toBe("pass");
    expect(c.p3.gate).toBe("advisory");
    expect(c.p4.gate).toBe("pass");
    expect(c.p1.note).toBeNull();
    expect(c.p2.note).toBeNull();
    expect(c.p4.note).toBeNull();
    expect(c.p3.note).toMatch(/Measured by proxy/);
    expect(c.p1.barFill).toBeCloseTo(1 - 0.095 / 0.6, 10);
    expect(c.p1.barTick).toBeCloseTo(1 - 0.15 / 0.6, 10);
    expect(c.p2.barFill).toBeCloseTo(0.96, 10);
    expect(c.p2.barTick).toBeCloseTo(0.9, 10);
    expect(c.p3.barFill).toBeCloseTo(1 - 9 / 45, 10);
    expect(c.p3.barTick).toBeNull();
    expect(c.p3.threshold).toBeNull();
    expect(c.p4.barFill).toBeCloseTo(1 - 5.5 / 25, 10);
    expect(c.p4.barTick).toBeCloseTo(1 - 8 / 25, 10);
    expect(c.p1.detail).toMatch(/^P1 — /);
  });

  it("P1 fail note and P2 fail note with k", () => {
    const c = buildChecks(
      { ...inputs, cosineMean: 0.4, equivalenceMean: 0.7, p2Outliers: ["v-01", "v-02"] },
      DEFAULT_THRESHOLDS,
    );
    expect(c.p1.gate).toBe("fail");
    expect(c.p1.note).toMatch(/too alike to deter copying/);
    expect(c.p2.gate).toBe("fail");
    expect(c.p2.note).toBe("2 versions drift from the construct. Regenerate the named versions.");
    expect(c.p1.barFill).toBeCloseTo(1 - 0.4 / 0.6, 10);
  });

  it("bar fills clamp to [0, 1]", () => {
    const c = buildChecks({ ...inputs, cosineMean: 0.9, fleschSigma: 40 }, DEFAULT_THRESHOLDS);
    expect(c.p1.barFill).toBe(0);
    expect(c.p4.barFill).toBe(0);
  });
});

describe("computeReport", () => {
  it("six variants: P1 and P2 pass, P4 fails, not releasable, outliers named", () => {
    const run = mkRun(sixVariants());
    const r = computeReport(run, DEFAULT_THRESHOLDS);

    expect(r.runId).toBe("run-1");
    expect(r.thresholdsVersion).toBe(DEFAULT_THRESHOLDS.version);
    expect(r.cosineMean).toBeCloseTo(0, 10);
    expect(r.ngramOverlapMean).toBe(0);
    expect(r.equivalenceMean).toBeCloseTo(0.95, 10);
    expect(r.fleschMean).toBeCloseTo(57.5, 10);
    expect(r.fleschSigma).toBeCloseTo(Math.sqrt(1595.5 / 6), 6);
    expect(r.rubricProxySigma).toBeCloseTo(r.fleschSigma / 4, 6);

    expect(r.checks.p1.gate).toBe("pass");
    expect(r.checks.p2.gate).toBe("pass");
    expect(r.checks.p3.gate).toBe("advisory");
    expect(r.checks.p4.gate).toBe("fail");
    expect(r.releasable).toBe(false);

    expect(r.outliers).toEqual(["v-04", "v-05", "v-06"]);
    // outlier mean = 45, set mean 57.5 → (57.5 − 45) / 10 = 1.25 → 1 grade level
    expect(r.checks.p4.note).toBe(
      "3 versions read 1 grade levels above the rest. Regenerate those 3, or loosen the jargon register.",
    );
    expect(r.checks.p4.metricLabel).toBe("σ Flesch 16.3");
    expect(r.checks.p1.note).toBeNull();
    expect(r.checks.p2.note).toBeNull();

    expect(r.joint).toBeGreaterThan(0);
    expect(r.joint).toBeLessThan(1);
    expect(r.failure).toBeCloseTo(1 - r.joint, 12);
    expect(r.joint).toBeCloseTo(
      jointScore(r.cosineMean, r.equivalenceMean, r.rubricProxySigma, r.fleschSigma),
      12,
    );
    expect(Date.parse(r.computedAt)).not.toBeNaN();
  });

  it("all-pass set is releasable with empty outliers", () => {
    const vs = [60, 62, 58, 61, 59, 60].map((f, i) => mkVariant(`v-0${i + 1}`, f, 0.95, TEXTS[i]));
    const r = computeReport(mkRun(vs), DEFAULT_THRESHOLDS);
    expect(r.checks.p4.gate).toBe("pass");
    expect(r.releasable).toBe(true);
    expect(r.outliers).toEqual([]);
    expect(r.checks.p4.note).toBeNull();
  });

  it("ignores rejected and errored variants in every set metric", () => {
    const vs = sixVariants();
    vs.push(mkVariant("v-07", -200, 0.1, TEXTS[0], { status: "rejected" }));
    vs.push(mkVariant("v-08", -200, 0.1, TEXTS[1], { error: "boom" }));
    const clean = computeReport(mkRun(sixVariants()), DEFAULT_THRESHOLDS);
    const r = computeReport(mkRun(vs), DEFAULT_THRESHOLDS);
    expect(r.fleschSigma).toBeCloseTo(clean.fleschSigma, 10);
    expect(r.cosineMean).toBeCloseTo(clean.cosineMean, 10);
    expect(r.equivalenceMean).toBeCloseTo(clean.equivalenceMean, 10);
    expect(r.outliers).toEqual(clean.outliers);
  });

  it("unjudged set: equivalence 0, P2 fails, nothing named for P2", () => {
    const vs = [60, 62, 58, 61, 59, 60].map((f, i) => mkVariant(`v-0${i + 1}`, f, null, TEXTS[i]));
    const r = computeReport(mkRun(vs), DEFAULT_THRESHOLDS);
    expect(r.equivalenceMean).toBe(0);
    expect(r.checks.p2.gate).toBe("fail");
    expect(r.checks.p2.note).toBe("0 versions drift from the construct. Regenerate the named versions.");
    expect(r.outliers).toEqual([]);
    expect(r.releasable).toBe(false);
  });

  it("P1 fails on near-identical texts", () => {
    // Each text differs by one word so no line is verbatim-shared (v3 would strip a fully shared line).
    const t = "audit the model card for the hospital triage classifier and report gaps in region";
    const vs = FLESCH.map((_, i) => mkVariant(`v-0${i + 1}`, 60, 0.95, `${t} ${["north", "south", "east", "west", "central", "coastal"][i]}`));
    const r = computeReport(mkRun(vs), DEFAULT_THRESHOLDS);
    expect(r.cosineMean).toBeGreaterThan(0.5);
    expect(r.ngramOverlapMean).toBeGreaterThan(0.5);
    expect(r.boilerplateLinesRemoved).toBe(0);
    expect(r.checks.p1.gate).toBe("fail");
    expect(r.releasable).toBe(false);
  });

  it("P1 is computed after stripping a line shared by every version", () => {
    const shared = "Assignment 3: Model card audit (12 points) — what you must produce";
    const bodies = ["bank underwriting complaint", "hospital sepsis escalation", "hiring shortlist composition", "carrier vendor scoring", "hotel cancellation chatbot", "grocer subscription churn"];
    const vs = FLESCH.map((_, i) => mkVariant(`v-0${i + 1}`, 60, 0.95, `${shared}\n${bodies[i]} scenario ${i}`));
    const r = computeReport(mkRun(vs), DEFAULT_THRESHOLDS);
    expect(r.boilerplateLinesRemoved).toBe(1);
    expect(r.checks.p1.gate).toBe("pass");
  });
});

describe("applyFlags", () => {
  it("sets p4Outlier on P4-named variants and p2Low on P2-named ones, copies only", () => {
    const vs = sixVariants();
    vs[0].metrics.equivalence = 0.5; // drags mean to 0.875 → P2 fails
    const r = computeReport(mkRun(vs), DEFAULT_THRESHOLDS);
    expect(r.checks.p2.gate).toBe("fail");
    expect(r.checks.p4.gate).toBe("fail");

    const flagged = applyFlags(vs, r);
    expect(flagged).not.toBe(vs);
    expect(vs.every((v) => !v.flags.p4Outlier && !v.flags.p2Low)).toBe(true);

    const byId = Object.fromEntries(flagged.map((v) => [v.id, v.flags]));
    expect(byId["v-01"]).toEqual({ p4Outlier: false, p2Low: true });
    expect(byId["v-04"]).toEqual({ p4Outlier: true, p2Low: false });
    expect(byId["v-05"]).toEqual({ p4Outlier: true, p2Low: false });
    expect(byId["v-06"]).toEqual({ p4Outlier: true, p2Low: false });
    expect(byId["v-02"]).toEqual({ p4Outlier: false, p2Low: false });
    expect(r.outliers).toEqual(["v-01", "v-04", "v-05", "v-06"]);
  });

  it("clears flags when the report passes", () => {
    const vs = [60, 62, 58, 61, 59, 60].map((f, i) =>
      mkVariant(`v-0${i + 1}`, f, 0.95, TEXTS[i], { flags: { p4Outlier: true, p2Low: true } }),
    );
    const r = computeReport(mkRun(vs), DEFAULT_THRESHOLDS);
    expect(applyFlags(vs, r).every((v) => !v.flags.p4Outlier && !v.flags.p2Low)).toBe(true);
  });
});
