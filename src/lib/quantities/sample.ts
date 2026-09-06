import type { Quantity } from "@shared/types";
import { evaluateFormula, formulaIdentifiers } from "./formula";

/** Stable 32-bit hash of a string (FNV-1a). */
function hashString(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** mulberry32: small, fast, deterministic PRNG. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function roundTo(n: number, decimals: number): number {
  const f = 10 ** decimals;
  return Math.round(n * f) / f;
}

function drawOne(q: Quantity, rnd: () => number): number {
  const r = q.range;
  if (!r) return q.value;
  const decimals = r.decimals ?? 0;
  const min = Math.min(r.min, r.max);
  const max = Math.max(r.min, r.max);
  if (r.step && r.step > 0) {
    const steps = Math.floor((max - min) / r.step + 1e-9);
    if (steps <= 0) return roundTo(min, decimals);
    const k = Math.floor(rnd() * (steps + 1));
    return roundTo(min + k * r.step, decimals);
  }
  return roundTo(min + rnd() * (max - min), decimals);
}

interface Comparison {
  op: ">" | ">=" | "<" | "<=" | "==" | "!=";
  rhs: string;
}

/** Parse a simple constraint like "> 0.85", ">= south_rate", "!= 0". */
function parseConstraint(c: string): Comparison | null {
  const m = /^\s*(>=|<=|!=|==|>|<|=)\s*(.+?)\s*$/.exec(c);
  if (!m) return null;
  const op = (m[1] === "=" ? "==" : m[1]) as Comparison["op"];
  return { op, rhs: m[2] };
}

function satisfies(value: number, cmp: Comparison, values: Record<string, number>): boolean {
  const rhs = evaluateFormula(cmp.rhs, values);
  switch (cmp.op) {
    case ">":
      return value > rhs;
    case ">=":
      return value >= rhs;
    case "<":
      return value < rhs;
    case "<=":
      return value <= rhs;
    case "==":
      return Math.abs(value - rhs) < 1e-9;
    case "!=":
      return Math.abs(value - rhs) >= 1e-9;
  }
}

/** Order quantities so every derived one comes after the identifiers it depends on. Throws on cycles. */
function order(quantities: Quantity[]): Quantity[] {
  const byKey = new Map(quantities.map((q) => [q.key, q]));
  const done = new Set<string>();
  const visiting = new Set<string>();
  const out: Quantity[] = [];
  const visit = (q: Quantity) => {
    if (done.has(q.key)) return;
    if (visiting.has(q.key)) throw new Error(`Circular formula involving "${q.key}"`);
    visiting.add(q.key);
    if (q.policy === "derived" && q.formula) {
      for (const id of formulaIdentifiers(q.formula)) {
        const dep = byKey.get(id);
        if (dep) visit(dep);
      }
    }
    // Constraints may also reference other keys.
    if (q.constraint) {
      const cmp = parseConstraint(q.constraint);
      if (cmp) for (const id of formulaIdentifiers(cmp.rhs)) {
        const dep = byKey.get(id);
        if (dep && dep.key !== q.key) visit(dep);
      }
    }
    visiting.delete(q.key);
    done.add(q.key);
    out.push(q);
  };
  for (const q of quantities) visit(q);
  return out;
}

export interface SampleOptions {
  /** Seed string, e.g. `${runId}:${variantIndex}`. Same seed → same values. */
  seed: string;
  /** Previously drawn value sets; the sampler re-draws (up to 20 times) until at least one varied value differs from each. */
  distinctFrom?: Record<string, number>[];
}

/**
 * Draw one concrete set of values for a blueprint's quantities.
 * keep → source value; vary → uniform within range honouring step/decimals; derived → formula over the others.
 * Constraints are simple comparisons ("> 0.85", ">= south_rate") enforced by rejection sampling.
 */
export function sampleQuantities(quantities: Quantity[], opts: SampleOptions): Record<string, number> {
  const ordered = order(quantities);
  const rnd = mulberry32(hashString(opts.seed));
  const variedKeys = quantities.filter((q) => q.policy === "vary").map((q) => q.key);

  const drawSet = (): Record<string, number> => {
    const values: Record<string, number> = {};
    for (const q of ordered) {
      let v: number;
      if (q.policy === "keep") v = q.value;
      else if (q.policy === "derived") {
        if (!q.formula) throw new Error(`Derived quantity "${q.key}" has no formula`);
        v = evaluateFormula(q.formula, values);
        if (q.range?.decimals !== undefined) v = roundTo(v, q.range.decimals);
      } else {
        v = drawOne(q, rnd);
      }
      if (q.constraint) {
        const cmp = parseConstraint(q.constraint);
        if (cmp) {
          let tries = 0;
          while (!satisfies(v, cmp, values)) {
            if (q.policy !== "vary" || ++tries >= 100) {
              throw new Error(`Could not satisfy constraint "${q.constraint}" for "${q.key}"`);
            }
            v = drawOne(q, rnd);
          }
        }
      }
      values[q.key] = v;
    }
    return values;
  };

  let values = drawSet();
  if (opts.distinctFrom?.length && variedKeys.length) {
    const same = (a: Record<string, number>, b: Record<string, number>) => variedKeys.every((k) => a[k] === b[k]);
    let attempts = 0;
    while (opts.distinctFrom.some((prev) => same(values, prev)) && attempts < 20) {
      values = drawSet();
      attempts++;
    }
  }
  return values;
}
