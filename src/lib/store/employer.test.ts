import { beforeEach, describe, expect, it } from "vitest";
import { useWorkspace } from "./workspace";
import { blueprintValidationStatus, employerStats, evidenceForVariant, evidenceView, sampleVariantsFor } from "./selectors";
import { lendingIds, lendingWorkspace } from "./testWorkspace";
import { applyScenarioEdits, nextEvidenceId } from "./employer";
import type { LevelScore } from "@shared/types";

describe("employer validation and evidence records (recorded lending run)", () => {
  beforeEach(() => {
    useWorkspace.setState({ ...lendingWorkspace(), runAbort: null });
  });

  it("builds a self-contained review package with three samples and no student ids", () => {
    const { bpId, partner, run } = lendingIds(useWorkspace.getState());
    const pkg = useWorkspace.getState().buildReviewPackage(bpId, partner.id);
    expect(pkg.version).toBe(1);
    expect(pkg.blueprint.id).toBe(bpId);
    expect(pkg.sampleVariants).toHaveLength(3);
    expect(JSON.stringify(pkg.sampleVariants)).not.toContain("studentId");
    expect(pkg.partner?.organisation).toBe(partner.organisation);
    expect(pkg.report?.joint).toBe(run.report!.joint);
    expect(pkg.issuedBy).toContain("Miami Dade College");
  });

  it("records a validation, applies scenario edits, links the partner, and audits", () => {
    const ws0 = useWorkspace.getState();
    const { bpId, bp, partner } = lendingIds(ws0);
    expect(blueprintValidationStatus(ws0, bpId)).toBe("pending");
    const before = bp.surfaceDimensions.find((d) => d.key === "scenario")!.values;

    const v = ws0.recordValidation(
      {
        blueprintId: bpId,
        blueprintName: bp.name,
        partnerId: null,
        organisation: partner.organisation.toLowerCase(),
        reviewerName: "J. Whitaker",
        reviewerRole: "Risk officer",
        reviewedAt: "2026-11-12T10:00:00-05:00",
        status: "validated",
        attested: true,
        criteriaComments: {},
        constructComment: "",
        scenarioEdits: [
          { dimensionKey: "scenario", added: ["small-business lending", before[0]], removed: [before[1]] },
          { dimensionKey: "readingLevel", added: ["graduate"], removed: [] },
        ],
        sampleVariantIds: [],
        satisfaction: null,
      },
      "workspace",
    );

    const ws = useWorkspace.getState();
    expect(v.partnerId).toBe(partner.id);
    expect(v.source).toBe("workspace");
    expect(blueprintValidationStatus(ws, bpId)).toBe("validated");
    const dims = ws.blueprints.find((b) => b.id === bpId)!.surfaceDimensions;
    const scenario = dims.find((d) => d.key === "scenario")!.values;
    expect(scenario).toContain("small-business lending");
    expect(scenario).not.toContain(before[1]);
    expect(scenario.filter((x) => x === before[0])).toHaveLength(1);
    expect(dims.find((d) => d.key === "readingLevel")!.values).toEqual([]);
    expect(ws.audit[0].text).toContain("validated");
    expect(employerStats(ws).validated).toBe(1);
  });

  it("applies an imported review result", () => {
    const { bpId, bp } = lendingIds(useWorkspace.getState());
    const v = useWorkspace.getState().applyReviewResult({
      version: 1,
      packageIssuedAt: "2026-11-01T09:00:00-05:00",
      validation: {
        blueprintId: bpId,
        blueprintName: bp.name,
        partnerId: null,
        organisation: "Unknown Logistics Co",
        reviewerName: "R. Ng",
        reviewerRole: "Ops manager",
        reviewedAt: "2026-11-12T10:00:00-05:00",
        status: "changes-requested",
        attested: false,
        criteriaComments: {},
        constructComment: "",
        scenarioEdits: [],
        sampleVariantIds: [],
        satisfaction: null,
      },
    });
    expect(v.source).toBe("imported");
    expect(v.partnerId).toBeNull();
    expect(blueprintValidationStatus(useWorkspace.getState(), bpId)).toBe("changes-requested");
    expect(() => useWorkspace.getState().applyReviewResult({ version: 2 } as never)).toThrow(/review result/);
  });

  it("issues an evidence record for a graded submission, idempotently, and refuses ungraded ones", async () => {
    const ws0 = useWorkspace.getState();
    const { bp, v0, v1, run } = lendingIds(ws0);
    expect(ws0.evidenceRecords).toHaveLength(0);
    expect(evidenceForVariant(ws0, v0.id)).toBeNull();
    await expect(ws0.issueEvidenceRecord(v0.id)).rejects.toThrow(/not been graded/);

    ws0.setSubmissionText(v0.id, "Finding 1. Subgroup false-positive rates are absent from the card.", "a.txt", run.id);
    const scores = Object.fromEntries(bp.rubric.map((c) => [c.id, 3 as LevelScore]));
    useWorkspace.getState().saveGrade(v0.id, scores);
    const r1 = await useWorkspace.getState().issueEvidenceRecord(v0.id);
    expect(r1.id).toBe("VR-2026-0001");
    expect(r1.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(r1.validationIds).toEqual([]);
    const r2 = await useWorkspace.getState().issueEvidenceRecord(v0.id);
    expect(r2.id).toBe(r1.id);
    expect(useWorkspace.getState().evidenceRecords).toHaveLength(1);
    await expect(useWorkspace.getState().issueEvidenceRecord(v1.id)).rejects.toThrow(/not been graded/);
    await expect(useWorkspace.getState().issueEvidenceRecord("v-99")).rejects.toThrow(/No version/);

    const view = evidenceView(useWorkspace.getState(), v0.id);
    expect(view?.record?.id).toBe("VR-2026-0001");
    expect(view?.grade?.total).toBe(bp.rubric.reduce((a, c) => a + c.points, 0));

    useWorkspace.getState().revokeEvidenceRecord(r1.id);
    expect(evidenceForVariant(useWorkspace.getState(), v0.id)).toBeNull();
  });

  it("partners can be added, adopted and removed with audit entries", () => {
    const ws0 = useWorkspace.getState();
    const n = ws0.employerPartners.length;
    const p = ws0.addPartner({ organisation: "Port of Miami Logistics", sector: "Logistics", contactName: "D. Ivers" });
    expect(useWorkspace.getState().employerPartners).toHaveLength(n + 1);
    useWorkspace.getState().setPartnerAdopted(p.id, true);
    expect(employerStats(useWorkspace.getState()).adopted).toBe(1);
    expect(useWorkspace.getState().audit[0].text).toContain("adopted evidence records");
    useWorkspace.getState().removePartner(p.id);
    expect(useWorkspace.getState().employerPartners).toHaveLength(n);
  });

  it("helpers: sample variants, scenario edits on locked dims, evidence id sequencing", () => {
    const ws = useWorkspace.getState();
    const { bp, bpId } = lendingIds(ws);
    expect(sampleVariantsFor(ws, bpId)).toHaveLength(3);
    expect(sampleVariantsFor(ws, "bp-does-not-exist")).toEqual([]);
    const edited = applyScenarioEdits(bp, [{ dimensionKey: "stepCount", added: ["7"], removed: [] }]);
    expect(edited.surfaceDimensions.find((d) => d.key === "stepCount")!.values).toEqual([]);
    expect(nextEvidenceId(ws.evidenceRecords, 2026)).toBe("VR-2026-0001");
    expect(nextEvidenceId(ws.evidenceRecords, 2027)).toBe("VR-2027-0001");
  });
});
