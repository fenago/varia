/**
 * Records AI-written sample submissions for a recorded run, honestly labelled.
 *
 * For each of `n` recorded versions the JUDGE model writes a submission as a
 * student at a stated quality tier (strong / adequate / weak), then the same
 * provider pre-scores it against the rubric. The fixture stores the text, the
 * tier, the pre-score and the model, and the app shows all of them as
 * "AI-written sample at the {tier} tier · grade is the model's suggestion".
 * Nothing here is ever presented as a real student's work.
 */
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod/v4";
import type { LlmProvider, ModelId, Settings } from "@shared/types";
import { modelSpec } from "@shared/models";
import { makeClient } from "@lib/llm/client";
import { shapeRequest } from "@lib/llm/shape";
import { LlmError, toLlmError, withRetry } from "@lib/llm/errors";
import type { SampleFixture } from "./recordSample";

export type SampleTier = "strong" | "adequate" | "weak";
export const TIERS: SampleTier[] = ["strong", "adequate", "weak"];

export interface SampleSubmission {
  variantId: string;
  tier: SampleTier;
  text: string;
  preScore: { scores: Record<string, 0 | 1 | 2 | 3>; rationale: Record<string, string>; summary: string };
  model: ModelId;
  recordedAt: string;
}

const SubmissionSchema = z.object({
  text: z.string().min(200),
});

const TIER_BRIEF: Record<SampleTier, string> = {
  strong:
    "a strong student: every rubric criterion is addressed with a specific, evidence-tied finding; claims cite the figures given in the task; recommendations are prioritised with a stated rule; the structure matches the deliverable exactly.",
  adequate:
    "an adequate student: the structure is right and most criteria are addressed, but one finding is vague or unsupported, one figure is quoted loosely, and the prioritisation is asserted rather than argued.",
  weak:
    "a weak student: the response is generic, misses one criterion entirely, invents or mis-states at least one figure, and offers recommendations without evidence or ordering. It should still be a plausible, well-formed submission, not nonsense.",
};

export interface RecordSubmissionsOptions {
  fixture: SampleFixture;
  provider: LlmProvider;
  settings: Pick<Settings, "apiKey" | "workspaceId" | "judgeModel">;
  n?: number;
  onProgress?: (message: string) => void;
  signal?: AbortSignal;
  now?: () => string;
}

/** Ask the judge model to write one submission at a tier. Live only. */
async function writeSubmission(opts: RecordSubmissionsOptions, variantText: string, tier: SampleTier): Promise<string> {
  const model = opts.settings.judgeModel;
  const spec = modelSpec(model);
  if (!spec) throw new LlmError("other", `Unknown model ${model}`);
  if (!opts.settings.apiKey) throw new LlmError("auth", "No key");
  const client = makeClient(opts.settings.apiKey, opts.settings.workspaceId ?? null);
  const bp = opts.fixture.blueprint;
  const rubric = bp.rubric.map((c) => `- ${c.name} (${c.points} points)`).join("\n");
  const system = `You write realistic student submissions for a college course, for use as clearly labelled AI-written samples. Write in the first person as the student. Do not mention that you are an AI or that this is a sample. Output only the submission text.`;
  const user = `Course competency: ${bp.construct}

Rubric criteria the instructor will grade on:
${rubric}

The task the student received:
"""
${variantText}
"""

Write the submission as ${TIER_BRIEF[tier]} Length 350–600 words, in the deliverable's own structure (headed findings, then recommendations). Return it as the "text" field.`;
  const base = shapeRequest(spec, "short", {
    model,
    max_tokens: 6000,
    system,
    messages: [{ role: "user", content: user }],
  }) as Record<string, unknown>;
  const res = await withRetry(
    async () =>
      client.beta.messages.parse({
        ...(base as object),
        output_config: { ...((base.output_config as object) ?? {}), format: betaZodOutputFormat(SubmissionSchema) },
        ...(spec.needsRefusalFallback ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const } : {}),
      } as never),
    {},
    opts.signal,
  ).catch((e) => {
    throw toLlmError(e);
  });
  const msg = res as { stop_reason?: string; parsed_output?: { text: string } | null };
  if (msg.stop_reason === "refusal") throw new LlmError("refusal", "Declined");
  if (!msg.parsed_output) throw new LlmError("parse", "No parsed output for the sample submission");
  return msg.parsed_output.text.trim();
}

export async function recordSubmissions(opts: RecordSubmissionsOptions): Promise<SampleSubmission[]> {
  const say = opts.onProgress ?? (() => {});
  const now = opts.now ?? (() => new Date().toISOString());
  if (opts.provider.mode !== "live" || !opts.provider.preScoreSubmission) throw new Error("Sample submissions need a live provider (a real key).");
  const variants = opts.fixture.run.variants.filter((v) => v.text && !v.error);
  const n = Math.min(opts.n ?? 3, variants.length, TIERS.length);
  const out: SampleSubmission[] = [];
  for (let i = 0; i < n; i++) {
    const v = variants[i];
    const tier = TIERS[i];
    say(`Writing a ${tier}-tier sample submission for ${v.id} with ${opts.settings.judgeModel}`);
    const text = await writeSubmission(opts, v.text, tier);
    say(`Pre-scoring the ${tier}-tier sample for ${v.id}`);
    const pre = await opts.provider.preScoreSubmission({
      blueprint: opts.fixture.blueprint,
      variant: { id: v.id, text: v.text, adaptedSolution: v.adaptedSolution },
      submissionText: text,
      judgeModel: opts.settings.judgeModel,
      signal: opts.signal,
    });
    out.push({ variantId: v.id, tier, text, preScore: { scores: pre.scores, rationale: pre.rationale, summary: pre.summary }, model: opts.settings.judgeModel, recordedAt: now() });
  }
  return out;
}
