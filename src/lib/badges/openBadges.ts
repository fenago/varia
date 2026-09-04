/**
 * Open Badges 3.0 export. An OB3 credential is a W3C Verifiable Credential
 * (v2 data model) whose subject holds an Achievement. This is the
 * interoperable shape for a VARIA evidence record: the same artifact WGU's
 * open tooling and Comprehensive Learner Record wallets consume.
 *
 * The learner is identified only by the hashed learner ID. The student's name
 * never enters the credential; it lives on the human-readable evidence page.
 */

import type { Endorsement, EvidenceRecord, EmployerValidation, OutcomeEvent, Property, SigningKey } from "@shared/types";
import type { EvidenceView } from "@lib/store/selectors";
import { downloadJson } from "@lib/share";

export const OB3_CONTEXT = [
  "https://www.w3.org/ns/credentials/v2",
  "https://purl.imsglobal.org/spec/ob/v3p0/context-3.0.3.json",
] as const;

export interface OpenBadgeCredential {
  "@context": readonly string[];
  id: string;
  type: ["VerifiableCredential", "OpenBadgeCredential"];
  name: string;
  description: string;
  issuer: { id: string; type: "Profile"; name: string; description?: string };
  validFrom: string;
  credentialSubject: {
    type: "AchievementSubject";
    identifier: { type: "IdentityObject"; identityHash: string; identityType: "identifier"; hashed: true }[];
    achievement: {
      id: string;
      type: "Achievement";
      name: string;
      description: string;
      achievementType: "Assessment";
      criteria: { narrative: string };
      alignment: { type: "Alignment"; targetName: string; targetType: "ceasn:Competency"; targetFramework?: string; targetCode?: string }[];
    };
    result: { type: "Result"; resultDescription: string; value: string; achievedLevel: string; status: "Completed" }[];
  };
  evidence: { type: "Evidence"; id?: string; name: string; description: string; narrative: string }[];
  proof?: {
    type: "DataIntegrityProof";
    cryptosuite: "ecdsa-jcs-2019";
    created: string;
    verificationMethod: string;
    proofPurpose: "assertionMethod";
    proofValue: string;
    description: string;
  };
}

function origin(): string {
  return typeof location !== "undefined" ? location.origin : "urn:varia";
}

function checksNarrative(view: EvidenceView): string {
  const r = view.report;
  if (!r) return "No integrity report attached.";
  const props: Property[] = ["p1", "p2", "p3", "p4"];
  return props.map((p) => `${r.checks[p].label}: ${r.checks[p].gate} (${r.checks[p].metricLabel})`).join("; ") + `. Composite J ${r.joint.toFixed(2)}.`;
}

function validationsNarrative(vals: EmployerValidation[]): string {
  if (!vals.length) return "Not yet validated by an employer partner.";
  return (
    "Employer validated by " +
    vals.map((v) => `${v.organisation} (${v.reviewerName}, ${v.reviewerRole}, ${v.reviewedAt.slice(0, 10)}${v.attested ? ", attested" : ""})`).join("; ") +
    "."
  );
}

/**
 * Build the credential. `signature` is the record's detached JWS if the record
 * has been signed; `key` supplies the kid and issuer name for the proof block.
 */
export interface OpenBadgeExtras {
  endorsements?: Endorsement[];
  outcomes?: OutcomeEvent[];
}

