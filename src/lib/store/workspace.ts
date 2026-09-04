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
  EmployerPartner,
  EmployerValidation,
  EvidenceRecord,
  LevelScore,
  ReviewPackage,
  ReviewResult,
  ModelId,
  Property,
  Roster,
  Run,
  Strategy,
  Submission,
  ThreatProfile,
  ThresholdSet,
  Workspace,
  ConsentEvent,
  SigningKey,
  VerificationEvent,
  SkillTag,
  EmployerChallenge,
  Endorsement,
  OutcomeEvent,
  PortfolioShare,
} from "@shared/types";
import { PROPERTY_LABELS } from "@shared/thresholds";
import { computeReport } from "@lib/metrics";
import { estimateRunCost } from "@lib/llm";
import { newId, nowIso } from "./ids";
import { runGeneration } from "./orchestrator";
import { buildDemoEmployabilityData, buildDemoEmployerData, buildDemoWorkspace, buildDemoBridgeEvents, DEMO_INSTRUCTOR } from "./seed";
import { applyChallengeToBlueprint, bridgeFor, recordCanonicalPure, resolveSkills, skillKeysForBlueprint, slugify, withBridgeDefaults, deriveChallengeId } from "./employer";
import { ensureSigningKey, signCanonical } from "@lib/badges/keys";
import { activeBlueprint, currentThresholds, evidenceForVariant, institutionRowForRun, runById, studentById, submissionForVariant, validationsForBlueprint, variantById } from "./selectors";
import { applyScenarioEdits, buildReviewPackagePure, evidenceCanonical, findPartnerByOrganisation, hashEvidence, nextEvidenceId, validationStatusText } from "./employer";
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

  addPartner: (p: { organisation: string; sector: string; contactName?: string; contactRole?: string; contactEmail?: string }) => EmployerPartner;
  updatePartner: (id: string, patch: Partial<EmployerPartner>) => void;
  removePartner: (id: string) => void;
  setPartnerAdopted: (id: string, adopted: boolean) => void;
  buildReviewPackage: (blueprintId: string, partnerId: string | null) => ReviewPackage;
  recordValidation: (v: Omit<EmployerValidation, "id" | "source">, source: "workspace" | "imported") => EmployerValidation;
  applyReviewResult: (result: ReviewResult) => EmployerValidation;
  issueEvidenceRecord: (variantId: string) => Promise<EvidenceRecord>;
  revokeEvidenceRecord: (id: string) => void;
  // Structural bridge
  setSigningKey: (key: SigningKey) => void;
  signEvidenceRecord: (recordId: string) => Promise<EvidenceRecord>;
  addConsent: (recordId: string, ev: Omit<ConsentEvent, "id" | "at" | "learnerId">) => ConsentEvent;
  addVerification: (ev: Omit<VerificationEvent, "id" | "at">) => VerificationEvent;
  // Employability bridge
  addSkill: (tag: Omit<SkillTag, "key"> & { key?: string }) => SkillTag;
  setCriterionSkills: (bpId: string, critId: string, skillKeys: string[]) => void;
  addChallenge: (c: Omit<EmployerChallenge, "id" | "contributedAt" | "status" | "blueprintIds" | "organisation"> & { organisation?: string }) => EmployerChallenge;
  retireChallenge: (id: string) => void;
  linkChallengeToBlueprint: (challengeId: string, blueprintId: string) => void;
  setSubmissionIncluded: (recordId: string, included: boolean) => Promise<EvidenceRecord>;
  addEndorsement: (e: Omit<Endorsement, "id" | "at">) => Endorsement;
  addOutcome: (o: Omit<OutcomeEvent, "id" | "at" | "learnerId">) => OutcomeEvent;
  createPortfolioShare: (learnerId: string, recordIds: string[], toOrganisation: string | null) => PortfolioShare;
  revokePortfolioShare: (id: string) => void;
}

export type WorkspaceState = Workspace & { runAbort: AbortController | null } & WorkspaceActions;

