import { describe, it, expect, beforeEach } from "vitest";
import { useWorkspace } from "./workspace";
import { useSettings } from "./settings";
import { buildAssignments } from "./orchestrator";
import { currentThresholds, runById } from "./selectors";
import type { SurfaceDimension } from "@shared/types";

describe("assignments are distinct across all strategies", () => {
  const dims: SurfaceDimension[] = [
    { key: "domain", label: "Domain", values: Array.from({ length: 10 }, (_, i) => `d${i}`), locked: false, enabled: true },
    { key: "stakeholder", label: "Stakeholder", values: ["a", "b", "c"], locked: false, enabled: true },
    { key: "readingLevel", label: "Reading level", values: [], locked: true, enabled: false },
  ];
  for (const strategy of ["zero-shot", "few-shot", "structured-cot", "dimension-preserving"] as const) {
    it(`${strategy}: 10 assignments over 10 domains have no duplicate domain`, () => {
      const a = buildAssignments(dims, 10, strategy);
      const domains = a.map((x) => x.domain);
      expect(new Set(domains).size).toBe(10);
      expect(a.every((x) => x.stakeholder)).toBe(true);
    });
  }
  it("no (domain, stakeholder) pair repeats before the grid is exhausted", () => {
    const a = buildAssignments(dims, 30, "zero-shot");
    const pairs = new Set(a.map((x) => `${x.domain}|${x.stakeholder}`));
    expect(pairs.size).toBe(30);
  });
});

describe("regenerateOutliers never releases; policy can block over-threshold release", () => {
  beforeEach(() => {
    useWorkspace.getState().resetToDemo();
    useSettings.getState().forgetKey();
  });

  it("regenerateOutliers leaves the run unreleased even when it stays over threshold", async () => {
    const ws = useWorkspace.getState();
    // The recorded runs all pass, so make one fail P4 on paper: name two versions as outliers and unrelease it.
    const run = ws.runs.find((r) => r.report && r.variants.length >= 2);
    expect(run).toBeTruthy();
    const named = run!.variants.slice(0, 2).map((v) => v.id);
    useWorkspace.setState((s) => ({
      runs: s.runs.map((r) =>
        r.id === run!.id
          ? {
              ...r,
              release: null,
              report: { ...r.report!, releasable: false, outliers: named, checks: { ...r.report!.checks, p4: { ...r.report!.checks.p4, gate: "fail" as const } } },
            }
          : r,
      ),
    }));
    await useWorkspace.getState().regenerateOutliers(run!.id);
    const after = runById(useWorkspace.getState(), run!.id)!;
    expect(after.release).toBeNull();
    expect(after.report).toBeTruthy();
    const audit = useWorkspace.getState().audit[0].text;
    expect(audit).toMatch(/Regenerated/);
  }, 30000);

  it("releaseAnyway refuses when policy blocks over-threshold release", () => {
    const ws = useWorkspace.getState();
    const run = ws.runs.find((r) => r.report && !r.report.releasable)!;
    useWorkspace.setState((s) => ({ runs: s.runs.map((r) => (r.id === run.id ? { ...r, release: null } : r)) }));
    ws.setThreshold({ allowOverThresholdRelease: false }, "Assessment office");
    expect(currentThresholds(useWorkspace.getState()).allowOverThresholdRelease).toBe(false);
    useWorkspace.getState().releaseAnyway(run.id, "test");
    expect(runById(useWorkspace.getState(), run.id)!.release).toBeNull();
    expect(useWorkspace.getState().audit[0].text).toMatch(/refused by institution policy/);
  });

  it("threshold set carries the metric definition version", () => {
    expect(currentThresholds(useWorkspace.getState()).metricsVersion ?? 3).toBeGreaterThanOrEqual(2);
  });
});