export function toOpenBadge(
  view: EvidenceView,
  record: EvidenceRecord,
  key: Pick<SigningKey, "kid" | "issuerName" | "demo"> | null,
  extras?: OpenBadgeExtras,
): OpenBadgeCredential {
  const bridge = record.bridge;
  const learnerId = bridge?.learnerId ?? "L-unknown";
  const credentialId = bridge?.credentialId ?? `urn:varia:${record.id}`;
  const iss = origin();
  const grade = view.grade;
  const total = grade ? grade.total : 0;
  const maxTotal = grade ? grade.maxTotal : view.blueprint.rubric.reduce((a, c) => a + c.points, 0);

  const results = view.blueprint.rubric.map((c) => {
    const level = grade ? (grade.scores[c.id] ?? 0) : 0;
    return {
      type: "Result" as const,
      resultDescription: c.name,
      value: String(level),
      achievedLevel: `Level ${level} of 3`,
      status: "Completed" as const,
    };
  });
  results.push({
    type: "Result",
    resultDescription: "Total",
    value: `${total}/${maxTotal}`,
    achievedLevel: `${total} of ${maxTotal} points`,
    status: "Completed",
  });

  const cred: OpenBadgeCredential = {
    "@context": OB3_CONTEXT,
    id: credentialId,
    type: ["VerifiableCredential", "OpenBadgeCredential"],
    name: `${view.blueprint.name} — evidence of demonstrated skill`,
    description: `VARIA evidence record ${record.id}: ${view.course.code} · ${view.course.term}, ${view.course.instructor.institution}. Hash ${record.hash}.`,
    issuer: {
      id: iss,
      type: "Profile",
      name: view.course.instructor.institution,
    },
    validFrom: record.issuedAt,
    credentialSubject: {
      type: "AchievementSubject",
      identifier: [{ type: "IdentityObject", identityHash: learnerId, identityType: "identifier", hashed: true }],
      achievement: {
        id: `${iss}/blueprint/${view.blueprint.id}`,
        type: "Achievement",
        name: view.blueprint.name,
        description: view.blueprint.construct,
        achievementType: "Assessment",
        criteria: { narrative: view.blueprint.rubric.map((c) => `${c.name} (${c.points} pts)`).join("; ") },
        alignment: [
          ...view.blueprint.constructDimensions.map((d) => ({ type: "Alignment" as const, targetName: d, targetType: "ceasn:Competency" as const })),
          ...(bridge?.workSample?.skills ?? []).map((sk) => ({
            type: "Alignment" as const,
            targetName: sk.label,
            targetType: "ceasn:Competency" as const,
            targetFramework: sk.source === "taxonomy" ? "O*NET" : sk.source === "employer" ? "Employer competency" : "Instructor",
            ...(sk.externalRef ? { targetCode: sk.externalRef } : {}),
          })),
        ],
      },
      result: results,
    },
    evidence: [
      {
        type: "Evidence",
        id: `${iss}/evidence/${record.variantId}`,
        name: "VARIA integrity report",
        description: checksNarrative(view),
        narrative: validationsNarrative(view.validations),
      },
      ...(extras?.endorsements?.length
        ? [
            {
              type: "Evidence" as const,
              name: "Employer endorsements",
              description: `${extras.endorsements.length} employer endorsement${extras.endorsements.length === 1 ? "" : "s"} of this work sample.`,
              narrative: extras.endorsements
                .map((e) => `${e.organisation} (${e.reviewerName}, ${e.at.slice(0, 10)}): ${e.score}/5${e.meetsBar ? ", meets their bar" : ""}. ${e.comment}`)
                .join(" "),
            },
          ]
        : []),
      ...(extras?.outcomes?.length
        ? [
            {
              type: "Evidence" as const,
              name: "Outcomes",
              description: "Events logged against this record by the learner or an employer.",
              narrative: extras.outcomes.map((o) => `${o.at.slice(0, 10)}: ${o.kind} · ${o.organisation}${o.onboardingHours ? ` (${o.onboardingHours} h to productive)` : ""}`).join("; "),
            },
          ]
        : []),
      ...(bridge?.workSample?.submissionIncluded && bridge.workSample.submissionText
        ? [
            {
              type: "Evidence" as const,
              id: `${iss}/evidence/${record.variantId}#submission`,
              name: "Work sample",
              description: "The learner's submission, included with the learner's consent.",
              narrative: bridge.workSample.submissionText,
            },
          ]
        : []),
    ],
  };

  if (bridge?.signature && key) {
    cred.proof = {
      type: "DataIntegrityProof",
      cryptosuite: "ecdsa-jcs-2019",
      created: record.issuedAt,
      verificationMethod: `${iss}#${key.kid}`,
      proofPurpose: "assertionMethod",
      proofValue: bridge.signature,
      description: key.demo
        ? `Signed with a browser-generated DEMO key (${key.issuerName}). This proves the mechanism, not the institution's identity. A production deployment signs with an MDC-held key published at the verificationMethod URL.`
        : `Signed by ${key.issuerName}.`,
    };
  }
  return cred;
}

export function downloadOpenBadge(
  view: EvidenceView,
  record: EvidenceRecord,
  key: Pick<SigningKey, "kid" | "issuerName" | "demo"> | null,
  extras?: OpenBadgeExtras,
): void {
  downloadJson(toOpenBadge(view, record, key, extras), `${record.id}-open-badge-3.0.json`);
}
