import { z } from "zod/v4";
import type { Blueprint, LevelScore, PreScoreOutput, Variant } from "@shared/types";
import { joinPromptBlocks, type CacheablePrompt } from "./shared";

/** Wire shape: arrays, never records (structured outputs forbid open objects). */
export const PreScoreSchema = z.object({
  criteria: z.array(
    z.object({
      criterion: z.string(),
      level: z.number().int().min(0).max(3),
      rationale: z.string(),
    }),
  ),
  summary: z.string(),
});

export const PRESCORE_SYSTEM = `You are a grading assistant for an instructor. You read one student's submission to one version of a task and suggest a rubric level for each criterion. Your suggestion is advisory: the instructor decides.

For each criterion, choose the level 0, 1, 2 or 3 whose anchor best matches the submission, and give one sentence of rationale that cites something specific in the submission (quote a phrase or name the finding). Grade against the adapted model answer for THIS version, not a generic answer. Do not reward length. Do not penalise a different scenario, organisation or vocabulary; the version is deliberately different from other students'. If a criterion is not addressed at all, level 0 with a rationale saying so. Finish with a two-sentence summary for the instructor: the strongest criterion and the one most worth a second look.`;

/**
 * `stable` (construct and full rubric) is identical for every pre-score call
 * on a blueprint; the version and the submission are per call. See shared.ts.
 */
export function buildPreScorePrompt(
  blueprint: Pick<Blueprint, "construct" | "rubric">,
  variant: Pick<Variant, "id" | "text" | "adaptedSolution">,
  submissionText: string,
): CacheablePrompt {
  const rubric = blueprint.rubric
    .map((c, i) => {
      const anchors = c.anchors ? c.anchors.map((a, l) => `    ${l}: ${a}`).join("\n") : "    (no level descriptions; use your judgement against the model answer)";
      return `${i + 1}. ${c.name} (${c.points} points)\n${anchors}`;
    })
    .join("\n");
  const stable = [
    `CONSTRUCT (what the task measures):`,
    blueprint.construct,
    ``,
    `RUBRIC (copy each criterion name exactly into your answer, in this order):`,
    rubric,
  ].join("\n");
  const volatile = [
    `THE VERSION THIS STUDENT RECEIVED (${variant.id}):`,
    `<task>`,
    variant.text,
    `</task>`,
    ``,
    `ADAPTED MODEL ANSWER FOR THIS VERSION (the reference):`,
    `<model_answer>`,
    variant.adaptedSolution,
    `</model_answer>`,
    ``,
    `STUDENT SUBMISSION:`,
    `<submission>`,
    submissionText,
    `</submission>`,
  ].join("\n");
  return { system: PRESCORE_SYSTEM, stable, volatile, user: joinPromptBlocks(stable, volatile) };
}

/** Map the model's criterion labels back to criterion ids (exact, then substring, then position). */
export function preScoreToOutput(blueprint: Pick<Blueprint, "rubric">, out: z.infer<typeof PreScoreSchema>): PreScoreOutput {
  const scores: Record<string, LevelScore> = {};
  const rationale: Record<string, string> = {};
  const used = new Set<number>();
  blueprint.rubric.forEach((c, i) => {
    const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
    let idx = out.criteria.findIndex((x, j) => !used.has(j) && norm(x.criterion) === norm(c.name));
    if (idx < 0) idx = out.criteria.findIndex((x, j) => !used.has(j) && (norm(x.criterion).includes(norm(c.name)) || norm(c.name).includes(norm(x.criterion))));
    if (idx < 0 && !used.has(i) && out.criteria[i]) idx = i;
    if (idx >= 0) {
      used.add(idx);
      const lv = Math.max(0, Math.min(3, Math.round(out.criteria[idx].level))) as LevelScore;
      scores[c.id] = lv;
      rationale[c.id] = out.criteria[idx].rationale.trim();
    }
  });
  return { scores, rationale, summary: out.summary.trim() };
}
