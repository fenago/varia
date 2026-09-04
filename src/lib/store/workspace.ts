/**
 * The one persisted Workspace (localStorage["varia.workspace.v1"]) plus every
 * action the pages call. No database: this store is the whole back end.
 */

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type {
  Appeal,
  AuditKind,
  Blueprint,
  BlueprintDraft,
  Criterion,
  LevelScore,
  ModelId,
  Property,
  Roster,
  Run,
  Strategy,
  Submission,
  ThreatProfile,
  ThresholdSet,
  Workspace,
} from "@shared/types";
import { PROPERTY_LABELS } from "@shared/thresholds";
import { computeReport } from "@lib/metrics";
import { estimateRunCost } from "@lib/llm";
import { newId, nowIso } from "./ids";
import { runGeneration } from "./orchestrator";
import { buildDemoWorkspace, DEMO_INSTRUCTOR } from "./seed";
import { activeBlueprint, currentThresholds, institutionRowForRun, runById, variantById } from "./selectors";
import { getProvider, getSettings } from "./settings";

const LS_KEY = "varia.workspace.v1";

export interface StartRunOptions {
  threatProfile: ThreatProfile;
  strategy: Strategy;
  n: number;
  enabledDimensions: string[];
  generatorModel: ModelId;
  judgeModel: ModelId;
  judgeSamples: number;
}

export interface WorkspaceActions {
  resetToDemo: () => void;
  exportJson: () => string;
  importJson: (json: string) => void;

  setRoster: (roster: Roster) => void;
  setPendingDraft: (draft: BlueprintDraft | null) => void;
  saveDraftAsBlueprint: () => Blueprint;
  addBlueprint: (bp: Blueprint) => void;
  updateBlueprint: (id: string, patch: Partial<Blueprint>) => void;
  setActiveBlueprint: (id: string) => void;
  patchCriterion: (bpId: string, critId: string, patch: Partial<Criterion>) => void;
  addCriterion: (bpId: string) => Criterion;
  removeCriterion: (bpId: string, critId: string) => void;

  startRun: (opts: StartRunOptions) => Promise<string>;
  cancelRun: () => void;
  regenerateAndRelease: (runId: string) => Promise<void>;
  releaseAnyway: (runId: string, reason: string) => void;
  sendToReviewer: (runId: string) => void;

  saveGrade: (variantId: string, scores: Record<string, LevelScore>) => void;
  openAppeal: (variantId: string, note: string) => void;
  resolveAppeal: (id: string, resolution: string) => void;

  setThreshold: (patch: Partial<Pick<ThresholdSet, "p1Cosine" | "p2Equivalence" | "p4FleschSigma">>, by: string) => void;
  addAudit: (kind: AuditKind, text: string, runId?: string) => void;
}

export type WorkspaceState = Workspace & { runAbort: AbortController | null } & WorkspaceActions;

function seed(): Workspace {
  return buildDemoWorkspace(computeReport);
}

function withRun(ws: Workspace, run: Run): Run[] {
  const i = ws.runs.findIndex((r) => r.id === run.id);
  if (i < 0) return [...ws.runs, run];
  const copy = [...ws.runs];
  copy[i] = run;
  return copy;
}

function auditEvent(kind: AuditKind, text: string, actor: string, runId?: string) {
  return { id: newId("aud"), at: nowIso(), actor, kind, text, runId };
}

function upsertInstitutionRow(ws: Workspace, run: Run): Workspace["institutionSets"] {
  const row = institutionRowForRun(ws, run);
  if (!row) return ws.institutionSets;
  const existing = ws.institutionSets.find((s) => s.runId === run.id);
  if (existing) {
    return ws.institutionSets.map((s) => (s.runId === run.id ? { ...row, id: existing.id } : s));
  }
  return [row, ...ws.institutionSets];
}

