/**
 * Zod schemas for every structured-output call.
 *
 * Two wire-format rules, both forced by the SDK's `zodOutputFormat` transform:
 *  - Every object is sent with `additionalProperties: false`, so a `z.record`
 *    would arrive as an object the model cannot put keys in. Anything the app
 *    types as `Record<string, …>` is carried as an array of `{ key, value }`
 *    pairs here and converted in live.ts.
 *  - Numeric / length constraints are stripped from the wire schema and
 *    validated client-side after the response, so they are kept loose and the
 *    prompts state the exact counts in words.
 *
 * The SDK's helper is typed against `zod/v4`, which zod 3.25 ships as a
 * subpath export; import from there, not from "zod".
 */
import { z } from "zod/v4";

export const KeyValueSchema = z.object({
  key: z.string().describe("Surface dimension key, e.g. 'domain'"),
  value: z.string().describe("The value assigned to that dimension in this variant"),
});
export type KeyValueList = z.infer<typeof KeyValueSchema>[];

export const AnchorsConfidenceSchema = z.enum(["high", "draft", "missing"]);

export const CriterionDraftSchema = z.object({
  name: z.string().describe("Criterion name as the instructor wrote it"),
  points: z.number().describe("Maximum points for this criterion"),
  weight: z.number().describe("Share of the total, 0..1; all weights sum to 1"),
  anchors: z
    .array(z.string())
    .nullable()
    .describe(
      "Exactly four level descriptions for scores 0, 1, 2, 3 in that order, or null when the source text has none",
    ),
  anchorsConfidence: AnchorsConfidenceSchema.describe(
    "'high' when the four descriptions were in the source text, 'draft' when you had to infer them, 'missing' when anchors is null",
  ),
});

export const SurfaceDimensionDraftSchema = z.object({
  key: z.string().describe("domain | stakeholder | scenario | jargon | readingLevel | stepCount"),
  label: z.string().describe("Human label, e.g. 'Domain'"),
  values: z.array(z.string()).describe("Candidate values (4–12) for unlocked dimensions; empty for locked ones"),
  locked: z.boolean().describe("true for readingLevel and stepCount, which are held constant"),
  note: z.string().describe("'4 found', '12 drafted' or 'held constant'"),
});

/**
 * A number the extractor found in the task (wave 11: controlled quantities).
 * The app, not the model, chooses each version's values; here the model only
 * names the numbers, says what each one is, and suggests whether it may vary.
 */
export const QuantityDraftSchema = z.object({
  key: z.string().describe("Short snake_case identifier usable in formulas, e.g. accuracy, north_default_rate"),
  label: z.string().describe("Plain-words label, e.g. Overall accuracy on the holdout"),
  value: z.number().describe("The number as it appears in the task"),
  unit: z.string().nullable().describe("%, $, days, records … or null"),
  kind: z.enum(["rate", "count", "money", "measure", "date", "threshold", "score", "other"]),
  suggestedPolicy: z.enum(["keep", "vary", "derived"]).describe("keep = must stay as written; vary = a version may have its own value; derived = computed from other keys by formula"),
  formula: z.string().nullable().describe("For derived only: arithmetic over other keys, e.g. north_rate - south_rate; else null"),
  context: z.string().nullable().describe("The phrase in the task where the number appears"),
  constraint: z.string().nullable().describe("What the intended finding needs from this number, e.g. must stay below the 0.80 fairness threshold; else null"),
});
export type QuantityDraftWire = z.infer<typeof QuantityDraftSchema>;

export const BlueprintDraftSchema = z.object({
  construct: z
    .string()
    .describe("One sentence, 'Given X, produce Y that …', naming the competency every variant must still measure"),
  constructDimensions: z
    .array(z.string())
    .describe("Two to five short construct-map dimensions the judge will score, e.g. 'Identifies fairness gaps'"),
  name: z.string().describe("Short assessment name, e.g. 'Model card audit'"),
  code: z.string().nullable().describe("Course or assignment code if the text has one, else null"),
  rubric: z.array(CriterionDraftSchema),
  canonicalSolution: z
    .string()
    .nullable()
    .describe("The instructor's model answer verbatim if present in the text, else null"),
  canonicalSolutionFound: z.boolean(),
  taskPrompt: z.string().describe("The student-facing task prompt, verbatim where possible"),
  surfaceDimensions: z.array(SurfaceDimensionDraftSchema),
  extractionConfidence: z.enum(["high", "medium", "low"]),
  quantities: z.array(QuantityDraftSchema).describe("Every number in the task prompt that a version could carry differently; empty when the task has none"),
});
export type BlueprintDraftWire = z.infer<typeof BlueprintDraftSchema>;

