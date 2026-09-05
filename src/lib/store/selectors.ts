/** Pure read-side helpers over a Workspace. No store access, no side effects. */

import type {
  VerificationEvent,
  AuditEvent,
  Blueprint,
  BlueprintDraft,
  InstitutionSet,
  Run,
  Strategy,
  Student,
  Submission,
  SubmissionStatus,
  ThresholdSet,
  Variant,
  Workspace,
  IssuedCredential,
} from "@shared/types";
import { eligibilityOf } from "@lib/badges/credential";
import { DEFAULT_THRESHOLDS, STRATEGY_LABELS } from "@shared/thresholds";
/** "lending" → "Lending"; keeps already-capitalised labels as they are. */
function domainLabel(d: string): string {
  const t = (d ?? "").trim();
  return t ? t[0].toUpperCase() + t.slice(1) : "";
}

export function activeBlueprint(ws: Workspace): Blueprint | null {
  return ws.blueprints.find((b) => b.id === ws.activeBlueprintId) ?? null;
}

export function activeRun(ws: Workspace): Run | null {
  return ws.runs.find((r) => r.id === ws.activeRunId) ?? null;
}

export function runById(ws: Workspace, runId: string | null | undefined): Run | null {
  if (!runId) return null;
  return ws.runs.find((r) => r.id === runId) ?? null;
}

/** Newest completed run for a blueprint, if any. */
export function latestRunForBlueprint(ws: Workspace, blueprintId: string): Run | null {
  const runs = ws.runs.filter((r) => r.blueprintId === blueprintId);
  return runs.length ? runs[runs.length - 1] : null;
}

export function variantById(ws: Workspace, variantId: string, runId?: string | null): { run: Run; variant: Variant } | null {
  const candidates = runId ? ws.runs.filter((r) => r.id === runId) : [...ws.runs].reverse();
  for (const run of candidates) {
    const variant = run.variants.find((v) => v.id === variantId);
    if (variant) return { run, variant };
  }
  return null;
}

export function studentById(ws: Workspace, id: string | null | undefined): Student | null {
  if (!id) return null;
  return ws.roster.students.find((s) => s.id === id) ?? null;
}

export function submissionForVariant(ws: Workspace, variantId: string, runId?: string | null): Submission | null {
  return ws.submissions.find((s) => s.variantId === variantId && (!runId || s.runId === runId)) ?? null;
}

export function openAppealForVariant(ws: Workspace, variantId: string, runId?: string | null) {
  return ws.appeals.find((a) => a.variantId === variantId && a.status === "open" && (!runId || a.runId === runId)) ?? null;
}

export function submissionStatus(ws: Workspace, variant: Variant): SubmissionStatus {
  if (openAppealForVariant(ws, variant.id, variant.runId)) return "appeal";
  const sub = submissionForVariant(ws, variant.id, variant.runId);
  if (!sub || !sub.submittedAt) return "not-started";
  if (sub.grade) return "graded";
  return "submitted";
}

export function domainStakeholderLabel(variant: Variant): string {
  const d = variant.surfaceAssignment.domain;
  const s = variant.surfaceAssignment.stakeholder;
  if (d && s) return `${domainLabel(d)} · ${s}`;
  if (d) return domainLabel(d);
  if (s) return s;
  return "—";
}

export interface RosterRow {
  student: Student | null;
  variant: Variant;
  domainStakeholder: string;
  readingEase: number;
  status: SubmissionStatus;
  scoreLabel: string;
  submission: Submission | null;
}

export function rosterRows(ws: Workspace, runId: string | null | undefined): RosterRow[] {
  const run = runById(ws, runId);
  if (!run) return [];
  const rows = run.variants
    .filter((v) => !v.error && v.text)
    .map((variant) => {
      const student = studentById(ws, variant.studentId);
      const submission = submissionForVariant(ws, variant.id, run.id);
      const status = submissionStatus(ws, variant);
      return {
        student,
        variant,
        domainStakeholder: domainStakeholderLabel(variant),
        readingEase: Math.round(variant.metrics.fleschEase * 10) / 10,
        status,
        scoreLabel: submission?.grade ? `${submission.grade.total} / ${submission.grade.maxTotal}` : "—",
        submission,
      };
    });
  rows.sort((a, b) => {
    const an = a.student?.name ?? "~";
    const bn = b.student?.name ?? "~";
    return an.localeCompare(bn) || a.variant.id.localeCompare(b.variant.id);
  });
  return rows;
}

