import type { Blueprint, Criterion, SurfaceDimension, ThresholdSet } from "@shared/types";

/**
 * Wave 6d: every repeated call (generation, judge, pre-score) is built as a
 * cacheable prefix followed by a per-call tail, so the Anthropic prompt cache
 * can serve the blueprint, rubric, canonical solution and strategy
 * instructions from cache on every call after the first.
 *
 *  system   — stable for the whole run (no per-call text, no timestamps, no ids)
 *  stable   — first user block: blueprint / rubric / solution / strategy material,
 *             byte-identical across every call of one run on one model
 *  volatile — second user block: the surface tuple, prior-variant summaries,
 *             the candidate under judgment, the submission
 *
 * `cache_control` goes on the `stable` block (see lib/llm/live.ts), which also
 * caches the tools and system rendered before it. `user` is the two blocks
 * joined, kept for callers and tests that read the prompt as one string.
 */
export interface CacheablePrompt {
  system: string;
  stable: string;
  volatile: string;
  user: string;
}

/** `stable` and `volatile` joined the way the model reads them (one blank line between). */
export function joinPromptBlocks(stable: string, volatile: string): string {
  return `${stable}\n\n${volatile}`;
}

/** The four integrity properties, worded as constraints on a single variant. */
export function propertyConstraints(t: ThresholdSet): string {
  return [
    `P1 Surface diversity — the variant must look different from the original task and from every other variant: a different scenario, domain, stakeholder and wording. The set's mean pairwise TF-IDF n-gram cosine must stay at or below ${t.p1Cosine}. Do not reuse sentences from the original.`,
    `P2 Construct equivalence — the variant must measure exactly the same competency. A judge scores each construct dimension 1–5 on whether the variant still measures it; the normalised median must be at or above ${t.p2Equivalence}. Keep every construct dimension exercised.`,
    `P3 Rubric stability — the instructor's rubric must grade the variant unchanged: the same criteria, the same number of criteria, the same kind of evidence for each level. Do not add or remove deliverables.`,
    `P4 Difficulty parity — the variant must be equally hard: same reading level (the set's Flesch reading-ease standard deviation must stay at or below ${t.p4FleschSigma}), same number of required findings or steps, similar length and jargon density as the original task.`,
  ].join("\n");
}

export function formatRubric(rubric: Criterion[]): string {
  if (rubric.length === 0) return "(no rubric criteria supplied)";
  return rubric
    .map((c, i) => {
      const head = `${i + 1}. ${c.name} — ${c.points} pts, weight ${c.weight.toFixed(2)}`;
      if (!c.anchors) return head;
      const levels = c.anchors.map((a, lvl) => `     level ${lvl}: ${a}`).join("\n");
      return `${head}\n${levels}`;
    })
    .join("\n");
}

export function formatDimensions(dims: SurfaceDimension[], enabledOnly = false): string {
  const list = enabledOnly ? dims.filter((d) => !d.locked && d.enabled) : dims;
  if (list.length === 0) return "(none)";
  return list
    .map((d) => {
      if (d.locked) return `- ${d.key} (${d.label}): LOCKED — held constant across all variants`;
      const values = d.values.length ? d.values.join(" | ") : "(free choice)";
      return `- ${d.key} (${d.label}): ${values}`;
    })
    .join("\n");
}

export function formatConstructDimensions(dims: string[]): string {
  return dims.map((d, i) => `${i + 1}. ${d}`).join("\n");
}

/** The blueprint as the generator sees it. Locked dimensions are stated explicitly. */
export function formatBlueprint(bp: Blueprint): string {
  return [
    `ASSESSMENT: ${bp.name}`,
    ``,
    `CONSTRUCT (what every version must still measure):`,
    bp.construct,
    ``,
    `CONSTRUCT DIMENSIONS (the judge scores each of these):`,
    formatConstructDimensions(bp.constructDimensions),
    ``,
    `RUBRIC (${bp.rubric.length} criteria, four levels 0–3; applied unchanged to every version):`,
    formatRubric(bp.rubric),
    ``,
    `ORIGINAL TASK PROMPT (as given to students):`,
    `<original_task>`,
    bp.taskPrompt,
    `</original_task>`,
    ``,
    `CANONICAL SOLUTION (expert answer to the original; keep its findings and structure):`,
    `<canonical_solution>`,
    bp.canonicalSolution || "(none supplied — infer the expected findings from the rubric)",
    `</canonical_solution>`,
    ``,
    `SURFACE DIMENSIONS:`,
    formatDimensions(bp.surfaceDimensions),
  ].join("\n");
}

export function formatAssignment(a: Record<string, string>): string {
  const entries = Object.entries(a);
  if (entries.length === 0) return "(none)";
  return entries.map(([k, v]) => `- ${k}: ${v}`).join("\n");
}

/** First `chars` characters of each prior variant, at most `max` of them. */
export function summarisePriorVariants(texts: string[], max = 8, chars = 200): string {
  const picked = texts.slice(-max);
  if (picked.length === 0) return "(none yet)";
  return picked
    .map((t, i) => {
      const s = t.replace(/\s+/g, " ").trim();
      return `${i + 1}. ${s.length > chars ? s.slice(0, chars) + "…" : s}`;
    })
    .join("\n");
}
