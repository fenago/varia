/**
 * Pure helpers for the employer-outcomes bridge: scenario edits, evidence
 * canonicalisation and hashing, review packages. No store access.
 */

import type {
  Blueprint,
  Course,
  EmployerPartner,
  EmployerValidation,
  EvidenceRecord,
  Grade,
  IntegrityReport,
  ReviewPackage,
  ScenarioEdit,
  Student,
  Variant,
  Workspace,
} from "@shared/types";
import { sha256Hex } from "./sha256";

/** Stable JSON: object keys sorted recursively, arrays kept in order. */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortKeys(value));
}

function sortKeys(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(sortKeys);
  if (v && typeof v === "object") {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(v as Record<string, unknown>).sort()) out[k] = sortKeys((v as Record<string, unknown>)[k]);
    return out;
  }
  return v;
}

export function hashEvidence(canonical: string): string {
  return sha256Hex(canonical);
}

export interface EvidenceCanonicalInput {
  student: Student;
  course: Course;
  blueprint: Blueprint;
  variant: Variant;
  grade: Grade;
  report: IntegrityReport | null;
  validationIds: string[];
  issuedAt: string;
}

/** The content an evidence record's hash covers. */
export function evidenceCanonical(i: EvidenceCanonicalInput): string {
  return canonicalJson({
    recordVersion: 1,
    student: i.student.name,
    course: `${i.course.code} · ${i.course.term}`,
    blueprint: i.blueprint.name,
    taskText: i.variant.text,
    criterionScores: i.blueprint.rubric.map((c) => ({ name: c.name, level: i.grade.scores[c.id] ?? 0, points: c.points })),
    reportChecks: i.report
      ? (["p1", "p2", "p3", "p4"] as const).map((p) => ({ property: p, gate: i.report!.checks[p].gate, value: i.report!.checks[p].value }))
      : [],
    validationIds: [...i.validationIds].sort(),
    issuedAt: i.issuedAt,
  });
}

/** "VR-2026-0003": next sequential id for the year among existing records. */
export function nextEvidenceId(records: EvidenceRecord[], year: number): string {
  const prefix = `VR-${year}-`;
  let max = 0;
  for (const r of records) {
    if (r.id.startsWith(prefix)) {
      const n = Number(r.id.slice(prefix.length));
      if (Number.isFinite(n) && n > max) max = n;
    }
  }
  return `${prefix}${String(max + 1).padStart(4, "0")}`;
}

/** Apply reviewer scenario edits to a blueprint's surface dimensions. Locked dims are never touched. */
export function applyScenarioEdits(bp: Blueprint, edits: ScenarioEdit[]): Blueprint {
  if (!edits.length) return bp;
  const dims = bp.surfaceDimensions.map((d) => {
    const edit = edits.find((e) => e.dimensionKey === d.key);
    if (!edit || d.locked) return d;
    const removed = new Set(edit.removed.map((x) => x.trim().toLowerCase()));
    const kept = d.values.filter((v) => !removed.has(v.trim().toLowerCase()));
    const seen = new Set(kept.map((v) => v.trim().toLowerCase()));
    const added: string[] = [];
    for (const a of edit.added) {
      const t = a.trim();
      if (!t || seen.has(t.toLowerCase())) continue;
      seen.add(t.toLowerCase());
      added.push(t);
    }
    const values = [...kept, ...added];
    return { ...d, values, note: `${values.length} values · ${added.length ? `${added.length} added by employer` : "employer reviewed"}` };
  });
  return { ...bp, surfaceDimensions: dims };
}

export function findPartnerByOrganisation(partners: EmployerPartner[], organisation: string): EmployerPartner | null {
  const key = organisation.trim().toLowerCase();
  if (!key) return null;
  return partners.find((p) => p.organisation.trim().toLowerCase() === key) ?? null;
}

export function validationStatusText(v: Pick<EmployerValidation, "status">): string {
  return v.status === "validated" ? "validated" : v.status === "changes-requested" ? "requested changes to" : "declined";
}

/** Sample variants for a review: the mockup trio when present, else the first three scorable. */
export function pickSampleVariants(variants: Variant[]): Variant[] {
  const scorable = variants.filter((v) => v.status !== "rejected" && !v.error);
  const trio = ["v-04", "v-07", "v-11"].map((id) => scorable.find((v) => v.id === id)).filter((v): v is Variant => !!v);
  if (trio.length === 3) return trio;
  return scorable.slice(0, 3);
}

export function buildReviewPackagePure(
  ws: Pick<Workspace, "blueprints" | "runs" | "course" | "employerPartners">,
  blueprintId: string,
  partnerId: string | null,
  issuedAt: string,
): ReviewPackage {
  const blueprint = ws.blueprints.find((b) => b.id === blueprintId);
  if (!blueprint) throw new Error(`No blueprint ${blueprintId}`);
  const runs = ws.runs.filter((r) => r.blueprintId === blueprintId);
  const latest = runs.length ? runs[runs.length - 1] : null;
  const partner = partnerId ? (ws.employerPartners.find((p) => p.id === partnerId) ?? null) : null;
  return {
    version: 1,
    issuedAt,
    issuedBy: `${ws.course.instructor.name} · ${ws.course.instructor.institution}`,
    course: ws.course,
    blueprint,
    sampleVariants: (latest ? pickSampleVariants(latest.variants) : []).map((v) => ({
      id: v.id,
      text: v.text,
      surfaceAssignment: v.surfaceAssignment,
      adaptedSolution: v.adaptedSolution,
    })),
    partner: partner ? { id: partner.id, organisation: partner.organisation, sector: partner.sector } : null,
    report: latest?.report ?? null,
  };
}

// ---------------------------------------------------------------------------
// Structural bridge: learner identity and record schema v2
// ---------------------------------------------------------------------------

/** Stable learner identifier that is not the name: "L-" + 12 hex of sha256(studentId|courseId|seededAt). */
export function learnerIdFor(ws: Pick<Workspace, "course" | "seededAt">, studentId: string): string {
  return "L-" + sha256Hex(`${studentId}|${ws.course.id}|${ws.seededAt}`).slice(0, 12);
}

/** Credential id for a record: a URL on this origin when in a browser, a URN otherwise. */
export function credentialIdFor(recordId: string): string {
  return typeof location !== "undefined" && location.origin ? `${location.origin}/verify/${recordId}` : `urn:varia:${recordId}`;
}

export function bridgeFor(ws: Pick<Workspace, "course" | "seededAt">, record: Pick<EvidenceRecord, "id" | "studentId">): NonNullable<EvidenceRecord["bridge"]> {
  return {
    schemaVersion: 2,
    learnerId: learnerIdFor(ws, record.studentId),
    consent: [],
    credentialId: credentialIdFor(record.id),
    signature: null,
    signedWithKid: null,
  };
}

/** Upgrade a workspace in place-of: records without a bridge get one (unsigned); bridge arrays get defaults. */
export function withBridgeDefaults<T extends Pick<Workspace, "course" | "seededAt" | "evidenceRecords" | "verificationEvents" | "signingKey">>(ws: T): T {
  const evidenceRecords = ws.evidenceRecords.map((r) => (r.bridge ? r : { ...r, bridge: bridgeFor(ws, r) }));
  return {
    ...ws,
    evidenceRecords,
    verificationEvents: Array.isArray(ws.verificationEvents) ? ws.verificationEvents : [],
    signingKey: ws.signingKey ?? null,
  };
}