export function rosterStats(ws: Workspace, runId: string | null | undefined) {
  const run = runById(ws, runId);
  const rows = rosterRows(ws, runId);
  const released = run?.release ? rows.length : 0;
  const submitted = rows.filter((r) => r.status === "submitted" || r.status === "graded" || r.status === "appeal").length;
  const graded = rows.filter((r) => r.status === "graded").length;
  const appealRows = rows.filter((r) => r.status === "appeal");
  const appeals = appealRows.length;
  const first = appealRows[0];
  const appealNote = first
    ? `${first.variant.id}, ${first.variant.flags.p4Outlier ? "over-threshold version" : "within threshold"}`
    : "none open";
  return { released, submitted, graded, appeals, appealNote };
}

/** Next submitted-but-ungraded variant after the given one (wraps around). */
export function nextUngraded(ws: Workspace, runId: string | null | undefined, afterVariantId: string): string | null {
  const rows = rosterRows(ws, runId);
  if (!rows.length) return null;
  const idx = rows.findIndex((r) => r.variant.id === afterVariantId);
  const order = [...rows.slice(idx + 1), ...rows.slice(0, Math.max(idx, 0))];
  const next = order.find((r) => r.status === "submitted" || r.status === "appeal");
  return next?.variant.id ?? null;
}

export function strategyLabel(s: Strategy): string {
  return STRATEGY_LABELS[s] ?? s;
}

export function currentThresholds(ws: Workspace): ThresholdSet {
  return ws.thresholds[ws.thresholds.length - 1] ?? DEFAULT_THRESHOLDS;
}

export function auditNewestFirst(ws: Workspace): AuditEvent[] {
  return [...ws.audit].sort((a, b) => b.at.localeCompare(a.at));
}

/** Project a local run with a report into a console row: released runs as cleared / over-threshold,
 *  unreleased over-threshold runs as blocked (held until regenerated or released with a reason). */
export function institutionRowForRun(ws: Workspace, run: Run): InstitutionSet | null {
  if (!run.report) return null;
  const failing = (["p1", "p2", "p4"] as const).filter((p) => run.report!.checks[p].gate === "fail");
  if (!run.release) {
    if (!failing.length) return null;
    return {
      id: `set-local-${run.id}`,
      course: ws.course.code,
      assessment: run.blueprintName,
      instructor: shortName(ws.course.instructor.name),
      department: "Data Analytics & AI",
      n: run.n,
      strategy: run.strategy,
      joint: Math.round(run.report.joint * 100) / 100,
      failingChecks: failing,
      status: "blocked",
      releasedAt: run.finishedAt ?? run.startedAt,
      reviewedAt: null,
      runId: run.id,
    };
  }
  return {
    id: `set-local-${run.id}`,
    course: ws.course.code,
    assessment: run.blueprintName,
    instructor: shortName(ws.course.instructor.name),
    department: "Data Analytics & AI",
    n: run.n,
    strategy: run.strategy,
    joint: Math.round(run.report.joint * 100) / 100,
    failingChecks: failing,
    status: run.release.overThreshold ? "over-threshold" : "cleared",
    releasedAt: run.release.releasedAt,
    reviewedAt: run.release.overThreshold ? null : run.release.releasedAt,
    runId: run.id,
  };
}

function shortName(full: string): string {
  const parts = full.replace(/^Dr\.?\s+/i, "").split(/\s+/);
  if (parts.length < 2) return full;
  return `${parts[0][0]}. ${parts[parts.length - 1]}`;
}

/** Seeded rows plus local released runs not already linked, newest first. */
export function consoleRows(ws: Workspace): InstitutionSet[] {
  const linked = new Set(ws.institutionSets.map((s) => s.runId).filter(Boolean));
  const local = ws.runs
    .filter((r) => r.report && !linked.has(r.id))
    .map((r) => institutionRowForRun(ws, r))
    .filter((x): x is InstitutionSet => !!x);
  return [...ws.institutionSets, ...local].sort((a, b) => b.releasedAt.localeCompare(a.releasedAt));
}

