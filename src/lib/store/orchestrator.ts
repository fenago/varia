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
import { aggregateJudge, applyFlags, computeReport, computeVariantMetrics } from "@lib/metrics";
import { nowIso, variantId, variantIndex } from "./ids";
import { calibrateDemoReport } from "./seed";

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
}

const GEN_CONCURRENCY = 3;
const JUDGE_CONCURRENCY = 4;

function clone<T>(x: T): T {
  return JSON.parse(JSON.stringify(x)) as T;
}

/** Cartesian product cycled so every variant gets a distinct tuple where possible. */
export function buildAssignments(dims: SurfaceDimension[], n: number, strategy: Strategy): SurfaceAssignment[] {
  const usable = dims.filter((d) => !d.locked && d.enabled && d.values.length > 0);
  const out: SurfaceAssignment[] = [];
  if (!usable.length) {
    for (let i = 0; i < n; i++) out.push({});
    return out;
  }
  // Order dimensions by cardinality (largest first) so tuples spread widely.
  const ordered = [...usable].sort((a, b) => b.values.length - a.values.length);
  for (let i = 0; i < n; i++) {
    const a: SurfaceAssignment = {};
    ordered.forEach((d, k) => {
      // Offset by a co-prime-ish stride per dimension so tuples do not align.
      const stride = strategy === "dimension-preserving" ? 1 + k * 3 : 1 + k;
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

function progress(phase: RunProgress["phase"], done: number, total: number, message: string): RunProgress {
  return { phase, done, total, message };
}

function metricsFrom(text: string, adaptedSolution: string, scaffold: unknown, mode: Run["mode"]): Omit<VariantMetrics, "equivalence" | "judgeSamples"> {
  const demo = (scaffold as { demoMetrics?: Partial<VariantMetrics> } | undefined)?.demoMetrics;
  if (mode === "demo" && demo && typeof demo.fleschEase === "number") {
    return {
      fleschEase: demo.fleschEase,
      lexicalComplexity: demo.lexicalComplexity ?? 0.6,
      stepCount: demo.stepCount ?? 4,
      solutionFleschEase: demo.solutionFleschEase ?? demo.fleschEase,
    };
  }
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

export async function runGeneration(args: RunGenerationArgs): Promise<Run> {
  const { blueprint, provider, thresholds, onUpdate, signal, onlyVariantIds, studentIds } = args;
  let r = clone(args.run);
  const emit = () => onUpdate(clone(r));

  const enabled = blueprint.surfaceDimensions.filter((d) => r.enabledDimensions.includes(d.key) || d.locked);
  const assignments = buildAssignments(enabled, r.n, r.strategy);

  const targets: number[] = onlyVariantIds?.length
    ? onlyVariantIds.map(variantIndex).filter((i) => i >= 0)
    : Array.from({ length: r.n }, (_, i) => i);
  const targetIds = new Set(targets.map(variantId));

  // Live runs show "Actual so far" from the first emit; demo runs report no usage.
  if (r.mode === "live" && !r.usage) r.usage = emptyUsage();

  r.status = "generating";
  r.progress = progress("generating", 0, targets.length, onlyVariantIds ? `Regenerating ${targets.length} version${targets.length === 1 ? "" : "s"}` : `Generating ${targets.length} versions`);
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
        } catch (e) {
          if (isCancelled(signal, e)) return;
          anyError = true;
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
        r.progress = progress("generating", r.progress.done + 1, targets.length, `${r.progress.done + 1} of ${targets.length} versions generated`);
        emit();
      }),
    ),
  );

  if (signal.aborted) {
    r.status = "cancelled";
    r.progress = progress("cancelled", r.progress.done, targets.length, "Cancelled");
    r.finishedAt = nowIso();
    emit();
    return r;
  }

  // Judging -----------------------------------------------------------------
  const toJudge = r.variants.filter((v) => targetIds.has(v.id) && v.text && !v.error);
  r.status = "judging";
  r.progress = progress("judging", 0, toJudge.length, `Judging construct equivalence, ${r.judgeSamples} samples each`);
  emit();
  const judge = pLimit(JUDGE_CONCURRENCY);
  await Promise.all(
    toJudge.map((v) =>
      judge(async () => {
        if (signal.aborted) return;
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
            cur.metrics = { ...cur.metrics, judgeSamples: samples, equivalence: aggregateJudge(samples) };
          }
        } catch (e) {
          if (isCancelled(signal, e)) return;
          anyError = true;
          const cur = r.variants.find((x) => x.id === v.id);
          if (cur) cur.error = `Judge failed: ${(e as Error).message}`;
        }
        r.progress = progress("judging", r.progress.done + 1, toJudge.length, `${r.progress.done + 1} of ${toJudge.length} versions judged`);
        emit();
      }),
    ),
  );

  if (signal.aborted) {
    r.status = "cancelled";
    r.progress = progress("cancelled", r.progress.done, toJudge.length, "Cancelled");
    r.finishedAt = nowIso();
    emit();
    return r;
  }

  // Scoring -----------------------------------------------------------------
  r.status = "scoring";
  r.progress = progress("scoring", 0, 1, "Scoring the set on all four properties");
  emit();
  let report: IntegrityReport = computeReport(r, thresholds);
  if (r.mode === "demo") report = calibrateDemoReport(report, thresholds);
  r.report = report;
  r.variants = applyFlags(r.variants, report);
  r.status = anyError ? "partial" : "complete";
  r.finishedAt = nowIso();
  const ok = r.variants.filter((v) => !v.error).length;
  r.progress = progress(r.status, 1, 1, anyError ? `${ok} of ${r.n} versions completed; some failed` : `${r.n} versions generated, judged and scored`);
  emit();
  return r;
}
