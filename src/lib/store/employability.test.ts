import { beforeEach, describe, expect, it } from "vitest";
import type { Workspace } from "@shared/types";
import { useWorkspace } from "./workspace";
import { DEMO_CHALLENGE_IDS, DEMO_PARTNER_IDS } from "./seed";
import { employerFunnel, employerStats, learnersWithRecords, outcomeStats, portfolioFor, sharedViaFor, talentRows } from "./selectors";
import { recordCanonicalPure, hashEvidence, slugify, withBridgeDefaults } from "./employer";

describe("employability bridge", () => {
  beforeEach(() => {
    useWorkspace.getState().resetToDemo();
  });

  it("linkChallengeToBlueprint adds the challenge's domain, stakeholder and scenario to the scenario bank and records ids both ways", () => {
    const ws0 = useWorkspace.getState();
    const b2 = ws0.blueprints.find((b) => b.id === "bp-b2-stakeholder-memo")!;
    const before = Object.fromEntries(b2.surfaceDimensions.map((d) => [d.key, d.values.length]));
    ws0.linkChallengeToBlueprint(DEMO_CHALLENGE_IDS.coral, b2.id);
    const ws = useWorkspace.getState();
    const after = ws.blueprints.find((b) => b.id === b2.id)!;
    const dim = (k: string) => after.surfaceDimensions.find((d) => d.key === k)!;
    expect(dim("domain").values).toContain("healthcare");
    expect(dim("stakeholder").values).toContain("clinical lead");
    expect(dim("scenario").values.some((v) => v.startsWith("Coral Health Network"))).toBe(true);
    expect(dim("scenario").values.length).toBe(before.scenario + 1);
    expect(dim("readingLevel").values).toEqual([]);
    expect(after.challengeIds).toContain(DEMO_CHALLENGE_IDS.coral);
    expect(ws.challenges!.find((c) => c.id === DEMO_CHALLENGE_IDS.coral)!.blueprintIds).toContain(b2.id);
    expect(ws.audit[0].kind).toBe("employer");
    // idempotent
    ws.linkChallengeToBlueprint(DEMO_CHALLENGE_IDS.coral, b2.id);
    expect(useWorkspace.getState().blueprints.find((b) => b.id === b2.id)!.surfaceDimensions.find((d) => d.key === "domain")!.values.filter((v) => v === "healthcare")).toHaveLength(1);
  });

  it("addChallenge takes the organisation from the partner, audits, and retire keeps it out of the active funnel", () => {
    const ws0 = useWorkspace.getState();
    const c = ws0.addChallenge({
      partnerId: DEMO_PARTNER_IDS.northline,
      title: "Explain a screening decision to a rejected applicant",
      brief: "Write the letter our recruiters cannot.",
      domain: "Hiring",
      stakeholderRole: "Recruiting manager",
      deliverable: "a one-page explanation",
      skillKeys: ["stakeholder-communication"],
      contributedBy: "J. Whitaker",
    });
    expect(c.organisation).toBe("Northline Talent Systems");
    expect(c.status).toBe("active");
    expect(employerFunnel(useWorkspace.getState()).challenges).toBe(4);
    useWorkspace.getState().retireChallenge(c.id);
    expect(useWorkspace.getState().challenges!.find((x) => x.id === c.id)!.status).toBe("retired");
    expect(talentRows(useWorkspace.getState(), DEMO_PARTNER_IDS.northline)).toHaveLength(0);
  });

  it("addSkill slugifies and dedupes; setCriterionSkills updates the rubric", () => {
    const ws0 = useWorkspace.getState();
    const a = ws0.addSkill({ label: "Data Storytelling", source: "instructor" });
    expect(a.key).toBe("data-storytelling");
    const b = useWorkspace.getState().addSkill({ label: "data storytelling", source: "employer" });
    expect(b).toEqual(a);
    expect(useWorkspace.getState().skills).toHaveLength(9);
    useWorkspace.getState().setCriterionSkills("bp-b1-model-card-audit", "c-fairness", ["data-storytelling", "fairness-analysis", "fairness-analysis"]);
    expect(useWorkspace.getState().blueprints.find((b) => b.id === "bp-b1-model-card-audit")!.rubric[0].skillKeys).toEqual(["data-storytelling", "fairness-analysis"]);
    expect(slugify("  Résumé & CV review! ")).toBe("r-sum-cv-review");
  });

  it("setSubmissionIncluded copies the submission in, re-hashes, logs consent, and removing it reverses the hash change", async () => {
    const ws0 = useWorkspace.getState();
    const r2 = ws0.evidenceRecords.find((r) => r.id === "VR-2026-0002")!;
    expect(r2.bridge?.workSample?.submissionIncluded).toBe(false);
    const hashBefore = r2.hash;
    const next = await ws0.setSubmissionIncluded(r2.id, true);
    expect(next.bridge?.workSample?.submissionIncluded).toBe(true);
    expect(next.bridge?.workSample?.submissionText).toBeTruthy();
    expect(next.hash).not.toBe(hashBefore);
    expect(hashEvidence(recordCanonicalPure(useWorkspace.getState(), next)!)).toBe(next.hash);
    expect(next.bridge?.consent.at(-1)?.note).toBe("submission included");
    expect(useWorkspace.getState().audit[0].text).toContain("included their submission");
    const back = await useWorkspace.getState().setSubmissionIncluded(r2.id, false);
    expect(back.hash).toBe(hashBefore);
    expect(back.bridge?.workSample?.submissionText).toBeNull();
    await expect(useWorkspace.getState().setSubmissionIncluded("VR-9999-0000", true)).rejects.toThrow(/No evidence record/);
  });

  it("addEndorsement links the partner and the record; addOutcome sets the learner id and audits as outcome", () => {
    const ws0 = useWorkspace.getState();
    const e = ws0.addEndorsement({
      recordId: "VR-2026-0002",
      partnerId: null,
      organisation: "coral health network",
      reviewerName: "Dr. A. Okonkwo",
      score: 7,
      meetsBar: false,
      comment: "Solid but not our bar.",
    });
    expect(e.partnerId).toBe(DEMO_PARTNER_IDS.coral);
    expect(e.score).toBe(5);
    const ws1 = useWorkspace.getState();
    expect(ws1.evidenceRecords.find((r) => r.id === "VR-2026-0002")!.bridge!.workSample!.endorsementIds).toEqual([e.id]);
    expect(ws1.audit[0].kind).toBe("employer");
    const o = ws1.addOutcome({ recordId: "VR-2026-0002", kind: "hired", organisation: "Coral Health Network", by: "employer" });
    const r2 = useWorkspace.getState().evidenceRecords.find((r) => r.id === "VR-2026-0002")!;
    expect(o.learnerId).toBe(r2.bridge!.learnerId);
    expect(useWorkspace.getState().audit[0].kind).toBe("outcome");
    expect(employerStats(useWorkspace.getState()).hires).toBe(1);
    useWorkspace.getState().addOutcome({ recordId: "VR-2026-0002", kind: "ramped", organisation: "Coral Health Network", by: "employer", onboardingHours: 30 });
    const st = outcomeStats(useWorkspace.getState());
    expect(st.hired).toBe(1);
    expect(st.ramped).toBe(1);
    expect(st.meanOnboardingHours).toBe(30);
    expect(() => useWorkspace.getState().addOutcome({ recordId: "VR-0", kind: "hired", organisation: "X", by: "student" })).toThrow(/No evidence record/);
  });

  it("talentRows respects consent and portfolio shares, including revocation", () => {
    const ws0 = useWorkspace.getState();
    const r2 = ws0.evidenceRecords.find((r) => r.id === "VR-2026-0002")!;
    const learnerId = r2.bridge!.learnerId;
    expect(talentRows(ws0, DEMO_PARTNER_IDS.bayfront).map((r) => r.record.id)).toEqual(["VR-2026-0001"]);
    // Ferreira (v-15, lending) shares with Bayfront via a portfolio share
    const share = ws0.createPortfolioShare(learnerId, ["VR-2026-0002"], "Bayfront Regional Bank");
    expect(share.recordIds).toEqual(["VR-2026-0002"]);
    let rows = talentRows(useWorkspace.getState(), DEMO_PARTNER_IDS.bayfront);
    expect(rows.map((r) => r.record.id)).toEqual(["VR-2026-0002", "VR-2026-0001"]); // 11/12 sorts above 10/12
    expect(rows[0].sharedVia).toBe("consent"); // a portfolio share also records consent to that organisation
    // a healthcare partner never sees lending records even if shared publicly
    useWorkspace.getState().addConsent("VR-2026-0002", { action: "shared", toOrganisation: null, toEmail: null, note: null });
    expect(sharedViaFor(useWorkspace.getState(), useWorkspace.getState().evidenceRecords[1], "Coral Health Network")).toBe("public");
    expect(talentRows(useWorkspace.getState(), DEMO_PARTNER_IDS.coral)).toHaveLength(0);
    // revoke the portfolio share and the public consent → gone from Bayfront's view
    useWorkspace.getState().revokePortfolioShare(share.id);
    useWorkspace.getState().addConsent("VR-2026-0002", { action: "revoked", toOrganisation: null, toEmail: null, note: null });
    rows = talentRows(useWorkspace.getState(), DEMO_PARTNER_IDS.bayfront);
    expect(rows.map((r) => r.record.id)).toEqual(["VR-2026-0001"]);
    expect(useWorkspace.getState().portfolioShares!.find((p) => p.id === share.id)!.revokedAt).toBeTruthy();
    expect(() => useWorkspace.getState().createPortfolioShare("L-nobody", ["VR-2026-0001"], null)).toThrow(/No records/);
  });

  it("migration upgrades v2 records to v3 work samples and re-hashes them, clearing stale signatures", () => {
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
      expect(r.bridge?.workSample?.skills.length).toBe(6);
      expect(r.hash).toMatch(/^[0-9a-f]{64}$/);
      expect(r.hash).not.toBe("0".repeat(64));
      expect(r.bridge?.signature).toBeNull();
    }
    expect(up.skills).toEqual([]);
    expect(learnersWithRecords(ws0)).toHaveLength(2);
    expect(portfolioFor(ws0, learnersWithRecords(ws0)[0].learnerId)).not.toBeNull();
  });
});
