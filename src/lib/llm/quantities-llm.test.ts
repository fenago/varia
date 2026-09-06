/**
 * Wave 11: controlled quantities through extraction, generation, judging,
 * the orchestrator and the report.
 */
import { describe, expect, it } from "vitest";
import type { Blueprint, GenerateVariantInput, JudgeInput, LlmProvider, Quantity, Run, Variant } from "@shared/types";
import { DEFAULT_THRESHOLDS } from "@shared/thresholds";
import { lendingBlueprint } from "@lib/store/testWorkspace";
import { chooseQuantityValues, quantityPlan, runGeneration } from "@lib/store/orchestrator";
import { createDemoProvider } from "@lib/store/demoProvider";
import { computeReport, QUANTITY_COMPLEXITY_SIGMA_ADVISORY } from "@lib/metrics/report";
import { formatQuantity } from "@lib/quantities";
import { buildGenerationPrompt } from "./prompts/strategies";
import { buildJudgePrompt, SOLVABILITY_DIMENSION } from "./prompts/judge";
import { EXTRACT_SYSTEM } from "./prompts/extract";
import { fallbackRange, guardDraft, mergeQuantities } from "./extractGuard";
import { normaliseQuantities } from "./live";
import { BlueprintDraftSchema, JudgeSchema } from "./schemas";

const QS: Quantity[] = [
  { id: "q-1", key: "accuracy", label: "Overall accuracy", value: 0.91, kind: "score", policy: "vary", range: { min: 0.86, max: 0.95, step: 0.01, decimals: 2 } },
  { id: "q-2", key: "threshold", label: "Decision threshold", value: 0.35, kind: "threshold", policy: "keep" },
  { id: "q-3", key: "metro", label: "Metro decline rate", value: 18, unit: "%", kind: "rate", policy: "vary", range: { min: 12, max: 24, step: 1, decimals: 0 } },
  { id: "q-4", key: "coastal", label: "Coastal decline rate", value: 27, unit: "%", kind: "rate", policy: "vary", range: { min: 20, max: 34, step: 1, decimals: 0 }, constraint: "> metro" },
  { id: "q-5", key: "gap", label: "Decline-rate gap", value: 9, unit: "%", kind: "measure", policy: "derived", formula: "coastal - metro" },
];

function bpWithQuantities(vary = true): Blueprint {
  return { ...lendingBlueprint(), quantities: QS, varyQuantities: vary };
}

function makeRun(n: number, mode: Run["mode"]): Run {
  return {
    id: "run-q",
    blueprintId: "bp-ml-lending-fairness-audit",
    blueprintName: "Model card audit",
    courseId: "dat4100",
    strategy: "zero-shot",
    threatProfile: "high-stakes",
    generatorModel: "claude-opus-5",
    judgeModel: "claude-sonnet-5",
    judgeSamples: 1,
    n,
    enabledDimensions: ["domain", "stakeholder", "scenario", "jargon"],
    mode,
    status: "queued",
    progress: { phase: "queued", done: 0, total: n, message: "" },
    startedAt: new Date().toISOString(),
    finishedAt: null,
    variants: [],
    report: null,
    release: null,
    costEstimateUsd: 0,
    estMinutes: 0,
  };
}

/** Text that states every figure the way the source did. */
function textWith(values: Record<string, number>, skip: string[] = []): string {
  const parts = QS.filter((q) => !skip.includes(q.key) && values[q.key] !== undefined).map((q) => `${q.label} is ${formatQuantity(q, values[q.key])[0]}.`);
  return `A regional lender asks for an audit of its model card. ${parts.join(" ")} Write four findings, each tied to the evidence, for the risk officer.`;
}

