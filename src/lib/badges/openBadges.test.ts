import { describe, expect, it } from "vitest";
import { computeReport } from "@lib/metrics";
import { buildDemoWorkspace } from "@lib/store/seed";
import { withBridgeDefaults } from "@lib/store/employer";
import { endorsementsForRecord, evidenceView, outcomesForRecord } from "@lib/store/selectors";
import { OB3_CONTEXT, toOpenBadge } from "./openBadges";

describe("Open Badges 3.0 export", () => {
  it("emits a VC with both contexts, a hashed learner id, and no student name", () => {
    const ws = withBridgeDefaults(buildDemoWorkspace(computeReport));
    const record = ws.evidenceRecords.find((r) => r.id === "VR-2026-0001")!;
    const view = evidenceView(ws, record.variantId)!;
    const cred = toOpenBadge(view, record, null);
    expect(cred["@context"]).toEqual(OB3_CONTEXT);
    expect(cred.type).toEqual(["VerifiableCredential", "OpenBadgeCredential"]);
    expect(cred.credentialSubject.identifier[0].identityHash).toMatch(/^L-[0-9a-f]{12}$/);
    expect(cred.credentialSubject.identifier[0].hashed).toBe(true);
    expect(JSON.stringify(cred)).not.toContain(view.student.name);
    expect(cred.credentialSubject.achievement.name).toBe(view.blueprint.name);
    expect(cred.credentialSubject.result.length).toBe(view.blueprint.rubric.length + 1);
    expect(cred.proof).toBeUndefined();
  });

  it("aligns skills, narrates endorsements and outcomes, and includes the submission only when the learner included it", () => {
    const ws = withBridgeDefaults(buildDemoWorkspace(computeReport));
    const r1 = ws.evidenceRecords.find((r) => r.id === "VR-2026-0001")!;
    const v1 = evidenceView(ws, r1.variantId)!;
    const c1 = toOpenBadge(v1, r1, null, { endorsements: endorsementsForRecord(ws, r1.id), outcomes: outcomesForRecord(ws, r1.id) });
    const skillAlignments = c1.credentialSubject.achievement.alignment.filter((a) => a.targetFramework);
    expect(skillAlignments.map((a) => a.targetName)).toContain("Fairness analysis");
    expect(skillAlignments.find((a) => a.targetName === "Fairness analysis")?.targetFramework).toBe("O*NET");
    expect(skillAlignments.find((a) => a.targetName === "Model auditing")?.targetCode).toContain("Bayfront");
    expect(c1.evidence.map((e) => e.name)).toEqual(["VARIA integrity report", "Employer endorsements", "Outcomes", "Work sample"]);
    expect(c1.evidence[1].narrative).toContain("meets their bar");
    expect(c1.evidence[2].narrative).toContain("interviewed");
    expect(c1.evidence[3].narrative).toBe(r1.bridge!.workSample!.submissionText);
    expect(JSON.stringify(c1)).not.toContain(v1.student.name);

    const r2 = ws.evidenceRecords.find((r) => r.id === "VR-2026-0002")!;
    const c2 = toOpenBadge(evidenceView(ws, r2.variantId)!, r2, null);
    expect(c2.evidence.map((e) => e.name)).toEqual(["VARIA integrity report"]);
  });

  it("adds a proof block when the record is signed", () => {
    const ws = withBridgeDefaults(buildDemoWorkspace(computeReport));
    const record = ws.evidenceRecords.find((r) => r.id === "VR-2026-0001")!;
    const view = evidenceView(ws, record.variantId)!;
    const signed = { ...record, bridge: { ...record.bridge!, signature: "h.p.s", signedWithKid: "mdc-demo-abcd1234" } };
    const cred = toOpenBadge(view, signed, { kid: "mdc-demo-abcd1234", issuerName: "Miami Dade College (demo key)", demo: true });
    expect(cred.proof?.proofValue).toBe("h.p.s");
    expect(cred.proof?.verificationMethod).toContain("#mdc-demo-abcd1234");
    expect(cred.proof?.description).toContain("DEMO");
  });
});
