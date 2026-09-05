import { beforeEach, describe, expect, it } from "vitest";
import { useWorkspace } from "@lib/store/workspace";
import { lendingIds, lendingWorkspace } from "@lib/store/testWorkspace";
import { endorsementsForRecord, evidenceView, outcomesForRecord } from "@lib/store/selectors";
import type { LevelScore } from "@shared/types";
import { OB3_CONTEXT, toOpenBadge } from "./openBadges";

/** Grade the first recorded version and issue its evidence record. */
async function issuedRecord() {
  const { bp, v0, run } = lendingIds(useWorkspace.getState());
  const scores = Object.fromEntries(bp.rubric.map((c, i) => [c.id, ((i % 3) + 1) as LevelScore]));
  useWorkspace.getState().setSubmissionText(v0.id, "Finding 1. The card reports aggregate accuracy only; subgroup false-positive rates are absent, so the regional complaint cannot be assessed from the card.", "test.txt", run.id);
  useWorkspace.getState().saveGrade(v0.id, scores);
  const record = await useWorkspace.getState().issueEvidenceRecord(v0.id);
  const ws = useWorkspace.getState();
  return { ws, record, view: evidenceView(ws, v0.id)! };
}

describe("Open Badges 3.0 export", () => {
  beforeEach(() => {
    useWorkspace.setState({ ...lendingWorkspace(), runAbort: null });
  });

  it("emits a VC with both contexts, a hashed learner id, and no student name", async () => {
    const { record, view } = await issuedRecord();
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

  it("aligns skills, narrates endorsements and outcomes, and includes the submission only when the learner included it", async () => {
    const { ws, record, view } = await issuedRecord();
    const c0 = toOpenBadge(view, record, null, { endorsements: endorsementsForRecord(ws, record.id), outcomes: outcomesForRecord(ws, record.id) });
    // Nothing has happened to this record yet: only the integrity report is evidence.
    expect(c0.evidence.map((e) => e.name)).toEqual(["VARIA integrity report"]);
    const skillAlignments = c0.credentialSubject.achievement.alignment.filter((a) => a.targetFramework);
    expect(skillAlignments.length).toBeGreaterThan(0);

    // Endorse, log an outcome, include the submission: all three appear, name still absent.
    useWorkspace.getState().addEndorsement({ recordId: record.id, partnerId: null, organisation: "Bayfront Regional Bank", reviewerName: "K. Osei", score: 4, meetsBar: true, comment: "Meets our bar for a junior analyst." });
    useWorkspace.getState().addOutcome({ recordId: record.id, kind: "interviewed", organisation: "Bayfront Regional Bank", by: "employer" });
    const rec2 = await useWorkspace.getState().setSubmissionIncluded(record.id, true);
    const ws2 = useWorkspace.getState();
    const view2 = evidenceView(ws2, record.variantId)!;
    const c1 = toOpenBadge(view2, rec2, null, { endorsements: endorsementsForRecord(ws2, rec2.id), outcomes: outcomesForRecord(ws2, rec2.id) });
    expect(c1.evidence.map((e) => e.name)).toEqual(["VARIA integrity report", "Employer endorsements", "Outcomes", "Work sample"]);
    expect(c1.evidence[1].narrative).toContain("meets their bar");
    expect(c1.evidence[2].narrative).toContain("interviewed");
    expect(c1.evidence[3].narrative).toBe(rec2.bridge!.workSample!.submissionText);
    expect(JSON.stringify(c1)).not.toContain(view2.student.name);
  });

  it("adds a proof block when the record is signed", async () => {
    const { record, view } = await issuedRecord();
    const signed = { ...record, bridge: { ...record.bridge!, signature: "h.p.s", signedWithKid: "mdc-demo-abcd1234" } };
    const cred = toOpenBadge(view, signed, { kid: "mdc-demo-abcd1234", issuerName: "Miami Dade College (demo key)", demo: true });
    expect(cred.proof?.proofValue).toBe("h.p.s");
    expect(cred.proof?.verificationMethod).toContain("#mdc-demo-abcd1234");
    expect(cred.proof?.description).toContain("DEMO");
  });
});