/** A fake live provider that writes the figures it is given, optionally forgetting some until a retry. */
function fakeLive(opts: { forgetOnFirstCall?: string[]; forgetAlways?: string[] } = {}) {
  const calls: GenerateVariantInput[] = [];
  const judged: JudgeInput[] = [];
  const provider: LlmProvider = {
    mode: "live",
    verifyKey: async () => ({ ok: true, model: "claude-opus-5" }),
    extractBlueprint: async () => { throw new Error("not used"); },
    draftAnchors: async () => ["a", "b", "c", "d"],
    draftCanonicalSolution: async () => "",
    generateFewShotAnchors: async () => ({ positive: [], negative: [] }),
    async generateVariant(input) {
      calls.push(input);
      const values = input.quantityValues ?? {};
      const firstForThisIndex = calls.filter((c) => c.index === input.index).length === 1;
      const skip = [...(opts.forgetAlways ?? []), ...(firstForThisIndex ? opts.forgetOnFirstCall ?? [] : [])];
      const text = `${textWith(values, skip)} Version ${input.index + 1} in ${input.surfaceAssignment.domain ?? "lending"}.`;
      return { text, adaptedSolution: `Model answer. ${textWith(values, skip)}`, surfaceAssignment: input.surfaceAssignment };
    },
    async judgeVariant(input) {
      judged.push(input);
      const scores = Object.fromEntries(input.blueprint.constructDimensions.map((d) => [d, 5]));
      if (input.quantityValues) scores[SOLVABILITY_DIMENSION] = 5;
      return Array.from({ length: input.samples }, () => ({ dimensionScores: scores, rationale: "ok. ok." }));
    },
  };
  return { provider, calls, judged };
}

describe("schemas carry quantities and solvability", () => {
  it("BlueprintDraftSchema has a quantities array and JudgeSchema a nullable solvability", () => {
    const shape = BlueprintDraftSchema.shape;
    expect("quantities" in shape).toBe(true);
    expect(JudgeSchema.parse({ dimensionScores: [{ dimension: "x", score: 4 }], rationale: "a. b.", solvability: null }).solvability).toBeNull();
    expect(JudgeSchema.parse({ dimensionScores: [], rationale: "", solvability: 3 }).solvability).toBe(3);
  });

  it("the extraction prompt asks for quantities and tells the model it does not choose values", () => {
    expect(EXTRACT_SYSTEM).toMatch(/- quantities:/);
    expect(EXTRACT_SYSTEM).toMatch(/You are not choosing values/);
    expect(EXTRACT_SYSTEM).toMatch(/Not rubric points/);
  });

  it("normaliseQuantities makes unique snake_case keys and honours the suggested policy", () => {
    const out = normaliseQuantities([
      { key: "Accuracy", label: "Accuracy", value: 0.91, unit: null, kind: "score", suggestedPolicy: "vary", formula: null, context: "accuracy 0.91", constraint: null },
      { key: "accuracy", label: "AUC", value: 0.88, unit: "", kind: "score", suggestedPolicy: "keep", formula: null, context: null, constraint: null },
      { key: "gap", label: "Gap", value: 9, unit: "%", kind: "measure", suggestedPolicy: "derived", formula: "a - b", context: null, constraint: null },
      { key: "broken", label: "Broken", value: 1, unit: null, kind: "other", suggestedPolicy: "derived", formula: null, context: null, constraint: null },
    ]);
    expect(out.map((q) => q.key)).toEqual(["accuracy", "accuracy_2", "gap", "broken"]);
    expect(out.map((q) => q.policy)).toEqual(["vary", "keep", "derived", "vary"]);
    expect(out[2].formula).toBe("a - b");
    expect(out[3].formula).toBeUndefined();
    expect(out[1].unit).toBeUndefined();
    expect(out.map((q) => q.id)).toEqual(["q-1", "q-2", "q-3", "q-4"]);
  });
});

