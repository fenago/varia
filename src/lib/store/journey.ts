import type { Workspace } from "@shared/types";
import { activeBlueprint, activeRun, readinessOf } from "./selectors";

export type JourneyStatus = "done" | "current" | "todo" | "blocked";

export interface JourneyStep {
  /** 1-based step number shown to the instructor */
  n: number;
  key: "load" | "check-found" | "make" | "check-versions" | "release" | "grade";
  path: string;
  label: string;
  status: JourneyStatus;
  /** One muted line under the current step, e.g. "Bayfront's brief · 4 criteria · 28 students" */
  summary?: string;
}

export const JOURNEY_LABELS: { key: JourneyStep["key"]; path: string; label: string }[] = [
  { key: "load", path: "/import", label: "1 · Load your assignment" },
  { key: "check-found", path: "/blueprint", label: "2 · Check what we found" },
  { key: "make", path: "/generate", label: "3 · Make the versions" },
  { key: "check-versions", path: "/report", label: "4 · Check the versions" },
  { key: "release", path: "/roster", label: "5 · Release to students" },
  { key: "grade", path: "/grade", label: "6 · Grade the work" },
];

function possessive(name: string): string {
  const first = name.split(/[·—-]/)[0].trim();
  return first.endsWith("s") ? `${first}'` : `${first}'s`;
}

/**
 * Where the instructor is in the six-step journey, derived from the workspace.
 * "done" is cumulative; the first not-done step is "current".
 */
export function journeyState(ws: Workspace): { steps: JourneyStep[]; current: JourneyStep | null } {
  const bp = activeBlueprint(ws);
  const run = activeRun(ws);
  const runForBp = run && bp && run.blueprintId === bp.id ? run : run;
  const students = ws.roster?.students?.length ?? 0;

  const loaded = !!bp && (bp.source?.files?.length > 0 || bp.taskPrompt?.trim().length > 0 || bp.construct?.trim().length > 0);
  const ready = !!bp && readinessOf(bp).ready;
  const hasReport = !!runForBp?.report;
  const released = !!runForBp?.release;
  const subs = runForBp ? ws.submissions.filter((s) => s.runId === runForBp.id && s.text) : [];
  const hasSubmission = subs.length > 0;
  const instructorGraded = subs.some((s) => s.grade && s.grade.basis !== "suggested");

  const done = [loaded, ready, hasReport, released, hasSubmission, instructorGraded];
  const firstTodo = done.findIndex((d) => !d);

  const summaries: (string | undefined)[] = [
    bp ? `${possessive(bp.name)} blueprint${students ? ` · ${students} students` : ""}` : undefined,
    bp ? `${bp.rubric.length} criteria · ${bp.canonicalSolution?.trim() ? "model answer found" : "no model answer yet"}` : undefined,
    runForBp
      ? `${runForBp.variants.filter((v) => v.text && !v.error).length} of ${runForBp.n} versions · ${runForBp.status}`
      : bp
        ? `${students || "your"} versions to make`
        : undefined,
    runForBp?.report
      ? `${Object.values(runForBp.report.checks).filter((c) => c.gate === "pass").length} of 4 checks pass${runForBp.report.releasable ? " · ready to release" : ""}`
      : undefined,
    released ? `released ${new Date(runForBp!.release!.releasedAt).toLocaleDateString()}` : undefined,
    subs.length ? `${subs.filter((s) => s.grade && s.grade.basis !== "suggested").length} of ${subs.length} graded` : undefined,
  ];

  const steps: JourneyStep[] = JOURNEY_LABELS.map((l, i) => {
    let status: JourneyStatus;
    if (done[i]) status = "done";
    else if (i === firstTodo) status = "current";
    else if (i > 0 && !done[i - 1] && i !== firstTodo) status = "todo";
    else status = "todo";
    return { n: i + 1, key: l.key, path: l.path, label: l.label, status, summary: summaries[i] };
  });
  const current = steps.find((s) => s.status === "current") ?? null;
  return { steps, current };
}
