import { describe, expect, it } from "vitest";
import { computeReport } from "@lib/metrics";
import { buildDemoWorkspace } from "@lib/store/seed";
import { withBridgeDefaults } from "@lib/store/employer";
import { evidenceView } from "@lib/store/selectors";
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
