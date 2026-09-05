/**
 * Wave 7: credential issuance.
 *
 * When a work sample is graded by the instructor, its blueprint is validated by
 * an employer, and an employer endorsement meets the bar, the college issues an
 * Open Badges 3.0 AchievementCredential and each qualifying employer endorsement
 * becomes an EndorsementCredential. Both travel together in a
 * VerifiablePresentation-shaped bundle.
 */

import type { Endorsement, EmployerValidation, EvidenceRecord, IssuedCredential, JsonDoc, SigningKey } from "@shared/types";
import type { EvidenceView } from "@lib/store/selectors";
import { canonicalJson } from "@lib/store/employer";
import { signCanonical, verifySignature } from "./keys";
import { toOpenBadge, type OpenBadgeCredential } from "./openBadges";
import { attachProof, toEndorsementCredential } from "./endorsement";

export const VP_CONTEXT = ["https://www.w3.org/ns/credentials/v2"] as const;

export function credentialOrigin(): string {
  return typeof location !== "undefined" ? location.origin : "urn:varia";
}

// ---------------------------------------------------------------------------
// Eligibility
// ---------------------------------------------------------------------------

export interface EligibilityInput {
  record: EvidenceRecord | null;
  grade: EvidenceView["grade"];
  validations: EmployerValidation[];
  endorsements: Endorsement[];
}

export interface Eligibility {
  eligible: boolean;
  missing: string[];
}

export const MISSING = {
  record: "No evidence record has been issued for this work yet",
  grade: "Not yet graded by the instructor",
  suggested: "The grade is an AI suggestion, not an instructor's decision",
  validation: "Blueprint not yet validated by an employer",
  endorsement: "No employer endorsement meets the bar",
} as const;

/** Pure eligibility rule. Suggested (AI) grades never qualify. */
export function eligibilityOf(input: EligibilityInput): Eligibility {
  const missing: string[] = [];
  if (!input.record) missing.push(MISSING.record);
  if (!input.grade) missing.push(MISSING.grade);
  else if (input.grade.basis === "suggested") missing.push(MISSING.suggested);
  if (!input.validations.some((v) => v.status === "validated")) missing.push(MISSING.validation);
  if (!input.endorsements.some((e) => e.meetsBar)) missing.push(MISSING.endorsement);
  return { eligible: missing.length === 0, missing };
}

// ---------------------------------------------------------------------------
// Building
// ---------------------------------------------------------------------------

/** Strip the proof so the same bytes are what get signed and what get verified. */
export function proofless<T extends { proof?: unknown }>(doc: T): Omit<T, "proof"> {
  const { proof: _p, ...rest } = doc;
  return rest;
}

export function achievementCredentialId(origin: string, credentialId: string): string {
  return `${origin}/credential/${credentialId}`;
}

/**
 * Build the unsigned AchievementCredential for an issued credential. Reuses the
 * evidence-record badge (skills, results, integrity report) and adds the
 * credential status pointer.
 */
export function buildAchievementCredential(opts: {
  origin: string;
  credentialId: string;
  view: EvidenceView;
  record: EvidenceRecord;
  key: Pick<SigningKey, "kid" | "issuerName" | "demo"> | null;
  endorsements: Endorsement[];
  issuedAt: string;
}): OpenBadgeCredential & { credentialStatus: JsonDoc } {
  const base = proofless(toOpenBadge(opts.view, opts.record, null, { endorsements: opts.endorsements }));
  const id = achievementCredentialId(opts.origin, opts.credentialId);
  const validated = opts.view.validations.filter((v) => v.status === "validated");
  return {
    ...base,
    id,
    name: `${opts.view.blueprint.name} — verified work sample`,
    description: `${opts.view.course.instructor.institution} certifies that the holder completed a version of "${opts.view.blueprint.name}" graded on the same rubric as every other version, validated by ${validated.map((v) => v.organisation).join(", ") || "an employer partner"}, and endorsed by ${[...new Set(opts.endorsements.map((e) => e.organisation))].join(", ")}. Evidence record ${opts.record.id}. Credential ${opts.credentialId}.`,
    validFrom: opts.issuedAt,
    issuer: { ...base.issuer, id: opts.origin, name: opts.view.course.instructor.institution },
    evidence: [
      ...base.evidence,
      {
        type: "Evidence",
        name: "Employer validation records",
        description: validated.length ? validated.map((v) => v.id).join(", ") : "none",
        narrative: validated.map((v) => `${v.organisation}: ${v.reviewerName}, ${v.reviewerRole}, ${v.reviewedAt.slice(0, 10)}${v.attested ? ", attested that the rubric reflects what they hire for" : ""}`).join("; ") || "No validation on file.",
      },
    ],
    credentialStatus: {
      id: `${opts.origin}/verify/${opts.record.id}`,
      type: "VariaStatus",
      statusPurpose: "revocation",
      note: "Revocation is recorded in the issuing workspace and reflected on the verify page; no external status list in this prototype.",
    },
  } as OpenBadgeCredential & { credentialStatus: JsonDoc };
}

