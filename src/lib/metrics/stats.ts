/**
 * Small numeric helpers shared by the metric modules. Pure, dependency-free.
 */

/** Arithmetic mean. 0 for an empty list. */
export function mean(xs: number[]): number {
  if (xs.length === 0) return 0;
  let s = 0;
  for (const x of xs) s += x;
  return s / xs.length;
}

/**
 * Standard deviation. Population (÷N) by default, which is what the paper uses
 * for σ Flesch across a variant set. Sample (÷(N−1)) when `population` is false.
 * 0 for an empty list, or for a single element in sample mode.
 */
export function stddev(xs: number[], population = true): number {
  const n = xs.length;
  if (n === 0) return 0;
  if (!population && n < 2) return 0;
  const m = mean(xs);
  let ss = 0;
  for (const x of xs) ss += (x - m) * (x - m);
  return Math.sqrt(ss / (population ? n : n - 1));
}

/** Median. 0 for an empty list. Mean of the two middle values for even N. */
export function median(xs: number[]): number {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 1 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/** Clamp to [0, 1]. NaN → 0. */
export function clamp01(x: number): number {
  if (Number.isNaN(x)) return 0;
  return Math.min(1, Math.max(0, x));
}