function releaseRun(ws: Workspace, runId: string, overThreshold: boolean, reason: string | undefined, regenerated: string[]): Workspace {
  const run = runById(ws, runId);
  if (!run || !run.report) return ws;
  const failing = (["p1", "p2", "p4"] as const).filter((p) => run.report!.checks[p].gate === "fail");
  const released: Run = {
    ...run,
    release: {
      runId,
      releasedAt: nowIso(),
      by: ws.course.instructor.name,
      overThreshold,
      reason,
      failingChecks: failing,
      regenerated,
    },
    variants: run.variants.map((v) => (v.error ? v : { ...v, status: "released" as const })),
  };
  const next: Workspace = { ...ws, runs: withRun(ws, released) };
  next.institutionSets = upsertInstitutionRow(next, released);
  const label = failing.map((p) => PROPERTY_LABELS[p].label.toLowerCase()).join(", ");
  const text = overThreshold
    ? `${ws.course.code} ${run.blueprintName} released over threshold (${label || "advisory"}). Reason: "${reason ?? ""}"`
    : `${ws.course.code} ${run.blueprintName} released — all four checks cleared${regenerated.length ? ` after regenerating ${regenerated.join(", ")}` : ""}`;
  next.audit = [auditEvent("release", text, ws.course.instructor.name, runId), ...ws.audit];
  // Existing submissions for a re-released run are kept; new runs start empty.
  return next;
}

