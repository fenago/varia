import { describe, it, expect } from "vitest";
import { eligibilityOf, issueCredentialDocs, verifyCredential, nextCredentialId, MISSING, proofless } from "./credential";
import { generateSigningKey } from "./keys";
import { canonicalJson } from "@lib/store/employer";
import type { Endorsement, EmployerValidation, EvidenceRecord, Grade, IssuedCredential } from "@shared/types";
import type { EvidenceView } from "@lib/store/selectors";

const grade: Grade = { scores: { c1: 3, c2: 2 }, total: 5, maxTotal: 6, gradedAt: "2026-09-05T10:00:00Z", by: "Dr. E. Lee", basis: "instructor" };
const validation = { id: "val1", blueprintId: "bp1", blueprintName: "Audit", partnerId: null, organisation: "Bayfront Regional Bank", reviewerName: "M. Ruiz", reviewerRole: "Risk officer", reviewedAt: "2026-09-01T00:00:00Z", status: "validated", attested: true, criteriaComments: {}, constructComment: "", scenarioEdits: [], sampleVariantIds: [], satisfaction: null, source: "workspace" } as EmployerValidation;
const endorsement: Endorsement = { id: "end1", at: "2026-09-03T00:00:00Z", recordId: "VR-2026-0001", partnerId: null, organisation: "Bayfront Regional Bank", reviewerName: "M. Ruiz", score: 4, meetsBar: true, comment: "Solid audit; would ship it" };
const record: EvidenceRecord = {
  id: "VR-2026-0001", runId: "run1", variantId: "v-01", studentId: "s1", blueprintId: "bp1", issuedAt: "2026-09-04T00:00:00Z", issuedBy: "Dr. E. Lee", hash: "ab".repeat(32), validationIds: ["val1"],
  bridge: { schemaVersion: 3, learnerId: "L-0123456789ab", consent: [], credentialId: "urn:varia:VR-2026-0001", signature: null, signedWithKid: null, workSample: { submissionIncluded: false, submissionText: null, skills: [{ key: "fairness-analysis", label: "Fairness analysis", source: "taxonomy", externalRef: "O*NET 15-2051.01" }], challengeId: null, endorsementIds: ["end1"] } },
};
const view = {
  record,
  student: { id: "s1", name: "Alvarez, R." },
  course: { id: "c1", code: "CAP 4631C", term: "Fall 2026", title: "ML for Data Analytics I", instructor: { name: "Dr. E. Lee", institution: "Miami Dade College", role: "Instructor" } },
  blueprint: { id: "bp1", name: "Audit our loan-default classifier", courseId: "c1", construct: "Audit a deployed classifier for fairness gaps.", constructDimensions: ["Fairness", "Robustness"], rubric: [{ id: "c1", name: "Fairness gaps", points: 3, weight: 0.5, levels: 4, anchors: null, anchorsConfidence: "high" }, { id: "c2", name: "Robustness", points: 3, weight: 0.5, levels: 4, anchors: null, anchorsConfidence: "high" }], canonicalSolution: "…", canonicalSolutionSource: "found", surfaceDimensions: [], taskPrompt: "…", source: { files: [], extractedAt: null, extractionConfidence: null }, createdAt: "", updatedAt: "" },
  variant: { id: "v-01", runId: "run1", studentId: "s1", text: "A bank…", adaptedSolution: "…", surfaceAssignment: {}, metrics: { fleschEase: 40, lexicalComplexity: 0.5, stepCount: 4, solutionFleschEase: 40, equivalence: 1, judgeSamples: [] }, flags: { p4Outlier: false, p2Low: false }, status: "released", generation: 1 },
  run: { id: "run1" } as EvidenceView["run"],
  submission: null,
  grade,
  report: null,
  validations: [validation],
  partnerNames: ["Bayfront Regional Bank"],
} as unknown as EvidenceView;

describe("credential eligibility", () => {
  it("is eligible with instructor grade, validation, and a meets-bar endorsement", () => {
    expect(eligibilityOf({ record, grade, validations: [validation], endorsements: [endorsement] })).toEqual({ eligible: true, missing: [] });
  });
  it("names each missing condition in plain words", () => {
    expect(eligibilityOf({ record: null, grade: null, validations: [], endorsements: [] }).missing).toEqual([MISSING.record, MISSING.grade, MISSING.validation, MISSING.endorsement]);
  });
  it("rejects AI-suggested grades", () => {
    const e = eligibilityOf({ record, grade: { ...grade, basis: "suggested" }, validations: [validation], endorsements: [endorsement] });
    expect(e.eligible).toBe(false);
    expect(e.missing).toEqual([MISSING.suggested]);
  });
  it("rejects endorsements that do not meet the bar and validations that are not validated", () => {
    const e = eligibilityOf({ record, grade, validations: [{ ...validation, status: "changes-requested" }], endorsements: [{ ...endorsement, meetsBar: false }] });
    expect(e.missing).toEqual([MISSING.validation, MISSING.endorsement]);
  });
});

describe("credential issuance", () => {
  it("builds a signed OB3 achievement + endorsement bundle with no student name", async () => {
    const key = await generateSigningKey("Test key");
    const docs = await issueCredentialDocs({ credentialId: "CR-2026-0001", view, record, key, endorsements: [endorsement, { ...endorsement, id: "end2", meetsBar: false }], issuedAt: "2026-09-05T12:00:00Z", origin: "https://varia.test" });
    const ach = docs.achievementCredential as any;
    expect(ach["@context"]).toContain("https://purl.imsglobal.org/spec/ob/v3p0/context-3.0.3.json");
    expect(ach.type).toEqual(["VerifiableCredential", "OpenBadgeCredential"]);
    expect(ach.id).toBe("https://varia.test/credential/CR-2026-0001");
    expect(ach.credentialSubject.identifier[0].identityHash).toBe("L-0123456789ab");
    expect(ach.credentialStatus.id).toBe("https://varia.test/verify/VR-2026-0001");
    expect(JSON.stringify(docs.bundle)).not.toContain("Alvarez");
    expect(docs.endorsementCredentials).toHaveLength(1); // only meets-bar endorsements
    const end = docs.endorsementCredentials[0] as any;
    expect(end.type).toEqual(["VerifiableCredential", "EndorsementCredential"]);
    expect(end.credentialSubject.id).toBe(ach.id);
    expect(end.issuer.name).toBe("Bayfront Regional Bank");
    expect(end.credentialSubject.endorsementComment).toContain("meets our bar");
    expect(end.proof.proofValue.split(".")).toHaveLength(3);
    const bundle = docs.bundle as any;
    expect(bundle.type).toEqual(["VerifiablePresentation"]);
    expect(bundle.verifiableCredential).toHaveLength(2);
    // signature verifies over the proof-less canonical JSON
    const cred: IssuedCredential = { ...docs, revokedAt: null };
    expect(await verifyCredential(cred, key.publicJwk)).toBe(true);
    // tamper
    const tampered = { ...cred, achievementCredential: { ...cred.achievementCredential, name: "x" } };
    expect(await verifyCredential(tampered, key.publicJwk)).toBe(false);
    expect(canonicalJson(proofless(ach))).not.toContain("proofValue");
  });
  it("numbers credentials sequentially per year", () => {
    expect(nextCredentialId([], 2026)).toBe("CR-2026-0001");
    expect(nextCredentialId([{ id: "CR-2026-0007" }, { id: "CR-2025-0100" }], 2026)).toBe("CR-2026-0008");
  });
});