export function consoleStats(ws: Workspace) {
  if (!ws.institutionSets.length) {
    // Nothing institution-wide is recorded: compute from this workspace's runs only.
    const released = ws.runs.filter((r) => r.release);
    const passingAll = released.filter((r) => r.report?.releasable).length;
    const overThreshold = released.filter((r) => r.release?.overThreshold).length;
    return {
      inUse: released.length,
      courses: new Set(released.map((r) => r.courseId)).size,
      departments: 0,
      passingAll,
      passingPct: released.length ? Math.round((passingAll / released.length) * 100) : 0,
      overThreshold,
      unreviewed: 0,
      runsOnly: true as const,
    };
  }
  const rows = consoleRows(ws);
  const inUseRows = rows.filter((r) => r.status !== "blocked");
  const inUse = inUseRows.length;
  const courses = new Set(inUseRows.map((r) => r.course)).size;
  const departments = new Set(inUseRows.map((r) => r.department)).size;
  const passingAll = inUseRows.filter((r) => r.status === "cleared").length;
  const passingPct = inUse ? Math.round((passingAll / inUse) * 100) : 0;
  const overThreshold = inUseRows.filter((r) => r.status === "over-threshold").length;
  const unreviewed = inUseRows.filter((r) => r.status === "awaiting-sign-off" && !r.reviewedAt).length;
  return { inUse, courses, departments, passingAll, passingPct, overThreshold, unreviewed, runsOnly: false as const };
}

export interface ReadinessItem {
  ok: boolean;
  warn?: boolean;
  text: string;
}

/** The Blueprint page's readiness list. */
export function readinessOf(bp: Blueprint | BlueprintDraft | null): { items: ReadinessItem[]; ready: boolean } {
  if (!bp) return { items: [{ ok: false, text: "No blueprint loaded" }], ready: false };
  const construct = bp.construct.trim().length >= 40;
  const rubric = bp.rubric.length >= 4;
  const solution = bp.canonicalSolution.trim().length >= 80;
  const draftAnchors = bp.rubric.filter((c) => c.anchorsConfidence !== "high").length;
  const items: ReadinessItem[] = [
    { ok: construct, text: construct ? "Construct described" : "Describe the construct (at least a sentence)" },
    { ok: rubric, text: rubric ? "Rubric has ≥ 4 criteria" : `Rubric has ${bp.rubric.length} criteria — add ${4 - bp.rubric.length} more` },
    { ok: solution, text: solution ? "Canonical solution present" : "Canonical solution missing — write one or draft it" },
  ];
  if (draftAnchors > 0) {
    items.push({
      ok: true,
      warn: true,
      text: `${draftAnchors === 1 ? "One criterion has" : `${draftAnchors} criteria have`} draft anchors — the judge is less reliable without them`,
    });
  } else {
    items.push({ ok: true, text: "All criteria have written anchors" });
  }
  return { items, ready: construct && rubric && solution };
}

/** The Import page's extraction summary. */
export function extractionSummary(draft: BlueprintDraft | null, rosterCount: number | null): ReadinessItem[] {
  if (!draft) return [];
  const complete = draft.rubric.filter((c) => c.anchorsConfidence === "high").length;
  const total = draft.rubric.length;
  const words = draft.canonicalSolution ? draft.canonicalSolution.trim().split(/\s+/).length : 0;
  const missing = total - complete;
  const items: ReadinessItem[] = [
    { ok: draft.construct.trim().length > 0, text: "Construct identified" },
    { ok: complete === total, warn: complete !== total, text: `${complete} of ${total} criteria complete` },
    { ok: words > 0, text: words > 0 ? `Model answer ${draft.canonicalSolutionSource === "drafted" ? "drafted" : "found"} · ${words} words` : "No model answer — one will be drafted" },
    { ok: rosterCount !== null && rosterCount > 0, text: rosterCount ? `Roster matched · ${rosterCount} students` : "No roster file — versions will not be assigned to students" },
  ];
  if (missing > 0) {
    items.push({ ok: false, warn: true, text: `${missing} criterion${missing === 1 ? "" : "s"} need${missing === 1 ? "s" : ""} level descriptions` });
  }
  return items;
}

export interface LibraryEntry {
  blueprint: Blueprint;
  sub: string;
  active: boolean;
}

