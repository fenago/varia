/**
 * No-key provider: no network. Replays RECORDED runs (real outputs of the real
 * pipeline, see src/lib/store/fixtures) with short delays so the pages show
 * real progress. Nothing here invents a metric: replayed texts are re-scored
 * by the orchestrator with the same metric code as a live run, and judge
 * samples are the recorded ones for that text.
 */

import type {
  Blueprint,
  BlueprintDraft,
  Criterion,
  GenerateVariantInput,
  GenerateVariantOutput,
  JudgeInput,
  JudgeSample,
  LevelScore,
  LlmProvider,
  PreScoreInput,
  PreScoreOutput,
  Variant,
} from "@shared/types";
import { fixtureForBlueprint, getFixture, listFixtures, type FixtureWithSamples } from "./fixtures";

const GENERATE_MS = 350;
const JUDGE_MS = 120;

function wait(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new Error("Request cancelled."));
    const t = setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => {
      clearTimeout(t);
      reject(new Error("Request cancelled."));
    });
  });
}

/** Demo mode makes no API calls, so every output reports zero usage. */
const ZERO_USAGE = () => ({ inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, costUsd: 0, calls: 0 });

function fixtureFor(bp: { id: string; name: string; sampleId?: string | null }): FixtureWithSamples | null {
  return (bp.sampleId ? getFixture(bp.sampleId) : null) ?? fixtureForBlueprint(bp.id, bp.name);
}

function firstFixture(): FixtureWithSamples | null {
  const info = listFixtures()[0];
  return info ? getFixture(info.sampleId) : null;
}

/** Pick the recording that matches the raw text (by organisation name), else the first. */
function fixtureForText(rawText: string): FixtureWithSamples | null {
  const lower = rawText.toLowerCase();
  for (const info of listFixtures()) {
    if (info.organisation && lower.includes(info.organisation.toLowerCase())) return getFixture(info.sampleId);
  }
  return firstFixture();
}

function usableVariants(f: FixtureWithSamples): Variant[] {
  return f.run.variants.filter((v) => v.text && !v.error);
}

