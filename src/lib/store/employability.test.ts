import { beforeEach, describe, expect, it } from "vitest";
import type { LevelScore, Workspace } from "@shared/types";
import { useWorkspace } from "./workspace";
import { lendingIds, lendingWorkspace } from "./testWorkspace";
import { employerFunnel, employerStats, learnersWithRecords, outcomeStats, portfolioFor, sharedViaFor, talentRows } from "./selectors";
import { recordCanonicalPure, hashEvidence, slugify, withBridgeDefaults } from "./employer";

/** Grade a recorded version and issue its evidence record. */
async function issue(variantId: string) {
  const ws = useWorkspace.getState();
  const { bp, run } = lendingIds(ws);
  ws.setSubmissionText(variantId, "Finding 1. The card reports aggregate accuracy only, so the regional complaint cannot be assessed from it.", "s.txt", run.id);
  useWorkspace.getState().saveGrade(variantId, Object.fromEntries(bp.rubric.map((c) => [c.id, 3 as LevelScore])));
  return useWorkspace.getState().issueEvidenceRecord(variantId);
}

describe("employability bridge (recorded lending run)", () => {
  beforeEach(() => {
    useWorkspace.setState({ ...lendingWorkspace(), runAbort: null });
  });

  it("linkChallengeToBlueprint adds the challenge's domain, stakeholder and scenario to the scenario bank and records ids both ways", () => {
    const ws0 = useWorkspace.getState();
    const { bp, challenge } = lendingIds(ws0);
    if (!challenge) throw new Error("fixture has no challenge");
    // Detach first so the link is observable.
    ws0.updateBlueprint(bp.id, { challengeIds: [] });
    const before = Object.fromEntries(bp.surfaceDimensions.map((d) => [d.key, d.values.length]));
    useWorkspace.getState().linkChallengeToBlueprint(challenge.id, bp.id);
    const ws = useWorkspace.getState();
    const after = ws.blueprints.find((b) => b.id === bp.id)!;
    const dim = (k: string) => after.surfaceDimensions.find((d) => d.key === k)!;
    expect(dim("domain").values.map((v) => v.toLowerCase())).toContain(challenge.domain.toLowerCase());
    expect(dim("stakeholder").values.map((v) => v.toLowerCase())).toContain(challenge.stakeholderRole.toLowerCase());
    expect(dim("scenario").values.length).toBeGreaterThanOrEqual(before.scenario);
    expect(dim("readingLevel").values).toEqual([]);
    expect(after.challengeIds).toContain(challenge.id);
    expect(ws.challenges!.find((c) => c.id === challenge.id)!.blueprintIds).toContain(bp.id);
    expect(ws.audit[0].kind).toBe("employer");
    // idempotent
    ws.linkChallengeToBlueprint(challenge.id, bp.id);
    const dom = useWorkspace.getState().blueprints.find((b) => b.id === bp.id)!.surfaceDimensions.find((d) => d.key === "domain")!.values;
    expect(dom.filter((v) => v.toLowerCase() === challenge.domain.toLowerCase())).toHaveLength(1);
  });

  it("addChallenge takes the organisation from the partner, audits, and retire keeps it out of the active funnel", () => {
    const ws0 = useWorkspace.getState();
    const { partner } = lendingIds(ws0);
    const n = employerFunnel(ws0).challenges;
    const c = ws0.addChallenge({
      partnerId: partner.id,
      title: "Explain a declined application to the applicant",
      brief: "Write the letter our underwriters cannot.",
      domain: "Lending",
      stakeholderRole: "Underwriting manager",
      deliverable: "a one-page explanation",
      skillKeys: ["stakeholder-communication"],
      contributedBy: "K. Osei",
    });
    expect(c.organisation).toBe(partner.organisation);
    expect(c.status).toBe("active");
    expect(employerFunnel(useWorkspace.getState()).challenges).toBe(n + 1);
    useWorkspace.getState().retireChallenge(c.id);
    expect(useWorkspace.getState().challenges!.find((x) => x.id === c.id)!.status).toBe("retired");
    expect(talentRows(useWorkspace.getState(), partner.id)).toHaveLength(0);
  });

  it("addSkill slugifies and dedupes; setCriterionSkills updates the rubric", () => {
    const ws0 = useWorkspace.getState();
    const { bp } = lendingIds(ws0);
    const n = ws0.skills!.length;
    const a = ws0.addSkill({ label: "Data Storytelling", source: "instructor" });
    expect(a.key).toBe("data-storytelling");
    const b = useWorkspace.getState().addSkill({ label: "data storytelling", source: "employer" });
    expect(b).toEqual(a);
    expect(useWorkspace.getState().skills).toHaveLength(n + 1);
    const crit = bp.rubric[0].id;
    useWorkspace.getState().setCriterionSkills(bp.id, crit, ["data-storytelling", "fairness-analysis", "fairness-analysis"]);
    expect(useWorkspace.getState().blueprints.find((x) => x.id === bp.id)!.rubric[0].skillKeys).toEqual(["data-storytelling", "fairness-analysis"]);
    expect(slugify("  Résumé & CV review! ")).toBe("r-sum-cv-review");
  });

  it("setSubmissionIncluded copies the submission in, re-hashes, logs consent, and removing it reverses the hash change", async () => {
    const { v0 } = lendingIds(useWorkspace.getState());
    const r = await issue(v0.id);
    expect(r.bridge?.workSample?.submissionIncluded).toBe(false);
    const hashBefore = r.hash;
    const next = await useWorkspace.getState().setSubmissionIncluded(r.id, true);
    expect(next.bridge?.workSample?.submissionIncluded).toBe(true);
    expect(next.bridge?.workSample?.submissionText).toBeTruthy();
    expect(next.hash).not.toBe(hashBefore);
    expect(hashEvidence(recordCanonicalPure(useWorkspace.getState(), next)!)).toBe(next.hash);
    expect(next.bridge?.consent.at(-1)?.note).toBe("submission included");
    expect(useWorkspace.getState().audit[0].text).toContain("included their submission");
    const back = await useWorkspace.getState().setSubmissionIncluded(r.id, false);
    expect(back.hash).toBe(hashBefore);
    expect(back.bridge?.workSample?.submissionText).toBeNull();
    await expect(useWorkspace.getState().setSubmissionIncluded("VR-9999-0000", true)).rejects.toThrow(/No evidence record/);
  });

  it("addEndorsement links the partner and the record; addOutcome sets the learner id and audits as outcome", async () => {
    const { v0, partner } = lendingIds(useWorkspace.getState());
    const r = await issue(v0.id);
    const e = useWorkspace.getState().addEndorsement({
      recordId: r.id,
      partnerId: null,
      organisation: partner.organisation.toLowerCase(),
      reviewerName: "K. Osei",
      score: 7,
      meetsBar: false,
      comment: "Solid but not our bar.",
    });
    expect(e.partnerId).toBe(partner.id);
    expect(e.score).toBe(5);
    const ws1 = useWorkspace.getState();
    expect(ws1.evidenceRecords.find((x) => x.id === r.id)!.bridge!.workSample!.endorsementIds).toEqual([e.id]);
    expect(ws1.audit[0].kind).toBe("employer");
    const o = ws1.addOutcome({ recordId: r.id, kind: "hired", organisation: partner.organisation, by: "employer" });
    const r2 = useWorkspace.getState().evidenceRecords.find((x) => x.id === r.id)!;
    expect(o.learnerId).toBe(r2.bridge!.learnerId);
    expect(useWorkspace.getState().audit[0].kind).toBe("outcome");
    expect(employerStats(useWorkspace.getState()).hires).toBe(1);
    useWorkspace.getState().addOutcome({ recordId: r.id, kind: "ramped", organisation: partner.organisation, by: "employer", onboardingHours: 30 });
    const st = outcomeStats(useWorkspace.getState());
    expect(st.hired).toBe(1);
    expect(st.ramped).toBe(1);
    expect(st.meanOnboardingHours).toBe(30);
    expect(() => useWorkspace.getState().addOutcome({ recordId: "VR-0", kind: "hired", organisation: "X", by: "student" })).toThrow(/No evidence record/);
  });

  it("talentRows respects consent and portfolio shares, including revocation", async () => {
    const { v0, v1, partner } = lendingIds(useWorkspace.getState());
    const ra = await issue(v0.id);
    const rb = await issue(v1.id);
    expect(talentRows(useWorkspace.getState(), partner.id)).toHaveLength(0);
    // learner b shares with the partner via a portfolio share
    const learnerB = rb.bridge!.learnerId;
    const share = useWorkspace.getState().createPortfolioShare(learnerB, [rb.id], partner.organisation);
    expect(share.recordIds).toEqual([rb.id]);
    let rows = talentRows(useWorkspace.getState(), partner.id);
    expect(rows.map((x) => x.record.id)).toEqual([rb.id]);
    expect(rows[0].sharedVia).toBe("consent"); // a portfolio share also records consent to that organisation
    // learner a shares publicly: a public share is filtered by the partner's challenge domain, and the
    // recorded lending versions deliberately vary domain away from lending, so it stays hidden here…
    useWorkspace.getState().addConsent(ra.id, { action: "shared", toOrganisation: null, toEmail: null, note: null });
    expect(sharedViaFor(useWorkspace.getState(), useWorkspace.getState().evidenceRecords.find((x) => x.id === ra.id)!, partner.organisation)).toBe("public");
    expect(talentRows(useWorkspace.getState(), partner.id).map((x) => x.record.id)).toEqual([rb.id]);
    // …while an explicit share to the organisation always shows.
    useWorkspace.getState().addConsent(ra.id, { action: "shared", toOrganisation: partner.organisation, toEmail: null, note: null });
    expect(talentRows(useWorkspace.getState(), partner.id).map((x) => x.record.id).sort()).toEqual([ra.id, rb.id].sort());
    // revoke everything → gone
    useWorkspace.getState().revokePortfolioShare(share.id);
    useWorkspace.getState().addConsent(ra.id, { action: "revoked", toOrganisation: partner.organisation, toEmail: null, note: null });
    useWorkspace.getState().addConsent(ra.id, { action: "revoked", toOrganisation: null, toEmail: null, note: null });
    rows = talentRows(useWorkspace.getState(), partner.id);
    expect(rows).toHaveLength(0);
    expect(useWorkspace.getState().portfolioShares!.find((p) => p.id === share.id)!.revokedAt).toBeTruthy();
    expect(() => useWorkspace.getState().createPortfolioShare("L-nobody", [ra.id], null)).toThrow(/No records/);
  });

  it("migration upgrades v2 records to v3 work samples and re-hashes them, clearing stale signatures", async () => {
    const { v0 } = lendingIds(useWorkspace.getState());
    await issue(v0.id);
    const ws0 = useWorkspace.getState();
    const { runAbort: _a, ...plain } = ws0;
    const stripped = {
      ...plain,
      skills: undefined,
      challenges: undefined,
      endorsements: undefined,
      outcomes: undefined,
      portfolioShares: undefined,
      evidenceRecords: plain.evidenceRecords.map((r) => {
        const { workSample: _w, ...bridge } = r.bridge!;
        return { ...r, hash: "0".repeat(64), bridge: { ...bridge, schemaVersion: 2 as const, signature: "x.y.z", signedWithKid: "k" } };
      }),
    };
    const up = withBridgeDefaults(stripped as unknown as Workspace);
    for (const r of up.evidenceRecords) {
      expect(r.bridge?.schemaVersion).toBe(3);
      expect(r.bridge?.workSample?.submissionIncluded).toBe(false);
      expect(r.bridge?.workSample?.skills.length).toBeGreaterThan(0);
      expect(r.hash).toMatch(/^[0-9a-f]{64}$/);
      expect(r.hash).not.toBe("0".repeat(64));
      expect(r.bridge?.signature).toBeNull();
    }
    expect(up.skills).toEqual([]);
    expect(learnersWithRecords(ws0)).toHaveLength(1);
    expect(portfolioFor(ws0, learnersWithRecords(ws0)[0].learnerId)).not.toBeNull();
  });
});