export function blueprintLibrary(ws: Workspace): LibraryEntry[] {
  return ws.blueprints.map((b) => {
    const latest = latestRunForBlueprint(ws, b.id);
    const code = b.code ? `${b.code} · ` : "";
    let sub: string;
    if (b.id === ws.activeBlueprintId) sub = `${code}editing now`;
    else if (latest?.report) sub = `${code}used ${ws.course.term} · J ${latest.report.joint.toFixed(2)}`;
    else if (b.lastUsed) sub = `${code}used ${b.lastUsed.term} · J ${b.lastUsed.joint.toFixed(2)}`;
    else sub = `${code}not yet used`;
    return { blueprint: b, sub, active: b.id === ws.activeBlueprintId };
  });
}

/** Set mean reading ease for the Grade page's comparison note. */
export function readingEaseContext(run: Run | null, variant: Variant | null) {
  if (!run || !variant) return null;
  const eases = run.variants.filter((v) => !v.error && v.text).map((v) => v.metrics.fleschEase);
  if (!eases.length) return null;
  const mean = eases.reduce((a, b) => a + b, 0) / eases.length;
  const delta = variant.metrics.fleschEase - mean;
  const rounded = Math.round(delta * 10) / 10;
  return { mean: Math.round(mean * 10) / 10, delta: rounded, within3: Math.abs(rounded) <= 3 };
}

// ---------------------------------------------------------------------------
// Employer validation and evidence records
// ---------------------------------------------------------------------------

import type { EmployerPartner, EmployerValidation, EvidenceRecord, Grade, IntegrityReport, Course, SkillTag, EmployerChallenge, Endorsement, OutcomeEvent, PortfolioShare } from "@shared/types";
import { EMPLOYER_GOALS } from "@shared/thresholds";
import { learnerIdFor, pickSampleVariants, resolveSkills, skillKeysForBlueprint } from "./employer";

export type BlueprintValidationStatus = "validated" | "changes-requested" | "declined" | "pending";

export function partnerById(ws: Workspace, id: string | null | undefined): EmployerPartner | null {
  if (!id) return null;
  return ws.employerPartners.find((p) => p.id === id) ?? null;
}

/** Newest first. */
export function validationsForBlueprint(ws: Workspace, bpId: string): EmployerValidation[] {
  return ws.employerValidations.filter((v) => v.blueprintId === bpId).sort((a, b) => b.reviewedAt.localeCompare(a.reviewedAt));
}

export function latestValidation(ws: Workspace, bpId: string): EmployerValidation | null {
  return validationsForBlueprint(ws, bpId)[0] ?? null;
}

export function blueprintValidationStatus(ws: Workspace, bpId: string): BlueprintValidationStatus {
  const vs = validationsForBlueprint(ws, bpId);
  if (vs.some((v) => v.status === "validated")) return "validated";
  return vs[0]?.status ?? "pending";
}

export interface EmployerStats {
  blueprints: number;
  validated: number;
  validatedPct: number;
  partners: number;
  adopted: number;
  adoptedPct: number;
  satisfactionMean: number | null;
  responses: number;
  goals: typeof EMPLOYER_GOALS;
  /** partners with ≥1 valid verification event / partners (observed adoption) */
  observedAdoptedPct: number;
  /** "hired" outcome events logged against records */
  hires: number;
}

export function employerStats(ws: Workspace): EmployerStats {
  const blueprints = ws.blueprints.length;
  const validated = ws.blueprints.filter((b) => blueprintValidationStatus(ws, b.id) === "validated").length;
  const partners = ws.employerPartners.length;
  const adopted = ws.employerPartners.filter((p) => p.adoptedEvidenceRecords).length;
  const surveys = ws.employerValidations.map((v) => v.satisfaction).filter((s): s is NonNullable<typeof s> => !!s);
  const means = surveys.map((s) => (s.realism + s.rubricFit + s.fairness + s.trust + s.adoptionIntent) / 5);
  const satisfactionMean = means.length ? Math.round((means.reduce((a, b) => a + b, 0) / means.length) * 100) / 100 : null;
  return {
    blueprints,
    validated,
    validatedPct: blueprints ? validated / blueprints : 0,
    partners,
    adopted,
    adoptedPct: partners ? adopted / partners : 0,
    satisfactionMean,
    responses: surveys.length,
    goals: EMPLOYER_GOALS,
    observedAdoptedPct: adoptionObserved(ws).observedAdoptedPct,
    hires: (ws.outcomes ?? []).filter((o) => o.kind === "hired").length,
  };
}

export function sampleVariantsFor(ws: Workspace, bpId: string): Variant[] {
  const run = latestRunForBlueprint(ws, bpId);
  return run ? pickSampleVariants(run.variants) : [];
}