export function createDemoProvider(): LlmProvider {
  return {
    mode: "demo",

    async verifyKey() {
      throw new Error("No key");
    },

    async extractBlueprint(input): Promise<BlueprintDraft> {
      await wait(900, input.signal);
      const f = fixtureForText(input.rawText);
      if (!f) throw new Error("No recorded sample runs are available to replay. Add a key on Settings to extract for real.");
      const { id: _id, courseId: _c, createdAt: _a, updatedAt: _u, ...draft } = f.blueprint;
      return {
        ...draft,
        source: {
          ...draft.source,
          files: input.files.length ? input.files.map((x) => ({ ...x, text: undefined })) : draft.source.files,
          extractedAt: new Date().toISOString(),
          readSeconds: Math.max(3, Math.round(input.rawText.length / 4000)),
        },
        fewShotAnchors: null,
        lastUsed: null,
      };
    },

    async draftAnchors(criterion: Criterion): Promise<[string, string, string, string]> {
      await wait(500);
      const n = criterion.name.toLowerCase();
      return [
        `No evidence of ${n}, or claims made without reference to the materials.`,
        `${criterion.name} attempted, but reasons are vague or not tied to the materials.`,
        `${criterion.name} is present and tied to specific evidence in the materials.`,
        `${criterion.name} is present, evidence-tied, and its consequence for the stakeholder's decision is stated.`,
      ];
    },

    async draftCanonicalSolution(bp): Promise<string> {
      await wait(700);
      const f = fixtureForBlueprint(null, "construct" in bp ? undefined : undefined) ?? firstFixture();
      return f?.blueprint.canonicalSolution ?? "";
    },

    async generateFewShotAnchors(blueprint: Blueprint) {
      await wait(600);
      const f = fixtureForBlueprint(blueprint.id, blueprint.name) ?? firstFixture();
      const vs = f ? usableVariants(f) : [];
      return {
        positive: vs.slice(0, 2).map((v) => v.text),
        negative: [
          // paraphrastic near-copy of the original prompt
          blueprint.taskPrompt.slice(0, 600),
          // construct drift: asks for something the rubric does not grade
          `${blueprint.name}: write a short reflective essay on why this topic matters to you and conclude with your personal opinion.`,
        ],
      };
    },

    async generateVariant(input: GenerateVariantInput): Promise<GenerateVariantOutput> {
      await wait(GENERATE_MS, input.signal);
      const f = fixtureFor(input.blueprint) ?? firstFixture();
      if (!f) throw new Error("No recorded sample runs are available to replay. Add a key on Settings to generate for real.");
      const vs = usableVariants(f);
      if (!vs.length) throw new Error("The recorded run has no usable versions.");
      // Replay by index; a regeneration (index beyond the set, or a text already used) takes
      // the next unused recorded version if there is one, else repeats with an honest note.
      const used = new Set(input.priorVariantTexts);
      let v = vs[input.index % vs.length];
      let note: string | null = null;
      if (input.index >= vs.length || used.has(v.text)) {
        const unused = vs.find((x) => !used.has(x.text));
        if (unused) v = unused;
        else note = "No unused recorded version remains; this repeats a recorded one. Add a key to regenerate for real.";
      }
      return {
        usage: ZERO_USAGE(),
        text: v.text,
        adaptedSolution: v.adaptedSolution,
        surfaceAssignment: v.surfaceAssignment,
        scaffold: { replayedFrom: { sampleId: f.sampleId, variantId: v.id, recordedAt: f.recordedAt, generator: f.models.generator }, note },
      };
    },

    async judgeVariant(input: JudgeInput): Promise<JudgeSample[]> {
      await wait(JUDGE_MS, input.signal);
      const f = fixtureFor(input.blueprint) ?? firstFixture();
      const v = f?.run.variants.find((x) => x.text === input.variantText);
      const samples = v?.metrics.judgeSamples ?? [];
      if (samples.length) return samples.slice(0, Math.max(1, input.samples));
      // Unknown text (e.g. a user-edited blueprint): score every dimension at the recorded
      // set's median so the replay is neither flattering nor invented per-dimension.
      const dims = input.blueprint.constructDimensions ?? [];
      const all = f ? usableVariants(f).flatMap((x) => x.metrics.judgeSamples) : [];
      const med = all.length ? [...all.flatMap((s) => Object.values(s.dimensionScores))].sort((a, b) => a - b)[Math.floor(all.length / 2)] ?? 4 : 4;
      return Array.from({ length: Math.max(1, input.samples) }, () => ({
        dimensionScores: Object.fromEntries(dims.map((d) => [d, med])),
        rationale: "Replay: no recorded judgement exists for this text, so it carries the recorded set's median score. Add a key to judge for real.",
      }));
    },

    async preScoreSubmission(input: PreScoreInput): Promise<PreScoreOutput> {
      await wait(400, input.signal);
      // If this exact submission was recorded with a real pre-score, return it.
      for (const info of listFixtures()) {
        const f = getFixture(info.sampleId);
        const hit = f?.sampleSubmissions?.find((s) => s.text === input.submissionText);
        if (hit) return hit.preScore;
      }
      // Otherwise a transparent heuristic, labelled as such: level by how many of the
      // criterion's anchor keywords appear in the submission. Not a judgement of quality.
      const text = input.submissionText.toLowerCase();
      const scores: Record<string, LevelScore> = {};
      const rationale: Record<string, string> = {};
      for (const c of input.blueprint.rubric) {
        const kws = new Set(
          [c.name, ...(c.anchors ?? [])]
            .join(" ")
            .toLowerCase()
            .split(/[^a-z]+/)
            .filter((w) => w.length > 5),
        );
        const hits = [...kws].filter((w) => text.includes(w)).length;
        const ratio = kws.size ? hits / kws.size : 0;
        const lv = (ratio > 0.45 ? 3 : ratio > 0.3 ? 2 : ratio > 0.12 ? 1 : 0) as LevelScore;
        scores[c.id] = lv;
        rationale[c.id] = `Keyword-overlap heuristic (no key): ${hits} of ${kws.size} rubric terms for "${c.name}" appear in the submission.`;
      }
      return {
        scores,
        rationale,
        summary: "No-key suggestion from a keyword-overlap heuristic, not a reading of the work. Add a key on Settings for a real pre-score.",
      };
    },
  };
}
