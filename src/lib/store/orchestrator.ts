/**
 * Runs a generation: generate every variant (3-wide), judge each (4-wide),
 * score the set, and hand progress back after every step so the UI can show
 * it and the store can persist partial work.
 */

import pLimit from "p-limit";
import type {
  Blueprint,
  IntegrityReport,
  LlmProvider,
  Run,
  RunProgress,
  Strategy,
  SurfaceAssignment,
  SurfaceDimension,
  ThresholdSet,
  UsageTotals,
  Variant,
  VariantMetrics,
} from "@shared/types";
import { aggregateJudge, applyFlags, computeReport, computeVariantMetrics, stepCount } from "@lib/metrics";
import { DEFAULT_ADVANCED } from "@shared/types";
import { nowIso, variantId, variantIndex } from "./ids";
import { progressStart, progressUpdate } from "./progress";

export interface RunGenerationArgs {
  run: Run;
  blueprint: Blueprint;
  provider: LlmProvider;
  thresholds: ThresholdSet;
  onUpdate: (run: Run) => void;
  signal: AbortSignal;
  /** Regenerate only these variants (keeps ids, bumps generation). */
  onlyVariantIds?: string[];
  /** Student ids in roster order, mapped onto v-01… */
  studentIds?: (string | null)[];
  /**
   * Resume a partial run: generate only the indexes that have no usable text,
   * judge every variant still lacking an equivalence score, then re-score.
   */
  resume?: boolean;
}


function clone<T>(x: T): T {
  return JSON.parse(JSON.stringify(x)) as T;
}

/**
 * Distinct surface tuples for every strategy (wave 6c). The two most
 * discriminating dimensions (largest cardinality first, typically domain and
 * stakeholder) are cycled so no pair repeats until every combination has been
 * used; the remaining dimensions cycle with a stride so tuples do not align.
 * Dimension-preserving treats the tuple as mandatory; the other strategies get
 * it as a strong hint.
 */
export function buildAssignments(dims: SurfaceDimension[], n: number, _strategy: Strategy): SurfaceAssignment[] {
  const usable = dims.filter((d) => !d.locked && d.enabled && d.values.length > 0);
  const out: SurfaceAssignment[] = [];
  if (!usable.length) {
    for (let i = 0; i < n; i++) out.push({});
    return out;
  }
  const ordered = [...usable].sort((a, b) => b.values.length - a.values.length);
  const [first, second, ...rest] = ordered;
  const pairs: [number, number][] = [];
  if (second) {
    const A = first.values.length;
    const B = second.values.length;
    for (let k = 0; k < A * B; k++) pairs.push([k % A, (k + Math.floor(k / A)) % B]);
  }
  for (let i = 0; i < n; i++) {
    const a: SurfaceAssignment = {};
    if (second) {
      const [ia, ib] = pairs[i % pairs.length];
      a[first.key] = first.values[ia];
      a[second.key] = second.values[ib];
    } else {
      a[first.key] = first.values[i % first.values.length];
    }
    rest.forEach((d, k) => {
      const stride = 1 + (k + 2) * 3;
      a[d.key] = d.values[(i * stride + k) % d.values.length];
    });
    out.push(a);
  }
  return out;
}

function emptyUsage(): UsageTotals {
  return { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, costUsd: 0, calls: 0 };
}

/** Add one call's usage to a variant's and the run's running totals. */
function accumulateUsage(r: Run, v: Variant | undefined, u: UsageTotals) {
  for (const target of [r, v]) {
    if (!target) continue;
    const t = target.usage ?? emptyUsage();
    t.inputTokens += u.inputTokens;
    t.outputTokens += u.outputTokens;
    t.cacheReadTokens += u.cacheReadTokens;
    t.cacheWriteTokens += u.cacheWriteTokens;
    t.costUsd += u.costUsd;
    t.calls += u.calls;
    target.usage = t;
  }
}

