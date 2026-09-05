import type Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import type { AutoParseableBetaOutputFormat } from "@anthropic-ai/sdk/lib/beta-parser";
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
  UsageTotals, PreScoreInput, PreScoreOutput } from "@shared/types";
import { DEFAULT_THRESHOLDS } from "@shared/thresholds";
import { costOf, modelSpec, type ModelSpec } from "@shared/models";
import { makeClient } from "./client";
import { LlmError, toLlmError, withRetry } from "./errors";
import { shapeRequest, type RequestKind } from "./shape";
import {
  AnchorsSchema,
  BlueprintDraftSchema,
  CanonicalSolutionSchema,
  FewShotAnchorsSchema,
  JudgeSchema,
  StructuredCotSchema,
  StructuredCotNoMapSchema,
  VariantSchema,
  pairsToRecord,
  type BlueprintDraftWire,
} from "./schemas";
import { buildDraftAnchorsPrompt, buildCanonicalSolutionPrompt, buildFewShotAnchorsPrompt } from "./prompts/anchors";
import { buildExtractPrompt } from "./prompts/extract";
import { buildJudgePrompt } from "./prompts/judge";
import { PreScoreSchema, buildPreScorePrompt, preScoreToOutput } from "./prompts/prescore";
import { buildGenerationPrompt, type GenerationSchemaKind } from "./prompts/strategies";
import type { CacheablePrompt } from "./prompts/shared";

export { shapeRequest } from "./shape";

const MAX_TOKENS_LONG = 16000;
/** Room for a short adaptive/budget think plus the JSON. */
const MAX_TOKENS_JUDGE = 8000;
const MAX_TOKENS_VERIFY = 64;
const JUDGE_CONCURRENCY = 4;

type BetaMessage = Anthropic.Beta.Messages.BetaMessage;
type Parsed<T> = BetaMessage & { parsed_output: T | null };

/**
 * Ids outside the catalog (a user-typed id, or a fallback model the server
 * chose) are treated as a current-generation model: adaptive thinking, effort,
 * no sampling, no fallback chain.
 */
function specFor(id: ModelId): ModelSpec {
  return (
    modelSpec(id) ?? {
      id,
      label: id,
      family: "opus",
      generation: "5",
      roles: ["generator", "judge"],
      thinking: "adaptive",
      supportsEffort: true,
      supportsSampling: false,
      needsRefusalFallback: false,
      contextTokens: 1_000_000,
      maxOutputTokens: 128_000,
      priceInPerM: 0,
      priceOutPerM: 0,
      priceCacheReadPerM: 0,
      priceCacheWritePerM: 0,
      minCacheTokens: 1024,
      note: "not in catalog",
    }
  );
}

export function emptyUsage(): UsageTotals {
  return { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, costUsd: 0, calls: 0 };
}

export function addUsage(into: UsageTotals, u: UsageTotals): UsageTotals {
  into.inputTokens += u.inputTokens;
  into.outputTokens += u.outputTokens;
  into.cacheReadTokens += u.cacheReadTokens;
  into.cacheWriteTokens += u.cacheWriteTokens;
  into.costUsd += u.costUsd;
  into.calls += u.calls;
  return into;
}

/**
 * Real usage from a response. Priced on the model that actually answered when
 * it is in the catalog (a server-side fallback bills at the fallback's rate),
 * otherwise on the model we asked for.
 */
export function usageOf(msg: Pick<BetaMessage, "usage" | "model">, requestedModel: ModelId): UsageTotals {
  const u = msg.usage;
  const counts = {
    inputTokens: u?.input_tokens ?? 0,
    outputTokens: u?.output_tokens ?? 0,
    cacheReadTokens: u?.cache_read_input_tokens ?? 0,
    cacheWriteTokens: u?.cache_creation_input_tokens ?? 0,
  };
  const billed = msg.model && modelSpec(msg.model) ? msg.model : requestedModel;
  return { ...counts, costUsd: costOf(billed, counts), calls: 1 };
}

/**
 * Turn a parsed message into its payload or throw the matching LlmError.
 * Checked before anything reads `content`.
 */