export const AnchorsSchema = z.object({
  anchors: z
    .array(z.string())
    .describe("Exactly four level descriptions for scores 0, 1, 2, 3 in that order"),
});

export const CanonicalSolutionSchema = z.object({
  solution: z.string().describe("The complete canonical solution in prose and numbered steps"),
});

export const VariantSchema = z.object({
  text: z.string().describe("The complete student-facing task prompt for this variant"),
  adaptedSolution: z
    .string()
    .describe("The canonical solution rewritten into this variant's scenario, same findings and structure"),
  surfaceAssignment: z
    .array(KeyValueSchema)
    .describe("One entry per enabled surface dimension with the value actually used"),
});
export type VariantWire = z.infer<typeof VariantSchema>;

export const SelfCheckSchema = z.object({
  p1: z.boolean().describe("Surface diversity: differs in scenario, domain and wording from the original and prior variants"),
  p2: z.boolean().describe("Construct equivalence: still measures every construct dimension"),
  p3: z.boolean().describe("Rubric stability: every rubric criterion still applies unchanged"),
  p4: z.boolean().describe("Difficulty parity: same reading level, step count and number of required findings"),
  notes: z.string().describe("What was fixed between draft and final, or 'none'"),
});

export const StructuredCotSchema = z.object({
  constructMap: z
    .string()
    .describe("Explicit reading of the construct: what competency the task measures and how each construct dimension shows up in a good answer"),
  surfacePlan: z
    .string()
    .describe("Surface-variation plan keyed to the enabled dimensions, and what is held constant for difficulty parity"),
  draft: z.string().describe("First full draft of the variant task prompt"),
  selfCheck: SelfCheckSchema,
  final: z.string().describe("The final student-facing task prompt after the self-check"),
  adaptedSolution: z.string().describe("The canonical solution rewritten into the final variant's scenario"),
  surfaceAssignment: z.array(KeyValueSchema),
});
export type StructuredCotWire = z.infer<typeof StructuredCotSchema>;

/** θ−SC ablation (wave 6c): structured CoT without the explicit construct-map step. */
export const StructuredCotNoMapSchema = StructuredCotSchema.omit({ constructMap: true });
export type StructuredCotNoMapWire = z.infer<typeof StructuredCotNoMapSchema>;

export const DimensionScoreSchema = z.object({
  dimension: z.string().describe("The construct dimension text, copied exactly"),
  score: z.number().int().describe("1 (does not measure it) to 5 (measures it exactly as the original does)"),
});

export const JudgeSchema = z.object({
  dimensionScores: z.array(DimensionScoreSchema).describe("One entry per construct dimension, in the order given"),
  rationale: z.string().describe("Two sentences"),
  solvability: z
    .number()
    .nullable()
    .describe("Only when the candidate lists figures for this version: 1–5, whether the task is still well-posed and solvable with exactly those figures; else null"),
});
export type JudgeWire = z.infer<typeof JudgeSchema>;

export const FewShotAnchorsSchema = z.object({
  positive: z.array(z.string()).describe("Exactly two complete variant task prompts that satisfy all four properties"),
  negative: z
    .array(z.string())
    .describe("Exactly two complete variant task prompts: first a paraphrastic near-copy, second a construct-drifted one"),
});
export type FewShotAnchorsWire = z.infer<typeof FewShotAnchorsSchema>;

/** Convert a wire key/value list to the app's Record shape. Later keys win. */
export function pairsToRecord(pairs: KeyValueList): Record<string, string> {
  const out: Record<string, string> = {};
  for (const p of pairs) {
    const k = p.key.trim();
    if (k) out[k] = p.value.trim();
  }
  return out;
}