function seed(): Workspace {
  const ws = withBridgeDefaults(buildDemoWorkspace(computeReport));
  return buildDemoBridgeEvents(ws);
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

/** Rebuild the canonical content a record's hash covers, from the workspace. Null if the content is gone. */
export function recordCanonical(ws: Workspace, record: EvidenceRecord): string | null {
  return recordCanonicalPure(ws, record);
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
        const base = seed();
        const next = { ...base, ...parsed } as Workspace;
        if (!Array.isArray(parsed.employerPartners) || !Array.isArray(parsed.employerValidations) || !Array.isArray(parsed.evidenceRecords)) {
          const demo = buildDemoEmployerData(next);
          next.employerPartners = Array.isArray(parsed.employerPartners) ? parsed.employerPartners : demo.employerPartners;
          next.employerValidations = Array.isArray(parsed.employerValidations) ? parsed.employerValidations : demo.employerValidations;
          next.evidenceRecords = Array.isArray(parsed.evidenceRecords) ? parsed.evidenceRecords : demo.evidenceRecords;
        }
        // Skills and challenges first (work-sample defaults need them), then the bridge (learner ids),
        // then the learner-keyed employability data (outcomes, portfolio shares).
        const emp0 = buildDemoEmployabilityData(next);
        const prepared = { ...next, skills: emp0.skills, challenges: emp0.challenges };
        const bridged = withBridgeDefaults(prepared);
        const emp = buildDemoEmployabilityData({ ...prepared, evidenceRecords: bridged.evidenceRecords });
        Object.assign(next, bridged, emp);
        set({ ...next, runAbort: null });
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

      // ---- Employer partners ------------------------------------------------

      addPartner: (p) => {
        const partner: EmployerPartner = {
          id: newId("partner"),
          organisation: p.organisation.trim(),
          sector: p.sector.trim(),
          contactName: p.contactName?.trim() || undefined,
          contactRole: p.contactRole?.trim() || undefined,
          contactEmail: p.contactEmail?.trim() || undefined,
          adoptedEvidenceRecords: false,
          adoptedAt: null,
          addedAt: nowIso(),
        };
        set((s) => ({
          employerPartners: [...s.employerPartners, partner],
          audit: [auditEvent("employer", `Employer partner added: ${partner.organisation} (${partner.sector})`, s.course.instructor.name), ...s.audit],
        }));
        return partner;
      },

      updatePartner: (id, patch) =>
        set((s) => ({ employerPartners: s.employerPartners.map((p) => (p.id === id ? { ...p, ...patch, id } : p)) })),

      removePartner: (id) =>
        set((s) => {
          const p = s.employerPartners.find((x) => x.id === id);
          if (!p) return s;
          return {
            employerPartners: s.employerPartners.filter((x) => x.id !== id),
            audit: [auditEvent("employer", `Employer partner removed: ${p.organisation}`, s.course.instructor.name), ...s.audit],
          };
        }),

      setPartnerAdopted: (id, adopted) =>
        set((s) => {
          const p = s.employerPartners.find((x) => x.id === id);
          if (!p || p.adoptedEvidenceRecords === adopted) return s;
          return {
            employerPartners: s.employerPartners.map((x) => (x.id === id ? { ...x, adoptedEvidenceRecords: adopted, adoptedAt: adopted ? nowIso() : null } : x)),
            audit: [
              auditEvent(
                "policy",
                adopted ? `${p.organisation} adopted evidence records for hiring or promotion` : `${p.organisation} no longer using evidence records`,
                s.course.instructor.name,
              ),
              ...s.audit,
            ],
          };
        }),

      // ---- Employer validation ------------------------------------------------

      buildReviewPackage: (blueprintId, partnerId) => buildReviewPackagePure(get(), blueprintId, partnerId, nowIso()),

      recordValidation: (v, source) => {
        const ws = get();
        const partner = v.partnerId ? (ws.employerPartners.find((p) => p.id === v.partnerId) ?? null) : findPartnerByOrganisation(ws.employerPartners, v.organisation);
        const validation: EmployerValidation = { ...v, id: newId("val"), partnerId: partner?.id ?? null, source };
        const bp = ws.blueprints.find((b) => b.id === v.blueprintId);
        const blueprints = bp
          ? ws.blueprints.map((b) => (b.id === bp.id ? { ...applyScenarioEdits(b, v.scenarioEdits), updatedAt: nowIso() } : b))
          : ws.blueprints;
        const name = bp?.name ?? v.blueprintName;
        const suffix = source === "imported" ? " (imported result)" : "";
        set({
          blueprints,
          employerValidations: [...ws.employerValidations, validation],
          audit: [auditEvent("employer", `${v.organisation} ${validationStatusText(v)} ${name}${suffix}`, `${v.reviewerName} (${v.organisation})`), ...ws.audit],
        });
        return validation;
      },

      applyReviewResult: (result) => {
        if (!result || result.version !== 1 || !result.validation) throw new Error("Not a VARIA review result (expected version 1).");
        return get().recordValidation(result.validation, "imported");
      },

      // ---- Evidence records ------------------------------------------------

      issueEvidenceRecord: async (variantId) => {
        const ws = get();
        const existing = evidenceForVariant(ws, variantId);
        if (existing) return existing;
        const found = variantById(ws, variantId);
        if (!found) throw new Error(`No version ${variantId} in this workspace.`);
        const { run, variant } = found;
        const submission = submissionForVariant(ws, variantId, run.id);
        if (!submission?.grade) throw new Error(`${variantId} has not been graded yet. Grade the submission before issuing an evidence record.`);
        const student = studentById(ws, variant.studentId);
        if (!student) throw new Error(`${variantId} is not assigned to a student.`);
        const blueprint = ws.blueprints.find((b) => b.id === run.blueprintId);
        if (!blueprint) throw new Error("The blueprint for this run no longer exists.");
        const issuedAt = nowIso();
        const validationIds = validationsForBlueprint(ws, blueprint.id).filter((v) => v.status === "validated").map((v) => v.id);
        const skills = resolveSkills(ws.skills, skillKeysForBlueprint(blueprint));
        const canonical = evidenceCanonical({
          student,
          course: ws.course,
          blueprint,
          variant,
          grade: submission.grade,
          report: run.report,
          validationIds,
          issuedAt,
          submissionIncluded: false,
          submissionText: null,
          skillKeys: skills.map((sk) => sk.key),
        });
        const record: EvidenceRecord = {
          id: nextEvidenceId(ws.evidenceRecords, new Date(issuedAt).getFullYear()),
          runId: run.id,
          variantId,
          studentId: student.id,
          blueprintId: blueprint.id,
          issuedAt,
          issuedBy: `${ws.course.instructor.name} · ${ws.course.instructor.institution}`,
          hash: hashEvidence(canonical),
          validationIds,
        };
        record.bridge = {
          ...bridgeFor(ws, record),
          workSample: { submissionIncluded: false, submissionText: null, skills, challengeId: deriveChallengeId(ws.challenges, blueprint, variant), endorsementIds: [] },
        };
        set((s) => ({
          evidenceRecords: [...s.evidenceRecords, record],
          audit: [auditEvent("evidence", `Evidence record ${record.id} issued for ${student.name}`, s.course.instructor.name, run.id), ...s.audit],
        }));
        return record;
      },

      revokeEvidenceRecord: (id) =>
        set((s) => {
          const r = s.evidenceRecords.find((x) => x.id === id);
          if (!r) return s;
          const student = studentById(s, r.studentId);
          return {
            evidenceRecords: s.evidenceRecords.filter((x) => x.id !== id),
            audit: [auditEvent("evidence", `Evidence record ${id} revoked${student ? ` (${student.name})` : ""}`, s.course.instructor.name, r.runId), ...s.audit],
          };
        }),

      // ---- Structural bridge -------------------------------------------------

      setSigningKey: (key) =>
        set((s) => ({
          signingKey: key,
          audit: [auditEvent("settings", `Demo signing key ${key.kid} generated (${key.issuerName})`, s.course.instructor.name), ...s.audit],
        })),

      signEvidenceRecord: async (recordId) => {
        const ws = get();
        const record = ws.evidenceRecords.find((r) => r.id === recordId);
        if (!record) throw new Error(`No evidence record ${recordId}.`);
        const bridge = record.bridge ?? bridgeFor(ws, record);
        if (bridge.signature && bridge.signedWithKid) return record;
        const canonical = recordCanonical(ws, record);
        if (!canonical) throw new Error("The record's underlying content is no longer in this workspace, so it cannot be signed.");
        const key = await ensureSigningKey({ signingKey: get().signingKey, setSigningKey: get().setSigningKey });
        const signature = await signCanonical(key, canonical);
        const signed: EvidenceRecord = { ...record, bridge: { ...bridge, signature, signedWithKid: key.kid } };
        set((s) => ({
          evidenceRecords: s.evidenceRecords.map((r) => (r.id === recordId ? signed : r)),
          audit: [auditEvent("evidence", `Evidence record ${recordId} signed with ${key.kid}`, s.course.instructor.name, record.runId), ...s.audit],
        }));
        return signed;
      },

      addConsent: (recordId, ev) => {
        const ws = get();
        const record = ws.evidenceRecords.find((r) => r.id === recordId);
        if (!record) throw new Error(`No evidence record ${recordId}.`);
        const bridge = record.bridge ?? bridgeFor(ws, record);
        const event: ConsentEvent = { id: newId("con"), at: nowIso(), learnerId: bridge.learnerId, ...ev };
        const student = studentById(ws, record.studentId);
        set((s) => ({
          evidenceRecords: s.evidenceRecords.map((r) => (r.id === recordId ? { ...r, bridge: { ...bridge, consent: [...bridge.consent, event] } } : r)),
          audit: [
            auditEvent(
              "evidence",
              `${student?.name ?? bridge.learnerId} ${ev.action === "shared" ? "shared" : "revoked sharing of"} ${recordId}${ev.toOrganisation ? ` with ${ev.toOrganisation}` : ""}`,
              student?.name ?? bridge.learnerId,
              record.runId,
            ),
            ...s.audit,
          ],
        }));
        return event;
      },

      addVerification: (ev) => {
        const event: VerificationEvent = { id: newId("ver"), at: nowIso(), ...ev };
        set((s) => ({
          verificationEvents: [...(s.verificationEvents ?? []), event],
          audit: [
            auditEvent("evidence", `${ev.byOrganisation ?? "Someone"} verified ${ev.recordId}: ${ev.result} (${ev.method})`, ev.byOrganisation ?? "verifier"),
            ...s.audit,
          ],
        }));
        return event;
      },

      // ---- Employability bridge -----------------------------------------------

      addSkill: (tag) => {
        const ws = get();
        const key = slugify(tag.key ?? tag.label);
        if (!key) throw new Error("A skill needs a label.");
        const existing = (ws.skills ?? []).find((s) => s.key === key);
        if (existing) return existing;
        const skill: SkillTag = { key, label: tag.label.trim(), source: tag.source, externalRef: tag.externalRef?.trim() || undefined };
        set((s) => ({ skills: [...(s.skills ?? []), skill] }));
        return skill;
      },

      setCriterionSkills: (bpId, critId, skillKeys) =>
        set((s) => ({
          blueprints: s.blueprints.map((b) =>
            b.id === bpId
              ? { ...b, updatedAt: nowIso(), rubric: b.rubric.map((c) => (c.id === critId ? { ...c, skillKeys: [...new Set(skillKeys)] } : c)) }
              : b,
          ),
        })),

      addChallenge: (c) => {
        const ws = get();
        const partner = ws.employerPartners.find((p) => p.id === c.partnerId) ?? null;
        const organisation = (c.organisation ?? partner?.organisation ?? "").trim();
        if (!organisation) throw new Error("A challenge needs an employer partner.");
        const challenge: EmployerChallenge = {
          ...c,
          organisation,
          title: c.title.trim(),
          brief: c.brief.trim(),
          domain: c.domain.trim(),
          stakeholderRole: c.stakeholderRole.trim(),
          deliverable: c.deliverable.trim(),
          skillKeys: [...new Set(c.skillKeys)],
          id: newId("chal"),
          contributedAt: nowIso(),
          status: "active",
          blueprintIds: [],
        };
        set((s) => ({
          challenges: [...(s.challenges ?? []), challenge],
          audit: [auditEvent("employer", `${organisation} contributed a challenge: ${challenge.title}`, c.contributedBy || organisation), ...s.audit],
        }));
        return challenge;
      },

      retireChallenge: (id) =>
        set((s) => {
          const c = (s.challenges ?? []).find((x) => x.id === id);
          if (!c) return s;
          return {
            challenges: (s.challenges ?? []).map((x) => (x.id === id ? { ...x, status: "retired" as const } : x)),
            audit: [auditEvent("employer", `Challenge retired: ${c.title} (${c.organisation})`, s.course.instructor.name), ...s.audit],
          };
        }),

      linkChallengeToBlueprint: (challengeId, blueprintId) =>
        set((s) => {
          const challenge = (s.challenges ?? []).find((c) => c.id === challengeId);
          const bp = s.blueprints.find((b) => b.id === blueprintId);
          if (!challenge || !bp) return s;
          const linked = applyChallengeToBlueprint(bp, challenge);
          return {
            blueprints: s.blueprints.map((b) => (b.id === blueprintId ? { ...linked, updatedAt: nowIso() } : b)),
            challenges: (s.challenges ?? []).map((c) => (c.id === challengeId ? { ...c, blueprintIds: [...new Set([...c.blueprintIds, blueprintId])] } : c)),
            audit: [auditEvent("employer", `${challenge.organisation}'s challenge "${challenge.title}" now feeds ${bp.name}`, s.course.instructor.name), ...s.audit],
          };
        }),

      setSubmissionIncluded: async (recordId, included) => {
        const ws = get();
        const record = ws.evidenceRecords.find((r) => r.id === recordId);
        if (!record) throw new Error(`No evidence record ${recordId}.`);
        const bridge = record.bridge ?? bridgeFor(ws, record);
        const sample = bridge.workSample ?? { submissionIncluded: false, submissionText: null, skills: [], challengeId: null, endorsementIds: [] };
        if (sample.submissionIncluded === included) return record;
        const submission = submissionForVariant(ws, record.variantId, record.runId);
        if (included && !submission?.text) throw new Error("There is no submission text to include.");
        const nextSample = { ...sample, submissionIncluded: included, submissionText: included ? (submission?.text ?? null) : null };
        let next: EvidenceRecord = { ...record, bridge: { ...bridge, workSample: nextSample } };
        const canonical = recordCanonicalPure(ws, next);
        if (canonical) {
          next = { ...next, hash: hashEvidence(canonical) };
          if (bridge.signature && ws.signingKey) {
            const signature = await signCanonical(ws.signingKey, canonical);
            next = { ...next, bridge: { ...next.bridge!, signature, signedWithKid: ws.signingKey.kid } };
          } else if (bridge.signature) {
            next = { ...next, bridge: { ...next.bridge!, signature: null, signedWithKid: null } };
          }
        }
        const student = studentById(ws, record.studentId);
        const consent: ConsentEvent | null = included
          ? { id: newId("con"), at: nowIso(), action: "shared", learnerId: bridge.learnerId, toOrganisation: null, toEmail: null, note: "submission included" }
          : null;
        if (consent) next = { ...next, bridge: { ...next.bridge!, consent: [...next.bridge!.consent, consent] } };
        set((s) => ({
          evidenceRecords: s.evidenceRecords.map((r) => (r.id === recordId ? next : r)),
          audit: [
            auditEvent("evidence", `${student?.name ?? bridge.learnerId} ${included ? "included their submission in" : "removed their submission from"} ${recordId}`, student?.name ?? bridge.learnerId, record.runId),
            ...s.audit,
          ],
        }));
        return next;
      },

      addEndorsement: (e) => {
        const ws = get();
        const record = ws.evidenceRecords.find((r) => r.id === e.recordId);
        if (!record) throw new Error(`No evidence record ${e.recordId}.`);
        const partnerId = e.partnerId ?? ws.employerPartners.find((p) => p.organisation.trim().toLowerCase() === e.organisation.trim().toLowerCase())?.id ?? null;
        const endorsement: Endorsement = { ...e, partnerId, id: newId("end"), at: nowIso(), score: Math.max(1, Math.min(5, Math.round(e.score))) };
        set((s) => ({
          endorsements: [...(s.endorsements ?? []), endorsement],
          evidenceRecords: s.evidenceRecords.map((r) =>
            r.id === e.recordId && r.bridge?.workSample
              ? { ...r, bridge: { ...r.bridge, workSample: { ...r.bridge.workSample, endorsementIds: [...r.bridge.workSample.endorsementIds, endorsement.id] } } }
              : r,
          ),
          audit: [
            auditEvent("employer", `${e.organisation} endorsed ${e.recordId}${e.meetsBar ? " (meets their bar)" : ""}`, `${e.reviewerName} (${e.organisation})`, record.runId),
            ...s.audit,
          ],
        }));
        return endorsement;
      },

      addOutcome: (o) => {
        const ws = get();
        const record = ws.evidenceRecords.find((r) => r.id === o.recordId);
        if (!record) throw new Error(`No evidence record ${o.recordId}.`);
        const learnerId = (record.bridge ?? bridgeFor(ws, record)).learnerId;
        const outcome: OutcomeEvent = { ...o, id: newId("out"), at: nowIso(), learnerId };
        const actor = o.by === "employer" ? o.organisation : (studentById(ws, record.studentId)?.name ?? learnerId);
        set((s) => ({
          outcomes: [...(s.outcomes ?? []), outcome],
          audit: [auditEvent("outcome", `${o.organisation} ${o.by === "employer" ? "logged" : "was reported by the student to have"} ${o.kind}${o.kind === "ramped" && o.onboardingHours ? ` (${o.onboardingHours} h)` : ""} for ${learnerId}`, actor, record.runId), ...s.audit],
        }));
        return outcome;
      },

      createPortfolioShare: (learnerId, recordIds, toOrganisation) => {
        const ws = get();
        const ids = recordIds.filter((id) => ws.evidenceRecords.some((r) => r.id === id && r.bridge?.learnerId === learnerId));
        if (!ids.length) throw new Error("No records of this learner to share.");
        const share: PortfolioShare = { id: newId("pshare"), learnerId, recordIds: ids, toOrganisation: toOrganisation?.trim() || null, createdAt: nowIso(), revokedAt: null };
        set((s) => ({ portfolioShares: [...(s.portfolioShares ?? []), share] }));
        for (const id of ids) get().addConsent(id, { action: "shared", toOrganisation: share.toOrganisation, toEmail: null, note: `portfolio share ${share.id}` });
        return share;
      },

      revokePortfolioShare: (id) => {
        const ws = get();
        const share = (ws.portfolioShares ?? []).find((p) => p.id === id);
        if (!share || share.revokedAt) return;
        set((s) => ({ portfolioShares: (s.portfolioShares ?? []).map((p) => (p.id === id ? { ...p, revokedAt: nowIso() } : p)) }));
        for (const rid of share.recordIds) get().addConsent(rid, { action: "revoked", toOrganisation: share.toOrganisation, toEmail: null, note: `portfolio share ${share.id} revoked` });
      },
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
        const merged = { ...current, ...p, runs, runAbort: null } as WorkspaceState;
        // Workspaces persisted before the employer bridge existed get the demo employer data.
        if (!Array.isArray(p.employerPartners) || !Array.isArray(p.employerValidations) || !Array.isArray(p.evidenceRecords)) {
          const demo = buildDemoEmployerData(merged);
          merged.employerPartners = Array.isArray(p.employerPartners) ? p.employerPartners : demo.employerPartners;
          merged.employerValidations = Array.isArray(p.employerValidations) ? p.employerValidations : demo.employerValidations;
          merged.evidenceRecords = Array.isArray(p.evidenceRecords) ? p.evidenceRecords : demo.evidenceRecords;
        }
        // Skills and challenges first (work-sample defaults need them), then the bridge (schema v3:
        // learner ids, credential ids, work-sample fields; event arrays get defaults), then the
        // learner-keyed employability data (endorsements, outcomes, portfolio shares) when missing.
        const emp0 = buildDemoEmployabilityData(merged);
        const prepared = { ...merged, skills: emp0.skills, challenges: emp0.challenges };
        const bridged = withBridgeDefaults(prepared);
        const emp = buildDemoEmployabilityData({ ...prepared, evidenceRecords: bridged.evidenceRecords });
        return { ...merged, ...bridged, ...emp } as WorkspaceState;
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
