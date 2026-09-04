/** Pure read-side helpers over a Workspace. No store access, no side effects. */

import type {
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
} from "@shared/types";
import { DEFAULT_THRESHOLDS, STRATEGY_LABELS } from "@shared/thresholds";
import { domainLabel } from "./seedVariants";

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

/** Project a released local run into a console row. */
export function institutionRowForRun(ws: Workspace, run: Run): InstitutionSet | null {
  if (!run.release || !run.report) return null;
  const failing = (["p1", "p2", "p4"] as const).filter((p) => run.report!.checks[p].gate === "fail");
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
    .filter((r) => r.release && r.report && !linked.has(r.id))
    .map((r) => institutionRowForRun(ws, r))
    .filter((x): x is InstitutionSet => !!x);
  return [...ws.institutionSets, ...local].sort((a, b) => b.releasedAt.localeCompare(a.releasedAt));
}

export function consoleStats(ws: Workspace) {
  const rows = consoleRows(ws);
  const inUseRows = rows.filter((r) => r.status !== "blocked");
  const inUse = inUseRows.length;
  const courses = new Set(inUseRows.map((r) => r.course)).size;
  const departments = new Set(inUseRows.map((r) => r.department)).size;
  const passingAll = inUseRows.filter((r) => r.status === "cleared").length;
  const passingPct = inUse ? Math.round((passingAll / inUse) * 100) : 0;
  const overThreshold = inUseRows.filter((r) => r.status === "over-threshold").length;
  const unreviewed = inUseRows.filter((r) => r.status === "awaiting-sign-off" && !r.reviewedAt).length;
  return { inUse, courses, departments, passingAll, passingPct, overThreshold, unreviewed };
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
