import type { Blueprint, Criterion, ThresholdSet } from "@shared/types";
import { formatBlueprint, formatRubric, propertyConstraints } from "./shared";

/** Four level descriptions (scores 0–3) for one rubric criterion. */
export function buildDraftAnchorsPrompt(
  criterion: Criterion,
  blueprint: Pick<Blueprint, "construct" | "taskPrompt">,
): { system: string; user: string } {
  const system = `You write rubric level descriptions for an instructor. Each criterion is scored on four levels, 0 to 3. Write exactly four descriptions, in order from 0 (absent or wrong) to 3 (complete and expert), each one or two sentences, each naming the observable evidence a grader looks for at that level. Keep the instructor's vocabulary. Do not mention points or percentages.`;
  const user = [
    `CONSTRUCT:`,
    blueprint.construct,
    ``,
    `TASK PROMPT:`,
    `<task>`,
    blueprint.taskPrompt,
    `</task>`,
    ``,
    `CRITERION: ${criterion.name} (${criterion.points} pts)`,
    ``,
    `Write the four level descriptions for scores 0, 1, 2, 3.`,
  ].join("\n");
  return { system, user };
}

/** An expert canonical solution s* for the blueprint's original task. */
export function buildCanonicalSolutionPrompt(
  blueprint: Pick<Blueprint, "construct" | "taskPrompt" | "rubric">,
): { system: string; user: string } {
  const system = `You write the canonical solution for an assessment: the complete answer an expert would submit to the task as written, which the instructor will use as the reference when grading. Answer the task itself, not a description of how to answer it. Address every rubric criterion at its top level. Use numbered steps or numbered findings for the substantive content so the structure can be carried over into other versions of the task. Do not add a preamble about being an AI or a note to the instructor.`;
  const user = [
    `CONSTRUCT:`,
    blueprint.construct,
    ``,
    `RUBRIC:`,
    formatRubric(blueprint.rubric),
    ``,
    `TASK PROMPT:`,
    `<task>`,
    blueprint.taskPrompt,
    `</task>`,
    ``,
    `Write the canonical solution.`,
  ].join("\n");
  return { system, user };
}

/**
 * Few-shot anchors (paper §3.3): two positive variants satisfying all four
 * properties; two negative anchors, a paraphrastic near-copy (fails P1) and a
 * construct-drifted variant (fails P2). Generated once per blueprint and cached.
 */
export function buildFewShotAnchorsPrompt(blueprint: Blueprint, thresholds: ThresholdSet): { system: string; user: string } {
  const system = [
    `You write anchor examples that will be shown to a generator of student-specific assessment versions. The generator must produce versions that satisfy four integrity properties:`,
    propertyConstraints(thresholds),
    ``,
    `Produce four complete student-facing task prompts:`,
    `- positive[0] and positive[1]: two versions that satisfy all four properties. Different domain, stakeholder and scenario from the original and from each other; same competency, same deliverable, same rubric criteria named, same reading level and number of required findings.`,
    `- negative[0]: a paraphrastic near-copy. Same scenario and structure as the original with sentences reworded and synonyms swapped. It fails P1 (surface diversity) and is what a lazy generator produces.`,
    `- negative[1]: a construct-drifted version. A fresh, plausible scenario that reads like a good variant but quietly asks for a different skill (for example description instead of analysis, or a different deliverable), so the rubric no longer fits. It fails P2 (construct equivalence).`,
    `Each anchor must be a complete task a student could answer on its own. Do not label the anchors inside their text.`,
  ].join("\n");
  const user = [formatBlueprint(blueprint), ``, `Write the two positive and two negative anchors.`].join("\n");
  return { system, user };
}
