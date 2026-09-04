/**
 * Pure helpers for the employer-outcomes bridge: scenario edits, evidence
 * canonicalisation and hashing, review packages. No store access.
 */

import type {
  Blueprint,
  Course,
  EmployerChallenge,
  EmployerPartner,
  EmployerValidation,
  EvidenceRecord,
  Grade,
  IntegrityReport,
  ReviewPackage,
  ScenarioEdit,
  SkillTag,
  Student,
  Variant,
  Workspace,
  WorkSampleFields,
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
  /** v3 work-sample fields. Defaults: not included, no skills. */
  submissionIncluded?: boolean;
  submissionText?: string | null;
  skillKeys?: string[];
}

/**
 * The content an evidence record's hash covers (schema v3). Covers whether the
 * submission is included (and a digest of it when it is) and the skill keys,
 * so a record cannot be re-labelled after issue without the hash changing.
 */
export function evidenceCanonical(i: EvidenceCanonicalInput): string {
  const included = !!i.submissionIncluded;
  return canonicalJson({
    recordVersion: 3,
    submissionIncluded: included,
    submissionDigest: included && i.submissionText ? sha256Hex(i.submissionText) : null,
    skillKeys: [...new Set(i.skillKeys ?? [])].sort(),
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

export type WorkspaceForBridge = Pick<
  Workspace,
  "course" | "seededAt" | "blueprints" | "runs" | "submissions" | "roster" | "evidenceRecords" | "verificationEvents" | "signingKey"
> &
  Partial<Pick<Workspace, "skills" | "challenges" | "endorsements" | "outcomes" | "portfolioShares">>;

/** Skill keys a blueprint's rubric evidences (deduped, in criterion order). */
export function skillKeysForBlueprint(bp: Pick<Blueprint, "rubric"> | null | undefined): string[] {
  if (!bp) return [];
  const out: string[] = [];
  for (const c of bp.rubric) for (const k of c.skillKeys ?? []) if (!out.includes(k)) out.push(k);
  return out;
}

/** Resolve skill tags for keys against the workspace's skill list; unknown keys become instructor tags. */
export function resolveSkills(skills: SkillTag[] | undefined, keys: string[]): SkillTag[] {
  return keys.map((k) => skills?.find((s) => s.key === k) ?? { key: k, label: k.replace(/-/g, " ").replace(/^\w/, (m) => m.toUpperCase()), source: "instructor" as const });
}

/** A challenge linked to the blueprint whose domain matches the variant's domain, if any. */
export function deriveChallengeId(
  challenges: EmployerChallenge[] | undefined,
  blueprint: Pick<Blueprint, "id" | "challengeIds"> | null | undefined,
  variant: Pick<Variant, "surfaceAssignment"> | null | undefined,
): string | null {
  if (!challenges?.length || !blueprint || !variant) return null;
  const domain = String(variant.surfaceAssignment.domain ?? "").trim().toLowerCase();
  if (!domain) return null;
  const linked = challenges.filter((c) => c.status === "active" && (c.blueprintIds.includes(blueprint.id) || (blueprint.challengeIds ?? []).includes(c.id)));
  return linked.find((c) => c.domain.trim().toLowerCase() === domain)?.id ?? null;
}

/** Everything a record's canonical content and work-sample defaults need, looked up from the workspace. */
export function recordContext(ws: WorkspaceForBridge, record: Pick<EvidenceRecord, "runId" | "variantId" | "studentId" | "blueprintId">) {
  const run = ws.runs.find((r) => r.id === record.runId) ?? null;
  const variant = run?.variants.find((v) => v.id === record.variantId) ?? null;
  const submission = ws.submissions.find((s) => s.variantId === record.variantId && s.runId === record.runId) ?? null;
  const student = ws.roster.students.find((s) => s.id === record.studentId) ?? null;
  const blueprint = ws.blueprints.find((b) => b.id === record.blueprintId) ?? null;
  return { run, variant, submission, student, blueprint };
}

/** Work-sample defaults for a record: submission not included, skills from the blueprint, challenge derived from the variant's domain. */
export function workSampleDefaults(ws: WorkspaceForBridge, record: Pick<EvidenceRecord, "runId" | "variantId" | "studentId" | "blueprintId">): WorkSampleFields {
  const { variant, blueprint } = recordContext(ws, record);
  return {
    submissionIncluded: false,
    submissionText: null,
    skills: resolveSkills(ws.skills, skillKeysForBlueprint(blueprint)),
    challengeId: deriveChallengeId(ws.challenges, blueprint, variant),
    endorsementIds: [],
  };
}

/** Rebuild the canonical content a record's hash covers, from the workspace. Null if the content is gone. */
export function recordCanonicalPure(ws: WorkspaceForBridge, record: EvidenceRecord): string | null {
  const { run, variant, submission, student, blueprint } = recordContext(ws, record);
  if (!run || !variant || !submission?.grade || !student || !blueprint) return null;
  const sample = record.bridge?.workSample;
  return evidenceCanonical({
    student,
    course: ws.course,
    blueprint,
    variant,
    grade: submission.grade,
    report: run.report,
    validationIds: record.validationIds,
    issuedAt: record.issuedAt,
    submissionIncluded: sample?.submissionIncluded ?? false,
    submissionText: sample?.submissionText ?? null,
    skillKeys: (sample?.skills ?? resolveSkills(ws.skills, skillKeysForBlueprint(blueprint))).map((s) => s.key),
  });
}

export function bridgeFor(ws: WorkspaceForBridge, record: Pick<EvidenceRecord, "id" | "runId" | "variantId" | "studentId" | "blueprintId">): NonNullable<EvidenceRecord["bridge"]> {
  return {
    schemaVersion: 3,
    learnerId: learnerIdFor(ws, record.studentId),
    consent: [],
    credentialId: credentialIdFor(record.id),
    signature: null,
    signedWithKid: null,
    workSample: workSampleDefaults(ws, record),
  };
}

/**
 * Upgrade a workspace: records without a bridge get one (unsigned); v2 records get
 * work-sample defaults and are re-hashed under the v3 canonical (a signature over the
 * old canonical is void, so it is cleared and can be re-signed on demand); the bridge
 * and employability arrays get defaults.
 */
export function withBridgeDefaults<T extends WorkspaceForBridge>(ws: T): T {
  const base: WorkspaceForBridge = {
    ...ws,
    skills: Array.isArray(ws.skills) ? ws.skills : [],
    challenges: Array.isArray(ws.challenges) ? ws.challenges : [],
    endorsements: Array.isArray(ws.endorsements) ? ws.endorsements : [],
    outcomes: Array.isArray(ws.outcomes) ? ws.outcomes : [],
    portfolioShares: Array.isArray(ws.portfolioShares) ? ws.portfolioShares : [],
    verificationEvents: Array.isArray(ws.verificationEvents) ? ws.verificationEvents : [],
    signingKey: ws.signingKey ?? null,
  };
  const evidenceRecords = ws.evidenceRecords.map((r) => {
    if (r.bridge?.workSample) return r;
    const bridge = r.bridge
      ? { ...r.bridge, schemaVersion: 3 as const, workSample: workSampleDefaults(base, r) }
      : bridgeFor(base, r);
    const upgraded: EvidenceRecord = { ...r, bridge };
    const canonical = recordCanonicalPure(base, upgraded);
    if (canonical) {
      const hash = hashEvidence(canonical);
      if (hash !== r.hash) {
        upgraded.hash = hash;
        upgraded.bridge = { ...bridge, signature: null, signedWithKid: null };
      }
    }
    return upgraded;
  });
  return { ...(base as T), evidenceRecords };
}

/** Slug for a skill label: "Fairness analysis" → "fairness-analysis". */
export function slugify(label: string): string {
  return label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Add a challenge's domain, stakeholder role and a scenario line to a blueprint's scenario bank (deduped, locked dims untouched). */
export function applyChallengeToBlueprint(bp: Blueprint, challenge: EmployerChallenge): Blueprint {
  const scenarioLine = `${challenge.organisation} · ${challenge.title.replace(/^audit our\s+/i, "")}`;
  const edits: ScenarioEdit[] = [
    { dimensionKey: "domain", added: [challenge.domain.toLowerCase()], removed: [] },
    { dimensionKey: "stakeholder", added: [challenge.stakeholderRole.toLowerCase()], removed: [] },
    { dimensionKey: "scenario", added: [scenarioLine], removed: [] },
  ];
  const edited = applyScenarioEdits(bp, edits);
  const dims = edited.surfaceDimensions.map((d) => {
    const before = bp.surfaceDimensions.find((x) => x.key === d.key);
    if (!before || before.values.length === d.values.length || d.locked) return { ...d, note: before?.note };
    return { ...d, note: `${d.values.length} values · ${d.values.length - before.values.length} from ${challenge.organisation}` };
  });
  const challengeIds = [...new Set([...(bp.challengeIds ?? []), challenge.id])];
  return { ...edited, surfaceDimensions: dims, challengeIds };
}
