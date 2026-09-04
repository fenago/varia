/**
 * Word n-gram overlap (P1, secondary). Mean pairwise Jaccard on 4-gram sets.
 */

/** Lowercase alphanumeric word tokens. */
export function tokenize(text: string): string[] {
  return text.toLowerCase().match(/[a-z0-9]+/g) ?? [];
}

/** Set of space-joined word n-grams. Empty when fewer than n tokens. */
export function wordNgrams(tokens: string[], n: number): Set<string> {
  const out = new Set<string>();
  if (n <= 0) return out;
  for (let i = 0; i + n <= tokens.length; i++) {
    out.add(tokens.slice(i, i + n).join(" "));
  }
  return out;
}

/** Jaccard similarity |A∩B| / |A∪B|. 0 when both sets are empty. */
export function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 0;
  let inter = 0;
  const [small, large] = a.size <= b.size ? [a, b] : [b, a];
  for (const x of small) if (large.has(x)) inter++;
  const union = a.size + b.size - inter;
  return union === 0 ? 0 : inter / union;
}

/** Mean Jaccard on word 4-gram sets over all unordered pairs. 0 if fewer than 2 texts. */
export function pairwiseJaccard4Mean(texts: string[]): number {
  if (texts.length < 2) return 0;
  const sets = texts.map((t) => wordNgrams(tokenize(t), 4));
  let sum = 0;
  let pairs = 0;
  for (let i = 0; i < sets.length; i++) {
    for (let j = i + 1; j < sets.length; j++) {
      sum += jaccard(sets[i], sets[j]);
      pairs++;
    }
  }
  return pairs === 0 ? 0 : sum / pairs;
}
