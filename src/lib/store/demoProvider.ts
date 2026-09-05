/**
 * Demo-mode LLM provider: no key, no network. Replays the seeded variant set
 * with short delays so the Generate page shows real progress, and returns
 * easier-reading rewrites when an outlier is regenerated.
 */

import type {
  Blueprint,
  BlueprintDraft,
  Criterion,
  GenerateVariantInput,
  GenerateVariantOutput,
  JudgeInput,
  JudgeSample,
  LlmProvider,
} from "@shared/types";
import { variantId } from "./ids";
import { buildDemoBlueprintB1, buildDemoDraft, demoJudgeSamples, demoMetricsForScenario } from "./seed";
import {
  SEED_ALTERNATES,
  SEED_SCENARIOS,
  seedAdaptedSolution,
  seedSurfaceAssignment,
  seedVariantText,
} from "./seedVariants";

const GENERATE_MS = 350;
const JUDGE_MS = 150;

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

/** Metrics for an easier-reading regenerated version (reading ease ≈ 53–54, the set mean). */
function regeneratedMetrics(index: number) {
  const base = demoMetricsForScenario(index);
  const ease = 53.2 + ((index * 7) % 5) * 0.3;
  return { ...base, fleschEase: ease, solutionFleschEase: ease - 0.8, judgeSamples: demoJudgeSamples(0), equivalence: null };
}

/** Demo mode makes no API calls, so every output reports zero usage. */
const ZERO_USAGE = () => ({ inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, costUsd: 0, calls: 0 });

export function createDemoProvider(): LlmProvider {
  const seedTexts = SEED_SCENARIOS.map(seedVariantText);

  return {
    mode: "demo",

    async verifyKey() {
      throw new Error("No key");
    },

    async extractBlueprint(input): Promise<BlueprintDraft> {
      await wait(1200, input.signal);
      const draft = buildDemoDraft();
      if (input.files.length) {
        draft.source = {
          ...draft.source,
          files: input.files.map((f) => ({ ...f, text: undefined })),
          extractedAt: new Date().toISOString(),
          readSeconds: Math.max(3, Math.round(input.rawText.length / 4000)),
        };
      }
      return draft;
    },

    async draftAnchors(criterion: Criterion): Promise<[string, string, string, string]> {
      await wait(600);
      const n = criterion.name.toLowerCase();
      return [
        `No evidence of ${n}, or claims made without reference to the materials.`,
        `${criterion.name} attempted, but reasons are vague or not tied to the materials.`,
        `${criterion.name} is present and tied to specific evidence in the materials.`,
        `${criterion.name} is present, evidence-tied, and its consequence for the stakeholder's decision is stated.`,
      ];
    },

    async draftCanonicalSolution(): Promise<string> {
      await wait(900);
      return buildDemoBlueprintB1().canonicalSolution;
    },

    async generateFewShotAnchors(_blueprint: Blueprint) {
      await wait(700);
      return {
        positive: [seedTexts[3], seedTexts[6]],
        negative: [
          // paraphrastic near-copy of the original prompt
          "You are auditing a deployed classifier for a stakeholder. Using the partial model card provided, produce a structured audit identifying fairness, robustness and documentation gaps. Justify each finding against the card and prioritise your recommendations.",
          // construct drift: asks for something the rubric does not grade
          "A regional bank deployed a loan-default classifier in March. Write a short essay on the history of credit scoring and explain why machine learning is now used in lending. Conclude with your personal opinion about whether banks should use AI.",
        ],
      };
    },

    async generateVariant(input: GenerateVariantInput): Promise<GenerateVariantOutput> {
      await wait(GENERATE_MS, input.signal);
      const idx = ((input.index % SEED_SCENARIOS.length) + SEED_SCENARIOS.length) % SEED_SCENARIOS.length;
      const scenario = SEED_SCENARIOS[idx];
      const seedText = seedTexts[idx];
      const isRegeneration = input.index >= SEED_SCENARIOS.length || input.priorVariantTexts.includes(seedText);
      if (isRegeneration) {
        const alt = SEED_ALTERNATES[variantId(idx)];
        const m = regeneratedMetrics(idx);
        if (alt) {
          return {
            usage: ZERO_USAGE(),
            text: alt.text,
            adaptedSolution: alt.adaptedSolution,
            surfaceAssignment: { ...seedSurfaceAssignment(scenario), jargon: "plain" },
            scaffold: { demo: true, regenerated: true, demoMetrics: m },
          };
        }
        return {
          usage: ZERO_USAGE(),
          text: seedText.replace(/^/, "Revised version. ").replace(/technical|methodological/g, "plain"),
          adaptedSolution: seedAdaptedSolution(scenario),
          surfaceAssignment: { ...seedSurfaceAssignment(scenario), jargon: "plain" },
          scaffold: { demo: true, regenerated: true, demoMetrics: m },
        };
      }
      const m = demoMetricsForScenario(idx);
      return {
        usage: ZERO_USAGE(),
        text: seedText,
        adaptedSolution: seedAdaptedSolution(scenario),
        surfaceAssignment: seedSurfaceAssignment(scenario),
        scaffold:
          input.strategy === "structured-cot"
            ? {
                demo: true,
                constructMap: "Fairness gap identification; robustness reasoning; documentation critique; evidence-grounded prioritisation.",
                surfacePlan: `Domain ${scenario.domain}; stakeholder ${scenario.role}; organisation ${scenario.org}; register ${scenario.jargon}.`,
                selfCheck: { p1: true, p2: true, p3: true, p4: true, notes: "Reading level held to the original task." },
                demoMetrics: { ...m, judgeSamples: [], equivalence: null },
              }
            : { demo: true, demoMetrics: { ...m, judgeSamples: [], equivalence: null } },
      };
    },

    async judgeVariant(input: JudgeInput): Promise<JudgeSample[]> {
      await wait(JUDGE_MS, input.signal);
      const idx = seedTexts.indexOf(input.variantText);
      const dims = input.blueprint.constructDimensions?.length ? input.blueprint.constructDimensions : undefined;
      if (idx >= 0) return demoJudgeSamples(idx, dims).slice(0, Math.max(1, input.samples));
      // regenerated or unknown text: strong, uniform equivalence
      return demoJudgeSamples(0, dims).slice(0, Math.max(1, input.samples));
    },
  };
}
