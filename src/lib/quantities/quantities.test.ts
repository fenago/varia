import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Quantity } from "@shared/types";
import {
  checkConsistency,
  evaluateFormula,
  formatQuantity,
  numericComplexity,
  parseQuantities,
  quantitiesSummary,
  sampleQuantities,
} from "./index";

const sample = (f: string) => readFileSync(resolve(__dirname, "../../../public/samples/ml-lending-fairness-audit", f), "utf8");

describe("evaluateFormula", () => {
  it("does arithmetic with identifiers and functions", () => {
    expect(evaluateFormula("round(a * b / 100, 1)", { a: 27, b: 3 })).toBe(0.8);
    expect(evaluateFormula("max(a, b) - min(a, b)", { a: 18, b: 29 })).toBe(11);
    expect(evaluateFormula("-(a + 2) * 3", { a: 1 })).toBe(-9);
    expect(evaluateFormula("abs(a - b)", { a: 2, b: 5 })).toBe(3);
  });
  it("rejects unsafe or bad input", () => {
    expect(() => evaluateFormula("a + zzz", { a: 1 })).toThrow(/Unknown identifier/);
    expect(() => evaluateFormula("a / 0", { a: 1 })).toThrow(/Division by zero/);
    expect(() => evaluateFormula("a; b", { a: 1, b: 2 })).toThrow();
    expect(() => evaluateFormula("window.alert(1)", {})).toThrow();
    expect(() => evaluateFormula("a )", { a: 1 })).toThrow(/trailing/);
  });
});

describe("parseQuantities on the lending sample", () => {
  const brief = parseQuantities(sample("employer-brief.md"));
  const assignment = parseQuantities(sample("assignment.md"));

  it("finds the headline figures in the employer brief", () => {
    const values = brief.map((q) => q.value);
    expect(values).toContain(0.91);
    expect(values).toContain(0.88);
    expect(values).toContain(41);
    const acc = brief.find((q) => q.value === 0.91)!;
    expect(acc.kind).toBe("score");
    expect(acc.policy).toBe("vary");
    expect(acc.range!.max).toBeLessThanOrEqual(1);
  });

  it("finds the scenario figures in the assignment and skips rubric/length numbers", () => {
    const values = assignment.map((q) => q.value);
    for (const v of [0.91, 0.88, 0.35, 41, 18, 27, 29, 3.1, 2.6, 2.4, 14]) expect(values).toContain(v);
    // rubric points, word counts and the assignment number are not quantities
    expect(assignment.find((q) => q.value === 900)).toBeUndefined();
    expect(assignment.find((q) => q.value === 1300)).toBeUndefined();
    expect(assignment.find((q) => q.value === 6)).toBeUndefined();
    expect(assignment.find((q) => q.value === 3 && q.kind === "count")).toBeUndefined();
    // period qualifiers like "12-month" are not quantities
    expect(assignment.find((q) => q.value === 12)).toBeUndefined();
  });

  it("keeps dates and thresholds, varies the rest, with unique keys", () => {
    const y2023 = assignment.find((q) => q.value === 2023)!;
    expect(y2023.kind).toBe("date");
    expect(y2023.policy).toBe("keep");
    const thr = assignment.find((q) => q.value === 0.35)!;
    expect(thr.kind).toBe("threshold");
    expect(thr.policy).toBe("keep");
    const keys = assignment.map((q) => q.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const k of keys) expect(k).toMatch(/^[a-z0-9_]+$/);
    const metro = assignment.find((q) => q.value === 18)!;
    expect(metro.unit).toBe("%");
    expect(metro.kind).toBe("rate");
    expect(metro.key).toMatch(/metro/);
  });
});

