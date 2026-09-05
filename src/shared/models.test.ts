import { describe, expect, it } from "vitest";
import {
  DEFAULT_GENERATOR,
  DEFAULT_JUDGE,
  DEFAULT_PRESET,
  ESTIMATE_CACHE_PREFIX_TOKENS,
  ESTIMATE_TOKENS,
  GENERATOR_MODELS,
  JUDGE_MODELS,
  MODEL_CATALOG,
  PRESET_ORDER,
  RUN_PRESETS,
  costOf,
  estimateRunCost,
  modelCaveat,
  modelOptionText,
  modelSpec,
  modelsByFamily,
  presetDescription,
  presetPerStudentUsd,
} from "./models";
import { GENERATOR_MODELS as TYPES_GENERATOR_MODELS, JUDGE_MODELS as TYPES_JUDGE_MODELS } from "./types";

const EXPECTED_IDS = [
  "claude-fable-5-1",
  "claude-fable-5",
  "claude-opus-5",
  "claude-opus-4-8",
  "claude-opus-4-7",
  "claude-opus-4-6",
  "claude-sonnet-5",
  "claude-sonnet-4-6",
  "claude-haiku-4-5",
];

describe("MODEL_CATALOG", () => {
  it("contains exactly the nine models, in family order, with no date suffixes", () => {
    expect(MODEL_CATALOG.map((m) => m.id)).toEqual(EXPECTED_IDS);
    for (const m of MODEL_CATALOG) expect(m.id).not.toMatch(/\d{8}$/);
  });

  it("has unique ids and every field populated", () => {
    expect(new Set(MODEL_CATALOG.map((m) => m.id)).size).toBe(MODEL_CATALOG.length);
    for (const m of MODEL_CATALOG) {
      expect(m.label).toBeTruthy();
      expect(m.note).toBeTruthy();
      expect(m.roles.length).toBeGreaterThan(0);
      expect(m.contextTokens).toBeGreaterThan(0);
      expect(m.maxOutputTokens).toBeGreaterThan(0);
      expect(m.priceInPerM).toBeGreaterThan(0);
      expect(m.priceOutPerM).toBeGreaterThan(m.priceInPerM);
      expect(m.priceCacheReadPerM).toBeLessThan(m.priceInPerM);
      expect(m.priceCacheWritePerM).toBeCloseTo(m.priceInPerM * 1.25, 6);
      expect([512, 1024, 2048, 4096]).toContain(m.minCacheTokens);
    }
  });

  it("carries the minimum cacheable prefix per model from the claude-api skill", () => {
    expect(modelSpec("claude-opus-5")!.minCacheTokens).toBe(512);
    expect(modelSpec("claude-fable-5-1")!.minCacheTokens).toBe(512);
    expect(modelSpec("claude-sonnet-5")!.minCacheTokens).toBe(1024);
    expect(modelSpec("claude-opus-4-8")!.minCacheTokens).toBe(1024);
    expect(modelSpec("claude-opus-4-7")!.minCacheTokens).toBe(2048);
    expect(modelSpec("claude-opus-4-6")!.minCacheTokens).toBe(4096);
    expect(modelSpec("claude-haiku-4-5")!.minCacheTokens).toBe(4096);
  });

  it("marks defaults: Opus 5 generates, Sonnet 5 judges", () => {
    expect(DEFAULT_GENERATOR).toBe("claude-opus-5");
    expect(DEFAULT_JUDGE).toBe("claude-sonnet-5");
    expect(MODEL_CATALOG.filter((m) => m.defaultFor === "generator")).toHaveLength(1);
    expect(MODEL_CATALOG.filter((m) => m.defaultFor === "judge")).toHaveLength(1);
  });

  it("encodes the per-family request rules from the claude-api skill", () => {
    const fable = modelSpec("claude-fable-5-1")!;
    expect(fable.thinking).toBe("always");
    expect(fable.supportsSampling).toBe(false);
    expect(fable.needsRefusalFallback).toBe(true);
    expect(fable.priceCacheReadPerM).toBe(0.25);
    expect(modelSpec("claude-fable-5")!.priceCacheReadPerM).toBe(1);

    const opus5 = modelSpec("claude-opus-5")!;
    expect(opus5.thinking).toBe("adaptive");
    expect(opus5.needsRefusalFallback).toBe(true);
    expect(opus5.supportsSampling).toBe(false);

    for (const id of ["claude-opus-4-8", "claude-opus-4-7", "claude-sonnet-5"]) {
      expect(modelSpec(id)!.thinking).toBe("adaptive");
      expect(modelSpec(id)!.supportsSampling).toBe(false);
    }
    for (const id of ["claude-opus-4-6", "claude-sonnet-4-6"]) {
      expect(modelSpec(id)!.thinking).toBe("adaptive");
      expect(modelSpec(id)!.supportsSampling).toBe(true);
    }

    const haiku = modelSpec("claude-haiku-4-5")!;
    expect(haiku.thinking).toBe("budget");
    expect(haiku.supportsEffort).toBe(false);
    expect(haiku.contextTokens).toBe(200_000);
    expect(haiku.maxOutputTokens).toBe(64_000);
  });

  it("keeps the pilot notes on Opus 4.7 and Sonnet 4.6", () => {
    expect(modelSpec("claude-opus-4-7")!.note).toBe("pilot generator");
    expect(modelSpec("claude-sonnet-4-6")!.note).toBe("pilot judge");
  });

  it("returns undefined for unknown ids", () => {
    expect(modelSpec("claude-opus-5-20260401")).toBeUndefined();
  });
});

