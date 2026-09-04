import { describe, expect, it } from "vitest";
import type { Run } from "@shared/types";
import { DEFAULT_THRESHOLDS } from "@shared/thresholds";
import { createDemoProvider } from "./demoProvider";
import { buildAssignments, runGeneration } from "./orchestrator";
import { buildDemoBlueprintB1 } from "./seed";

function makeRun(n: number): Run {
  return {
    id: "run-test",
    blueprintId: "bp-b1-model-card-audit",
    blueprintName: "Model card audit",
    courseId: "dat4100",
    strategy: "structured-cot",
    threatProfile: "high-stakes",
    generatorModel: "claude-opus-5",
    judgeModel: "claude-sonnet-5",
    judgeSamples: 5,
    n,
    enabledDimensions: ["domain", "stakeholder", "scenario", "trigger", "jargon"],
    mode: "demo",
    status: "queued",
    progress: { phase: "queued", done: 0, total: n, message: "" },
    startedAt: new Date().toISOString(),
    finishedAt: null,
    variants: [],
    report: null,
    release: null,
    costEstimateUsd: 0,
    estMinutes: 0,
  };
}

describe("orchestrator", () => {
  it("runs a 6-variant demo generation to completion with a report", async () => {
    const updates: string[] = [];
    const run = await runGeneration({
      run: makeRun(6),
      blueprint: buildDemoBlueprintB1(),
      provider: createDemoProvider(),
      thresholds: DEFAULT_THRESHOLDS,
      signal: new AbortController().signal,
      studentIds: ["s1", "s2", "s3", "s4", "s5", "s6"],
      onUpdate: (r) => updates.push(`${r.status}:${r.progress.done}`),
    });
    expect(run.status).toBe("complete");
    expect(run.variants).toHaveLength(6);
    expect(run.variants.map((v) => v.id)).toEqual(["v-01", "v-02", "v-03", "v-04", "v-05", "v-06"]);
    expect(run.variants.every((v) => v.text.length > 100 && v.adaptedSolution.length > 100)).toBe(true);
    expect(run.variants.every((v) => v.metrics.equivalence !== null && v.metrics.judgeSamples.length === 5)).toBe(true);
    expect(run.variants[0].studentId).toBe("s1");
    expect(run.report).not.toBeNull();
    expect(run.report!.joint).toBeGreaterThan(0.5);
    expect(run.report!.joint).toBeLessThan(1);
    expect(run.report!.checks.p1.gate).toBe("pass");
    expect(updates.some((u) => u.startsWith("generating"))).toBe(true);
    expect(updates.some((u) => u.startsWith("judging"))).toBe(true);
    expect(updates[updates.length - 1]).toBe("complete:1");
  }, 20000);

  it("regenerates only the named variants and bumps their generation", async () => {
    const first = await runGeneration({
      run: makeRun(34),
      blueprint: buildDemoBlueprintB1(),
      provider: createDemoProvider(),
      thresholds: DEFAULT_THRESHOLDS,
      signal: new AbortController().signal,
      onUpdate: () => {},
    });
    expect(first.report!.checks.p4.gate).toBe("fail");
    expect(first.report!.outliers).toEqual(["v-12", "v-19", "v-27"]);
    const second = await runGeneration({
      run: first,
      blueprint: buildDemoBlueprintB1(),
      provider: createDemoProvider(),
      thresholds: DEFAULT_THRESHOLDS,
      signal: new AbortController().signal,
      onlyVariantIds: first.report!.outliers,
      onUpdate: () => {},
    });
    const v12 = second.variants.find((v) => v.id === "v-12")!;
    expect(v12.generation).toBe(2);
    expect(v12.status).toBe("regenerated");
    expect(v12.metrics.fleschEase).toBeGreaterThan(45);
    expect(second.variants.find((v) => v.id === "v-04")!.generation).toBe(1);
    expect(second.report!.checks.p4.gate).toBe("pass");
    expect(second.report!.releasable).toBe(true);
  }, 30000);

  it("cancels cleanly", async () => {
    const abort = new AbortController();
    setTimeout(() => abort.abort(), 400);
    const run = await runGeneration({
      run: makeRun(12),
      blueprint: buildDemoBlueprintB1(),
      provider: createDemoProvider(),
      thresholds: DEFAULT_THRESHOLDS,
      signal: abort.signal,
      onUpdate: () => {},
    });
    expect(run.status).toBe("cancelled");
    expect(run.variants.length).toBeLessThan(12);
  }, 10000);

  it("builds distinct surface tuples for dimension-preserving runs", () => {
    const dims = buildDemoBlueprintB1().surfaceDimensions;
    const a = buildAssignments(dims, 12, "dimension-preserving");
    expect(a).toHaveLength(12);
    expect(new Set(a.map((x) => JSON.stringify(x))).size).toBe(12);
    expect(a[0].readingLevel).toBeUndefined();
  });
});
