/**
 * Shared-boilerplate stripping (metric definition v3). Before P1 metrics are
 * computed, any line (trimmed, at least 4 words) that appears verbatim in at
 * least 60% of the set's variants is removed from every text. Assignment
 * headers, "what you must produce" boilerplate and rubric lines that a model
 * copied into every version would otherwise dominate the similarity.
 */

export const BOILERPLATE_SHARE = 0.6;
export const BOILERPLATE_MIN_WORDS = 4;

function normLine(line: string): string {
  return line.replace(/\s+/g, " ").trim();
}

function wordCount(line: string): number {
  return line ? line.split(" ").length : 0;
}

export interface StrippedTexts {
  texts: string[];
  removedLines: string[];
}

/** Remove lines shared by ≥ 60% of the texts. Fewer than 2 texts are returned as is. */
export function stripSharedBoilerplate(texts: string[]): StrippedTexts {
  if (texts.length < 2) return { texts: [...texts], removedLines: [] };
  const presence = new Map<string, number>();
  for (const t of texts) {
    const seen = new Set<string>();
    for (const raw of t.split(/\r?\n/)) {
      const l = normLine(raw);
      if (wordCount(l) < BOILERPLATE_MIN_WORDS) continue;
      if (seen.has(l)) continue;
      seen.add(l);
      presence.set(l, (presence.get(l) ?? 0) + 1);
    }
  }
  const threshold = Math.ceil(texts.length * BOILERPLATE_SHARE);
  const removed = new Set<string>();
  for (const [l, n] of presence) if (n >= threshold) removed.add(l);
  if (removed.size === 0) return { texts: [...texts], removedLines: [] };
  const out = texts.map((t) =>
    t
      .split(/\r?\n/)
      .filter((raw) => !removed.has(normLine(raw)))
      .join("\n"),
  );
  return { texts: out, removedLines: [...removed] };
}
