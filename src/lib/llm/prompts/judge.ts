import type { Blueprint, Quantity } from "@shared/types";
import { formatQuantity } from "@lib/quantities";
import { formatConstructDimensions, joinPromptBlocks, type CacheablePrompt } from "./shared";

/**
 * Key under which the judge's solvability score is stored in
 * `JudgeSample.dimensionScores` when a version carried controlled figures.
 * It counts toward the equivalence aggregate like any construct dimension: a
 * version whose numbers no longer pose the task is not construct-equivalent.
 */
export const SOLVABILITY_DIMENSION = "Solvable with this version's figures";

/**
 * P2 judge (paper §3.4): five-point Likert per construct-map dimension, five
 * independent self-consistency samples, median aggregation done in lib/metrics.
 * The judge sees ONE variant and never the other variants, so scores are
 * independent across the set.
 */
export const JUDGE_SYSTEM = `You are an assessment validity judge. You compare a candidate version of a task against the original and decide, dimension by dimension, whether the candidate still measures the same competency.

Score each construct dimension from 1 to 5:
5 — the candidate elicits this dimension exactly as the original does; a good answer needs the same reasoning.
4 — elicits it with a minor shift in emphasis or evidence.
3 — elicits it partially; part of the dimension could be skipped and still answer the candidate well.
2 — mostly displaced; the candidate rewards a different skill on this dimension.
1 — the dimension is absent or replaced by something else.

Judge construct, not surface. A different domain, stakeholder, scenario or vocabulary is expected and is not a reason to lower a score. Missing or altered deliverables, missing rubric criteria, or a task that can be answered without the competency are reasons to lower a score. Give exactly two sentences of rationale: one on what is preserved, one on what, if anything, drifted.

SOLVABILITY. When the candidate comes with a list of figures for this version, the app chose those numbers on purpose: they are the candidate's data. Score solvability 1 to 5: 5 — with exactly these figures the task is well-posed, the intended finding still exists and an expert could reach it; 3 — solvable but a figure makes the finding weaker, trivial or ambiguous (e.g. a gap that is now too small to matter, a threshold the data no longer crosses); 1 — the figures contradict each other, the text, or the deliverable, so the task cannot be answered as asked. Different values from the original are expected and are not a reason to lower the score. When no figures are listed, solvability = null.`;

/**
 * `stable` (construct, dimensions, criteria, original task) is identical for
 * every judge call of a run; only the candidate is per call. See shared.ts.
 */
export function buildJudgePrompt(
  blueprint: Pick<Blueprint, "construct" | "constructDimensions" | "rubric" | "taskPrompt"> & { quantities?: Quantity[] },
  variantText: string,
  quantityValues?: Record<string, number>,
): CacheablePrompt {
  const figures = formatFiguresForJudge(blueprint.quantities ?? [], quantityValues);
  const stable = [
    `CONSTRUCT:`,
    blueprint.construct,
    ``,
    `CONSTRUCT DIMENSIONS TO SCORE (copy each dimension text exactly into your answer, in this order):`,
    formatConstructDimensions(blueprint.constructDimensions),
    ``,
    `RUBRIC CRITERIA (must remain gradable on the candidate):`,
    blueprint.rubric.map((c, i) => `${i + 1}. ${c.name}`).join("\n") || "(none)",
    ``,
    `ORIGINAL TASK:`,
    `<original_task>`,
    blueprint.taskPrompt,
    `</original_task>`,
  ].join("\n");
  const volatile = [
    `CANDIDATE VERSION:`,
    `<candidate_task>`,
    variantText,
    `</candidate_task>`,
    ...(figures ? [``, `FIGURES THE APP CHOSE FOR THIS VERSION (its data; judge solvability with exactly these):`, figures] : []),
    ``,
    figures
      ? `Score every construct dimension 1–5, score solvability 1–5, and give the two-sentence rationale.`
      : `Score every construct dimension 1–5 (solvability = null) and give the two-sentence rationale.`,
  ].join("\n");

  return { system: JUDGE_SYSTEM, stable, volatile, user: joinPromptBlocks(stable, volatile) };
}

/** "- Overall accuracy (accuracy): 0.91" per controlled figure; empty string when there are none. */
function formatFiguresForJudge(quantities: Quantity[], values?: Record<string, number>): string {
  if (!values) return "";
  const lines: string[] = [];
  for (const q of quantities) {
    const v = values[q.key];
    if (v === undefined || !Number.isFinite(v)) continue;
    const shown = formatQuantity(q, v)[0] ?? String(v);
    lines.push(`- ${q.label} (${q.key}): ${shown}${q.policy === "derived" && q.formula ? ` = ${q.formula}` : ""}${q.constraint ? ` · ${q.constraint}` : ""}`);
  }
  return lines.join("\n");
}