describe("extraction guard merges the parser in", () => {
  const task = "The model reports accuracy 0.91 and AUC 0.88 on the 2024 holdout. The decline rate is 18% for Metro and 27% for Coastal applicants.";

  it("fills ranges for the model's entries, adds numbers the model missed, demotes broken formulas", () => {
    const fromModel: Quantity[] = [
      { id: "x", key: "accuracy", label: "Accuracy", value: 0.91, kind: "score", policy: "vary" },
      { id: "y", key: "gap", label: "Gap", value: 9, kind: "measure", policy: "derived", formula: "coastal - metro" },
    ];
    const { quantities, repair } = mergeQuantities(fromModel, task);
    const acc = quantities.find((q) => q.key === "accuracy")!;
    expect(acc.range).toBeDefined();
    expect(acc.range!.min).toBeLessThan(0.91);
    expect(acc.range!.max).toBeLessThanOrEqual(1);
    // Parser-found numbers the model did not name are added (AUC, 2024, 18%, 27%).
    expect(quantities.some((q) => q.value === 0.88)).toBe(true);
    expect(quantities.some((q) => q.value === 2024)).toBe(true);
    expect(quantities.filter((q) => q.value === 0.91)).toHaveLength(1);
    // "gap" referred to keys that do not exist, so it varies on its own.
    const gap = quantities.find((q) => q.key === "gap")!;
    expect(gap.policy).toBe("vary");
    expect(gap.formula).toBeUndefined();
    expect(gap.range).toBeDefined();
    expect(new Set(quantities.map((q) => q.key)).size).toBe(quantities.length);
    expect(quantities.map((q) => q.id)).toEqual(quantities.map((_, i) => `q-${i + 1}`));
    expect(repair).toMatch(/added from the task text/);
    expect(repair).toMatch(/derived number set to vary/);
  });

  it("keeps a valid formula and the model's constraint", () => {
    const fromModel: Quantity[] = [
      { id: "a", key: "metro", label: "Metro decline rate", value: 18, unit: "%", kind: "rate", policy: "vary" },
      { id: "b", key: "coastal", label: "Coastal decline rate", value: 27, unit: "%", kind: "rate", policy: "vary", constraint: "> metro" },
      { id: "c", key: "gap", label: "Gap", value: 9, unit: "%", kind: "measure", policy: "derived", formula: "coastal - metro" },
    ];
    const { quantities } = mergeQuantities(fromModel, task);
    expect(quantities.find((q) => q.key === "gap")!.policy).toBe("derived");
    expect(quantities.find((q) => q.key === "coastal")!.constraint).toBe("> metro");
  });

  it("falls back to the parser alone when the model returned nothing", () => {
    const { quantities, repair } = mergeQuantities(undefined, task);
    expect(quantities.length).toBeGreaterThanOrEqual(4);
    expect(repair).toMatch(/found by the built-in parser/);
  });

  it("guardDraft sets quantities and the vary switch on a draft that had neither", () => {
    const bp = lendingBlueprint();
    const { id: _i, courseId: _c, createdAt: _a, updatedAt: _u, quantities: _q, varyQuantities: _v, ...draft } = bp;
    const { draft: out } = guardDraft(draft, []);
    expect(out.quantities!.length).toBeGreaterThan(3);
    expect(out.varyQuantities).toBe(true);
  });

  it("fallbackRange is kind-aware", () => {
    expect(fallbackRange({ value: 0.91, kind: "score" }).max).toBeLessThanOrEqual(1);
    expect(fallbackRange({ value: 41, kind: "count" }).step).toBe(1);
    expect(fallbackRange({ value: 12000, kind: "money" }).step).toBe(100);
    expect(fallbackRange({ value: 0.35, kind: "threshold" }).decimals).toBe(2);
  });
});