export const useWorkspace = create<WorkspaceState>()(
  persist(
    (set, get) => ({
      ...seed(),
      runAbort: null,

      resetToDemo: () => set({ ...seed(), runAbort: null }),

      exportJson: () => {
        const { runAbort: _a, ...rest } = get();
        const data: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(rest)) if (typeof v !== "function") data[k] = v;
        return JSON.stringify(data, null, 2);
      },

      importJson: (json) => {
        const parsed = JSON.parse(json) as Partial<Workspace>;
        if (!parsed || parsed.version !== 1 || !Array.isArray(parsed.blueprints) || !Array.isArray(parsed.runs)) {
          throw new Error("Not a VARIA workspace file (expected version 1).");
        }
        set({ ...seed(), ...parsed, runAbort: null });
      },

      setRoster: (roster) => set({ roster }),

      setPendingDraft: (draft) => set({ pendingDraft: draft }),

      saveDraftAsBlueprint: () => {
        const ws = get();
        const draft = ws.pendingDraft;
        if (!draft) throw new Error("No draft to save.");
        const now = nowIso();
        const bp: Blueprint = {
          ...draft,
          id: newId("bp"),
          courseId: ws.course.id,
          createdAt: now,
          updatedAt: now,
          rubric: draft.rubric.map((c) => ({ ...c, id: c.id || newId("c") })),
        };
        set({
          blueprints: [...ws.blueprints, bp],
          activeBlueprintId: bp.id,
          pendingDraft: null,
          audit: [auditEvent("run", `Blueprint "${bp.name}" created from ${bp.source.files.length || "pasted"} file${bp.source.files.length === 1 ? "" : "s"}`, ws.course.instructor.name), ...ws.audit],
        });
        return bp;
      },

      addBlueprint: (bp) => set((ws) => ({ blueprints: [...ws.blueprints, bp] })),

      updateBlueprint: (id, patch) =>
        set((ws) => ({
          blueprints: ws.blueprints.map((b) => (b.id === id ? { ...b, ...patch, updatedAt: nowIso() } : b)),
        })),

      setActiveBlueprint: (id) => set({ activeBlueprintId: id }),

      patchCriterion: (bpId, critId, patch) =>
        set((ws) => ({
          blueprints: ws.blueprints.map((b) =>
            b.id === bpId
              ? { ...b, updatedAt: nowIso(), rubric: b.rubric.map((c) => (c.id === critId ? { ...c, ...patch } : c)) }
              : b,
          ),
        })),

      addCriterion: (bpId) => {
        const c: Criterion = {
          id: newId("c"),
          name: "New criterion",
          points: 3,
          weight: 0,
          levels: 4,
          anchors: null,
          anchorsConfidence: "missing",
        };
        set((ws) => ({
          blueprints: ws.blueprints.map((b) => (b.id === bpId ? { ...b, updatedAt: nowIso(), rubric: [...b.rubric, c] } : b)),
        }));
        return c;
      },

      removeCriterion: (bpId, critId) =>
        set((ws) => ({
          blueprints: ws.blueprints.map((b) =>
            b.id === bpId ? { ...b, updatedAt: nowIso(), rubric: b.rubric.filter((c) => c.id !== critId) } : b,
          ),
        })),

      startRun: async (opts) => {
        const ws = get();
        const bp = activeBlueprint(ws);
        if (!bp) throw new Error("No active blueprint.");
        const settings = getSettings();
        const provider = getProvider();
        const est = estimateRunCost(opts.n, opts.judgeSamples);
        const run: Run = {
          id: newId("run"),
          blueprintId: bp.id,
          blueprintName: bp.name.split(" — ")[0],
          courseId: ws.course.id,
          strategy: opts.strategy,
          threatProfile: opts.threatProfile,
          generatorModel: opts.generatorModel || settings.generatorModel,
          judgeModel: opts.judgeModel || settings.judgeModel,
          judgeSamples: opts.judgeSamples || settings.judgeSamples,
          n: Math.max(2, Math.min(200, Math.round(opts.n))),
          enabledDimensions: opts.enabledDimensions,
          mode: settings.mode,
          status: "queued",
          progress: { phase: "queued", done: 0, total: opts.n, message: "Queued" },
          startedAt: nowIso(),
          finishedAt: null,
          variants: [],
          report: null,
          release: null,
          costEstimateUsd: est.usd,
          estMinutes: est.minutes,
        };
        const abort = new AbortController();
        set((s) => ({
          runs: [...s.runs, run],
          activeRunId: run.id,
          runAbort: abort,
          audit: [auditEvent("run", `Generation started: ${run.n} versions of "${bp.name}" (${run.strategy}, ${run.generatorModel}, ${run.mode} mode)`, ws.course.instructor.name, run.id), ...s.audit],
        }));

        // Few-shot needs anchors cached on the blueprint (the provider only memoises in-process).
        let blueprint = bp;
        if (run.strategy === "few-shot" && !bp.fewShotAnchors) {
          try {
            const anchors = await provider.generateFewShotAnchors(bp);
            get().updateBlueprint(bp.id, { fewShotAnchors: anchors });
            blueprint = { ...bp, fewShotAnchors: anchors };
          } catch (e) {
            const failed: Run = { ...run, status: "failed", error: `Could not generate few-shot anchors: ${(e as Error).message}`, finishedAt: nowIso() };
            set((s) => ({ runs: withRun(s, failed), runAbort: null }));
            return run.id;
          }
        }

        const studentIds = ws.roster.students.map((s) => s.id);
        try {
          const final = await runGeneration({
            run,
            blueprint,
            provider,
            thresholds: currentThresholds(ws),
            signal: abort.signal,
            studentIds,
            onUpdate: (r) => set((s) => ({ runs: withRun(s, r) })),
          });
          set((s) => ({
            runs: withRun(s, final),
            runAbort: null,
            audit: [
              auditEvent(
                "run",
                final.status === "cancelled"
                  ? `Generation cancelled after ${final.variants.length} versions`
                  : `Generation ${final.status}: J ${final.report?.joint.toFixed(2) ?? "—"}, ${final.report?.releasable ? "all checks pass" : `${final.report?.outliers.length ?? 0} versions flagged`}`,
                "system",
                run.id,
              ),
              ...s.audit,
            ],
          }));
        } catch (e) {
          const failed: Run = { ...get().runs.find((r) => r.id === run.id)!, status: "failed", error: (e as Error).message, finishedAt: nowIso() };
          set((s) => ({ runs: withRun(s, failed), runAbort: null }));
        }
        return run.id;
      },

      cancelRun: () => {
        get().runAbort?.abort();
      },

      regenerateAndRelease: async (runId) => {
        const ws = get();
        const run = runById(ws, runId);
        if (!run || !run.report) throw new Error("Run has no report yet.");
        const bp = ws.blueprints.find((b) => b.id === run.blueprintId) ?? activeBlueprint(ws);
        if (!bp) throw new Error("Blueprint for this run is missing.");
        const outliers = run.report.outliers;
        let updated = run;
        if (outliers.length) {
          const provider = getProvider();
          const abort = new AbortController();
          set({ runAbort: abort, activeRunId: run.id });
          updated = await runGeneration({
            run: { ...run, release: null },
            blueprint: bp,
            provider,
            thresholds: currentThresholds(ws),
            signal: abort.signal,
            onlyVariantIds: outliers,
            onUpdate: (r) => set((s) => ({ runs: withRun(s, r) })),
          });
          set((s) => ({ runs: withRun(s, updated), runAbort: null }));
          get().addAudit("run", `Regenerated ${outliers.join(", ")}; σ Flesch now ${updated.report?.fleschSigma.toFixed(1) ?? "—"}`, run.id);
        }
        if (updated.status === "cancelled") return;
        const releasable = updated.report?.releasable ?? false;
        set((s) => releaseRun(s, runId, !releasable, releasable ? undefined : "Released after regeneration; residual outliers accepted", outliers));
      },

      releaseAnyway: (runId, reason) => {
        set((s) => {
          const run = runById(s, runId);
          const over = !(run?.report?.releasable ?? false);
          return releaseRun(s, runId, over, reason, []);
        });
      },

      sendToReviewer: (runId) =>
        set((s) => {
          const run = runById(s, runId);
          if (!run) return s;
          const rowExists = s.institutionSets.some((r) => r.runId === runId);
          let sets = s.institutionSets;
          if (rowExists) {
            sets = sets.map((r) => (r.runId === runId ? { ...r, status: "awaiting-sign-off" as const, reviewedAt: null } : r));
          } else if (run.report) {
            const row = institutionRowForRun(s, { ...run, release: run.release ?? { runId, releasedAt: nowIso(), by: s.course.instructor.name, overThreshold: !run.report.releasable, failingChecks: [], regenerated: [] } });
            if (row) sets = [{ ...row, status: "awaiting-sign-off", reviewedAt: null }, ...sets];
          }
          return {
            institutionSets: sets,
            audit: [auditEvent("release", `${s.course.code} ${run.blueprintName} sent to the assessment office for review`, s.course.instructor.name, runId), ...s.audit],
          };
        }),

      saveGrade: (variantId, scores) =>
        set((s) => {
          const found = variantById(s, variantId);
          if (!found) return s;
          const { run, variant } = found;
          const bp = s.blueprints.find((b) => b.id === run.blueprintId);
          const rubric = bp?.rubric ?? [];
          const total = rubric.reduce((a, c) => a + Math.round(((scores[c.id] ?? 0) / 3) * c.points), 0);
          const maxTotal = rubric.reduce((a, c) => a + c.points, 0);
          const grade = { scores, total, maxTotal, gradedAt: nowIso(), by: s.course.instructor.name };
          const existing = s.submissions.find((x) => x.variantId === variantId && x.runId === run.id);
          const submissions: Submission[] = existing
            ? s.submissions.map((x) => (x === existing ? { ...x, grade } : x))
            : [...s.submissions, { id: newId("sub"), runId: run.id, variantId, studentId: variant.studentId ?? "", text: null, submittedAt: null, grade }];
          return {
            submissions,
            audit: [auditEvent("grade", `Graded ${variantId}: ${total} / ${maxTotal}`, s.course.instructor.name, run.id), ...s.audit],
          };
        }),

      openAppeal: (variantId, note) =>
        set((s) => {
          const found = variantById(s, variantId);
          if (!found) return s;
          const appeal: Appeal = {
            id: newId("appeal"),
            runId: found.run.id,
            variantId,
            studentId: found.variant.studentId ?? "",
            openedAt: nowIso(),
            note,
            status: "open",
          };
          const student = s.roster.students.find((st) => st.id === appeal.studentId);
          return {
            appeals: [...s.appeals, appeal],
            audit: [auditEvent("appeal", `Student appeal opened on ${s.course.code} ${variantId}`, student?.name ?? "student", found.run.id), ...s.audit],
          };
        }),

      resolveAppeal: (id, resolution) =>
        set((s) => {
          const appeal = s.appeals.find((a) => a.id === id);
          if (!appeal) return s;
          return {
            appeals: s.appeals.map((a) => (a.id === id ? { ...a, status: "resolved" as const, resolution } : a)),
            audit: [auditEvent("appeal", `Appeal on ${appeal.variantId} resolved: ${resolution}`, s.course.instructor.name, appeal.runId), ...s.audit],
          };
        }),

      setThreshold: (patch, by) =>
        set((s) => {
          const cur = currentThresholds(s);
          const next: ThresholdSet = { ...cur, ...patch, version: cur.version + 1, setAt: nowIso(), setBy: by };
          const events = [] as ReturnType<typeof auditEvent>[];
          const describe = (p: Property, a: number, b: number, lowerIsTighter: boolean) => {
            if (a === b) return;
            const tightened = lowerIsTighter ? b < a : b > a;
            events.push(auditEvent("threshold", `${PROPERTY_LABELS[p].paper.replace(/^P\d\s/, "")} threshold ${tightened ? "tightened" : "loosened"} ${fmt(a)} → ${fmt(b)}`, by));
          };
          describe("p1", cur.p1Cosine, next.p1Cosine, true);
          describe("p2", cur.p2Equivalence, next.p2Equivalence, false);
          describe("p4", cur.p4FleschSigma, next.p4FleschSigma, true);
          return { thresholds: [...s.thresholds, next], audit: [...events, ...s.audit] };
        }),

      addAudit: (kind, text, runId) =>
        set((s) => ({ audit: [auditEvent(kind, text, kind === "system" ? "system" : s.course.instructor.name, runId), ...s.audit] })),
    }),
    {
      name: LS_KEY,
      version: 1,
      storage: createJSONStorage(() => {
        const mem = new Map<string, string>();
        return {
          getItem: (k) => {
            try {
              return typeof localStorage !== "undefined" ? localStorage.getItem(k) : (mem.get(k) ?? null);
            } catch {
              return mem.get(k) ?? null;
            }
          },
          setItem: (k, v) => {
            mem.set(k, v);
            try {
              if (typeof localStorage !== "undefined") localStorage.setItem(k, v);
            } catch {
              /* quota exceeded or storage blocked: keep in memory */
            }
          },
          removeItem: (k) => {
            mem.delete(k);
            try {
              if (typeof localStorage !== "undefined") localStorage.removeItem(k);
            } catch {
              /* ignore */
            }
          },
        };
      }),
      partialize: (s) => {
        const out: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(s)) {
          if (k === "runAbort" || typeof v === "function") continue;
          out[k] = v;
        }
        return out as unknown as WorkspaceState;
      },
      merge: (persisted, current) => {
        const p = persisted as Partial<Workspace> | undefined;
        if (!p || p.version !== 1 || !Array.isArray(p.runs)) return current;
        // A run that was mid-flight when the tab closed is marked partial so it can be inspected.
        const runs = p.runs.map((r) =>
          ["queued", "generating", "judging", "scoring"].includes(r.status)
            ? { ...r, status: "partial" as const, progress: { ...r.progress, message: "Interrupted by a page reload" } }
            : r,
        );
        return { ...current, ...p, runs, runAbort: null };
      },
    },
  ),
);

function fmt(x: number): string {
  return Number.isInteger(x) ? x.toFixed(1) : String(x);
}

/** Non-hook read of the workspace. */
export function getWorkspace(): WorkspaceState {
  return useWorkspace.getState();
}

export { DEMO_INSTRUCTOR };