describe("sampleQuantities", () => {
  const qs: Quantity[] = [
    { id: "1", key: "accuracy", label: "Accuracy", value: 0.91, kind: "score", policy: "vary", range: { min: 0.8, max: 0.97, decimals: 2, step: 0.01 } },
    { id: "2", key: "threshold", label: "Threshold", value: 0.35, kind: "threshold", policy: "keep" },
    { id: "3", key: "metro", label: "Decline rate Metro", value: 18, unit: "%", kind: "rate", policy: "vary", range: { min: 10, max: 25, step: 1, decimals: 0 } },
    { id: "4", key: "coastal", label: "Decline rate Coastal", value: 27, unit: "%", kind: "rate", policy: "vary", range: { min: 10, max: 40, step: 1, decimals: 0 }, constraint: "> metro" },
    { id: "5", key: "gap", label: "Gap", value: 9, unit: "%", kind: "measure", policy: "derived", formula: "coastal - metro", range: { decimals: 0, min: 0, max: 0 } },
  ];

  it("is deterministic for a seed and honours keep/vary/derived/constraints", () => {
    const a = sampleQuantities(qs, { seed: "run:1" });
    const b = sampleQuantities(qs, { seed: "run:1" });
    expect(a).toEqual(b);
    expect(a.threshold).toBe(0.35);
    expect(a.accuracy).toBeGreaterThanOrEqual(0.8);
    expect(a.accuracy).toBeLessThanOrEqual(0.97);
    expect(Number.isInteger(a.metro)).toBe(true);
    expect(a.coastal).toBeGreaterThan(a.metro);
    expect(a.gap).toBe(a.coastal - a.metro);
  });

  it("produces different values for different seeds and respects distinctFrom", () => {
    const seen = new Set<string>();
    const prev: Record<string, number>[] = [];
    for (let i = 0; i < 8; i++) {
      const v = sampleQuantities(qs, { seed: `run:${i}`, distinctFrom: prev });
      prev.push(v);
      seen.add(`${v.accuracy}|${v.metro}|${v.coastal}`);
    }
    expect(seen.size).toBe(8);
  });

  it("evaluates derived values in dependency order regardless of list order", () => {
    const reversed = [...qs].reverse();
    const v = sampleQuantities(reversed, { seed: "x" });
    expect(v.gap).toBe(v.coastal - v.metro);
  });

  it("throws on circular formulas", () => {
    const cyc: Quantity[] = [
      { id: "a", key: "a", label: "a", value: 1, kind: "other", policy: "derived", formula: "b + 1" },
      { id: "b", key: "b", label: "b", value: 1, kind: "other", policy: "derived", formula: "a + 1" },
    ];
    expect(() => sampleQuantities(cyc, { seed: "s" })).toThrow(/Circular/);
  });
});

describe("formatQuantity and checkConsistency", () => {
  const rate: Quantity = { id: "r", key: "r", label: "Rate", value: 0.35, kind: "rate", policy: "vary", range: { min: 0, max: 1, decimals: 2 } };
  const pct: Quantity = { id: "p", key: "p", label: "Metro", value: 18, unit: "%", kind: "rate", policy: "vary", range: { min: 0, max: 100, decimals: 0 } };
  const money: Quantity = { id: "m", key: "m", label: "Budget", value: 12000, unit: "$", kind: "money", policy: "vary", range: { min: 0, max: 100000, decimals: 0 } };
  const year: Quantity = { id: "y", key: "y", label: "Year", value: 2023, kind: "date", policy: "keep" };

  it("renders the ways a source might write a number", () => {
    expect(formatQuantity(rate, 0.35)).toEqual(expect.arrayContaining(["0.35", "35%", "35 percent"]));
    expect(formatQuantity(pct, 18)).toEqual(expect.arrayContaining(["18%", "18 percent", "18"]));
    expect(formatQuantity(money, 12000)).toEqual(expect.arrayContaining(["$12,000", "12,000", "12000", "12k"]));
    expect(formatQuantity(year, 2023)).toEqual(["2023"]);
  });

  it("passes when every varied figure is in every text and kept figures are in one", () => {
    const qs = [rate, pct, year];
    const values = { r: 0.42, p: 21, y: 2023 };
    const ok = checkConsistency(qs, values, [
      "The cut-off is 0.42 and Metro declines 21 percent of applicants in 2023.",
      "Model answer: at 42% the Metro rate of 21% is above the line.",
    ]);
    expect(ok.consistent).toBe(true);
    expect(ok.missing).toEqual([]);
    const bad = checkConsistency(qs, values, ["The cut-off is 0.35 and Metro declines 21 percent of applicants in 2023."]);
    expect(bad.consistent).toBe(false);
    expect(bad.missing).toEqual(["r"]);
  });

  it("does not match a number inside a longer number", () => {
    const res = checkConsistency([pct], { p: 18 }, ["Metro declines 118 percent, or 0.18."]);
    expect(res.consistent).toBe(false);
  });

  it("scores complexity and summarises", () => {
    const qs: Quantity[] = [rate, pct, { ...money, key: "d", policy: "derived", formula: "m * r" }, money];
    const c = numericComplexity(qs, { r: 0.35, p: 18, m: 12000, d: 4200 });
    expect(c).toBeGreaterThan(4);
    const s = quantitiesSummary(
      [
        { values: {}, consistent: true, missing: [], complexity: 6 },
        { values: {}, consistent: false, missing: ["p"], complexity: 8 },
        null,
      ],
      true,
    );
    expect(s).toEqual({ checked: 2, consistent: 1, complexitySigma: 1, varied: true });
  });
});