export function evidenceForVariant(ws: Workspace, variantId: string): EvidenceRecord | null {
  return ws.evidenceRecords.find((r) => r.variantId === variantId) ?? null;
}

export interface EvidenceView {
  record: EvidenceRecord | null;
  student: Student;
  course: Course;
  blueprint: Blueprint;
  variant: Variant;
  run: Run;
  submission: Submission | null;
  grade: Grade | null;
  report: IntegrityReport | null;
  validations: EmployerValidation[];
  partnerNames: string[];
}

export function evidenceView(ws: Workspace, variantId: string): EvidenceView | null {
  const record = evidenceForVariant(ws, variantId);
  const found = variantById(ws, variantId, record?.runId ?? null);
  if (!found) return null;
  const { run, variant } = found;
  const student = studentById(ws, variant.studentId);
  const blueprint = ws.blueprints.find((b) => b.id === run.blueprintId) ?? null;
  if (!student || !blueprint) return null;
  const submission = submissionForVariant(ws, variantId, run.id);
  const validations = record
    ? ws.employerValidations.filter((v) => record.validationIds.includes(v.id))
    : validationsForBlueprint(ws, blueprint.id).filter((v) => v.status === "validated");
  return {
    record,
    student,
    course: ws.course,
    blueprint,
    variant,
    run,
    submission,
    grade: submission?.grade ?? null,
    report: run.report,
    validations,
    partnerNames: [...new Set(validations.map((v) => v.organisation))],
  };
}

export interface EvidenceRow {
  record: EvidenceRecord;
  student: Student | null;
  blueprintName: string;
  issuedAt: string;
}

export function evidenceRows(ws: Workspace): EvidenceRow[] {
  return [...ws.evidenceRecords]
    .sort((a, b) => b.issuedAt.localeCompare(a.issuedAt))
    .map((record) => ({
      record,
      student: studentById(ws, record.studentId),
      blueprintName: ws.blueprints.find((b) => b.id === record.blueprintId)?.name ?? "",
      issuedAt: record.issuedAt,
    }));
}

export interface EmployerBlueprintRow {
  blueprint: Blueprint;
  status: BlueprintValidationStatus;
  latest: EmployerValidation | null;
  partnerName: string | null;
  sampleCount: number;
}

export function blueprintRowsForEmployer(ws: Workspace): EmployerBlueprintRow[] {
  return ws.blueprints.map((blueprint) => {
    const latest = latestValidation(ws, blueprint.id);
    return {
      blueprint,
      status: blueprintValidationStatus(ws, blueprint.id),
      latest,
      partnerName: latest ? (partnerById(ws, latest.partnerId)?.organisation ?? latest.organisation) : null,
      sampleCount: sampleVariantsFor(ws, blueprint.id).length,
    };
  });
}

// ---------------------------------------------------------------------------
// Structural bridge: verification events (observed adoption)
// ---------------------------------------------------------------------------

export function verificationsForRecord(ws: Workspace, recordId: string): VerificationEvent[] {
  return (ws.verificationEvents ?? []).filter((e) => e.recordId === recordId).sort((a, b) => b.at.localeCompare(a.at));
}

export interface AdoptionObserved {
  /** Partners with at least one valid verification event (matched by organisation name) */
  partnersWithVerifications: number;
  verifications: number;
  observedAdoptedPct: number;
}

export function adoptionObserved(ws: Workspace): AdoptionObserved {
  const events = (ws.verificationEvents ?? []).filter((e) => e.result === "valid");
  const orgs = new Set(events.map((e) => (e.byOrganisation ?? "").trim().toLowerCase()).filter(Boolean));
  const partnersWithVerifications = ws.employerPartners.filter((p) => orgs.has(p.organisation.trim().toLowerCase())).length;
  return {
    partnersWithVerifications,
    verifications: events.length,
    observedAdoptedPct: ws.employerPartners.length ? partnersWithVerifications / ws.employerPartners.length : 0,
  };
}


// ---------------------------------------------------------------------------
// Employability bridge: skills, challenges, work samples, portfolio, talent, outcomes
// ---------------------------------------------------------------------------

export function skillByKey(ws: Workspace, key: string): SkillTag | null {
  return (ws.skills ?? []).find((s) => s.key === key) ?? null;
}

