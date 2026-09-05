import { describe, expect, it } from "vitest";
import type { Run } from "@shared/types";
import { DEFAULT_THRESHOLDS } from "@shared/thresholds";
import { createDemoProvider } from "./demoProvider";
import { buildAssignments, runCompletion, runGeneration } from "./orchestrator";
import { lendingBlueprint } from "./testWorkspace";
import { getFixture } from "./fixtures";

function makeRun(n: number): Run {
  return {
    id: "run-test",
    blueprintId: "bp-ml-lending-fairness-audit",
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
  it("replays a recorded run to completion with a real report (10 versions)", async () => {
    const updates: string[] = [];
    const run = await runGeneration({
      run: makeRun(10),
      blueprint: lendingBlueprint(),
      provider: createDemoProvider(),
      thresholds: DEFAULT_THRESHOLDS,
      signal: new AbortController().signal,
      studentIds: ["s1", "s2", "s3", "s4", "s5", "s6", "s7", "s8", "s9", "s10"],
      onUpdate: (r) => updates.push(`${r.status}:${r.progress.done}`),
    });
    expect(run.status).toBe("complete");
    expect(run.variants).toHaveLength(10);
    expect(run.variants.map((v) => v.id)).toEqual(["v-01", "v-02", "v-03", "v-04", "v-05", "v-06", "v-07", "v-08", "v-09", "v-10"]);
    expect(run.variants.every((v) => v.text.length > 100 && v.adaptedSolution.length > 100)).toBe(true);
    expect(run.variants.every((v) => v.metrics.equivalence !== null && v.metrics.judgeSamples.length === 5)).toBe(true);
    expect(run.variants[0].studentId).toBe("s1");
    expect(run.report).not.toBeNull();
    // Replayed texts are re-scored by the same metric code as the recording, so the gates match it.
    const recorded = getFixture("ml-lending-fairness-audit")!.run.report!;
    expect(run.report!.checks.p1.gate).toBe(recorded.checks.p1.gate);
    expect(run.report!.checks.p4.gate).toBe(recorded.checks.p4.gate);
    expect(Math.abs(run.report!.joint - recorded.joint)).toBeLessThan(0.02);
    expect(updates.some((u) => u.startsWith("generating"))).toBe(true);
    expect(updates.some((u) => u.startsWith("judging"))).toBe(true);
    expect(updates[updates.length - 1]).toBe("complete:1");
  }, 30000);

  it("regenerates only the named variants and bumps their generation", async () => {
    const first = await runGeneration({
      run: makeRun(10),
      blueprint: lendingBlueprint(),
      provider: createDemoProvider(),
      thresholds: DEFAULT_THRESHOLDS,
      signal: new AbortController().signal,
      onUpdate: () => {},
    });
    const named = ["v-02", "v-05"];
    const second = await runGeneration({
      run: first,
      blueprint: lendingBlueprint(),
      provider: createDemoProvider(),
      thresholds: DEFAULT_THRESHOLDS,
      signal: new AbortController().signal,
      onlyVariantIds: named,
      onUpdate: () => {},
    });
    for (const id of named) {
      const v = second.variants.find((x) => x.id === id)!;
      expect(v.generation).toBe(2);
      expect(v.status).toBe("regenerated");
      expect(v.metrics.equivalence).not.toBeNull();
    }
    expect(second.variants.find((v) => v.id === "v-01")!.generation).toBe(1);
    expect(second.report).not.toBeNull();
    expect(second.variants).toHaveLength(10);
  }, 40000);

  it("cancels cleanly", async () => {
    const abort = new AbortController();
    setTimeout(() => abort.abort(), 400);
    const run = await runGeneration({
      run: makeRun(12),
      blueprint: lendingBlueprint(),
      provider: createDemoProvider(),
      thresholds: DEFAULT_THRESHOLDS,
      signal: abort.signal,
      onUpdate: () => {},
    });
    // Cancel never discards: the run is partial and resumable.
    expect(run.status).toBe("partial");
    expect(run.variants.length).toBeLessThan(12);
    expect(runCompletion(run).resumable).toBe(true);
  }, 10000);

  it("resumes a partial run to completion, generating only the missing versions", async () => {
    const abort = new AbortController();
    setTimeout(() => abort.abort(), 400);
    const partial = await runGeneration({
      run: makeRun(12),
      blueprint: lendingBlueprint(),
      provider: createDemoProvider(),
      thresholds: DEFAULT_THRESHOLDS,
      signal: abort.signal,
      onUpdate: () => {},
    });
    const kept = partial.variants.filter((v) => v.text && !v.error).map((v) => v.text);
    expect(kept.length).toBeGreaterThan(0);
    const resumed = await runGeneration({
      run: partial,
      blueprint: lendingBlueprint(),
      provider: createDemoProvider(),
      thresholds: DEFAULT_THRESHOLDS,
      signal: new AbortController().signal,
      onUpdate: () => {},
      resume: true,
    });
    expect(resumed.status).toBe("complete");
    expect(resumed.variants).toHaveLength(12);
    expect(resumed.variants.every((v) => v.metrics.equivalence != null)).toBe(true);
    expect(resumed.report).not.toBeNull();
    // Previously generated versions were kept, not regenerated.
    for (const t of kept) expect(resumed.variants.some((v) => v.text === t)).toBe(true);
    expect(runCompletion(resumed).resumable).toBe(false);
  }, 20000);

  it("builds distinct surface tuples for dimension-preserving runs", () => {
    const dims = lendingBlueprint().surfaceDimensions;
    const a = buildAssignments(dims, 12, "dimension-preserving");
    expect(a).toHaveLength(12);
    expect(new Set(a.map((x) => JSON.stringify(x))).size).toBe(12);
    expect(a[0].readingLevel).toBeUndefined();
  });
});
