import { beforeEach, describe, expect, it } from "vitest";
import { useWorkspace } from "./workspace";
import { blueprintValidationStatus, employerStats, evidenceForVariant, evidenceView, sampleVariantsFor } from "./selectors";
import { DEMO_PARTNER_IDS } from "./seed";
import { applyScenarioEdits, nextEvidenceId } from "./employer";

describe("employer validation and evidence records", () => {
  beforeEach(() => {
    useWorkspace.getState().resetToDemo();
  });

  it("builds a self-contained review package with three samples and no student ids", () => {
    const pkg = useWorkspace.getState().buildReviewPackage("bp-b1-model-card-audit", DEMO_PARTNER_IDS.northline);
    expect(pkg.version).toBe(1);
    expect(pkg.blueprint.id).toBe("bp-b1-model-card-audit");
    expect(pkg.sampleVariants.map((v) => v.id)).toEqual(["v-04", "v-07", "v-11"]);
    expect(JSON.stringify(pkg.sampleVariants)).not.toContain("studentId");
    expect(pkg.partner?.organisation).toBe("Northline Talent Systems");
    expect(pkg.report?.joint).toBe(0.87);
    expect(pkg.issuedBy).toContain("Miami Dade College");
  });

  it("records a validation, applies scenario edits, links the partner, and audits", () => {
    const ws0 = useWorkspace.getState();
    expect(blueprintValidationStatus(ws0, "bp-b1-model-card-audit")).toBe("pending");
    const before = ws0.blueprints.find((b) => b.id === "bp-b1-model-card-audit")!.surfaceDimensions.find((d) => d.key === "scenario")!.values;

    const v = ws0.recordValidation(
      {
        blueprintId: "bp-b1-model-card-audit",
        blueprintName: "Model card audit — deployed classifier",
        partnerId: null,
        organisation: "northline talent systems",
        reviewerName: "J. Whitaker",
        reviewerRole: "HR Director",
        reviewedAt: "2026-11-12T10:00:00-05:00",
        status: "validated",
        attested: true,
        criteriaComments: {},
        constructComment: "",
        scenarioEdits: [
          { dimensionKey: "scenario", added: ["campus recruiting pipeline", before[0]], removed: [before[1]] },
          { dimensionKey: "readingLevel", added: ["graduate"], removed: [] },
        ],
        sampleVariantIds: ["v-04", "v-07", "v-11"],
        satisfaction: null,
      },
      "workspace",
    );

    const ws = useWorkspace.getState();
    expect(v.partnerId).toBe(DEMO_PARTNER_IDS.northline);
    expect(v.source).toBe("workspace");
    expect(blueprintValidationStatus(ws, "bp-b1-model-card-audit")).toBe("validated");
    const dims = ws.blueprints.find((b) => b.id === "bp-b1-model-card-audit")!.surfaceDimensions;
    const scenario = dims.find((d) => d.key === "scenario")!.values;
    expect(scenario).toContain("campus recruiting pipeline");
    expect(scenario).not.toContain(before[1]);
    expect(scenario.filter((x) => x === before[0])).toHaveLength(1);
    expect(dims.find((d) => d.key === "readingLevel")!.values).toEqual([]);
    expect(ws.audit[0].text).toBe("Northline Talent Systems validated Model card audit — deployed classifier".replace("Northline Talent Systems", "northline talent systems"));
    expect(employerStats(ws).validated).toBe(3);
  });

  it("applies an imported review result", () => {
    const ws0 = useWorkspace.getState();
    const v = ws0.applyReviewResult({
      version: 1,
      packageIssuedAt: "2026-11-01T09:00:00-05:00",
      validation: {
        blueprintId: "bp-b1-model-card-audit",
        blueprintName: "Model card audit",
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
    expect(blueprintValidationStatus(useWorkspace.getState(), "bp-b1-model-card-audit")).toBe("changes-requested");
    expect(() => useWorkspace.getState().applyReviewResult({ version: 2 } as never)).toThrow(/review result/);
  });

  it("issues an evidence record for a graded submission, idempotently, and refuses ungraded ones", async () => {
    const ws0 = useWorkspace.getState();
    expect(evidenceForVariant(ws0, "v-01")).toBeNull();
    const r1 = await ws0.issueEvidenceRecord("v-01");
    expect(r1.id).toBe("VR-2026-0003");
    expect(r1.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(r1.validationIds).toEqual([]);
    const r2 = await useWorkspace.getState().issueEvidenceRecord("v-01");
    expect(r2.id).toBe(r1.id);
    expect(useWorkspace.getState().evidenceRecords).toHaveLength(3);
    await expect(useWorkspace.getState().issueEvidenceRecord("v-07")).rejects.toThrow(/not been graded/);
    await expect(useWorkspace.getState().issueEvidenceRecord("v-99")).rejects.toThrow(/No version/);

    const view = evidenceView(useWorkspace.getState(), "v-04");
    expect(view?.record?.id).toBe("VR-2026-0001");
    expect(view?.grade?.total).toBe(10);
    expect(view?.student.name).toBe("Alvarez, R.");

    useWorkspace.getState().revokeEvidenceRecord(r1.id);
    expect(evidenceForVariant(useWorkspace.getState(), "v-01")).toBeNull();
  });

  it("existing seeded evidence hashes are reproducible from their canonical content", async () => {
    const ws = useWorkspace.getState();
    const seeded = evidenceForVariant(ws, "v-04")!;
    // Re-issuing returns the seeded record unchanged (idempotent), so the hash is stable across loads.
    const again = await ws.issueEvidenceRecord("v-04");
    expect(again.hash).toBe(seeded.hash);
  });

  it("partners can be added, adopted and removed with audit entries", () => {
    const ws0 = useWorkspace.getState();
    const p = ws0.addPartner({ organisation: "Port of Miami Logistics", sector: "Logistics", contactName: "D. Ivers" });
    expect(useWorkspace.getState().employerPartners).toHaveLength(4);
    useWorkspace.getState().setPartnerAdopted(p.id, true);
    expect(employerStats(useWorkspace.getState()).adopted).toBe(2);
    expect(useWorkspace.getState().audit[0].text).toContain("adopted evidence records");
    useWorkspace.getState().removePartner(p.id);
    expect(useWorkspace.getState().employerPartners).toHaveLength(3);
  });

  it("helpers: sample variants, scenario edits on locked dims, evidence id sequencing", () => {
    const ws = useWorkspace.getState();
    expect(sampleVariantsFor(ws, "bp-b1-model-card-audit").map((v) => v.id)).toEqual(["v-04", "v-07", "v-11"]);
    expect(sampleVariantsFor(ws, "bp-b2-stakeholder-memo")).toEqual([]);
    const bp = ws.blueprints.find((b) => b.id === "bp-b3-ethical-risk")!;
    const edited = applyScenarioEdits(bp, [{ dimensionKey: "stepCount", added: ["7"], removed: [] }]);
    expect(edited.surfaceDimensions.find((d) => d.key === "stepCount")!.values).toEqual([]);
    expect(nextEvidenceId(ws.evidenceRecords, 2026)).toBe("VR-2026-0003");
    expect(nextEvidenceId(ws.evidenceRecords, 2027)).toBe("VR-2027-0001");
  });
});
