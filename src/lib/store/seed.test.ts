import { describe, expect, it } from "vitest";
import { computeReport } from "@lib/metrics";
import { buildDemoWorkspace, demoReadingEase, NAMED_STUDENTS } from "./seed";
import { blueprintValidationStatus, consoleStats, employerFunnel, employerStats, portfolioFor, rosterRows, rosterStats, studentById, talentRows } from "./selectors";
import { DEMO_PARTNER_IDS } from "./seed";
import { recordCanonicalPure, hashEvidence } from "./employer";

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

  it("has three blueprints with B1 active and eight seeded audit events", () => {
    expect(ws.blueprints).toHaveLength(3);
    expect(ws.activeBlueprintId).toBe("bp-b1-model-card-audit");
    expect(ws.audit).toHaveLength(8);
    expect(ws.audit.some((a) => a.text === "Bayfront Regional Bank endorsed VR-2026-0001")).toBe(true);
    expect(ws.audit.some((a) => a.text === "Bayfront Regional Bank validated Stakeholder memo")).toBe(true);
    expect(ws.audit.some((a) => a.text === "Evidence record VR-2026-0001 issued for Alvarez, R.")).toBe(true);
    expect(ws.thresholds[ws.thresholds.length - 1].p4FleschSigma).toBe(8);
  });

  it("seeds three employer partners, two validations, two evidence records", () => {
    expect(ws.employerPartners.map((p) => p.organisation)).toEqual(["Bayfront Regional Bank", "Coral Health Network", "Northline Talent Systems"]);
    expect(ws.employerPartners.filter((p) => p.adoptedEvidenceRecords).map((p) => p.organisation)).toEqual(["Bayfront Regional Bank"]);
    expect(ws.employerValidations).toHaveLength(2);
    expect(blueprintValidationStatus(ws, "bp-b2-stakeholder-memo")).toBe("validated");
    expect(blueprintValidationStatus(ws, "bp-b3-ethical-risk")).toBe("validated");
    expect(blueprintValidationStatus(ws, "bp-b1-model-card-audit")).toBe("pending");
    // Bayfront's scenario edit is reflected on B2
    const b2 = ws.blueprints.find((b) => b.id === "bp-b2-stakeholder-memo")!;
    expect(b2.surfaceDimensions.find((d) => d.key === "scenario")!.values).toContain("small-business lending");
    expect(ws.evidenceRecords.map((r) => r.id)).toEqual(["VR-2026-0001", "VR-2026-0002"]);
    expect(ws.evidenceRecords.map((r) => r.variantId)).toEqual(["v-04", "v-15"]);
    for (const r of ws.evidenceRecords) {
      expect(r.hash).toMatch(/^[0-9a-f]{64}$/);
      expect(r.validationIds).toEqual([]); // B1 has no validation yet
      expect(r.issuedBy).toBe("Dr. E. Lee · Miami Dade College");
    }
    expect(ws.evidenceRecords[0].hash).not.toBe(ws.evidenceRecords[1].hash);
  });

  it("employer stats read 2 of 3 validated, 1 of 3 adopted, satisfaction 4.3 from 2 responses", () => {
    const s = employerStats(ws);
    expect(s.blueprints).toBe(3);
    expect(s.validated).toBe(2);
    expect(Math.abs(s.validatedPct - 2 / 3)).toBeLessThan(1e-9);
    expect(s.partners).toBe(3);
    expect(s.adopted).toBe(1);
    expect(Math.abs(s.adoptedPct - 1 / 3)).toBeLessThan(1e-9);
    expect(s.responses).toBe(2);
    expect(s.satisfactionMean).toBe(4.3); // (22/5 + 21/5) / 2
    expect(s.goals.validatedPct).toBe(0.75);
    expect(s.goals.adoptedPct).toBe(0.5);
    expect(s.hires).toBe(0);
  });

  it("seeds eight skills mapped onto the rubrics and three challenges linked to B1", () => {
    expect(ws.skills).toHaveLength(8);
    expect(ws.skills!.map((k) => k.key)).toContain("fairness-analysis");
    const b1 = ws.blueprints.find((b) => b.id === "bp-b1-model-card-audit")!;
    expect(b1.rubric.find((c) => c.id === "c-fairness")!.skillKeys).toEqual(["fairness-analysis", "evidence-based-reasoning"]);
    expect(b1.rubric.find((c) => c.id === "c-prioritisation")!.skillKeys).toEqual(["risk-prioritisation", "model-auditing"]);
    expect(ws.challenges).toHaveLength(3);
    expect(ws.challenges!.every((c) => c.blueprintIds.includes(b1.id) && c.status === "active")).toBe(true);
    expect(b1.challengeIds).toHaveLength(3);
    expect(ws.challenges!.map((c) => c.organisation)).toEqual(["Bayfront Regional Bank", "Northline Talent Systems", "Coral Health Network"]);
    expect(ws.challenges![0].brief.length).toBeGreaterThan(200);
  });

  it("seeds schema-v3 records: VR-2026-0001 is a shared, endorsed work sample with the Bayfront challenge", () => {
    const r1 = ws.evidenceRecords.find((r) => r.id === "VR-2026-0001")!;
    const r2 = ws.evidenceRecords.find((r) => r.id === "VR-2026-0002")!;
    expect(r1.bridge?.schemaVersion).toBe(3);
    expect(r1.bridge?.learnerId).toMatch(/^L-[0-9a-f]{12}$/);
    expect(r1.bridge?.workSample?.submissionIncluded).toBe(true);
    expect(r1.bridge?.workSample?.submissionText).toBeTruthy();
    expect(r1.bridge?.workSample?.challengeId).toBe("chal-bayfront-loan-default");
    expect(r1.bridge?.workSample?.skills.map((s) => s.key)).toEqual([
      "fairness-analysis",
      "evidence-based-reasoning",
      "robustness-evaluation",
      "documentation-review",
      "risk-prioritisation",
      "model-auditing",
    ]);
    expect(r1.bridge?.workSample?.endorsementIds).toEqual(["end-demo-0001"]);
    expect(r2.bridge?.workSample?.submissionIncluded).toBe(false);
    expect(r2.bridge?.workSample?.submissionText).toBeNull();
    // hashes reproduce from the v3 canonical
    for (const r of [r1, r2]) {
      const canonical = recordCanonicalPure(ws, r)!;
      expect(canonical).toContain('"recordVersion":3');
      expect(hashEvidence(canonical)).toBe(r.hash);
    }
    expect(ws.endorsements).toHaveLength(1);
    expect(ws.outcomes!.map((o) => o.kind)).toEqual(["interviewed", "offered"]);
    expect(ws.outcomes!.every((o) => o.learnerId === r1.bridge!.learnerId)).toBe(true);
    expect(ws.portfolioShares).toHaveLength(1);
    expect(ws.portfolioShares![0].learnerId).toBe(r1.bridge!.learnerId);
  });

  it("funnel reads 3 / 11 / 1 / 1 / 1 / 0 with no partner, and Bayfront's talent view has one row", () => {
    const f = employerFunnel(ws);
    expect(f).toEqual({ challenges: 3, completed: 11, shared: 1, endorsed: 1, interviewed: 1, hired: 0 });
    const fb = employerFunnel(ws, DEMO_PARTNER_IDS.bayfront);
    expect(fb.challenges).toBe(1);
    expect(fb.completed).toBe(11);
    expect(fb.shared).toBe(1);
    expect(fb.endorsed).toBe(1);
    expect(fb.interviewed).toBe(1);
    const rows = talentRows(ws, DEMO_PARTNER_IDS.bayfront);
    expect(rows).toHaveLength(1);
    expect(rows[0].record.id).toBe("VR-2026-0001");
    expect(rows[0].sharedVia).toBe("portfolio");
    expect(rows[0].total).toBe(10);
    expect(rows[0].endorsements).toHaveLength(1);
    expect(rows[0].outcomes.map((o) => o.kind)).toEqual(["interviewed", "offered"]);
    expect(talentRows(ws, DEMO_PARTNER_IDS.northline)).toHaveLength(0);
  });

  it("Alvarez's portfolio has one work sample with an endorsement and two outcomes, and a skills summary", () => {
    const r1 = ws.evidenceRecords.find((r) => r.id === "VR-2026-0001")!;
    const p = portfolioFor(ws, r1.bridge!.learnerId)!;
    expect(p.student.name).toBe("Alvarez, R.");
    expect(p.items).toHaveLength(1);
    expect(p.items[0].endorsements).toHaveLength(1);
    expect(p.items[0].outcomes).toHaveLength(2);
    expect(p.items[0].challenge?.organisation).toBe("Bayfront Regional Bank");
    expect(p.items[0].shares).toHaveLength(1);
    expect(p.skills).toHaveLength(6);
    expect(p.skills.every((s) => s.count === 1)).toBe(true);
    expect(portfolioFor(ws, "L-nope")).toBeNull();
  });
});
