import type { Blueprint } from "@shared/types";
import { formatConstructDimensions, joinPromptBlocks, type CacheablePrompt } from "./shared";

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

Judge construct, not surface. A different domain, stakeholder, scenario or vocabulary is expected and is not a reason to lower a score. Missing or altered deliverables, missing rubric criteria, or a task that can be answered without the competency are reasons to lower a score. Give exactly two sentences of rationale: one on what is preserved, one on what, if anything, drifted.`;

/**
 * `stable` (construct, dimensions, criteria, original task) is identical for
 * every judge call of a run; only the candidate is per call. See shared.ts.
 */
export function buildJudgePrompt(
  blueprint: Pick<Blueprint, "construct" | "constructDimensions" | "rubric" | "taskPrompt">,
  variantText: string,
): CacheablePrompt {
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
    ``,
    `Score every construct dimension 1–5 and give the two-sentence rationale.`,
  ].join("\n");

  return { system: JUDGE_SYSTEM, stable, volatile, user: joinPromptBlocks(stable, volatile) };
}