export function skillsForBlueprint(ws: Workspace, bp: Blueprint | null | undefined): SkillTag[] {
  return resolveSkills(ws.skills, skillKeysForBlueprint(bp));
}

export function challengeById(ws: Workspace, id: string | null | undefined): EmployerChallenge | null {
  if (!id) return null;
  return (ws.challenges ?? []).find((c) => c.id === id) ?? null;
}

export function challengesForPartner(ws: Workspace, partnerId: string): EmployerChallenge[] {
  return (ws.challenges ?? []).filter((c) => c.partnerId === partnerId);
}

export function endorsementsForRecord(ws: Workspace, recordId: string): Endorsement[] {
  return (ws.endorsements ?? []).filter((e) => e.recordId === recordId).sort((a, b) => b.at.localeCompare(a.at));
}

export function outcomesForRecord(ws: Workspace, recordId: string): OutcomeEvent[] {
  return (ws.outcomes ?? []).filter((o) => o.recordId === recordId).sort((a, b) => a.at.localeCompare(b.at));
}

function orgKey(s: string | null | undefined): string {
  return (s ?? "").trim().toLowerCase();
}

/** Organisations a record is currently shared with via consent events ("*" = anyone). Later revokes cancel earlier shares. */
export function sharedWith(record: EvidenceRecord): Set<string> {
  const out = new Set<string>();
  for (const c of record.bridge?.consent ?? []) {
    const key = c.toOrganisation ? orgKey(c.toOrganisation) : "*";
    if (c.action === "shared") out.add(key);
    else out.delete(key);
  }
  return out;
}

/** Active portfolio shares that include a record, to an organisation ("*" = public). */
export function portfolioSharesFor(ws: Workspace, recordId: string): PortfolioShare[] {
  return (ws.portfolioShares ?? []).filter((p) => !p.revokedAt && p.recordIds.includes(recordId));
}

export type SharedVia = "consent" | "portfolio" | "public";

/** How a record reaches an organisation, if at all. */
export function sharedViaFor(ws: Workspace, record: EvidenceRecord, organisation: string): SharedVia | null {
  const key = orgKey(organisation);
  const consent = sharedWith(record);
  if (consent.has(key)) return "consent";
  const shares = portfolioSharesFor(ws, record.id);
  if (shares.some((p) => orgKey(p.toOrganisation) === key)) return "portfolio";
  if (consent.has("*") || shares.some((p) => p.toOrganisation === null)) return "public";
  return null;
}

/** Records shared to any organisation (or publicly) and not since revoked. */
export function isSharedAnywhere(ws: Workspace, record: EvidenceRecord): boolean {
  return sharedWith(record).size > 0 || portfolioSharesFor(ws, record.id).length > 0;
}

export interface EmployerFunnel {
  challenges: number;
  completed: number;
  shared: number;
  endorsed: number;
  interviewed: number;
  hired: number;
}

/** Challenge → completed → shared → endorsed → interviewed → hired, for one partner or the whole workspace. */
export function employerFunnel(ws: Workspace, partnerId?: string | null): EmployerFunnel {
  const partner = partnerId ? partnerById(ws, partnerId) : null;
  const challenges = partner ? challengesForPartner(ws, partner.id) : (ws.challenges ?? []);
  const linkedBlueprintIds = new Set(challenges.flatMap((c) => c.blueprintIds));
  for (const b of ws.blueprints) if ((b.challengeIds ?? []).some((id) => challenges.some((c) => c.id === id))) linkedBlueprintIds.add(b.id);
  const runIds = new Set(ws.runs.filter((r) => !partner || linkedBlueprintIds.has(r.blueprintId)).map((r) => r.id));
  const completed = ws.submissions.filter((s) => s.grade && runIds.has(s.runId)).length;
  const records = ws.evidenceRecords.filter((r) => runIds.has(r.runId));
  const shared = records.filter((r) => (partner ? sharedViaFor(ws, r, partner.organisation) !== null : isSharedAnywhere(ws, r))).length;
  const byOrg = (org: string) => !partner || orgKey(org) === orgKey(partner.organisation);
  const endorsed = new Set((ws.endorsements ?? []).filter((e) => byOrg(e.organisation) && records.some((r) => r.id === e.recordId)).map((e) => e.recordId)).size;
  const outcomes = (ws.outcomes ?? []).filter((o) => byOrg(o.organisation) && records.some((r) => r.id === o.recordId));
  const interviewed = new Set(outcomes.filter((o) => o.kind === "interviewed").map((o) => o.learnerId)).size;
  const hired = new Set(outcomes.filter((o) => o.kind === "hired").map((o) => o.learnerId)).size;
  return { challenges: challenges.length, completed, shared, endorsed, interviewed, hired };
}

