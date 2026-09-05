import { describe, expect, it } from "vitest";
import type { LlmProvider, Run, UsageTotals } from "@shared/types";
import { DEFAULT_THRESHOLDS } from "@shared/thresholds";
import { costOf } from "@shared/models";
import { createDemoProvider } from "@lib/store/demoProvider";
import { runGeneration } from "@lib/store/orchestrator";
import { buildDemoBlueprintB1 } from "@lib/store/seed";
import { addUsage, emptyUsage, usageOf } from "./live";

function makeRun(n: number, mode: Run["mode"]): Run {
  return {
    id: "run-usage",
    blueprintId: "bp-b1-model-card-audit",
    blueprintName: "Model card audit",
    courseId: "dat4100",
    strategy: "zero-shot",
    threatProfile: "manual",
    generatorModel: "claude-opus-5",
    judgeModel: "claude-sonnet-5",
    judgeSamples: 3,
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

const GEN_USAGE = (model: string): UsageTotals => {
  const counts = { inputTokens: 1500, outputTokens: 1200, cacheReadTokens: 0, cacheWriteTokens: 0 };
  return { ...counts, costUsd: costOf(model, counts), calls: 1 };
};
const JUDGE_USAGE = (model: string): UsageTotals => {
  const counts = { inputTokens: 1200, outputTokens: 250, cacheReadTokens: 300, cacheWriteTokens: 0 };
  return { ...counts, costUsd: costOf(model, counts), calls: 1 };
};

/** The demo provider's outputs, but reporting usage the way the live provider does. */
function stubLiveProvider(): LlmProvider {
  const demo = createDemoProvider();
  return {
    ...demo,
    mode: "live",
    async generateVariant(input) {
      input.onUsage?.(GEN_USAGE(input.generatorModel));
      const out = await demo.generateVariant(input);
      return { ...out, usage: GEN_USAGE(input.generatorModel) };
    },
    async judgeVariant(input) {
      for (let i = 0; i < input.samples; i++) input.onUsage?.(JUDGE_USAGE(input.judgeModel));
      return demo.judgeVariant(input);
    },
  };
}

describe("usageOf", () => {
  it("reads the four token counts and prices on the model that answered", () => {
    const u = usageOf(
      { model: "claude-opus-4-8", usage: { input_tokens: 100, output_tokens: 50, cache_read_input_tokens: 20, cache_creation_input_tokens: 10 } as never },
      "claude-opus-5",
    );
    expect(u).toEqual({
      inputTokens: 100,
      outputTokens: 50,
      cacheReadTokens: 20,
      cacheWriteTokens: 10,
      calls: 1,
      costUsd: costOf("claude-opus-4-8", { inputTokens: 100, outputTokens: 50, cacheReadTokens: 20, cacheWriteTokens: 10 }),
    });
  });

  it("falls back to the requested model when the response model is not in the catalog, and treats missing counts as 0", () => {
    const u = usageOf({ model: "claude-something-new", usage: { input_tokens: 1000, output_tokens: 0 } as never }, "claude-sonnet-5");
    expect(u.cacheReadTokens).toBe(0);
    expect(u.cacheWriteTokens).toBe(0);
    expect(u.costUsd).toBeCloseTo(0.002, 9);
  });
});

describe("addUsage", () => {
  it("sums every field in place", () => {
    const t = emptyUsage();
    addUsage(t, GEN_USAGE("claude-opus-5"));
    addUsage(t, JUDGE_USAGE("claude-sonnet-5"));
    expect(t.calls).toBe(2);
    expect(t.inputTokens).toBe(2700);
    expect(t.outputTokens).toBe(1450);
    expect(t.cacheReadTokens).toBe(300);
    expect(t.costUsd).toBeCloseTo(GEN_USAGE("claude-opus-5").costUsd + JUDGE_USAGE("claude-sonnet-5").costUsd, 9);
  });
});

describe("orchestrator usage accumulation", () => {
  it("live runs accumulate per-run and per-variant usage through onUsage", async () => {
    const n = 4;
    const samples = 3;
    let sawUsageWhileGenerating = false;
    const run = await runGeneration({
      run: makeRun(n, "live"),
      blueprint: buildDemoBlueprintB1(),
      provider: stubLiveProvider(),
      thresholds: DEFAULT_THRESHOLDS,
      signal: new AbortController().signal,
      onUpdate: (r) => {
        if (r.status === "generating" && r.usage && r.usage.calls > 0) sawUsageWhileGenerating = true;
      },
    });
    expect(run.status).toBe("complete");
    expect(sawUsageWhileGenerating).toBe(true);

    const expectedCalls = n + n * samples;
    expect(run.usage?.calls).toBe(expectedCalls);
    const expectedCost = n * GEN_USAGE("claude-opus-5").costUsd + n * samples * JUDGE_USAGE("claude-sonnet-5").costUsd;
    expect(run.usage?.costUsd).toBeCloseTo(expectedCost, 9);
    expect(run.usage?.inputTokens).toBe(n * 1500 + n * samples * 1200);
    expect(run.usage?.cacheReadTokens).toBe(n * samples * 300);

    for (const v of run.variants) {
      expect(v.usage?.calls).toBe(1 + samples);
      expect(v.usage?.costUsd).toBeCloseTo(GEN_USAGE("claude-opus-5").costUsd + samples * JUDGE_USAGE("claude-sonnet-5").costUsd, 9);
    }
    const perVariant = run.variants.reduce((s, v) => s + (v.usage?.costUsd ?? 0), 0);
    expect(perVariant).toBeCloseTo(run.usage!.costUsd, 9);
  }, 20000);

  it("demo runs report no usage", async () => {
    const run = await runGeneration({
      run: makeRun(2, "demo"),
      blueprint: buildDemoBlueprintB1(),
      provider: createDemoProvider(),
      thresholds: DEFAULT_THRESHOLDS,
      signal: new AbortController().signal,
      onUpdate: () => {},
    });
    expect(run.status).toBe("complete");
    expect(run.usage).toBeUndefined();
    expect(run.variants.every((v) => v.usage === undefined)).toBe(true);
  }, 20000);
});