export function buildBundle(opts: {
  origin: string;
  credentialId: string;
  learnerId: string;
  achievement: JsonDoc;
  endorsements: JsonDoc[];
  issuedAt: string;
}): JsonDoc {
  return {
    "@context": VP_CONTEXT,
    id: `${opts.origin}/credential/${opts.credentialId}/presentation`,
    type: ["VerifiablePresentation"],
    holder: { id: `urn:varia:learner:${opts.learnerId}`, type: "Profile" },
    verifiableCredential: [opts.achievement, ...opts.endorsements],
    issuedAt: opts.issuedAt,
    note: "Open Badges 3.0 bundle: one AchievementCredential issued by the college and one EndorsementCredential per employer endorsement. Importing into a wallet (Credly, Badgr) requires the college's issuer profile to be published at the issuer id.",
  };
}

/**
 * Issue: build, sign the achievement (and each endorsement) over their
 * proof-less canonical JSON, attach proofs, and return the record to store.
 */
export async function issueCredentialDocs(opts: {
  credentialId: string;
  view: EvidenceView;
  record: EvidenceRecord;
  key: SigningKey;
  endorsements: Endorsement[];
  issuedAt: string;
  origin?: string;
}): Promise<Omit<IssuedCredential, "revokedAt">> {
  const origin = opts.origin ?? credentialOrigin();
  const qualifying = opts.endorsements.filter((e) => e.meetsBar);
  const learnerId = opts.record.bridge?.learnerId ?? "L-unknown";

  const unsignedAch = buildAchievementCredential({ ...opts, origin, endorsements: qualifying });
  const achCanonical = canonicalJson(unsignedAch);
  const achJws = await signCanonical(opts.key, achCanonical);
  const achievement = attachProof(unsignedAch, opts.key, origin, achJws, opts.issuedAt, `Issued by ${opts.view.course.instructor.institution}.`) as unknown as JsonDoc;

  const endorsementDocs: JsonDoc[] = [];
  for (let i = 0; i < qualifying.length; i++) {
    const unsigned = toEndorsementCredential({ origin, achievementCredentialId: unsignedAch.id, endorsement: qualifying[i], credentialId: opts.credentialId, index: i });
    const jws = await signCanonical(opts.key, canonicalJson(unsigned));
    endorsementDocs.push(attachProof(unsigned, opts.key, origin, jws, qualifying[i].at, `Endorsed by ${qualifying[i].organisation}; in production the employer signs with its own key.`) as unknown as JsonDoc);
  }

  const bundle = buildBundle({ origin, credentialId: opts.credentialId, learnerId, achievement, endorsements: endorsementDocs, issuedAt: opts.issuedAt });
  return {
    id: opts.credentialId,
    recordId: opts.record.id,
    learnerId,
    issuedAt: opts.issuedAt,
    issuedBy: opts.view.course.instructor.institution,
    achievementCredential: achievement,
    endorsementCredentials: endorsementDocs,
    bundle,
    signature: achJws,
    signedWithKid: opts.key.kid,
  };
}

/** Verify a stored credential's achievement proof against a public key. */
export async function verifyCredential(cred: IssuedCredential, publicJwk: JsonWebKey): Promise<boolean> {
  const doc = proofless(cred.achievementCredential as { proof?: unknown });
  return verifySignature(publicJwk, canonicalJson(doc), cred.signature);
}

export function nextCredentialId(existing: { id: string }[], year = new Date().getFullYear()): string {
  const prefix = `CR-${year}-`;
  const max = existing.map((c) => c.id).filter((id) => id.startsWith(prefix)).map((id) => parseInt(id.slice(prefix.length), 10) || 0).reduce((a, b) => Math.max(a, b), 0);
  return `${prefix}${String(max + 1).padStart(4, "0")}`;
}