describe("GENERATOR_MODELS / JUDGE_MODELS", () => {
  it("keep the { id, label, note } shape and are re-exported from types.ts unchanged", () => {
    for (const m of [...GENERATOR_MODELS, ...JUDGE_MODELS]) {
      expect(Object.keys(m).sort()).toEqual(["id", "label", "note"]);
    }
    expect(TYPES_GENERATOR_MODELS).toBe(GENERATOR_MODELS);
    expect(TYPES_JUDGE_MODELS).toBe(JUDGE_MODELS);
  });

  it("include the defaults and the pilot models", () => {
    expect(GENERATOR_MODELS.map((m) => m.id)).toContain("claude-opus-5");
    expect(GENERATOR_MODELS.map((m) => m.id)).toContain("claude-opus-4-7");
    expect(JUDGE_MODELS.map((m) => m.id)).toContain("claude-sonnet-5");
    expect(JUDGE_MODELS.map((m) => m.id)).toContain("claude-sonnet-4-6");
  });

  it("group by family in Fable, Opus, Sonnet, Haiku order", () => {
    const groups = modelsByFamily("generator");
    expect(groups.map((g) => g.family)).toEqual(["fable", "opus", "sonnet", "haiku"]);
    expect(groups.flatMap((g) => g.models.map((m) => m.id))).toEqual(EXPECTED_IDS);
  });
});

describe("option text and caveats", () => {
  it("puts label, note and in/out price in the option text", () => {
    const text = modelOptionText(modelSpec("claude-opus-5")!);
    expect(text).toContain("Claude Opus 5");
    expect(text).toContain("default generator");
    expect(text).toContain("$5 in / $25 out per M");
  });

  it("only Fable 5.1 carries the retention/decline caveat", () => {
    expect(modelCaveat("claude-fable-5-1")).toMatch(/30-day data retention/);
    for (const id of EXPECTED_IDS.filter((x) => x !== "claude-fable-5-1")) expect(modelCaveat(id)).toBeNull();
  });
});

describe("costOf", () => {
  it("prices each token class at its own rate per million", () => {
    // Opus 5: $5 in, $25 out, $0.50 cache read, $6.25 cache write.
    const usd = costOf("claude-opus-5", { inputTokens: 1_000_000, outputTokens: 100_000, cacheReadTokens: 200_000, cacheWriteTokens: 40_000 });
    expect(usd).toBeCloseTo(5 + 2.5 + 0.1 + 0.25, 9);
  });

  it("uses Fable 5.1's $0.25 cache-read rate", () => {
    expect(costOf("claude-fable-5-1", { inputTokens: 0, outputTokens: 0, cacheReadTokens: 4_000_000, cacheWriteTokens: 0 })).toBeCloseTo(1, 9);
  });

  it("is zero for zero usage, zero for unknown models, and ignores negative counts", () => {
    const zero = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 };
    expect(costOf("claude-sonnet-5", zero)).toBe(0);
    expect(costOf("not-a-model", { ...zero, inputTokens: 1_000_000 })).toBe(0);
    expect(costOf("claude-sonnet-5", { ...zero, inputTokens: -5 })).toBe(0);
  });
});

/** `calls` calls with the shared prefix written once and read `calls - 1` times. */
function series(id: string, calls: number, t: { inputTokens: number; outputTokens: number }): number {
  const prefix = ESTIMATE_CACHE_PREFIX_TOKENS;
  const rest = t.inputTokens - prefix;
  const first = costOf(id, { inputTokens: rest, outputTokens: t.outputTokens, cacheReadTokens: 0, cacheWriteTokens: prefix });
  const later = costOf(id, { inputTokens: rest, outputTokens: t.outputTokens, cacheReadTokens: prefix, cacheWriteTokens: 0 });
  return first + (calls - 1) * later;
}

