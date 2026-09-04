import { describe, expect, it } from "vitest";
import { computeReport } from "@lib/metrics";
import { buildDemoWorkspace, demoReadingEase, NAMED_STUDENTS } from "./seed";
import { consoleStats, rosterRows, rosterStats, studentById } from "./selectors";

describe("demo workspace", () => {
  const ws = buildDemoWorkspace(computeReport);
  const run = ws.runs[0];

  it("has 34 students and 34 variants", () => {
    expect(ws.roster.students).toHaveLength(34);
    expect(run.variants).toHaveLength(34);
    expect(new Set(run.variants.map((v) => v.studentId)).size).toBe(34);
  });

  it("maps the eight named students to their versions", () => {
    for (const [name, vid] of NAMED_STUDENTS) {
      const v = run.variants.find((x) => x.id === vid)!;
      expect(studentById(ws, v.studentId)?.name).toBe(name);
    }
  });

  it("tunes reading ease to σ = 8.9 and mean ≈ 52.8, with the mockup's eight values fixed", () => {
    const ease = demoReadingEase();
    const mean = ease.reduce((a, b) => a + b, 0) / ease.length;
    const sigma = Math.sqrt(ease.reduce((a, x) => a + (x - mean) ** 2, 0) / ease.length);
    expect(Math.abs(sigma - 8.9)).toBeLessThanOrEqual(0.05);
    expect(Math.abs(mean - 52.8)).toBeLessThan(0.5);
    expect(ease[3]).toBe(52.1);
    expect(ease[18]).toBe(36.9);
    // the three outliers are the three hardest to read
    const sorted = [...ease].sort((a, b) => a - b);
    expect(sorted.slice(0, 3)).toEqual([36.9, 37.4, 38.6]);
    expect(sorted[3]).toBeGreaterThan(41);
  });

  it("reports exactly v-12 / v-19 / v-27 as outliers with the mockup's numbers", () => {
    expect(run.report?.outliers).toEqual(["v-12", "v-19", "v-27"]);
    expect(run.report?.fleschSigma).toBe(8.9);
    expect(run.report?.cosineMean).toBe(0.095);
    expect(run.report?.joint).toBe(0.87);
    expect(run.report?.checks.p4.gate).toBe("fail");
    expect(run.report?.checks.p1.gate).toBe("pass");
    expect(run.report?.checks.p2.gate).toBe("pass");
    expect(run.report?.checks.p3.gate).toBe("advisory");
    expect(run.report?.releasable).toBe(false);
    for (const id of ["v-12", "v-19", "v-27"]) {
      expect(run.variants.find((v) => v.id === id)?.flags.p4Outlier).toBe(true);
    }
  });

  it("judge samples aggregate to ≈ 0.96 mean equivalence", () => {
    const eq = run.variants.map((v) => v.metrics.equivalence ?? 0);
    const mean = eq.reduce((a, b) => a + b, 0) / eq.length;
    expect(Math.abs(mean - 0.96)).toBeLessThan(0.005);
    expect(run.variants.every((v) => v.metrics.judgeSamples.length === 5)).toBe(true);
  });

  it("console tiles read 63 / 54 / 7 / 2 across 19 courses and 4 departments", () => {
    const s = consoleStats(ws);
    expect(s.inUse).toBe(63);
    expect(s.passingAll).toBe(54);
    expect(s.overThreshold).toBe(7);
    expect(s.unreviewed).toBe(2);
    expect(s.courses).toBe(19);
    expect(s.departments).toBe(4);
    expect(s.passingPct).toBe(86);
  });

  it("roster tiles read 34 / 27 / 11 / 1 and the first eight rows match the mockup", () => {
    const s = rosterStats(ws, run.id);
    expect(s.released).toBe(34);
    expect(s.submitted).toBe(27);
    expect(s.graded).toBe(11);
    expect(s.appeals).toBe(1);
    expect(s.appealNote).toBe("v-19, over-threshold version");
    const rows = rosterRows(ws, run.id).slice(0, 8);
    expect(rows.map((r) => r.variant.id)).toEqual(["v-04", "v-07", "v-11", "v-12", "v-15", "v-19", "v-22", "v-27"]);
    expect(rows[0].scoreLabel).toBe("10 / 12");
    expect(rows[4].scoreLabel).toBe("11 / 12");
    expect(rows[5].status).toBe("appeal");
    expect(rows[7].status).toBe("not-started");
    expect(rows[0].domainStakeholder).toBe("Lending · risk officer");
    expect(rows[1].readingEase).toBe(49.8);
  });

  it("has three blueprints with B1 active and five audit events", () => {
    expect(ws.blueprints).toHaveLength(3);
    expect(ws.activeBlueprintId).toBe("bp-b1-model-card-audit");
    expect(ws.audit).toHaveLength(5);
    expect(ws.thresholds[ws.thresholds.length - 1].p4FleschSigma).toBe(8);
  });
});
