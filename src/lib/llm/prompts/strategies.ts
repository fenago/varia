import { DEFAULT_ADVANCED, type GenerateVariantInput, type Quantity, type ThresholdSet } from "@shared/types";
import { formatQuantity } from "@lib/quantities";
import {
  formatAssignment,
  formatBlueprint,
  formatDimensions,
  joinPromptBlocks,
  propertyConstraints,
  summarisePriorVariants,
  type CacheablePrompt,
} from "./shared";

export type GenerationSchemaKind = "variant" | "structured-cot" | "structured-cot-nomap";

export interface GenerationPrompt extends CacheablePrompt {
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
 *
 * Prefix ordering (wave 6d): `system` and `stable` depend only on the run
 * (blueprint, strategy, thresholds, advanced options, set size) so they are
 * byte-identical for every version of one run and can be served from the
 * prompt cache. Everything that changes per version (which version this is,
 * the surface assignment, the prior variants) is in `volatile`.
 */
export function buildGenerationPrompt(input: GenerateVariantInput, thresholds: ThresholdSet): GenerationPrompt {
  const { blueprint, strategy } = input;
  const adv = { ...DEFAULT_ADVANCED, ...(input.advanced ?? {}) };
  const enabledDims = blueprint.surfaceDimensions.filter((d) => !d.locked && d.enabled);
  const lockedDims = blueprint.surfaceDimensions.filter((d) => d.locked);

  const systemParts: string[] = [
    `You generate student-specific versions of an existing assessment. Each version is a surface-different but construct-equivalent task: a different scenario for the same skill, graded by the same rubric, equally hard. You will be asked for one version at a time from a set of ${input.n}.`,
    ``,
    `THE FOUR INTEGRITY PROPERTIES (hard constraints on your output):`,
    propertyConstraints(thresholds),
    ``,
    `OUTPUT REQUIREMENTS (every strategy):`,
    `- text: the SCENARIO AND TASK STATEMENT ONLY, written to the student in the employer's or instructor's voice. State the organisation, the stakeholder, the situation and the data the student has, then what they must produce and how many findings or sections it needs, expressed inside the scenario text (for example "The risk officer wants four findings, each tied to evidence in the card"). Do not include the rubric, grading levels, points, or generic instructions; the app attaches them from the blueprint. Do not copy the assignment header, the "What you must produce" or "Constraints" sections, or any line of the original sheet verbatim. Do not address the instructor, do not explain the variation, do not include headings like "Variant", "Rubric" or "Assignment".`,
    `- adaptedSolution: the canonical solution rewritten into this variant's scenario. Keep the same findings, the same number of steps and the same structure; change only the surface details so that it is the correct expert answer to the new text.`,
    `- surfaceAssignment: the value you actually used for each enabled surface dimension.`,
    `- Locked dimensions are never varied: ${lockedDims.map((d) => d.label.toLowerCase()).join(", ") || "reading level, step count"} must match the original task.`,
  ];
  if ((blueprint.quantities ?? []).length) {
    systemParts.push(
      ``,
      `CONTROLLED FIGURES. The numbers in this assessment are variables. The app, not you, chooses each version's values and lists them under "FIGURES FOR THIS VERSION". Build the scenario and the model answer around exactly those figures: write every listed figure at least once in the text, in one of the forms shown, and use the same figures in the adapted solution. Do not round, rescale, convert or replace a listed figure, and do not add other headline numbers that would change the finding. Figures marked "keep" are the original's and stay as written; figures marked "derived" are already computed from the others, so state them as given rather than recomputing them.`,
    );
  }

  // Stable per run: the blueprint and the strategy's per-run material (anchors, enabled dimensions).
  const stableParts: string[] = [formatBlueprint(blueprint), ``];
  // Per version: the assignment, the prior variants, and which version this is.
  const volatileParts: string[] = [];

  switch (strategy) {
    case "zero-shot": {
      systemParts.push(
        ``,
        `STRATEGY: zero-shot. Work directly from the blueprint and the four properties above. No examples are provided.`,
      );
      stableParts.push(`ENABLED SURFACE DIMENSIONS TO VARY:`, formatDimensions(enabledDims, true));
      volatileParts.push(
        `SURFACE ASSIGNMENT FOR THIS VERSION (strong hint): use this domain and stakeholder unless doing so would change the skill being measured. Every version in the set has a distinct assignment; keeping to it is what makes the set diverse.`,
        formatAssignment(input.surfaceAssignment),
      );
      break;
    }

    case "few-shot": {
      const anchors = blueprint.fewShotAnchors;
      const withNeg = adv.negativeAnchors;
      systemParts.push(
        ``,
        withNeg
          ? `STRATEGY: few-shot with anchors. Two positive anchor variants show what satisfies all four properties. Two negative anchors show the failure modes to avoid: the first is a paraphrastic near-copy (fails P1: same scenario, reworded), the second is construct drift (fails P2: a different skill dressed in a new scenario). Match the positives' level of departure from the original; never resemble either negative.`
          : `STRATEGY: few-shot with positive anchors only (ablation θ−FS). Two positive anchor variants show what satisfies all four properties. Match their level of departure from the original.`,
      );
      stableParts.push(
        `POSITIVE ANCHORS (satisfy P1–P4):`,
        ...(anchors?.positive?.length
          ? anchors.positive.map((a, i) => `<positive_anchor n="${i + 1}">\n${a}\n</positive_anchor>`)
          : ["(no anchors cached — treat this as zero-shot)"]),
        ``,
      );
      if (withNeg) {
        stableParts.push(
          `NEGATIVE ANCHORS (do not produce anything like these):`,
          ...(anchors?.negative?.length
            ? anchors.negative.map(
                (a, i) =>
                  `<negative_anchor n="${i + 1}" failure="${i === 0 ? "paraphrastic near-copy (P1)" : "construct drift (P2)"}">\n${a}\n</negative_anchor>`,
              )
            : ["(none)"]),
          ``,
        );
      }
      stableParts.push(`ENABLED SURFACE DIMENSIONS TO VARY:`, formatDimensions(enabledDims, true));
      volatileParts.push(
        `SURFACE ASSIGNMENT FOR THIS VERSION (strong hint): use this domain and stakeholder unless doing so would change the skill being measured.`,
        formatAssignment(input.surfaceAssignment),
      );
      break;
    }

    case "structured-cot": {
      const withMap = adv.constructMap;
      const steps = [
        ...(withMap
          ? [`constructMap — an explicit construct-map reading: what competency the task measures and how each construct dimension shows up in a good answer. Ground this in the rubric and canonical solution.`]
          : []),
        `surfacePlan — a surface-variation plan keyed to the enabled dimensions: the domain, stakeholder, scenario and jargon you will use, and what you hold constant for difficulty parity (reading level, step count, number of required findings, length).`,
        `draft — a first full draft of the student-facing scenario and task statement.`,
        `selfCheck — check the draft against P1, P2, P3 and P4 honestly, one boolean each, and note what needs fixing. This self-check is mandatory: a false on any property must be repaired in the final.`,
        `final — the final scenario and task statement after applying the self-check (scenario and task only, no rubric or grading levels).`,
        `adaptedSolution — the canonical solution rewritten for the final.`,
        `surfaceAssignment — the values used in the final.`,
      ];
      systemParts.push(
        ``,
        withMap
          ? `STRATEGY: structured chain-of-thought. Fill the output fields in this order and let each one build on the last:`
          : `STRATEGY: structured chain-of-thought without the construct-map step (ablation θ−SC). Fill the output fields in this order and let each one build on the last:`,
        ...steps.map((t, i) => `${i + 1}. ${t}`),
      );
      stableParts.push(`ENABLED SURFACE DIMENSIONS TO VARY:`, formatDimensions(enabledDims, true));
      volatileParts.push(
        `SURFACE ASSIGNMENT FOR THIS VERSION (strong hint): use this domain and stakeholder unless doing so would change the skill being measured.`,
        formatAssignment(input.surfaceAssignment),
      );
      break;
    }

    case "dimension-preserving": {
      systemParts.push(
        ``,
        `STRATEGY: dimension-preserving constrained generation. The surface-dimension assignment given below is mandatory: use exactly those values, do not substitute or blend them. Everything not named in the assignment is held constant. Explicit parity constraints:`,
        `- same reading level as the original task: keep the Flesch reading-ease within ±${adv.readabilityBand} points of the original (match its sentence length and vocabulary difficulty; the set's Flesch reading-ease standard deviation must stay at or below ${thresholds.p4FleschSigma});`,
        `- same number of required findings or steps as the canonical solution (${countSteps(blueprint.canonicalSolution)} in the original);`,
        `- same number of rubric criteria referenced (${blueprint.rubric.length});`,
        `- same deliverable format and approximately the same word count as the original task (${wordCount(blueprint.taskPrompt)} words).`,
      );
      stableParts.push(`Locked (held constant): ${lockedDims.map((d) => d.label).join(", ") || "reading level, step count"}.`);
      volatileParts.push(`MANDATORY SURFACE ASSIGNMENT FOR THIS VERSION:`, formatAssignment(input.surfaceAssignment));
      break;
    }
  }

  const figures = formatFigures(blueprint.quantities ?? [], input.quantityValues);
  if (figures) {
    volatileParts.push(``, `FIGURES FOR THIS VERSION (mandatory; use exactly these, each at least once, in the text and in the adapted solution):`, figures);
  }
  if (input.retryNote) volatileParts.push(``, `NOTE ON YOUR PREVIOUS ATTEMPT: ${input.retryNote}`);

  volatileParts.push(
    ``,
    `VERSIONS ALREADY GENERATED IN THIS SET (first 200 characters of each). This version must differ in scenario from all of these:`,
    summarisePriorVariants(input.priorVariantTexts),
    ``,
    `Now produce version ${input.index + 1} of ${input.n}.`,
  );

  const stable = stableParts.join("\n").replace(/\n+$/, "");
  const volatile = volatileParts.join("\n");
  return {
    system: systemParts.join("\n"),
    stable,
    volatile,
    user: joinPromptBlocks(stable, volatile),
    schema: strategy === "structured-cot" ? (adv.constructMap ? "structured-cot" : "structured-cot-nomap") : "variant",
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

/**
 * One line per controlled figure: label, key, the value in its preferred form,
 * the other accepted renderings, the policy and any constraint. Empty when the
 * run passes no values (no quantities, or a replayed recording).
 */
export function formatFigures(quantities: Quantity[], values?: Record<string, number>): string {
  if (!values) return "";
  const lines: string[] = [];
  for (const q of quantities) {
    const v = values[q.key];
    if (v === undefined || !Number.isFinite(v)) continue;
    const forms = formatQuantity(q, v);
    const shown = forms[0] ?? String(v);
    const alt = forms.slice(1, 4);
    const tags = [q.policy === "keep" ? "keep: as in the original" : q.policy === "derived" ? `derived${q.formula ? ` = ${q.formula}` : ""}` : "chosen for this version"];
    if (q.constraint) tags.push(q.constraint);
    lines.push(`- ${q.label} (${q.key}): ${shown}${alt.length ? ` (also acceptable: ${alt.join(", ")})` : ""} — ${tags.join("; ")}`);
  }
  return lines.join("\n");
}
