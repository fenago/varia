import type Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import pLimit from "p-limit";
import type {
  Blueprint,
  BlueprintDraft,
  Criterion,
  ExtractInput,
  GenerateVariantInput,
  GenerateVariantOutput,
  JudgeInput,
  JudgeSample,
  LlmProvider,
  ModelId,
  Settings,
  SourceFile,
  SurfaceDimension,
  ThresholdSet,
} from "@shared/types";
import { DEFAULT_THRESHOLDS } from "@shared/thresholds";
import { makeClient } from "./client";
import { LlmError, toLlmError, withRetry } from "./errors";
import {
  AnchorsSchema,
  BlueprintDraftSchema,
  CanonicalSolutionSchema,
  FewShotAnchorsSchema,
  JudgeSchema,
  StructuredCotSchema,
  VariantSchema,
  pairsToRecord,
  type BlueprintDraftWire,
} from "./schemas";
import { buildDraftAnchorsPrompt, buildCanonicalSolutionPrompt, buildFewShotAnchorsPrompt } from "./prompts/anchors";
import { buildExtractPrompt } from "./prompts/extract";
import { buildJudgePrompt } from "./prompts/judge";
import { buildGenerationPrompt } from "./prompts/strategies";

const MAX_TOKENS_LONG = 16000;
const MAX_TOKENS_JUDGE = 2000;
const JUDGE_CONCURRENCY = 4;

type Parsed<T> = { stop_reason: string | null; parsed_output: T | null; stop_details?: unknown };

/**
 * Turn a parsed message into its payload or throw the matching LlmError.
 * Checked before anything reads `content`.
 */
function payloadOf<T>(msg: Parsed<T>): T {
  if (msg.stop_reason === "refusal") {
    const details = msg.stop_details as { category?: string | null; explanation?: string | null } | null | undefined;
    throw new LlmError("refusal", details?.explanation || "The model declined this request.", {
      category: details?.category ?? null,
    });
  }
  if (msg.stop_reason === "max_tokens") {
    throw new LlmError("parse", "The response was cut off at max_tokens before the JSON was complete.");
  }
  if (msg.parsed_output === null || msg.parsed_output === undefined) {
    throw new LlmError("parse", "The model returned no parseable structured output.");
  }
  return msg.parsed_output;
}

function requestOptions(signal?: AbortSignal): Anthropic.RequestOptions | undefined {
  return signal ? { signal } : undefined;
}

function nowIso(): string {
  return new Date().toISOString();
}

