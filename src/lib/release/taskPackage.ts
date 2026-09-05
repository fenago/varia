import type { Workspace } from "@shared/types";
import { encodePackage } from "@lib/share";
import { DEMO_DUE_LABEL, DEMO_RUN_ID } from "@lib/store/seed";

/**
 * What a student receives. Deliberately narrow: no adapted solution, no metrics,
 * no other students, no anchors. Built once per variant and carried in the link.
 */
export interface TaskPackage {
  version: 1;
  variantId: string;
  course: { code: string; term: string; title: string; institution: string };
  blueprintName: string;
  /** First sentence(s) of the construct: what the student must produce */
  deliverable: string;
  rubric: { name: string; points: number }[];
  maxPoints: number;
  text: string;
  dueLabel: string;
  /** "Alvarez, R." → "R. Alvarez"; never the full first name */
  studentLabel: string | null;
  instructorName: string;
  issuedAt: string;
}

export function dueLabelFor(ws: Workspace, runId: string): string {
  return runId === DEMO_RUN_ID ? DEMO_DUE_LABEL : "no due date set";
}

export function buildTaskPackage(ws: Workspace, variantId: string, runId?: string | null): TaskPackage | null {
  const runs = runId ? ws.runs.filter((r) => r.id === runId) : [...ws.runs].reverse();
  for (const run of runs) {
    const variant = run.variants.find((v) => v.id === variantId);
    if (!variant) continue;
    const bp = ws.blueprints.find((b) => b.id === run.blueprintId);
    const student = variant.studentId ? ws.roster.students.find((s) => s.id === variant.studentId) ?? null : null;
    const rubric = (bp?.rubric ?? []).map((c) => ({ name: c.name, points: c.points }));
    return {
      version: 1,
      variantId: variant.id,
      course: { code: ws.course.code, term: ws.course.term, title: ws.course.title, institution: ws.course.instructor.institution },
      blueprintName: run.blueprintName,
      deliverable: bp?.construct ?? "",
      rubric,
      maxPoints: rubric.reduce((a, c) => a + c.points, 0),
      text: variant.text,
      dueLabel: dueLabelFor(ws, run.id),
      studentLabel: student ? studentLabel(student.name) : null,
      instructorName: ws.course.instructor.name,
      issuedAt: run.release?.releasedAt ?? new Date().toISOString(),
    };
  }
  return null;
}

/** "Alvarez, R." or "Alvarez, Rosa" → "R. Alvarez" */
export function studentLabel(name: string): string {
  const [last, first = ""] = name.split(",").map((s) => s.trim());
  const initial = first ? `${first[0].toUpperCase()}.` : "";
  return [initial, last].filter(Boolean).join(" ");
}

/** `${origin}/task/:variantId#pkg=<encoded>` */
export async function taskLink(pkg: TaskPackage): Promise<string> {
  const origin = typeof location !== "undefined" && location.origin ? location.origin : "";
  return `${origin}/task/${pkg.variantId}#pkg=${await encodePackage(pkg)}`;
}

/** Plain-text rendering for "Copy my task as text" and Markdown exports. */
export function taskAsText(pkg: TaskPackage): string {
  const lines = [
    `${pkg.blueprintName} (${pkg.maxPoints} points)`,
    `${pkg.course.code} · ${pkg.course.term} · ${pkg.course.title}`,
    pkg.studentLabel ? `Prepared for ${pkg.studentLabel} · version ${pkg.variantId}` : `Version ${pkg.variantId}`,
    `Due: ${pkg.dueLabel}`,
    ``,
    `YOUR TASK`,
    pkg.text,
    ``,
    `WHAT YOU MUST PRODUCE`,
    pkg.deliverable,
    ``,
    `HOW IT IS GRADED`,
    ...pkg.rubric.map((c) => `- ${c.name} (${c.points} points)`),
    ``,
    `Instructor: ${pkg.instructorName}, ${pkg.course.institution}`,
  ];
  return lines.join("\n");
}
