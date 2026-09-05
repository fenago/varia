/**
 * Records one sample assessment end to end with the real pipeline and returns
 * a fixture: the extracted blueprint, the roster, and a full run (variants,
 * judge samples, metrics, report, usage). Runs in Node (via the recorder
 * script) or in tests (dry-run with the demo provider). No browser globals.
 */
import type { Blueprint, BlueprintDraft, LlmProvider, ModelId, Roster, Run, Strategy, ThresholdSet } from "@shared/types";
import { DEFAULT_THRESHOLDS } from "@shared/thresholds";
import { sampleById } from "@shared/samples";
import { DEFAULT_GENERATOR, DEFAULT_JUDGE, estimateRunCost } from "@shared/models";
import { parseFiles } from "@lib/ingest";
import { localExtract } from "@lib/ingest/localExtract";
import { guardDraft } from "@lib/llm/extractGuard";
import { runGeneration } from "@lib/store/orchestrator";

export const FIXTURE_VERSION = 1 as const;

export interface SampleFixture {
  version: typeof FIXTURE_VERSION;
  sampleId: string;
  recordedAt: string;
  /** "live" = real Claude calls; "demo-provider" = dry run, NOT real output */
  recordedWith: "live" | "demo-provider";
  models: { generator: ModelId; judge: ModelId };
  strategy: Strategy;
  blueprint: Blueprint;
  roster: Roster;
  run: Run;
  extraction: { model: ModelId | null; repairs: string[]; unresolved: string[]; by: "claude" | "local parser" };
}

export interface RecordOptions {
  sampleId: string;
  provider: LlmProvider;
  /** Returns the text of a sample file, e.g. from disk or fetch */
  readFile: (path: string) => Promise<string>;
  generatorModel?: ModelId;
  judgeModel?: ModelId;
  judgeSamples?: number;
  strategy?: Strategy;
  /** Cap the number of versions (default: roster size) */
  n?: number;
  thresholds?: ThresholdSet;
  courseId?: string;
  onProgress?: (message: string) => void;
  signal?: AbortSignal;
  now?: () => string;
}

function nowIso(): string {
  return new Date().toISOString();
}

function toFiles(sample: NonNullable<ReturnType<typeof sampleById>>, texts: Record<string, string>): File[] {
  return sample.files.map((f) => new File([texts[f.path] ?? ""], f.name, { type: f.name.endsWith(".csv") ? "text/csv" : "text/markdown" }));
}

