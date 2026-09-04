/**
 * A self-contained bundle a student can hand to an employer so the verify page
 * works in another browser with no server: the record, the canonical content
 * its hash covers, the issuer's public key, and a name-free summary to display.
 *
 * The canonical string necessarily contains the student's name (the hash covers
 * it). The verify page never renders it; the student chose to share the bundle.
 */

import type { EvidenceRecord, Property, SigningKey } from "@shared/types";
import type { EvidenceView } from "@lib/store/selectors";

export interface VerifySummary {
  course: string;
  institution: string;
  blueprint: string;
  construct: string;
  issuedBy: string;
  criterionScores: { name: string; level: number; points: number }[];
  total: string;
  checks: { property: Property; label: string; gate: string; metricLabel: string }[];
  joint: number | null;
  validations: { organisation: string; reviewerName: string; reviewerRole: string; reviewedAt: string; attested: boolean }[];
}

export interface VerifyBundle {
  version: 1;
  record: EvidenceRecord;
  canonical: string;
  publicJwk: JsonWebKey | null;
  kid: string | null;
  summary: VerifySummary;
}

export function summaryFromView(view: EvidenceView): VerifySummary {
  const g = view.grade;
  const props: Property[] = ["p1", "p2", "p3", "p4"];
  return {
    course: `${view.course.code} · ${view.course.term} · ${view.course.title}`,
    institution: view.course.instructor.institution,
    blueprint: view.blueprint.name,
    construct: view.blueprint.construct,
    issuedBy: view.record?.issuedBy ?? `${view.course.instructor.name} · ${view.course.instructor.institution}`,
    criterionScores: view.blueprint.rubric.map((c) => ({ name: c.name, level: g ? (g.scores[c.id] ?? 0) : 0, points: c.points })),
    total: g ? `${g.total} / ${g.maxTotal}` : "Not graded",
    checks: view.report ? props.map((p) => ({ property: p, label: view.report!.checks[p].label, gate: view.report!.checks[p].gate, metricLabel: view.report!.checks[p].metricLabel })) : [],
    joint: view.report?.joint ?? null,
    validations: view.validations.map((v) => ({ organisation: v.organisation, reviewerName: v.reviewerName, reviewerRole: v.reviewerRole, reviewedAt: v.reviewedAt, attested: v.attested })),
  };
}

export function buildVerifyBundle(view: EvidenceView, record: EvidenceRecord, canonical: string, key: SigningKey | null): VerifyBundle {
  return {
    version: 1,
    record,
    canonical,
    publicJwk: key && record.bridge?.signedWithKid === key.kid ? key.publicJwk : null,
    kid: record.bridge?.signedWithKid ?? null,
    summary: summaryFromView(view),
  };
}