export interface LearnerWithRecords {
  learnerId: string;
  student: Student;
  records: EvidenceRecord[];
}

export function learnersWithRecords(ws: Workspace): LearnerWithRecords[] {
  const out: LearnerWithRecords[] = [];
  for (const student of ws.roster.students) {
    const records = ws.evidenceRecords.filter((r) => r.studentId === student.id);
    if (!records.length) continue;
    out.push({ learnerId: records[0].bridge?.learnerId ?? learnerIdFor(ws, student.id), student, records });
  }
  return out.sort((a, b) => a.student.name.localeCompare(b.student.name));
}

export interface PortfolioItem {
  record: EvidenceRecord;
  view: EvidenceView;
  challenge: EmployerChallenge | null;
  endorsements: Endorsement[];
  outcomes: OutcomeEvent[];
  shares: PortfolioShare[];
}

export interface Portfolio {
  learnerId: string;
  student: Student;
  course: Course;
  skills: { skill: SkillTag; count: number }[];
  items: PortfolioItem[];
}

export function portfolioFor(ws: Workspace, learnerId: string): Portfolio | null {
  const learner = learnersWithRecords(ws).find((l) => l.learnerId === learnerId);
  if (!learner) return null;
  const items: PortfolioItem[] = [];
  const counts = new Map<string, { skill: SkillTag; count: number }>();
  for (const record of [...learner.records].sort((a, b) => b.issuedAt.localeCompare(a.issuedAt))) {
    const view = evidenceView(ws, record.variantId);
    if (!view) continue;
    const skills = record.bridge?.workSample?.skills ?? skillsForBlueprint(ws, view.blueprint);
    for (const sk of skills) {
      const cur = counts.get(sk.key);
      if (cur) cur.count += 1;
      else counts.set(sk.key, { skill: sk, count: 1 });
    }
    items.push({
      record,
      view,
      challenge: challengeById(ws, record.bridge?.workSample?.challengeId),
      endorsements: endorsementsForRecord(ws, record.id),
      outcomes: outcomesForRecord(ws, record.id),
      shares: portfolioSharesFor(ws, record.id),
    });
  }
  return {
    learnerId,
    student: learner.student,
    course: ws.course,
    skills: [...counts.values()].sort((a, b) => b.count - a.count || a.skill.label.localeCompare(b.skill.label)),
    items,
  };
}

export interface TalentRow {
  learnerId: string;
  record: EvidenceRecord;
  view: EvidenceView;
  challenge: EmployerChallenge | null;
  skills: SkillTag[];
  total: number | null;
  endorsements: Endorsement[];
  outcomes: OutcomeEvent[];
  sharedVia: SharedVia;
}

/**
 * Learners whose records reach this partner (consent to the organisation, a portfolio share
 * to it, or a public share), filtered to the partner's challenge domains when it has challenges.
 */
export function talentRows(ws: Workspace, partnerId: string): TalentRow[] {
  const partner = partnerById(ws, partnerId);
  if (!partner) return [];
  const challenges = challengesForPartner(ws, partnerId).filter((c) => c.status === "active");
  const domains = new Set(challenges.map((c) => orgKey(c.domain)));
  const rows: TalentRow[] = [];
  for (const record of ws.evidenceRecords) {
    const sharedVia = sharedViaFor(ws, record, partner.organisation);
    if (!sharedVia) continue;
    const view = evidenceView(ws, record.variantId);
    if (!view) continue;
    const challenge = challengeById(ws, record.bridge?.workSample?.challengeId);
    // A public share is narrowed to the partner's challenge domains; an explicit share to this
    // organisation (consent or portfolio) is the learner's choice and always shows.
    if (domains.size && sharedVia === "public") {
      const domain = orgKey(challenge?.domain ?? String(view.variant.surfaceAssignment.domain ?? ""));
      if (!domains.has(domain)) continue;
    }
    rows.push({
      learnerId: record.bridge?.learnerId ?? learnerIdFor(ws, record.studentId),
      record,
      view,
      challenge,
      skills: record.bridge?.workSample?.skills ?? skillsForBlueprint(ws, view.blueprint),
      total: view.grade?.total ?? null,
      endorsements: endorsementsForRecord(ws, record.id),
      outcomes: outcomesForRecord(ws, record.id),
      sharedVia,
    });
  }
  return rows.sort((a, b) => (b.total ?? 0) - (a.total ?? 0) || b.record.issuedAt.localeCompare(a.record.issuedAt));
}

