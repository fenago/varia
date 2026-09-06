import type { ExtractInput } from "@shared/types";

/**
 * Extraction: raw instructor materials → BlueprintDraft (paper §3.1: the
 * blueprint is the triple (construct C, analytic rubric R, canonical solution s*)
 * plus the surface-dimension scaffold of §3.3).
 */
export const EXTRACT_SYSTEM = `You read an instructor's existing assessment materials (a task prompt, a rubric, sometimes a model answer) and turn them into an assessment blueprint: the competency construct, an analytic rubric, the canonical solution if one is present, and a surface-dimension scaffold the generator can vary without changing what is measured.

Ground every field in the supplied text. Quote the task prompt and rubric wording verbatim where you can. Do not invent rubric criteria, points or level descriptions that are not in the text; when something is genuinely absent, say so through the confidence fields rather than filling it in.

Field rules:
- construct: one sentence in the form "Given X, produce Y that …". It names the competency, not the topic.
- constructDimensions: two to five short phrases, each a distinct thing a good answer demonstrates (e.g. "Identifies fairness gaps from subgroup metrics"). These are what a judge will score, so make them observable.
- name: a short assessment name (2–5 words). code: a course or assignment code if the text carries one, else null.
- rubric: one entry per criterion in the text. points as written. weight = points / total points, so weights sum to 1. anchors: exactly four level descriptions for scores 0, 1, 2, 3 in that order when the text gives level descriptions (map 3-, 5- or 6-level scales onto four levels, lowest first). If no level descriptions exist, anchors = null and anchorsConfidence = "missing". Use "high" when all four came from the text and "draft" when you had to infer some.
- canonicalSolution: the model answer verbatim if the text contains one (canonicalSolutionFound = true); otherwise null and false. Never draft one here.
- taskPrompt: the student-facing task exactly as written, including any data, scenario or deliverable description.
- surfaceDimensions: six entries, in this order.
    domain, stakeholder, scenario, jargon — locked = false. For each, list 4–12 candidate values. Include the value used by the original task first, then extrapolate plausible alternatives that keep the same competency (e.g. domain: healthcare, lending, hiring, logistics …; stakeholder: the role who receives the deliverable; scenario: the concrete situation; jargon: the professional register or vocabulary set). note = "<k> found" when the values come from the text, "<k> drafted" when you extrapolated them, where k is the count.
    readingLevel, stepCount — locked = true, values = [], note = "held constant".
- extractionConfidence: "high" when task, rubric with anchors and a solution were all present; "medium" when the task and rubric were present; "low" otherwise.
- quantities: every number in the TASK PROMPT that a student-specific version could carry differently (metrics, counts, amounts, dates, thresholds, scores). Not rubric points, not section numbers, not page or step numbers. One entry per number, in the order they appear. key: short snake_case, unique, usable in a formula. label: what the number is, in plain words. value: the number exactly as written (0.91 stays 0.91; 18% is 18 with unit "%"; $12,000 is 12000 with unit "$"). kind: rate for proportions and percentages, count for whole-number tallies, money, measure, date for years and dates, threshold for policy limits or cut-offs the task compares against, score for points or grades, other. suggestedPolicy: "keep" for dates, thresholds, policy limits and anything the intended finding depends on staying as written; "derived" when the number is computed from other keys (give formula over those keys, e.g. north_rate - south_rate); otherwise "vary". context: the phrase the number sits in. constraint: only when the intended finding needs a relation to hold (e.g. "must stay below the 0.80 fairness threshold so the gap remains a finding"); else null. You are not choosing values: the app chooses each version's numbers within instructor-set ranges. Return an empty array when the task has no such numbers.`;

export function buildExtractPrompt(input: ExtractInput): { system: string; user: string } {
  const fileList =
    input.files.length > 0
      ? input.files.map((f) => `- ${f.name} (${f.kind}, ${f.recognisedAs}, ${f.status})`).join("\n")
      : "- (pasted text)";

  const docs = input.documents ?? [];
  const docNote = docs.length
    ? [
        ``,
        `${docs.length} PDF${docs.length === 1 ? " is" : "s are"} attached as document${docs.length === 1 ? "" : "s"}: ${docs.map((d) => `${d.name}${d.scanned ? " (a scan: read the pages; any OCR text below is only a hint and may contain errors)" : ""}`).join("; ")}. Read the pages themselves for layout, tables and rubric grids; the text below is the extracted text of the same files plus any non-PDF files.`,
      ]
    : [];
  const user = [
    `Course: ${input.course.code} · ${input.course.term} · ${input.course.title}`,
    `Files supplied:`,
    fileList,
    ...docNote,
    ``,
    `Extract the assessment blueprint from the material below.`,
    ``,
    `<materials>`,
    input.rawText,
    `</materials>`,
  ].join("\n");

  return { system: EXTRACT_SYSTEM, user };
}