export async function recordSample(opts: RecordOptions): Promise<SampleFixture> {
  const sample = sampleById(opts.sampleId);
  if (!sample) throw new Error(`Unknown sample "${opts.sampleId}".`);
  const now = opts.now ?? nowIso;
  const say = opts.onProgress ?? (() => {});
  const courseId = opts.courseId ?? `course-${sample.course.code.toLowerCase().replace(/\s+/g, "")}`;
  const course = {
    id: courseId,
    code: sample.course.code,
    term: "Fall 2026",
    title: sample.course.title,
    instructor: { name: "Dr. E. Lee", institution: "Miami Dade College", role: "Instructor" },
  };

  say(`Reading ${sample.files.length} files for ${sample.organisation}`);
  const texts: Record<string, string> = {};
  for (const f of sample.files) texts[f.path] = await opts.readFile(f.path);
  const parsed = await parseFiles(toFiles(sample, texts), courseId);
  if (!parsed.roster) throw new Error("The sample roster did not parse.");

  // Extraction ---------------------------------------------------------------
  let draft: BlueprintDraft;
  let by: SampleFixture["extraction"]["by"];
  let extractionModel: ModelId | null = null;
  if (opts.provider.mode === "live") {
    say("Extracting the blueprint with Claude");
    const out = await opts.provider.extractBlueprint({ files: parsed.sources, rawText: parsed.rawText, course, signal: opts.signal });
    draft = { ...out, source: { ...out.source, files: parsed.sources.map(({ text: _t, ...rest }) => rest), readSeconds: parsed.readSeconds } };
    by = "claude";
    extractionModel = opts.generatorModel ?? DEFAULT_GENERATOR;
  } else {
    say("Extracting the blueprint with the local parser (dry run)");
    draft = localExtract(parsed.sources, sample);
    by = "local parser";
  }
  const guarded = guardDraft(draft, parsed.sources, sample);
  draft = guarded.draft;
  const skillKeys = sample.skills.map((s) => s.key);
  draft.rubric = draft.rubric.map((c, i) => (c.skillKeys?.length ? c : { ...c, skillKeys: skillKeys.filter((_, k) => k % Math.max(1, draft.rubric.length) === i) }));

  const t = now();
  const blueprint: Blueprint = {
    ...draft,
    id: `bp-${sample.id}`,
    code: draft.code ?? sample.course.code,
    courseId,
    createdAt: t,
    updatedAt: t,
    rubric: draft.rubric.map((c, i) => ({ ...c, id: c.id || `crit-${sample.id}-${i + 1}` })),
    challengeIds: [],
  };

  // Run ------------------------------------------------------------------------
  const generatorModel = opts.generatorModel ?? DEFAULT_GENERATOR;
  const judgeModel = opts.judgeModel ?? DEFAULT_JUDGE;
  const judgeSamples = opts.judgeSamples ?? 5;
  const strategy = opts.strategy ?? "structured-cot";
  const n = Math.max(2, Math.min(200, opts.n ?? parsed.roster.students.length));
  const est = estimateRunCost(n, judgeSamples, generatorModel, judgeModel);
  const run: Run = {
    id: `run-${sample.id}`,
    blueprintId: blueprint.id,
    blueprintName: blueprint.name.split(" — ")[0],
    courseId,
    strategy,
    threatProfile: strategy === "structured-cot" ? "high-stakes" : strategy === "dimension-preserving" ? "copy-at-scale" : "manual",
    generatorModel,
    judgeModel,
    judgeSamples,
    n,
    enabledDimensions: blueprint.surfaceDimensions.filter((d) => !d.locked && d.enabled).map((d) => d.key),
    mode: opts.provider.mode,
    status: "queued",
    progress: { phase: "queued", done: 0, total: n, message: "Queued" },
    startedAt: t,
    finishedAt: null,
    variants: [],
    report: null,
    release: null,
    costEstimateUsd: est.usd,
    estMinutes: est.minutes,
  };
  const studentIds = parsed.roster.students.map((s) => s.id);
  const signal = opts.signal ?? new AbortController().signal;
  const onUpdate = (r: Run) => say(`${r.progress.message}${r.usage ? ` · $${r.usage.costUsd.toFixed(2)} so far` : ""}`);
  let final = await runGeneration({
    run,
    blueprint,
    provider: opts.provider,
    thresholds: opts.thresholds ?? DEFAULT_THRESHOLDS,
    signal,
    studentIds,
    onUpdate,
  });
  // A transient failure (one truncated judge sample, one dropped connection) leaves the run
  // partial. Resume once automatically so a recording is complete unless something is really wrong.
  if (final.status === "partial") {
    say(`Run is partial; resuming once to retry what failed`);
    final = await runGeneration({ run: final, blueprint, provider: opts.provider, thresholds: opts.thresholds ?? DEFAULT_THRESHOLDS, signal, studentIds, onUpdate, resume: true });
  }

  return {
    version: FIXTURE_VERSION,
    sampleId: sample.id,
    recordedAt: now(),
    recordedWith: opts.provider.mode === "live" ? "live" : "demo-provider",
    models: { generator: generatorModel, judge: judgeModel },
    strategy,
    blueprint,
    roster: parsed.roster,
    run: final,
    extraction: { model: extractionModel, repairs: guarded.repairs, unresolved: guarded.unresolved, by },
  };
}


/** Resume a recorded run that ended partial (re-judges/regenerates only what is missing). */
export async function resumeFixture(fixture: SampleFixture, opts: Pick<RecordOptions, "provider" | "thresholds" | "signal" | "onProgress" | "now">): Promise<SampleFixture> {
  const say = opts.onProgress ?? (() => {});
  const now = opts.now ?? nowIso;
  const signal = opts.signal ?? new AbortController().signal;
  const studentIds = fixture.roster.students.map((s) => s.id);
  const final = await runGeneration({
    run: fixture.run,
    blueprint: fixture.blueprint,
    provider: opts.provider,
    thresholds: opts.thresholds ?? DEFAULT_THRESHOLDS,
    signal,
    studentIds,
    resume: true,
    onUpdate: (r) => say(`${r.progress.message}${r.usage ? ` · $${r.usage.costUsd.toFixed(2)} so far` : ""}`),
  });
  return { ...fixture, recordedAt: now(), run: final };
}
