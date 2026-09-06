import type { Quantity, QuantityOutcome } from "@shared/types";
import { formatQuantity } from "./format";
import { formulaIdentifiers } from "./formula";

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** True when any accepted rendering of the value appears in the text on number boundaries. */
function appears(q: Quantity, value: number, text: string): boolean {
  for (const r of formatQuantity(q, value)) {
    const re = new RegExp(`(?<![\\d.])${escapeRe(r)}(?![\\d]|\\.\\d)`, "i");
    if (re.test(text)) return true;
  }
  return false;
}

/**
 * Do the texts of a version use exactly the figures that were drawn for it?
 * Varied and derived figures must appear in every text; kept figures in at least one.
 */
export function checkConsistency(
  quantities: Quantity[],
  values: Record<string, number>,
  texts: string[],
): QuantityOutcome {
  const missing: string[] = [];
  const nonEmpty = texts.filter((t) => t && t.trim().length > 0);
  for (const q of quantities) {
    const v = values[q.key];
    if (v === undefined) {
      missing.push(q.key);
      continue;
    }
    if (!nonEmpty.length) {
      missing.push(q.key);
      continue;
    }
    const ok =
      q.policy === "keep"
        ? nonEmpty.some((t) => appears(q, v, t))
        : nonEmpty.every((t) => appears(q, v, t));
    if (!ok) missing.push(q.key);
  }
  return { values, consistent: missing.length === 0, missing, complexity: numericComplexity(quantities, values) };
}

function significantDigits(n: number): number {
  const s = Math.abs(n).toString();
  if (/e/i.test(s)) return 1;
  return s.replace(".", "").replace(/^0+/, "").replace(/0+$/, "").length || 1;
}

/**
 * A difficulty proxy for the arithmetic a version asks for:
 * one point per figure, plus its decimal places, plus one per derived step, plus one for each figure with ≥4 significant digits.
 */
export function numericComplexity(quantities: Quantity[], values: Record<string, number>): number {
  let score = 0;
  for (const q of quantities) {
    const v = values[q.key] ?? q.value;
    score += 1;
    const dec = q.range?.decimals ?? (String(v).split(".")[1]?.length ?? 0);
    score += dec;
    if (q.policy === "derived" && q.formula) score += Math.max(1, formulaIdentifiers(q.formula).length - 1);
    if (significantDigits(v) >= 4) score += 1;
  }
  return score;
}

/** Aggregate over a run's versions for the integrity report. */
export function quantitiesSummary(
  outcomes: (QuantityOutcome | undefined | null)[],
  varied: boolean,
): { checked: number; consistent: number; complexitySigma: number; varied: boolean } {
  const list = outcomes.filter((o): o is QuantityOutcome => !!o);
  const checked = list.length;
  const consistent = list.filter((o) => o.consistent).length;
  const cs = list.map((o) => o.complexity);
  const mean = cs.length ? cs.reduce((a, b) => a + b, 0) / cs.length : 0;
  const variance = cs.length ? cs.reduce((a, c) => a + (c - mean) ** 2, 0) / cs.length : 0;
  return { checked, consistent, complexitySigma: Math.round(Math.sqrt(variance) * 1000) / 1000, varied };
}