describe("generation prompt figures block", () => {
  const input = (values?: Record<string, number>, retryNote?: string): GenerateVariantInput => ({
    blueprint: bpWithQuantities(),
    strategy: "zero-shot",
    index: 1,
    n: 3,
    surfaceAssignment: { domain: "insurance" },
    priorVariantTexts: [],
    generatorModel: "claude-opus-5",
    ...(values ? { quantityValues: values } : {}),
    ...(retryNote ? { retryNote } : {}),
  });

  it("puts the figures in the per-version block, not the cached prefix, with the source's rendering", () => {
    const p = buildGenerationPrompt(input({ accuracy: 0.87, threshold: 0.35, metro: 14, coastal: 25, gap: 11 }), DEFAULT_THRESHOLDS);
    expect(p.system).toMatch(/CONTROLLED FIGURES/);
    expect(p.volatile).toMatch(/FIGURES FOR THIS VERSION \(mandatory/);
    expect(p.volatile).toMatch(/Overall accuracy \(accuracy\): 0\.87/);
    expect(p.volatile).toMatch(/Metro decline rate \(metro\): 14%/);
    expect(p.volatile).toMatch(/Decision threshold \(threshold\): 0\.35.*keep: as in the original/);
    expect(p.volatile).toMatch(/Decline-rate gap \(gap\): 11%.*derived = coastal - metro/);
    expect(p.volatile).toMatch(/> metro/);
    expect(p.stable).not.toMatch(/FIGURES FOR THIS VERSION/);
  });

  it("omits the block when no values are passed, and adds the retry note when given", () => {
    expect(buildGenerationPrompt(input(), DEFAULT_THRESHOLDS).volatile).not.toMatch(/FIGURES FOR THIS VERSION/);
    const p = buildGenerationPrompt(input({ accuracy: 0.9 }, "It did not use Overall accuracy."), DEFAULT_THRESHOLDS);
    expect(p.volatile).toMatch(/NOTE ON YOUR PREVIOUS ATTEMPT: It did not use Overall accuracy\./);
  });

  it("stable prefix is byte-identical across versions with different figures", () => {
    const a = buildGenerationPrompt(input({ accuracy: 0.87 }), DEFAULT_THRESHOLDS);
    const b = buildGenerationPrompt({ ...input({ accuracy: 0.93 }), index: 2 }, DEFAULT_THRESHOLDS);
    expect(a.stable).toBe(b.stable);
    expect(a.system).toBe(b.system);
  });
});

describe("judge prompt solvability", () => {
  it("lists the version's figures and asks for a solvability score only when figures are given", () => {
    const bp = bpWithQuantities();
    const withFigures = buildJudgePrompt(bp, "candidate", { accuracy: 0.87, threshold: 0.35, metro: 14, coastal: 25, gap: 11 });
    expect(withFigures.system).toMatch(/SOLVABILITY/);
    expect(withFigures.volatile).toMatch(/FIGURES THE APP CHOSE FOR THIS VERSION/);
    expect(withFigures.volatile).toMatch(/Overall accuracy \(accuracy\): 0\.87/);
    expect(withFigures.volatile).toMatch(/score solvability 1–5/);
    const without = buildJudgePrompt(bp, "candidate");
    expect(without.volatile).not.toMatch(/FIGURES THE APP CHOSE/);
    expect(without.volatile).toMatch(/solvability = null/);
    expect(without.stable).toBe(withFigures.stable);
  });
});

describe("orchestrator draws, checks and stores the figures", () => {
  it("quantityPlan: demo gets none; live falls back to the parser; the switch turns vary off", () => {
    expect(quantityPlan(bpWithQuantities(), "demo")).toEqual({ quantities: [], vary: false });
    expect(quantityPlan(bpWithQuantities(false), "live").vary).toBe(false);
    expect(quantityPlan(bpWithQuantities(true), "live").vary).toBe(true);
    const parsed = quantityPlan({ ...lendingBlueprint(), quantities: undefined, varyQuantities: undefined }, "live");
    expect(parsed.quantities.length).toBeGreaterThan(3);
    expect(parsed.vary).toBe(true);
  });

  it("chooseQuantityValues is seeded, distinct across versions, keeps kept figures and computes derived ones", () => {
    const plan = { quantities: QS, vary: true };
    const a = chooseQuantityValues(plan, "run-1", 0, [])!;
    const a2 = chooseQuantityValues(plan, "run-1", 0, [])!;
    const b = chooseQuantityValues(plan, "run-1", 1, [a])!;
    expect(a).toEqual(a2);
    expect(a.threshold).toBe(0.35);
    expect(a.gap).toBeCloseTo(a.coastal - a.metro, 9);
    expect(a.coastal).toBeGreaterThan(a.metro);
    expect(["accuracy", "metro", "coastal"].some((k) => a[k] !== b[k])).toBe(true);
    const kept = chooseQuantityValues({ quantities: QS, vary: false }, "run-1", 0, [])!;
    expect(kept).toEqual({ accuracy: 0.91, threshold: 0.35, metro: 18, coastal: 27, gap: 9 });
  });

  it("a live run passes the figures to the generator and the judge and records a consistent outcome", async () => {
    const { provider, calls, judged } = fakeLive();
    const run = await runGeneration({
      run: makeRun(3, "live"),
      blueprint: bpWithQuantities(),
      provider,
      thresholds: DEFAULT_THRESHOLDS,
      signal: new AbortController().signal,
      onUpdate: () => {},
    });
    expect(run.status).toBe("complete");
    expect(calls).toHaveLength(3);
    expect(calls.every((c) => c.quantityValues && c.quantityValues.threshold === 0.35)).toBe(true);
    expect(run.variants.every((v) => v.quantities?.consistent)).toBe(true);
    expect(judged.every((j) => j.quantityValues)).toBe(true);
    expect(run.variants.every((v) => v.metrics.judgeSamples[0].dimensionScores[SOLVABILITY_DIMENSION] === 5)).toBe(true);
    const values = run.variants.map((v) => JSON.stringify(v.quantities!.values));
    expect(new Set(values).size).toBe(3);
    expect(run.report!.quantities).toEqual({ checked: 3, consistent: 3, complexitySigma: expect.any(Number), varied: true });
  });

  it("retries once when a figure is missing and keeps the consistent rewrite", async () => {
    const { provider, calls } = fakeLive({ forgetOnFirstCall: ["accuracy"] });
    const run = await runGeneration({ run: makeRun(2, "live"), blueprint: bpWithQuantities(), provider, thresholds: DEFAULT_THRESHOLDS, signal: new AbortController().signal, onUpdate: () => {} });
    expect(calls).toHaveLength(4);
    expect(calls.filter((c) => c.retryNote).map((c) => c.retryNote)).toEqual([expect.stringMatching(/Overall accuracy/), expect.stringMatching(/Overall accuracy/)]);
    expect(run.variants.every((v) => v.quantities?.consistent)).toBe(true);
    expect(run.report!.quantities!.consistent).toBe(2);
  });

  it("after one failed retry the version is kept, flagged inconsistent, and the report counts it", async () => {
    const { provider, calls } = fakeLive({ forgetAlways: ["metro"] });
    const warnings: string[] = [];
    const run = await runGeneration({
      run: makeRun(2, "live"),
      blueprint: bpWithQuantities(),
      provider,
      thresholds: DEFAULT_THRESHOLDS,
      signal: new AbortController().signal,
      onUpdate: (r) => warnings.push(...(r.progress.warnings ?? [])),
    });
    expect(calls).toHaveLength(4);
    expect(run.variants).toHaveLength(2);
    expect(run.variants.every((v) => v.quantities && !v.quantities.consistent && v.quantities.missing.includes("metro"))).toBe(true);
    expect(run.report!.quantities).toMatchObject({ checked: 2, consistent: 0 });
    expect(warnings.some((w) => /still missing after one rewrite/.test(w))).toBe(true);
  });

  it("with the switch off every version carries the original figures", async () => {
    const { provider, calls } = fakeLive();
    const run = await runGeneration({ run: makeRun(2, "live"), blueprint: bpWithQuantities(false), provider, thresholds: DEFAULT_THRESHOLDS, signal: new AbortController().signal, onUpdate: () => {} });
    expect(calls.every((c) => c.quantityValues?.accuracy === 0.91 && c.quantityValues.metro === 18)).toBe(true);
    expect(run.report!.quantities!.varied).toBe(false);
  });

  it("a regeneration keeps the figures the student already had", async () => {
    const { provider, calls } = fakeLive();
    const first = await runGeneration({ run: makeRun(2, "live"), blueprint: bpWithQuantities(), provider, thresholds: DEFAULT_THRESHOLDS, signal: new AbortController().signal, onUpdate: () => {} });
    const before = first.variants[1].quantities!.values;
    await runGeneration({ run: first, blueprint: bpWithQuantities(), provider, thresholds: DEFAULT_THRESHOLDS, signal: new AbortController().signal, onUpdate: () => {}, onlyVariantIds: ["v-02"] });
    expect(calls[calls.length - 1].quantityValues).toEqual(before);
  });

  it("a replayed recording draws no figures and the report says so", async () => {
    const run = await runGeneration({ run: { ...makeRun(3, "demo"), judgeSamples: 5, strategy: "structured-cot" }, blueprint: bpWithQuantities(), provider: createDemoProvider(), thresholds: DEFAULT_THRESHOLDS, signal: new AbortController().signal, onUpdate: () => {} });
    expect(run.status).toBe("complete");
    expect(run.variants.every((v) => v.quantities === undefined)).toBe(true);
    expect(run.report!.quantities).toBeNull();
  });
});

describe("report advisory on numeric difficulty", () => {
  function variant(id: string, complexity: number, flesch: number): Variant {
    return {
      id,
      runId: "r",
      studentId: null,
      text: `Version ${id}. The lender wants findings about ${id} and the model card figures.`,
      adaptedSolution: "Answer.",
      surfaceAssignment: {},
      metrics: { fleschEase: flesch, lexicalComplexity: 0.5, stepCount: 4, solutionFleschEase: 50, equivalence: 0.95, judgeSamples: [] },
      flags: { p4Outlier: false, p2Low: false },
      status: "draft",
      generation: 1,
      quantities: { values: { accuracy: 0.9 + complexity / 100 }, consistent: true, missing: [], complexity },
    };
  }

  it("adds the advisory to the P4 note above the sigma limit without touching the gate", () => {
    const run: Run = { ...makeRun(3, "live"), variants: [variant("v-01", 3, 50), variant("v-02", 9, 51), variant("v-03", 15, 52)] };
    const report = computeReport(run, DEFAULT_THRESHOLDS, { quantitiesVaried: true });
    expect(report.quantities!.complexitySigma).toBeGreaterThan(QUANTITY_COMPLEXITY_SIGMA_ADVISORY);
    expect(report.checks.p4.gate).toBe("pass");
    expect(report.checks.p4.note).toMatch(/Numeric difficulty also varies/);
    const even: Run = { ...run, variants: [variant("v-01", 5, 50), variant("v-02", 5, 51), variant("v-03", 6, 52)] };
    const quiet = computeReport(even, DEFAULT_THRESHOLDS, { quantitiesVaried: true });
    expect(quiet.checks.p4.note).toBeNull();
    expect(quiet.quantities).toMatchObject({ checked: 3, consistent: 3, varied: true });
  });

  it("infers varied from the values when the run does not say", () => {
    const run: Run = { ...makeRun(2, "live"), variants: [variant("v-01", 5, 50), variant("v-02", 5, 51)] };
    expect(computeReport(run, DEFAULT_THRESHOLDS).quantities!.varied).toBe(false);
    const differ: Run = { ...run, variants: [variant("v-01", 5, 50), variant("v-02", 7, 51)] };
    expect(computeReport(differ, DEFAULT_THRESHOLDS).quantities!.varied).toBe(true);
  });
});
