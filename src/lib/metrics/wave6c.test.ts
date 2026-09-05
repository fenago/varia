import { describe, it, expect } from "vitest";
import { pairwiseCosineMean, contentTokens, stripSharedBoilerplate, detectOutliers, computeReport, METRICS_VERSION } from "./index";
import { DEFAULT_THRESHOLDS } from "@shared/thresholds";
import type { Run, Variant } from "@shared/types";

const mk = (id: string, flesch: number, text = `Version ${id} about a distinct scenario ${id} with unique details ${id}.`): Variant => ({
  id, runId: "r", studentId: null, text, adaptedSolution: "1. one\n2. two\n3. three",
  surfaceAssignment: {}, metrics: { fleschEase: flesch, lexicalComplexity: 0.5, stepCount: 3, solutionFleschEase: 50, equivalence: 0.95, judgeSamples: [] },
  flags: { p4Outlier: false, p2Low: false }, status: "draft", generation: 1,
});
const run = (variants: Variant[]): Run => ({
  id: "r", blueprintId: "b", blueprintName: "B", courseId: "c", strategy: "zero-shot", threatProfile: "high-stakes",
  generatorModel: "m", judgeModel: "j", judgeSamples: 5, n: variants.length, enabledDimensions: [], mode: "live", status: "complete",
  progress: { phase: "complete", done: 1, total: 1, message: "" }, startedAt: "", finishedAt: null, variants, report: null, release: null,
  costEstimateUsd: 0, estMinutes: 0,
});

describe("stop words (metric v2)", () => {
  it("removes stop words from the feature tokens", () => {
    expect(contentTokens("the bank and the officer of the branch")).toEqual(["bank", "officer", "branch"]);
  });
  it("texts differing only in stop words score ~1", () => {
    const a = "The classifier declined the applicants in the northern region.";
    const b = "Classifier declined applicants in northern region.";
    expect(pairwiseCosineMean([a, b])).toBeGreaterThan(0.99);
  });
  it("identical texts still score 1", () => {
    expect(pairwiseCosineMean(["alpha beta gamma delta", "alpha beta gamma delta"])).toBeCloseTo(1, 6);
  });
  it("METRICS_VERSION is 4", () => expect(METRICS_VERSION).toBe(4));
});

describe("shared boilerplate (metric v3)", () => {
  const header = "Assignment 3: Model Card Audit (12 points)\nWhat you must produce: a structured audit with four findings.\n";
  const bodies = [
    "A regional bank deployed a loan-default classifier in March and underwriting complained.",
    "A hospital network deployed a sepsis-risk classifier across two units and nursing escalated.",
    "A hiring platform deployed a résumé screener across four offices and HR raised shortlist composition.",
    "A logistics carrier deployed a vendor-scoring model and the ops manager found reliable vendors flagged.",
    "A hotel group deployed a concierge chatbot and guests received inconsistent cancellation answers.",
  ];
  it("strips lines shared by most versions and cosine drops materially", () => {
    const withHeader = bodies.map((b) => header + b);
    const before = pairwiseCosineMean(withHeader);
    const { texts, removedLines } = stripSharedBoilerplate(withHeader);
    const after = pairwiseCosineMean(texts);
    expect(removedLines.length).toBe(2);
    expect(after).toBeLessThan(before * 0.6);
    expect(texts[0]).not.toContain("What you must produce");
  });
  it("leaves texts alone when nothing is shared", () => {
    const { texts, removedLines } = stripSharedBoilerplate(bodies);
    expect(removedLines).toEqual([]);
    expect(texts).toEqual(bodies);
  });
  it("computeReport stamps metricsVersion and boilerplateLinesRemoved", () => {
    const vs = bodies.map((b, i) => mk(`v-0${i + 1}`, 50, header + b));
    const rep = computeReport(run(vs), DEFAULT_THRESHOLDS);
    expect(rep.metricsVersion).toBe(4);
    expect(rep.boilerplateLinesRemoved).toBe(2);
    expect(rep.checks.p1.detail).toContain("after removing 2 lines");
  });
});

describe("outlier options", () => {
  const vs = [mk("v-01", 60), mk("v-02", 58), mk("v-03", 55), mk("v-04", 40), mk("v-05", 35), mk("v-06", 30)];
  const ctx = { fleschMean: 46.3, fleschSigma: 11.7, p4Fails: true, p2Fails: false, p2Threshold: 0.9 };
  it("defaults name at least three", () => {
    expect(detectOutliers(vs, ctx).length).toBeGreaterThanOrEqual(3);
  });
  it("minNamed 1 with a wide sigma names fewer", () => {
    const named = detectOutliers(vs, { ...ctx, sigma: 2, minNamed: 1 });
    expect(named).toEqual(["v-06"]);
  });
  it("computeReport honours run.advanced", () => {
    const r = run(vs);
    r.advanced = { negativeAnchors: true, constructMap: true, readabilityBand: 5, outlierSigma: 2, outlierMinNamed: 1, concurrencyGenerate: 3, concurrencyJudge: 4 };
    const rep = computeReport(r, DEFAULT_THRESHOLDS);
    expect(rep.checks.p4.gate).toBe("fail");
    expect(rep.outliers).toEqual(["v-06"]);
  });
  it("flags a step-count mismatch under P3", () => {
    const r = run(vs.map((v, i) => ({ ...v, metrics: { ...v.metrics, stepCount: i < 2 ? 8 : 3 } })));
    const rep = computeReport(r, DEFAULT_THRESHOLDS, { canonicalStepCount: 3 });
    expect(rep.checks.p3.note).toContain("2 versions' adapted solutions have a different number of steps");
  });
});