describe("estimateRunCost", () => {
  it("is n generation calls plus n × samples judge calls, with the shared prefix cached after the first call per model", () => {
    const n = 34;
    const samples = 5;
    const expected = series("claude-opus-5", n, ESTIMATE_TOKENS.generation) + series("claude-sonnet-5", n * samples, ESTIMATE_TOKENS.judge);
    const est = estimateRunCost(n, samples);
    expect(est.usd).toBe(Math.round(expected * 100) / 100);
    expect(est.perStudentUsd).toBe(Math.round((expected / n) * 100) / 100);
    // Defaults are Opus 5 / Sonnet 5 / structured CoT.
    expect(est).toEqual(estimateRunCost(n, samples, "claude-opus-5", "claude-sonnet-5", "structured-cot"));
  });

  it("is cheaper than the same run priced without caching", () => {
    const n = 30;
    const uncached =
      n * costOf("claude-opus-5", { ...ESTIMATE_TOKENS.generation, cacheReadTokens: 0, cacheWriteTokens: 0 }) +
      n * 5 * costOf("claude-sonnet-5", { ...ESTIMATE_TOKENS.judge, cacheReadTokens: 0, cacheWriteTokens: 0 });
    expect(estimateRunCost(n, 5).usd).toBeLessThan(uncached);
  });

  it("prices models whose cache minimum exceeds the assumed prefix uncached (Haiku 4.5, Opus 4.6, Opus 4.7)", () => {
    for (const id of ["claude-haiku-4-5", "claude-opus-4-6", "claude-opus-4-7"]) {
      expect(modelSpec(id)!.minCacheTokens).toBeGreaterThan(ESTIMATE_CACHE_PREFIX_TOKENS);
      const n = 10;
      const uncached =
        n * costOf(id, { ...ESTIMATE_TOKENS.generationLight, cacheReadTokens: 0, cacheWriteTokens: 0 }) +
        n * 3 * costOf(id, { ...ESTIMATE_TOKENS.judge, cacheReadTokens: 0, cacheWriteTokens: 0 });
      expect(estimateRunCost(n, 3, id, id, "zero-shot").usd).toBe(Math.round(uncached * 100) / 100);
    }
  });

  it("assumes lighter generation output for every strategy but structured CoT", () => {
    expect(estimateRunCost(10, 5, "claude-opus-5", "claude-sonnet-5", "zero-shot").usd).toBeLessThan(estimateRunCost(10, 5).usd);
  });

  it("changes with the selected models", () => {
    const cheap = estimateRunCost(10, 5, "claude-haiku-4-5", "claude-haiku-4-5").usd;
    const dear = estimateRunCost(10, 5, "claude-fable-5-1", "claude-opus-5").usd;
    expect(cheap).toBeLessThan(dear);
  });

  it("handles zero and fractional inputs", () => {
    expect(estimateRunCost(0, 5)).toEqual({ usd: 0, minutes: 0, perStudentUsd: 0 });
    expect(estimateRunCost(2.9, 5.9).usd).toBe(estimateRunCost(2, 5).usd);
  });

  it("lands near the recorded full-sheet run: about $0.26 per student for high-stakes", () => {
    // Recorded uncached: $0.285 per variant (lib/store/fixtures/ml-lending-fairness-audit.json). Caching takes a little off.
    const per = estimateRunCost(30, 5).perStudentUsd;
    expect(per).toBeGreaterThanOrEqual(0.22);
    expect(per).toBeLessThanOrEqual(0.3);
  });
});

describe("run presets", () => {
  it("high-stakes is Opus 5 + Sonnet 5 × 5 on structured CoT; formative is Sonnet 5 + Sonnet 5 × 3 on dimension-preserving", () => {
    expect(DEFAULT_PRESET).toBe("high-stakes");
    expect(PRESET_ORDER).toEqual(["high-stakes", "formative", "custom"]);
    const hs = RUN_PRESETS["high-stakes"];
    expect([hs.generator, hs.judge, hs.judgeSamples, hs.strategy]).toEqual(["claude-opus-5", "claude-sonnet-5", 5, "structured-cot"]);
    const fm = RUN_PRESETS.formative;
    expect([fm.generator, fm.judge, fm.judgeSamples, fm.strategy]).toEqual(["claude-sonnet-5", "claude-sonnet-5", 3, "dimension-preserving"]);
  });

  it("describes each preset with a live per-student price", () => {
    const hs = presetDescription("high-stakes");
    expect(hs).toMatch(/^Highest construct fidelity; about \$\d+\.\d\d per student\.$/);
    expect(hs).toContain(`$${presetPerStudentUsd("high-stakes").toFixed(2)}`);
    const fm = presetDescription("formative");
    expect(fm).toMatch(/^Surface separation at about .* of the cost; about \$\d+\.\d\d per student\.$/);
    expect(presetPerStudentUsd("formative")).toBeLessThan(presetPerStudentUsd("high-stakes") / 2);
    expect(presetDescription("custom")).toMatch(/Your own generator/);
    expect(presetDescription("custom", { generator: "claude-opus-5", judge: "claude-sonnet-5", judgeSamples: 5, strategy: "structured-cot" })).toContain(
      `$${presetPerStudentUsd("high-stakes").toFixed(2)}`,
    );
  });
});
