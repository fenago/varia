import type { GenerateVariantInput, ThresholdSet } from "@shared/types";
import {
  formatAssignment,
  formatBlueprint,
  formatDimensions,
  propertyConstraints,
  summarisePriorVariants,
} from "./shared";

export type GenerationSchemaKind = "variant" | "structured-cot";

export interface GenerationPrompt {
  system: string;
  user: string;
  schema: GenerationSchemaKind;
}

/**
 * The four prompting strategies of paper §3.3.
 *
 *  zero-shot            blueprint + the four properties as explicit constraints, no examples
 *  few-shot             zero-shot + two positive anchors + two negative anchors (paraphrastic
 *                       near-copy, construct drift) cached on blueprint.fewShotAnchors
 *  structured-cot       emit, in order: constructMap → surfacePlan → draft → selfCheck (P1–P4) → final
 *  dimension-preserving the surfaceAssignment tuple is mandatory; explicit parity constraints
 *
 * Every strategy also gets the prior variants (diversity nudge), must return an
 * adapted canonical solution, and must return a complete student-facing task.
 */
export function buildGenerationPrompt(input: GenerateVariantInput, thresholds: ThresholdSet): GenerationPrompt {
  const { blueprint, strategy } = input;
  const enabledDims = blueprint.surfaceDimensions.filter((d) => !d.locked && d.enabled);
  const lockedDims = blueprint.surfaceDimensions.filter((d) => d.locked);

  const systemParts: string[] = [
    `You generate student-specific versions of an existing assessment. Each version is a surface-different but construct-equivalent task: a different scenario for the same skill, graded by the same rubric, equally hard. This is version ${input.index + 1} of ${input.n} in the set.`,
    ``,
    `THE FOUR INTEGRITY PROPERTIES (hard constraints on your output):`,
    propertyConstraints(thresholds),
    ``,
    `OUTPUT REQUIREMENTS (every strategy):`,
    `- text: a complete, self-contained, student-facing task prompt. It must ask for the same deliverable as the original (same format, same length expectation), state the scenario fully enough that a student can answer without seeing the original, and name the same rubric criteria the student will be graded on (${blueprint.rubric.map((c) => c.name).join("; ") || "as in the original"}). Do not address the instructor, do not explain the variation, do not include headings like "Variant".`,
    `- adaptedSolution: the canonical solution rewritten into this variant's scenario. Keep the same findings, the same number of steps and the same structure; change only the surface details so that it is the correct expert answer to the new text.`,
    `- surfaceAssignment: the value you actually used for each enabled surface dimension.`,
    `- Locked dimensions are never varied: ${lockedDims.map((d) => d.label.toLowerCase()).join(", ") || "reading level, step count"} must match the original task.`,
  ];

  const userParts: string[] = [formatBlueprint(blueprint), ``];

  switch (strategy) {
    case "zero-shot": {
      systemParts.push(
        ``,
        `STRATEGY: zero-shot. Work directly from the blueprint and the four properties above. No examples are provided.`,
      );
      userParts.push(
        `ENABLED SURFACE DIMENSIONS TO VARY:`,
        formatDimensions(enabledDims, true),
        ``,
        `Suggested assignment for this version (you may adjust it to satisfy P1 against the prior versions):`,
        formatAssignment(input.surfaceAssignment),
      );
      break;
    }

    case "few-shot": {
      const anchors = blueprint.fewShotAnchors;
      systemParts.push(
        ``,
        `STRATEGY: few-shot with anchors. Two positive anchor variants show what satisfies all four properties. Two negative anchors show the failure modes to avoid: the first is a paraphrastic near-copy (fails P1: same scenario, reworded), the second is construct drift (fails P2: a different skill dressed in a new scenario). Match the positives' level of departure from the original; never resemble either negative.`,
      );
      userParts.push(
        `POSITIVE ANCHORS (satisfy P1–P4):`,
        ...(anchors?.positive?.length
          ? anchors.positive.map((a, i) => `<positive_anchor n="${i + 1}">\n${a}\n</positive_anchor>`)
          : ["(no anchors cached — treat this as zero-shot)"]),
        ``,
        `NEGATIVE ANCHORS (do not produce anything like these):`,
        ...(anchors?.negative?.length
          ? anchors.negative.map(
              (a, i) =>
                `<negative_anchor n="${i + 1}" failure="${i === 0 ? "paraphrastic near-copy (P1)" : "construct drift (P2)"}">\n${a}\n</negative_anchor>`,
            )
          : ["(none)"]),
        ``,
        `ENABLED SURFACE DIMENSIONS TO VARY:`,
        formatDimensions(enabledDims, true),
        ``,
        `Suggested assignment for this version:`,
        formatAssignment(input.surfaceAssignment),
      );
      break;
    }

    case "structured-cot": {
      systemParts.push(
        ``,
        `STRATEGY: structured chain-of-thought. Fill the output fields in this order and let each one build on the last:`,
        `1. constructMap — an explicit construct-map reading: what competency the task measures and how each construct dimension shows up in a good answer. Ground this in the rubric and canonical solution.`,
        `2. surfacePlan — a surface-variation plan keyed to the enabled dimensions: the domain, stakeholder, scenario and jargon you will use, and what you hold constant for difficulty parity (reading level, step count, number of required findings, length).`,
        `3. draft — a first full draft of the student-facing task.`,
        `4. selfCheck — check the draft against P1, P2, P3 and P4 honestly, one boolean each, and note what needs fixing. This self-check is mandatory: a false on any property must be repaired in the final.`,
        `5. final — the final task prompt after applying the self-check.`,
        `6. adaptedSolution — the canonical solution rewritten for the final.`,
        `7. surfaceAssignment — the values used in the final.`,
      );
      userParts.push(
        `ENABLED SURFACE DIMENSIONS TO VARY:`,
        formatDimensions(enabledDims, true),
        ``,
        `Suggested assignment for this version:`,
        formatAssignment(input.surfaceAssignment),
      );
      break;
    }

    case "dimension-preserving": {
      systemParts.push(
        ``,
        `STRATEGY: dimension-preserving constrained generation. The surface-dimension assignment given below is mandatory: use exactly those values, do not substitute or blend them. Everything not named in the assignment is held constant. Explicit parity constraints:`,
        `- same reading level as the original task (match its sentence length and vocabulary difficulty; the set's Flesch reading-ease standard deviation must stay at or below ${thresholds.p4FleschSigma});`,
        `- same number of required findings or steps as the canonical solution (${countSteps(blueprint.canonicalSolution)} in the original);`,
        `- same number of rubric criteria referenced (${blueprint.rubric.length});`,
        `- same deliverable format and approximately the same word count as the original task (${wordCount(blueprint.taskPrompt)} words).`,
      );
      userParts.push(
        `MANDATORY SURFACE ASSIGNMENT FOR THIS VERSION:`,
        formatAssignment(input.surfaceAssignment),
        ``,
        `Locked (held constant): ${lockedDims.map((d) => d.label).join(", ") || "reading level, step count"}.`,
      );
      break;
    }
  }

  userParts.push(
    ``,
    `VERSIONS ALREADY GENERATED IN THIS SET (first 200 characters of each). This version must differ in scenario from all of these:`,
    summarisePriorVariants(input.priorVariantTexts),
    ``,
    `Now produce version ${input.index + 1} of ${input.n}.`,
  );

  return {
    system: systemParts.join("\n"),
    user: userParts.join("\n"),
    schema: strategy === "structured-cot" ? "structured-cot" : "variant",
  };
}

function wordCount(s: string): number {
  return s.trim() ? s.trim().split(/\s+/).length : 0;
}

/** Numbered or bulleted lines, the same proxy lib/metrics uses for stepCount. */
function countSteps(s: string): number {
  const n = s.split(/\r?\n/).filter((line) => /^\s*(\d+[.)]|[-*•])\s+/.test(line)).length;
  return n > 0 ? n : Math.max(1, s.split(/\n\s*\n/).filter((p) => p.trim()).length);
}