function newId(): string {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === "function") return c.randomUUID();
  return `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function fourStrings(arr: string[] | null | undefined): [string, string, string, string] | null {
  if (!arr || arr.length < 4) return null;
  const cleaned = arr.slice(0, 4).map((s) => s.trim());
  if (cleaned.some((s) => !s)) return null;
  return [cleaned[0], cleaned[1], cleaned[2], cleaned[3]];
}

const DIMENSION_LABELS: Record<string, string> = {
  domain: "Domain",
  stakeholder: "Stakeholder",
  scenario: "Scenario",
  jargon: "Jargon",
  readingLevel: "Reading level",
  stepCount: "Step count",
};
const UNLOCKED_KEYS = ["domain", "stakeholder", "scenario", "jargon"];
const LOCKED_KEYS = ["readingLevel", "stepCount"];

/** Normalise the wire dimensions: guarantee the six standard keys and the locked/enabled invariants. */
function normaliseDimensions(wire: BlueprintDraftWire["surfaceDimensions"]): SurfaceDimension[] {
  const byKey = new Map<string, BlueprintDraftWire["surfaceDimensions"][number]>();
  for (const d of wire) byKey.set(d.key.trim(), d);

  const out: SurfaceDimension[] = [];
  for (const key of UNLOCKED_KEYS) {
    const d = byKey.get(key);
    const values = Array.from(new Set((d?.values ?? []).map((v) => v.trim()).filter(Boolean)));
    out.push({
      key,
      label: d?.label?.trim() || DIMENSION_LABELS[key],
      values,
      locked: false,
      enabled: true,
      note: d?.note?.trim() || `${values.length} drafted`,
    });
    byKey.delete(key);
  }
  for (const key of LOCKED_KEYS) {
    const d = byKey.get(key);
    out.push({
      key,
      label: d?.label?.trim() || DIMENSION_LABELS[key],
      values: [],
      locked: true,
      enabled: false,
      note: "held constant",
    });
    byKey.delete(key);
  }
  // Any extra dimension the model proposed is kept, unlocked and enabled.
  for (const [key, d] of byKey) {
    if (!key) continue;
    const locked = d.locked;
    const values = locked ? [] : Array.from(new Set(d.values.map((v) => v.trim()).filter(Boolean)));
    out.push({
      key,
      label: d.label?.trim() || key,
      values,
      locked,
      enabled: !locked,
      note: locked ? "held constant" : d.note?.trim() || `${values.length} drafted`,
    });
  }
  return out;
}

function normaliseRubric(wire: BlueprintDraftWire["rubric"]): Criterion[] {
  const points = wire.map((c) => (Number.isFinite(c.points) && c.points > 0 ? c.points : 0));
  const weightSum = wire.reduce((s, c) => s + (Number.isFinite(c.weight) && c.weight > 0 ? c.weight : 0), 0);
  const pointSum = points.reduce((s, p) => s + p, 0);
  return wire.map((c, i) => {
    let weight: number;
    if (weightSum > 0) weight = Math.max(0, c.weight) / weightSum;
    else if (pointSum > 0) weight = points[i] / pointSum;
    else weight = 1 / Math.max(1, wire.length);
    const anchors = fourStrings(c.anchors);
    return {
      id: newId(),
      name: c.name.trim(),
      points: points[i],
      weight,
      levels: 4,
      anchors,
      anchorsConfidence: anchors ? (c.anchorsConfidence === "missing" ? "draft" : c.anchorsConfidence) : "missing",
    };
  });
}

function stripText(files: SourceFile[]): SourceFile[] {
  return files.map(({ text: _text, ...rest }) => rest);
}

/** Fuzzy match a model-returned dimension label back to the blueprint's exact text. */
function scoresToRecord(blueprint: Blueprint, scores: { dimension: string; score: number }[]): Record<string, number> {
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const out: Record<string, number> = {};
  blueprint.constructDimensions.forEach((dim, i) => {
    const target = norm(dim);
    const hit =
      scores.find((s) => norm(s.dimension) === target) ??
      scores.find((s) => norm(s.dimension).includes(target) || target.includes(norm(s.dimension))) ??
      scores[i];
    if (hit) out[dim] = Math.min(5, Math.max(1, Math.round(hit.score)));
  });
  return out;
}

export function createLiveProvider(settings: Settings, thresholds: ThresholdSet = DEFAULT_THRESHOLDS): LlmProvider {
  if (!settings.apiKey) {
    throw new LlmError("auth", "No API key set. Paste your Anthropic key on the Settings page.");
  }
  const client = makeClient(settings.apiKey);
  const generatorModel: ModelId = settings.generatorModel;
  const judgeModel: ModelId = settings.judgeModel;

  /** Few-shot anchors generated on demand when the blueprint has none cached, once per blueprint id. */
  const anchorCache = new Map<string, Promise<{ positive: string[]; negative: string[] }>>();

  async function draftCanonicalSolution(
    blueprint: Pick<Blueprint, "construct" | "taskPrompt" | "rubric">,
    signal?: AbortSignal,
  ): Promise<string> {
    const { system, user } = buildCanonicalSolutionPrompt(blueprint);
    const msg = await withRetry(
      () =>
        client.messages.parse(
          {
            model: generatorModel,
            max_tokens: MAX_TOKENS_LONG,
            thinking: { type: "adaptive" },
            system,
            messages: [{ role: "user", content: user }],
            output_config: { format: zodOutputFormat(CanonicalSolutionSchema) },
          },
          requestOptions(signal),
        ),
      {},
      signal,
    );
    return payloadOf(msg).solution.trim();
  }

  async function generateFewShotAnchors(blueprint: Blueprint, signal?: AbortSignal) {
    const { system, user } = buildFewShotAnchorsPrompt(blueprint, thresholds);
    const msg = await withRetry(
      () =>
        client.messages.parse(
          {
            model: generatorModel,
            max_tokens: MAX_TOKENS_LONG,
            thinking: { type: "adaptive" },
            system,
            messages: [{ role: "user", content: user }],
            output_config: { format: zodOutputFormat(FewShotAnchorsSchema) },
          },
          requestOptions(signal),
        ),
      {},
      signal,
    );
    const out = payloadOf(msg);
    const positive = out.positive.map((s) => s.trim()).filter(Boolean).slice(0, 2);
    const negative = out.negative.map((s) => s.trim()).filter(Boolean).slice(0, 2);
    if (positive.length < 2 || negative.length < 2) {
      throw new LlmError("parse", "Expected two positive and two negative anchors.");
    }
    return { positive, negative };
  }

  const provider: LlmProvider = {
    mode: "live",

    async verifyKey() {
      try {
        await client.messages.create({
          model: judgeModel,
          max_tokens: 16,
          output_config: { effort: "low" },
          messages: [{ role: "user", content: "Reply with OK." }],
        });
        return { ok: true as const, model: judgeModel };
      } catch (e) {
        throw toLlmError(e);
      }
    },

    async extractBlueprint(input: ExtractInput): Promise<BlueprintDraft> {
      const started = Date.now();
      const { system, user } = buildExtractPrompt(input);
      const msg = await withRetry(
        () =>
          client.messages
            .stream(
              {
                model: generatorModel,
                max_tokens: MAX_TOKENS_LONG,
                thinking: { type: "adaptive" },
                system,
                messages: [{ role: "user", content: user }],
                output_config: { format: zodOutputFormat(BlueprintDraftSchema) },
              },
              requestOptions(input.signal),
            )
            .finalMessage(),
        {},
        input.signal,
      );
      const wire = payloadOf(msg);

      const rubric = normaliseRubric(wire.rubric);
      const constructDimensions = wire.constructDimensions.map((d) => d.trim()).filter(Boolean).slice(0, 5);
      const taskPrompt = wire.taskPrompt.trim();
      const construct = wire.construct.trim();

      const found = wire.canonicalSolutionFound && !!wire.canonicalSolution?.trim();
      let canonicalSolution = found ? wire.canonicalSolution!.trim() : "";
      let canonicalSolutionSource: Blueprint["canonicalSolutionSource"] = found ? "found" : "drafted";
      if (!found) {
        canonicalSolution = await draftCanonicalSolution({ construct, taskPrompt, rubric }, input.signal);
        canonicalSolutionSource = "drafted";
      }

      const draft: BlueprintDraft = {
        code: wire.code?.trim() || undefined,
        name: wire.name.trim() || "Untitled assessment",
        construct,
        constructDimensions,
        rubric,
        canonicalSolution,
        canonicalSolutionSource,
        surfaceDimensions: normaliseDimensions(wire.surfaceDimensions),
        taskPrompt,
        source: {
          files: stripText(input.files),
          extractedAt: nowIso(),
          extractionConfidence: wire.extractionConfidence,
          readSeconds: Math.round((Date.now() - started) / 1000),
        },
        fewShotAnchors: null,
        lastUsed: null,
      };
      return draft;
    },

    async draftAnchors(criterion, blueprint) {
      const { system, user } = buildDraftAnchorsPrompt(criterion, blueprint);
      const msg = await withRetry(() =>
        client.messages.parse({
          model: generatorModel,
          max_tokens: MAX_TOKENS_LONG,
          thinking: { type: "adaptive" },
          system,
          messages: [{ role: "user", content: user }],
          output_config: { format: zodOutputFormat(AnchorsSchema) },
        }),
      );
      const anchors = fourStrings(payloadOf(msg).anchors);
      if (!anchors) throw new LlmError("parse", "Expected exactly four level descriptions.");
      return anchors;
    },

    draftCanonicalSolution(blueprint) {
      return draftCanonicalSolution(blueprint);
    },

    generateFewShotAnchors(blueprint) {
      return generateFewShotAnchors(blueprint);
    },

    async generateVariant(input: GenerateVariantInput): Promise<GenerateVariantOutput> {
      let blueprint = input.blueprint;

      // Few-shot needs anchors. The orchestrator is expected to cache them on the
      // blueprint; if it did not, generate once per blueprint id and reuse in-memory.
      if (input.strategy === "few-shot" && !blueprint.fewShotAnchors?.positive?.length) {
        let pending = anchorCache.get(blueprint.id);
        if (!pending) {
          pending = generateFewShotAnchors(blueprint, input.signal);
          anchorCache.set(blueprint.id, pending);
          pending.catch(() => anchorCache.delete(blueprint.id));
        }
        blueprint = { ...blueprint, fewShotAnchors: await pending };
      }

      const prompt = buildGenerationPrompt({ ...input, blueprint }, thresholds);
      const model = input.generatorModel || generatorModel;
      const base = {
        model,
        max_tokens: MAX_TOKENS_LONG,
        thinking: { type: "adaptive" as const },
        system: prompt.system,
        messages: [{ role: "user" as const, content: prompt.user }],
      };

      if (prompt.schema === "structured-cot") {
        const msg = await withRetry(
          () =>
            client.messages
              .stream(
                { ...base, output_config: { format: zodOutputFormat(StructuredCotSchema) } },
                requestOptions(input.signal),
              )
              .finalMessage(),
          {},
          input.signal,
        );
        const out = payloadOf(msg);
        return {
          text: out.final.trim(),
          adaptedSolution: out.adaptedSolution.trim(),
          surfaceAssignment: mergeAssignment(input, pairsToRecord(out.surfaceAssignment)),
          scaffold: { constructMap: out.constructMap, surfacePlan: out.surfacePlan, selfCheck: out.selfCheck },
        };
      }

      const msg = await withRetry(
        () =>
          client.messages
            .stream(
              { ...base, output_config: { format: zodOutputFormat(VariantSchema) } },
              requestOptions(input.signal),
            )
            .finalMessage(),
        {},
        input.signal,
      );
      const out = payloadOf(msg);
      return {
        text: out.text.trim(),
        adaptedSolution: out.adaptedSolution.trim(),
        surfaceAssignment: mergeAssignment(input, pairsToRecord(out.surfaceAssignment)),
      };
    },

    async judgeVariant(input: JudgeInput): Promise<JudgeSample[]> {
      const { system, user } = buildJudgePrompt(input.blueprint, input.variantText);
      const format = zodOutputFormat(JudgeSchema);
      const limit = pLimit(JUDGE_CONCURRENCY);
      const model = input.judgeModel || judgeModel;
      const samples = Math.max(1, Math.floor(input.samples));

      const runs = Array.from({ length: samples }, () =>
        limit(async () => {
          const msg = await withRetry(
            () =>
              client.messages.parse(
                {
                  model,
                  max_tokens: MAX_TOKENS_JUDGE,
                  system,
                  messages: [{ role: "user", content: user }],
                  output_config: { effort: "low", format },
                },
                requestOptions(input.signal),
              ),
            {},
            input.signal,
          );
          const out = payloadOf(msg);
          const sample: JudgeSample = {
            dimensionScores: scoresToRecord(input.blueprint, out.dimensionScores),
            rationale: out.rationale.trim(),
          };
          return sample;
        }),
      );
      return Promise.all(runs);
    },
  };

  return provider;
}

/**
 * Dimension-preserving: the orchestrator's tuple is mandatory, so it overrides
 * whatever the model reported. Other strategies: the model's reported values win,
 * with the hint filling any gaps.
 */
function mergeAssignment(input: GenerateVariantInput, reported: Record<string, string>): Record<string, string> {
  const enabledKeys = new Set(input.blueprint.surfaceDimensions.filter((d) => !d.locked && d.enabled).map((d) => d.key));
  const merged: Record<string, string> =
    input.strategy === "dimension-preserving"
      ? { ...reported, ...input.surfaceAssignment }
      : { ...input.surfaceAssignment, ...reported };
  // Keep the enabled dimensions first, then anything extra the model reported.
  const ordered: Record<string, string> = {};
  for (const k of enabledKeys) if (merged[k]) ordered[k] = merged[k];
  for (const [k, v] of Object.entries(merged)) if (!(k in ordered) && v) ordered[k] = v;
  return ordered;
}
