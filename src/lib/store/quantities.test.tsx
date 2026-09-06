import { describe, it, expect, beforeEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { useWorkspace } from "./workspace";
import { parseQuantities } from "@lib/quantities";
import { NumbersSwitch, QuantitiesTable, QuantitiesSummary, changingQuantities, defaultRangeFor, formulaCheck, newQuantity, policyWord, varyOn } from "@ui/components/Quantities";
import type { Quantity } from "@shared/types";

const LENDING = "ml-lending-fairness-audit";

function lendingBlueprint() {
  const bp = useWorkspace.getState().blueprints.find((b) => b.sampleId === LENDING);
  if (!bp) throw new Error("lending blueprint missing from the demo workspace");
  return bp;
}

describe("controlled numbers: store actions", () => {
  beforeEach(() => {
    useWorkspace.getState().resetToDemo();
  });

  it("the recorded blueprints carry no quantities, so the UI falls back to the parser", () => {
    const bp = lendingBlueprint();
    expect(bp.quantities).toBeUndefined();
    const parsed = parseQuantities(bp.taskPrompt);
    expect(parsed.length).toBeGreaterThan(0);
    expect(parsed.every((q) => typeof q.value === "number" && q.key && q.label)).toBe(true);
  });

  it("setQuantities replaces the list and patchQuantity edits one entry", () => {
    const bp = lendingBlueprint();
    const parsed = parseQuantities(bp.taskPrompt);
    useWorkspace.getState().setQuantities(bp.id, parsed);
    expect(lendingBlueprint().quantities).toHaveLength(parsed.length);

    const first = parsed[0];
    useWorkspace.getState().patchQuantity(bp.id, first.id, { policy: "keep", label: "Renamed figure" });
    const after = lendingBlueprint().quantities!.find((q) => q.id === first.id)!;
    expect(after.policy).toBe("keep");
    expect(after.label).toBe("Renamed figure");
    expect(after.value).toBe(first.value);
    // other blueprints untouched
    const others = useWorkspace.getState().blueprints.filter((b) => b.id !== bp.id);
    expect(others.every((b) => b.quantities === undefined)).toBe(true);
  });

  it("patchQuantity on a blueprint with no list is a no-op rather than a crash", () => {
    const bp = lendingBlueprint();
    useWorkspace.getState().patchQuantity(bp.id, "q-1", { policy: "keep" });
    expect(lendingBlueprint().quantities).toEqual([]);
  });

  it("setVaryQuantities flips the per-run switch; undefined counts as on", () => {
    const bp = lendingBlueprint();
    expect(varyOn(bp)).toBe(true);
    useWorkspace.getState().setVaryQuantities(bp.id, false);
    expect(lendingBlueprint().varyQuantities).toBe(false);
    expect(varyOn(lendingBlueprint())).toBe(false);
    useWorkspace.getState().setVaryQuantities(bp.id, true);
    expect(varyOn(lendingBlueprint())).toBe(true);
  });
});

describe("controlled numbers: helpers and rendering", () => {
  const accuracy: Quantity = { id: "q-1", key: "accuracy", label: "Overall accuracy", value: 0.91, kind: "rate", policy: "vary", range: { min: 0.85, max: 0.97, decimals: 2 } };
  const year: Quantity = { id: "q-2", key: "year", label: "Model year", value: 2023, kind: "date", policy: "keep" };
  const gap: Quantity = { id: "q-3", key: "gap", label: "Approval gap", value: 0.06, kind: "rate", policy: "derived", formula: "accuracy - 0.85" };

  it("counts what changes and words each policy", () => {
    expect(changingQuantities([accuracy, year, gap]).map((q) => q.key)).toEqual(["accuracy", "gap"]);
    expect(policyWord(year)).toBe("stays as written");
    expect(policyWord(accuracy)).toMatch(/^varies, 0.85 to 0.97/);
    expect(policyWord(gap)).toContain("accuracy - 0.85");
  });

  it("checks a derived formula against the other figures", () => {
    expect(formulaCheck(gap, [accuracy, year, gap]).ok).toBe(true);
    expect(formulaCheck({ ...gap, formula: "nope + 1" }, [accuracy, year, gap])).toMatchObject({ ok: false });
    expect(formulaCheck({ ...gap, formula: "" }, [accuracy, year, gap]).ok).toBe(false);
  });

  it("defaultRangeFor gives a ±25% band capped at 1 for rates", () => {
    const r = defaultRangeFor({ ...accuracy, range: undefined });
    expect(r.min).toBeCloseTo(0.68, 2);
    expect(r.max).toBe(1);
    const money = defaultRangeFor({ id: "m", key: "budget", label: "Budget", value: 12000, kind: "money", policy: "vary", unit: "$" });
    expect(money).toMatchObject({ min: 9000, max: 15000 });
  });

  it("newQuantity never reuses a key", () => {
    const q = newQuantity([{ ...accuracy, key: "figure_2" }]);
    expect(q.key).not.toBe("figure_2");
    expect(q.policy).toBe("keep");
  });

  it("the table renders the source rendering, the policy and the parser note", () => {
    const html = renderToStaticMarkup(<MemoryRouter><QuantitiesTable quantities={[accuracy, year]} fromParser /></MemoryRouter>);
    expect(html).toContain("Overall accuracy");
    expect(html).toContain("0.91");
    expect(html).toContain("2023");
    expect(html).toContain("stays as written");
    expect(html).toContain("Found by the local parser; confirm on edit.");
  });

  it("the switch says how many figures differ, and is disabled with nothing to vary", () => {
    const on = renderToStaticMarkup(<MemoryRouter><NumbersSwitch on onChange={() => {}} count={2} /></MemoryRouter>);
    expect(on).toContain("Numbers change per student");
    expect(on).toContain("2 figures will differ from student to student");
    const off = renderToStaticMarkup(<MemoryRouter><NumbersSwitch on={false} onChange={() => {}} count={1} /></MemoryRouter>);
    expect(off).toContain("every version keeps the original 1 figure");
    const none = renderToStaticMarkup(<MemoryRouter><NumbersSwitch on onChange={() => {}} count={0} /></MemoryRouter>);
    expect(none).toContain("disabled");
    expect(none).toContain("no figures were found to vary");
  });

  it("the summary lists the changing figures with their ranges and links to the editor", () => {
    const html = renderToStaticMarkup(<MemoryRouter><QuantitiesSummary quantities={[accuracy, year, gap]} fromParser={false} /></MemoryRouter>);
    expect(html).toContain("0.85 to 0.97");
    expect(html).toContain("Stays as written: Model year (2023)");
    expect(html).toContain("/blueprint?edit=1");
  });
});