export interface OutcomeStats {
  interviewed: number;
  offered: number;
  hired: number;
  ramped: number;
  promoted: number;
  meanOnboardingHours: number | null;
}

export function outcomeStats(ws: Workspace): OutcomeStats {
  const all = ws.outcomes ?? [];
  const count = (k: OutcomeEvent["kind"]) => new Set(all.filter((o) => o.kind === k).map((o) => o.learnerId)).size;
  const hours = all.filter((o) => o.kind === "ramped" && typeof o.onboardingHours === "number").map((o) => o.onboardingHours as number);
  return {
    interviewed: count("interviewed"),
    offered: count("offered"),
    hired: count("hired"),
    ramped: count("ramped"),
    promoted: count("promoted"),
    meanOnboardingHours: hours.length ? Math.round((hours.reduce((a, b) => a + b, 0) / hours.length) * 10) / 10 : null,
  };
}


// ---------------------------------------------------------------------------
// Wave 4: submissions import preview
// ---------------------------------------------------------------------------

import { matchSubmissionFiles, type MatchResult } from "@lib/release/submissionMatch";

export interface SubmissionImportRow extends MatchResult {
  studentName: string | null;
  alreadySubmitted: boolean;
}

/** Match uploaded file names to students on a run and flag rows that would overwrite a submission. */
export function submissionImportPreview(ws: Workspace, runId: string | null | undefined, fileNames: string[]): SubmissionImportRow[] {
  const run = runById(ws, runId);
  if (!run) return fileNames.map((fileName) => ({ fileName, studentId: null, variantId: null, reason: "unmatched", studentName: null, alreadySubmitted: false }));
  return matchSubmissionFiles(fileNames, ws.roster, run).map((m) => ({
    ...m,
    studentName: m.studentId ? (studentById(ws, m.studentId)?.name ?? null) : null,
    alreadySubmitted: !!(m.variantId && submissionForVariant(ws, m.variantId, run.id)?.submittedAt),
  }));
}

/** Variants on a run that have no submission yet, for the mapping select. */
export function unassignedVariantOptions(ws: Workspace, runId: string | null | undefined): { variantId: string; label: string }[] {
  const run = runById(ws, runId);
  if (!run) return [];
  return run.variants
    .filter((v) => !v.error && v.text)
    .map((v) => ({ variantId: v.id, label: `${studentById(ws, v.studentId)?.name ?? "Unassigned"} · ${v.id}` }));
}


// ---------------------------------------------------------------------------
// Wave 7: credentials
// ---------------------------------------------------------------------------

export function credentialForRecord(ws: Workspace, recordId: string): IssuedCredential | null {
  const all = (ws.credentials ?? []).filter((c) => c.recordId === recordId);
  return all.find((c) => !c.revokedAt) ?? all[all.length - 1] ?? null;
}

export function credentialById(ws: Workspace, id: string): IssuedCredential | null {
  return (ws.credentials ?? []).find((c) => c.id === id) ?? null;
}

/** Plain-words eligibility for issuing a credential on a record (by record id). */
export function credentialEligibility(ws: Workspace, recordId: string): { eligible: boolean; missing: string[] } {
  const record = ws.evidenceRecords.find((r) => r.id === recordId) ?? null;
  const view = record ? evidenceView(ws, record.variantId) : null;
  return eligibilityOf({
    record,
    grade: view?.grade ?? null,
    validations: view?.validations ?? [],
    endorsements: record ? endorsementsForRecord(ws, record.id) : [],
  });
}

/** Same, addressed by variant id (the Evidence page's key). */
export function credentialEligibilityForVariant(ws: Workspace, variantId: string): { eligible: boolean; missing: string[] } {
  const record = evidenceForVariant(ws, variantId);
  if (!record) return eligibilityOf({ record: null, grade: null, validations: [], endorsements: [] });
  return credentialEligibility(ws, record.id);
}