/** Kept for call sites that only know phase/done/total/message; routes through progressUpdate. */
function progress(prev: RunProgress | undefined, phase: RunProgress["phase"], done: number, total: number, message: string, extra: Record<string, unknown> = {}): RunProgress {
  const base = prev ?? progressStart(total, phase, message);
  return progressUpdate(base, { phase, done, total, message, ...extra });
}
const words = (t: string) => (t.trim() ? t.trim().split(/\s+/).length : 0);

function metricsFrom(text: string, adaptedSolution: string, _scaffold: unknown, _mode: Run["mode"]): Omit<VariantMetrics, "equivalence" | "judgeSamples"> {
  // Every mode computes real metrics from the text; replayed recordings are re-scored like live output.
  return computeVariantMetrics(text, adaptedSolution);
}

function upsertVariant(r: Run, v: Variant) {
  const i = r.variants.findIndex((x) => x.id === v.id);
  if (i >= 0) r.variants[i] = v;
  else r.variants.push(v);
  r.variants.sort((a, b) => variantIndex(a.id) - variantIndex(b.id));
}

function isCancelled(signal: AbortSignal, e: unknown): boolean {
  return signal.aborted || (e instanceof Error && /cancelled/i.test(e.message));
}

/** How much of a run is done, for Resume affordances. */
export function runCompletion(r: Run): { generated: number; judged: number; n: number; resumable: boolean } {
  const generated = r.variants.filter((v) => v.text && !v.error).length;
  const judged = r.variants.filter((v) => v.text && !v.error && v.metrics.equivalence != null).length;
  const resumable = (r.status === "partial" || r.status === "cancelled" || r.status === "failed") && (generated < r.n || judged < generated || !r.report);
  return { generated, judged, n: r.n, resumable };
}

/**
 * Cancel or interruption never discards work: keep every variant, score what
 * can be scored, and mark the run partial so it can be resumed.
 */
function reportOpts(r: Run, blueprint: Blueprint) {
  const adv = r.advanced ?? DEFAULT_ADVANCED;
  return {
    outlierSigma: adv.outlierSigma,
    outlierMinNamed: adv.outlierMinNamed,
    canonicalStepCount: blueprint.canonicalSolution ? stepCount(blueprint.canonicalSolution) : null,
  };
}

function finishPartial(r: Run, blueprint: Blueprint, thresholds: ThresholdSet, emit: () => void, why: string): Run {
  const judged = r.variants.filter((v) => v.text && !v.error && v.metrics.equivalence != null);
  if (judged.length >= 2) {
    try {
      const opts = reportOpts(r, blueprint);
      const report = computeReport(r, thresholds, opts);
      r.report = report;
      r.variants = applyFlags(r.variants, report, opts);
    } catch {
      /* leave report as is */
    }
  }
  r.status = "partial";
  r.finishedAt = nowIso();
  const { generated, n } = runCompletion(r);
  r.progress = progress(r.progress, "partial", generated, n, `${why}: ${generated} of ${n} versions kept. Resume to continue.`);
  emit();
  return r;
}