function payloadOf<T>(msg: Parsed<T>): T {
  if (msg.stop_reason === "refusal") {
    const details = msg.stop_details as { category?: string | null; explanation?: string | null } | null | undefined;
    const category = details?.category ?? null;
    const why = details?.explanation?.trim() || "The model declined this request.";
    throw new LlmError("refusal", category ? `Declined (${category}): ${why}` : `Declined: ${why}`, { category });
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

export type BaseParams = {
  model: ModelId;
  max_tokens: number;
  system: string;
  messages: Anthropic.Beta.Messages.BetaMessageParam[];
};

/**
 * Prompt caching (wave 6d). One user message of two text blocks: the stable
 * block carries `cache_control`, so the rendered prefix up to and including it
 * (tools → system → stable block) is written to the cache on the first call
 * of a run and read back on every later call whose prefix is byte-identical.
 * The volatile block after the breakpoint is priced as ordinary input.
 *
 * The API silently skips caching when the prefix is shorter than the model's
 * minimum (`ModelSpec.minCacheTokens`: 512 on Opus 5, 1024 on Sonnet 5, 4096
 * on Haiku 4.5). Nothing is padded; the order is right regardless.
 */
export const CACHE_CONTROL = { type: "ephemeral" } as const;

export function cachedUserMessage(p: Pick<CacheablePrompt, "stable" | "volatile">): Anthropic.Beta.Messages.BetaMessageParam {
  return {
    role: "user",
    content: [
      { type: "text", text: p.stable, cache_control: CACHE_CONTROL },
      { type: "text", text: p.volatile },
    ],
  };
}

/** The generation request before per-model shaping. Pure, so tests can compare two variants of one run. */
export function buildGenerationRequest(
  input: GenerateVariantInput,
  thresholds: ThresholdSet,
  model: ModelId = input.generatorModel,
): { base: BaseParams; schema: GenerationSchemaKind } {
  const prompt = buildGenerationPrompt(input, thresholds);
  return {
    base: { model, max_tokens: MAX_TOKENS_LONG, system: prompt.system, messages: [cachedUserMessage(prompt)] },
    schema: prompt.schema,
  };
}

/** One judge sample's request (every sample of a variant sends the same bytes). */
export function buildJudgeRequest(input: Pick<JudgeInput, "blueprint" | "variantText">, model: ModelId): BaseParams {
  const prompt = buildJudgePrompt(input.blueprint, input.variantText);
  return { model, max_tokens: MAX_TOKENS_JUDGE, system: prompt.system, messages: [cachedUserMessage(prompt)] };
}

export function buildPreScoreRequest(input: Pick<PreScoreInput, "blueprint" | "variant" | "submissionText">, model: ModelId): BaseParams {
  const prompt = buildPreScorePrompt(input.blueprint, input.variant, input.submissionText);
  return { model, max_tokens: MAX_TOKENS_JUDGE, system: prompt.system, messages: [cachedUserMessage(prompt)] };
}

type StructuredParams<T> = Anthropic.Beta.Messages.MessageCreateParamsNonStreaming & {
  output_config: { format: AutoParseableBetaOutputFormat<T> };
};

/** Shape a structured-output request for the model, keeping the parser's type. */
function structured<T>(kind: RequestKind, base: BaseParams, format: AutoParseableBetaOutputFormat<T>): StructuredParams<T> {
  const shaped = shapeRequest(specFor(base.model), kind, { ...base });
  return {
    ...shaped,
    messages: base.messages,
    output_config: { ...(shaped.output_config ?? {}), format },
  } as unknown as StructuredParams<T>;
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

type OnUsage = ((u: UsageTotals) => void) | undefined;

export function createLiveProvider(settings: Settings, thresholds: ThresholdSet = DEFAULT_THRESHOLDS): LlmProvider {
  if (!settings.apiKey) {
    throw new LlmError("auth", "No API key set. Paste your Anthropic key on the Settings page.");
  }
  const client = makeClient(settings.apiKey, settings.workspaceId ?? null);
  const generatorModel: ModelId = settings.generatorModel;
  const judgeModel: ModelId = settings.judgeModel;

  /** Few-shot anchors generated on demand when the blueprint has none cached, once per blueprint id. */
  const anchorCache = new Map<string, Promise<{ positive: string[]; negative: string[] }>>();

  /** Non-streaming structured call: shape, retry, report usage, unwrap. */
  async function callParse<T>(kind: RequestKind, base: BaseParams, format: AutoParseableBetaOutputFormat<T>, signal?: AbortSignal, onUsage?: OnUsage): Promise<T> {
    const params = structured(kind, base, format);
    const msg = await withRetry(() => client.beta.messages.parse(params, requestOptions(signal)), {}, signal);
    onUsage?.(usageOf(msg, base.model));
    return payloadOf(msg as Parsed<T>);
  }

  /** Streaming structured call for long outputs (avoids HTTP timeouts). */
  async function callStream<T>(kind: RequestKind, base: BaseParams, format: AutoParseableBetaOutputFormat<T>, signal?: AbortSignal, onUsage?: OnUsage): Promise<T> {
    const params = structured(kind, base, format);
    const msg = await withRetry(() => client.beta.messages.stream(params, requestOptions(signal)).finalMessage(), {}, signal);
    onUsage?.(usageOf(msg, base.model));
    return payloadOf(msg as Parsed<T>);
  }

  async function draftCanonicalSolution(
    blueprint: Pick<Blueprint, "construct" | "taskPrompt" | "rubric">,
    signal?: AbortSignal,
    onUsage?: OnUsage,
  ): Promise<string> {
    const { system, user } = buildCanonicalSolutionPrompt(blueprint);
    const out = await callParse(
      "generate",
      { model: generatorModel, max_tokens: MAX_TOKENS_LONG, system, messages: [{ role: "user", content: user }] },
      betaZodOutputFormat(CanonicalSolutionSchema),
      signal,
      onUsage,
    );
    return out.solution.trim();
  }

  async function generateFewShotAnchors(blueprint: Blueprint, signal?: AbortSignal, onUsage?: OnUsage) {
    const { system, user } = buildFewShotAnchorsPrompt(blueprint, thresholds);
    const out = await callParse(
      "generate",
      { model: generatorModel, max_tokens: MAX_TOKENS_LONG, system, messages: [{ role: "user", content: user }] },
      betaZodOutputFormat(FewShotAnchorsSchema),
      signal,
      onUsage,
    );
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
        const params = shapeRequest(specFor(judgeModel), "short", {
          model: judgeModel,
          max_tokens: MAX_TOKENS_VERIFY,
          messages: [{ role: "user", content: "Reply with OK." }],
        }) as unknown as Anthropic.Beta.Messages.MessageCreateParamsNonStreaming;
        await client.beta.messages.create(params);
        return { ok: true as const, model: judgeModel };
      } catch (e) {
        throw toLlmError(e);
      }
    },

    async extractBlueprint(input: ExtractInput): Promise<BlueprintDraft> {
      const started = Date.now();
      const { system, user } = buildExtractPrompt(input);
      const wire = await callStream(
        "extract",
        { model: generatorModel, max_tokens: MAX_TOKENS_LONG, system, messages: [{ role: "user", content: user }] },
        betaZodOutputFormat(BlueprintDraftSchema),
        input.signal,
        input.onUsage,
      );

      const rubric = normaliseRubric(wire.rubric);
      const constructDimensions = wire.constructDimensions.map((d) => d.trim()).filter(Boolean).slice(0, 5);
      const taskPrompt = wire.taskPrompt.trim();
      const construct = wire.construct.trim();

      const found = wire.canonicalSolutionFound && !!wire.canonicalSolution?.trim();
      let canonicalSolution = found ? wire.canonicalSolution!.trim() : "";
      let canonicalSolutionSource: Blueprint["canonicalSolutionSource"] = found ? "found" : "drafted";
      if (!found) {
        canonicalSolution = await draftCanonicalSolution({ construct, taskPrompt, rubric }, input.signal, input.onUsage);
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
      const out = await callParse(
        "generate",
        { model: generatorModel, max_tokens: MAX_TOKENS_LONG, system, messages: [{ role: "user", content: user }] },
        betaZodOutputFormat(AnchorsSchema),
      );
      const anchors = fourStrings(out.anchors);
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
      const total = emptyUsage();
      const onUsage: OnUsage = (u) => {
        addUsage(total, u);
        input.onUsage?.(u);
      };

      // Few-shot needs anchors. The orchestrator is expected to cache them on the
      // blueprint; if it did not, generate once per blueprint id and reuse in-memory.
      if (input.strategy === "few-shot" && !blueprint.fewShotAnchors?.positive?.length) {
        let pending = anchorCache.get(blueprint.id);
        if (!pending) {
          pending = generateFewShotAnchors(blueprint, input.signal, onUsage);
          anchorCache.set(blueprint.id, pending);
          pending.catch(() => anchorCache.delete(blueprint.id));
        }
        blueprint = { ...blueprint, fewShotAnchors: await pending };
      }

      const model = input.generatorModel || generatorModel;
      const { base, schema } = buildGenerationRequest({ ...input, blueprint }, thresholds, model);

      if (schema === "structured-cot") {
        const out = await callStream("generate", base, betaZodOutputFormat(StructuredCotSchema), input.signal, onUsage);
        return {
          text: out.final.trim(),
          adaptedSolution: out.adaptedSolution.trim(),
          surfaceAssignment: mergeAssignment(input, pairsToRecord(out.surfaceAssignment)),
          scaffold: { constructMap: out.constructMap, surfacePlan: out.surfacePlan, selfCheck: out.selfCheck },
          usage: total,
        };
      }
      if (schema === "structured-cot-nomap") {
        const out = await callStream("generate", base, betaZodOutputFormat(StructuredCotNoMapSchema), input.signal, onUsage);
        return {
          text: out.final.trim(),
          adaptedSolution: out.adaptedSolution.trim(),
          surfaceAssignment: mergeAssignment(input, pairsToRecord(out.surfaceAssignment)),
          scaffold: { constructMap: null, surfacePlan: out.surfacePlan, selfCheck: out.selfCheck, ablation: "no-construct-map" },
          usage: total,
        };
      }

      const out = await callStream("generate", base, betaZodOutputFormat(VariantSchema), input.signal, onUsage);
      return {
        text: out.text.trim(),
        adaptedSolution: out.adaptedSolution.trim(),
        surfaceAssignment: mergeAssignment(input, pairsToRecord(out.surfaceAssignment)),
        usage: total,
      };
    },

    async judgeVariant(input: JudgeInput): Promise<JudgeSample[]> {
      const format = betaZodOutputFormat(JudgeSchema);
      const limit = pLimit(JUDGE_CONCURRENCY);
      const model = input.judgeModel || judgeModel;
      const samples = Math.max(1, Math.floor(input.samples));
      const base = buildJudgeRequest(input, model);

      const runs = Array.from({ length: samples }, () =>
        limit(async () => {
          const out = await callParse("judge", base, format, input.signal, input.onUsage);
          const sample: JudgeSample = {
            dimensionScores: scoresToRecord(input.blueprint, out.dimensionScores),
            rationale: out.rationale.trim(),
          };
          return sample;
        }),
      );
      // Self-consistency tolerates a minority of failed samples: the median over the
      // successful ones is still the paper's aggregation. Fewer than a majority is a failure.
      const settled = await Promise.allSettled(runs);
      const ok = settled.filter((r): r is PromiseFulfilledResult<JudgeSample> => r.status === "fulfilled").map((r) => r.value);
      const failed = settled.filter((r): r is PromiseRejectedResult => r.status === "rejected");
      const needed = Math.ceil(samples / 2);
      if (ok.length >= needed) return ok;
      const first = failed[0]?.reason as Error | undefined;
      throw first instanceof LlmError ? first : new LlmError("parse", `Judge: ${ok.length} of ${samples} samples succeeded; ${first?.message ?? "unknown error"}`);
    },

    async preScoreSubmission(input: PreScoreInput): Promise<PreScoreOutput> {
      const model = input.judgeModel || judgeModel;
      const out = await callParse("judge", buildPreScoreRequest(input, model), betaZodOutputFormat(PreScoreSchema), input.signal, input.onUsage);
      return preScoreToOutput(input.blueprint, out);
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