export async function runGeneration(args: RunGenerationArgs): Promise<Run> {
  const { blueprint, provider, thresholds, onUpdate, signal, onlyVariantIds, studentIds, resume } = args;
  let r = clone(args.run);
  const emit = () => onUpdate(clone(r));
  const adv = r.advanced ?? DEFAULT_ADVANCED;
  const GEN_CONCURRENCY = Math.max(1, Math.min(8, adv.concurrencyGenerate));
  const JUDGE_CONCURRENCY = Math.max(1, Math.min(8, adv.concurrencyJudge));

  const enabled = blueprint.surfaceDimensions.filter((d) => r.enabledDimensions.includes(d.key) || d.locked);
  const assignments = buildAssignments(enabled, r.n, r.strategy);

  const all = Array.from({ length: r.n }, (_, i) => i);
  const targets: number[] = onlyVariantIds?.length
    ? onlyVariantIds.map(variantIndex).filter((i) => i >= 0)
    : resume
      ? all.filter((i) => {
          const v = r.variants.find((x) => x.id === variantId(i));
          return !v || !v.text || !!v.error;
        })
      : all;
  const targetIds = new Set(targets.map(variantId));
  if (resume) {
    // Clear stale errors on variants we are about to retry so a judge retry is not blocked.
    for (const v of r.variants) if (targetIds.has(v.id)) v.error = undefined;
    r.error = undefined;
    r.finishedAt = null;
  }

  // Live runs show "Actual so far" from the first emit; demo runs report no usage.
  if (r.mode === "live" && !r.usage) r.usage = emptyUsage();

  const done0 = resume ? r.variants.filter((v) => v.text && !v.error && !targetIds.has(v.id)).length : 0;
  r.status = "generating";
  r.progress = progress(
    r.progress,
    "generating",
    0,
    targets.length,
    onlyVariantIds
      ? `Regenerating ${targets.length} version${targets.length === 1 ? "" : "s"}`
      : resume
        ? `Resuming: ${done0} of ${r.n} versions already done, generating ${targets.length} more`
        : `Generating ${targets.length} versions`,
  );
  emit();

  // Generation -----------------------------------------------------------
  const gen = pLimit(GEN_CONCURRENCY);
  let anyError = false;
  await Promise.all(
    targets.map((i) =>
      gen(async () => {
        if (signal.aborted) return;
        const id = variantId(i);
        const existing = r.variants.find((v) => v.id === id);
        r.progress = progressUpdate(r.progress, { current: `${id} · writing (${r.strategy})` });
        emit();
        const prior = r.variants.filter((v) => v.id !== id && v.text && !v.error).map((v) => v.text);
        if (existing?.text) prior.push(existing.text);
        // Usage for this variant's generation calls; merged into the variant record below.
        const vUsage: UsageTotals = existing?.usage ? { ...existing.usage } : emptyUsage();
        let vCalls = 0;
        try {
          const out = await provider.generateVariant({
            blueprint,
            strategy: r.strategy,
            index: i,
            n: r.n,
            surfaceAssignment: assignments[i] ?? {},
            priorVariantTexts: prior,
            generatorModel: r.generatorModel,
            signal,
            advanced: adv,
            onUsage: (u) => {
              vCalls += u.calls;
              accumulateUsage(r, undefined, u);
              const t = vUsage;
              t.inputTokens += u.inputTokens;
              t.outputTokens += u.outputTokens;
              t.cacheReadTokens += u.cacheReadTokens;
              t.cacheWriteTokens += u.cacheWriteTokens;
              t.costUsd += u.costUsd;
              t.calls += u.calls;
            },
          });
          const base = metricsFrom(out.text, out.adaptedSolution, out.scaffold, r.mode);
          const v: Variant = {
            id,
            runId: r.id,
            studentId: existing?.studentId ?? studentIds?.[i] ?? null,
            text: out.text,
            adaptedSolution: out.adaptedSolution,
            surfaceAssignment: out.surfaceAssignment ?? assignments[i] ?? {},
            metrics: { ...base, equivalence: null, judgeSamples: [] },
            flags: { p4Outlier: false, p2Low: false },
            status: existing ? "regenerated" : "draft",
            generation: (existing?.generation ?? 0) + 1,
            scaffold: out.scaffold,
          };
          if (vCalls > 0 || existing?.usage) v.usage = vUsage;
          upsertVariant(r, v);
          r.progress = progressUpdate(r.progress, { lastDone: `${id} generated (${words(out.text)} words)` });
        } catch (e) {
          if (isCancelled(signal, e)) return;
          anyError = true;
          r.progress = progressUpdate(r.progress, { warning: `${id} failed: ${(e as Error).message}` });
          const v: Variant = existing
            ? { ...existing, error: (e as Error).message, ...(vCalls > 0 || existing.usage ? { usage: vUsage } : {}) }
            : {
                id,
                runId: r.id,
                studentId: studentIds?.[i] ?? null,
                text: "",
                adaptedSolution: "",
                surfaceAssignment: assignments[i] ?? {},
                metrics: { fleschEase: 0, lexicalComplexity: 0, stepCount: 0, solutionFleschEase: 0, equivalence: null, judgeSamples: [] },
                flags: { p4Outlier: false, p2Low: false },
                status: "draft",
                generation: 1,
                error: (e as Error).message,
                ...(vCalls > 0 ? { usage: vUsage } : {}),
              };
          upsertVariant(r, v);
        }
        r.progress = progressUpdate(r.progress, { done: r.progress.done + 1, total: targets.length, itemJustFinished: true, message: `${r.progress.done + 1} of ${targets.length} versions generated` });
        emit();
      }),
    ),
  );

  if (signal.aborted) return finishPartial(r, blueprint, thresholds, emit, "Cancelled during generation");

  // Judging -----------------------------------------------------------------
  // On resume, judge everything still missing a score, not only this pass's targets.
  const toJudge = r.variants.filter((v) => v.text && !v.error && (resume ? v.metrics.equivalence == null : targetIds.has(v.id)));
  r.status = "judging";
  r.progress = progress(r.progress, "judging", 0, toJudge.length * r.judgeSamples, `Judging every version · ${r.judgeSamples} samples`);
  emit();
  const judge = pLimit(JUDGE_CONCURRENCY);
  await Promise.all(
    toJudge.map((v) =>
      judge(async () => {
        if (signal.aborted) return;
        r.progress = progressUpdate(r.progress, { current: `${v.id} · judging ${r.judgeSamples} samples` });
        emit();
        try {
          const samples = await provider.judgeVariant({
            blueprint,
            variantText: v.text,
            judgeModel: r.judgeModel,
            samples: r.judgeSamples,
            signal,
            onUsage: (u) => accumulateUsage(r, r.variants.find((x) => x.id === v.id), u),
          });
          const cur = r.variants.find((x) => x.id === v.id);
          if (cur) {
            const eq = aggregateJudge(samples);
            cur.metrics = { ...cur.metrics, judgeSamples: samples, equivalence: eq };
            r.progress = progressUpdate(r.progress, { lastDone: `${v.id} judged · equivalence ${eq == null ? "—" : eq.toFixed(2)}` });
          }
        } catch (e) {
          if (isCancelled(signal, e)) return;
          anyError = true;
          const cur = r.variants.find((x) => x.id === v.id);
          if (cur) cur.error = `Judge failed: ${(e as Error).message}`;
          r.progress = progressUpdate(r.progress, { warning: `${v.id} judge failed: ${(e as Error).message}` });
        }
        const judgedSoFar = Math.min(toJudge.length, Math.floor(r.progress.done / r.judgeSamples) + 1);
        r.progress = progressUpdate(r.progress, { done: judgedSoFar * r.judgeSamples, total: toJudge.length * r.judgeSamples, itemJustFinished: true, message: `${judgedSoFar} of ${toJudge.length} versions judged` });
        emit();
      }),
    ),
  );

  if (signal.aborted) return finishPartial(r, blueprint, thresholds, emit, "Cancelled during judging");

  // Scoring -----------------------------------------------------------------
  r.status = "scoring";
  r.progress = progress(r.progress, "scoring", 0, 1, "Scoring the set on all four properties");
  emit();
  const opts = reportOpts(r, blueprint);
  const report: IntegrityReport = computeReport(r, thresholds, opts);
  r.report = report;
  r.variants = applyFlags(r.variants, report, opts);
  const ok = r.variants.filter((v) => v.text && !v.error).length;
  const incomplete = anyError || ok < r.n;
  r.status = incomplete ? "partial" : "complete";
  r.finishedAt = nowIso();
  r.progress = progress(r.progress, r.status, 1, 1, incomplete ? `${ok} of ${r.n} versions completed; resume to retry the rest` : `${r.n} versions generated, judged and scored`, { itemJustFinished: true, current: undefined });
  emit();
  return r;
}
