/**
 * The model catalog: every Claude model the app can call, with the request
 * shape it needs and the first-party price per million tokens.
 *
 * Prices and capabilities come from the `claude-api` skill's model table
 * (cached 2026-06-24). Cache reads are 0.1× input on every model except the
 * Fable tier: Fable 5.1 reads at $0.25/MTok, Fable 5 at $1.00/MTok. Cache
 * writes (5-minute) are 1.25× input everywhere.
 */

import type { ModelId, Strategy } from "./types";

export type ModelFamily = "fable" | "opus" | "sonnet" | "haiku";
export type ModelGeneration = "5" | "4.x";
export type ModelRole = "generator" | "judge";
/**
 * How the model takes its thinking configuration:
 * - `always`: thinking is on and cannot be configured; omit the parameter. Depth via `output_config.effort`.
 * - `adaptive`: send `thinking: { type: "adaptive" }`. Depth via `output_config.effort`.
 * - `budget`: pre-4.6 shape, `thinking: { type: "enabled", budget_tokens }`; `effort` is rejected.
 * - `none`: no thinking support.
 */
export type ThinkingMode = "always" | "adaptive" | "budget" | "none";

export interface ModelSpec {
  id: ModelId;
  label: string;
  family: ModelFamily;
  generation: ModelGeneration;
  roles: ModelRole[];
  defaultFor?: ModelRole;
  thinking: ThinkingMode;
  /** Accepts `output_config.effort` */
  supportsEffort: boolean;
  /** Accepts `temperature` / `top_p` / `top_k`. We never send them regardless. */
  supportsSampling: boolean;
  /** Safety classifiers may return `stop_reason: "refusal"`; opt into server-side fallbacks. */
  needsRefusalFallback: boolean;
  contextTokens: number;
  maxOutputTokens: number;
  priceInPerM: number;
  priceOutPerM: number;
  priceCacheReadPerM: number;
  /** 5-minute cache write, 1.25× input */
  priceCacheWritePerM: number;
  /**
   * Shortest prefix the prompt cache will store (claude-api skill, prompt-caching
   * § API reference). A shorter marked prefix is silently not cached.
   */
  minCacheTokens: number;
  note: string;
}

const BOTH: ModelRole[] = ["generator", "judge"];

export const MODEL_CATALOG: ModelSpec[] = [
  {
    id: "claude-fable-5-1",
    label: "Claude Fable 5.1",
    family: "fable",
    generation: "5",
    roles: BOTH,
    thinking: "always",
    supportsEffort: true,
    supportsSampling: false,
    needsRefusalFallback: true,
    contextTokens: 1_000_000,
    maxOutputTokens: 128_000,
    priceInPerM: 10,
    priceOutPerM: 50,
    priceCacheReadPerM: 0.25,
    priceCacheWritePerM: 12.5,
    minCacheTokens: 512,
    note: "most capable; 30-day retention required",
  },
  {
    id: "claude-fable-5",
    label: "Claude Fable 5",
    family: "fable",
    generation: "5",
    roles: BOTH,
    thinking: "always",
    supportsEffort: true,
    supportsSampling: false,
    needsRefusalFallback: true,
    contextTokens: 1_000_000,
    maxOutputTokens: 128_000,
    priceInPerM: 10,
    priceOutPerM: 50,
    priceCacheReadPerM: 1,
    priceCacheWritePerM: 12.5,
    minCacheTokens: 512,
    note: "previous Fable release",
  },
  {
    id: "claude-opus-5",
    label: "Claude Opus 5",
    family: "opus",
    generation: "5",
    roles: BOTH,
    defaultFor: "generator",
    thinking: "adaptive",
    supportsEffort: true,
    supportsSampling: false,
    needsRefusalFallback: true,
    contextTokens: 1_000_000,
    maxOutputTokens: 128_000,
    priceInPerM: 5,
    priceOutPerM: 25,
    priceCacheReadPerM: 0.5,
    priceCacheWritePerM: 6.25,
    minCacheTokens: 512,
    note: "default generator",
  },
  {
    id: "claude-opus-4-8",
    label: "Claude Opus 4.8",
    family: "opus",
    generation: "4.x",
    roles: BOTH,
    thinking: "adaptive",
    supportsEffort: true,
    supportsSampling: false,
    needsRefusalFallback: false,
    contextTokens: 1_000_000,
    maxOutputTokens: 128_000,
    priceInPerM: 5,
    priceOutPerM: 25,
    priceCacheReadPerM: 0.5,
    priceCacheWritePerM: 6.25,
    minCacheTokens: 1024,
    note: "previous Opus",
  },
  {
    id: "claude-opus-4-7",
    label: "Claude Opus 4.7",
    family: "opus",
    generation: "4.x",
    roles: BOTH,
    thinking: "adaptive",
    supportsEffort: true,
    supportsSampling: false,
    needsRefusalFallback: false,
    contextTokens: 1_000_000,
    maxOutputTokens: 128_000,
    priceInPerM: 5,
    priceOutPerM: 25,
    priceCacheReadPerM: 0.5,
    priceCacheWritePerM: 6.25,
    minCacheTokens: 2048,
    note: "pilot generator",
  },
  {
    id: "claude-opus-4-6",
    label: "Claude Opus 4.6",
    family: "opus",
    generation: "4.x",
    roles: BOTH,
    thinking: "adaptive",
    supportsEffort: true,
    supportsSampling: true,
    needsRefusalFallback: false,
    contextTokens: 1_000_000,
    maxOutputTokens: 128_000,
    priceInPerM: 5,
    priceOutPerM: 25,
    priceCacheReadPerM: 0.5,
    priceCacheWritePerM: 6.25,
    minCacheTokens: 4096,
    note: "older Opus",
  },
  {
    id: "claude-sonnet-5",
    label: "Claude Sonnet 5",
    family: "sonnet",
    generation: "5",
    roles: BOTH,
    defaultFor: "judge",
    thinking: "adaptive",
    supportsEffort: true,
    supportsSampling: false,
    needsRefusalFallback: false,
    contextTokens: 1_000_000,
    maxOutputTokens: 128_000,
    priceInPerM: 2,
    priceOutPerM: 10,
    priceCacheReadPerM: 0.2,
    priceCacheWritePerM: 2.5,
    minCacheTokens: 1024,
    note: "default judge",
  },
  {
    id: "claude-sonnet-4-6",
    label: "Claude Sonnet 4.6",
    family: "sonnet",
    generation: "4.x",
    roles: BOTH,
    thinking: "adaptive",
    supportsEffort: true,
    supportsSampling: true,
    needsRefusalFallback: false,
    contextTokens: 1_000_000,
    maxOutputTokens: 128_000,
    priceInPerM: 3,
    priceOutPerM: 15,
    priceCacheReadPerM: 0.3,
    priceCacheWritePerM: 3.75,
    minCacheTokens: 1024,
    note: "pilot judge",
  },
  {
    id: "claude-haiku-4-5",
    label: "Claude Haiku 4.5",
    family: "haiku",
    generation: "4.x",
    roles: BOTH,
    thinking: "budget",
    supportsEffort: false,
    supportsSampling: true,
    needsRefusalFallback: false,
    contextTokens: 200_000,
    maxOutputTokens: 64_000,
    priceInPerM: 1,
    priceOutPerM: 5,
    priceCacheReadPerM: 0.1,
    priceCacheWritePerM: 1.25,
    minCacheTokens: 4096,
    note: "fastest, cheapest",
  },
];

export const FAMILY_LABELS: Record<ModelFamily, string> = {
  fable: "Fable",
  opus: "Opus",
  sonnet: "Sonnet",
  haiku: "Haiku",
};

/** Family order for grouped selects. */
export const FAMILY_ORDER: ModelFamily[] = ["fable", "opus", "sonnet", "haiku"];

const BY_ID = new Map(MODEL_CATALOG.map((m) => [m.id, m]));

/** Spec for an exact id, or undefined for anything not in the catalog. */
export function modelSpec(id: ModelId): ModelSpec | undefined {
  return BY_ID.get(id);
}

export const DEFAULT_GENERATOR: ModelId = MODEL_CATALOG.find((m) => m.defaultFor === "generator")!.id;
export const DEFAULT_JUDGE: ModelId = MODEL_CATALOG.find((m) => m.defaultFor === "judge")!.id;

export interface ModelOption {
  id: ModelId;
  label: string;
  note: string;
}

function optionsFor(role: ModelRole): ModelOption[] {
  return MODEL_CATALOG.filter((m) => m.roles.includes(role)).map(({ id, label, note }) => ({ id, label, note }));
}

/** Same `{ id, label, note }` shape the UI has always consumed. */
export const GENERATOR_MODELS: ModelOption[] = optionsFor("generator");
export const JUDGE_MODELS: ModelOption[] = optionsFor("judge");

/** Catalog entries for one role, grouped by family in `FAMILY_ORDER`. */
export function modelsByFamily(role: ModelRole): { family: ModelFamily; label: string; models: ModelSpec[] }[] {
  return FAMILY_ORDER.map((family) => ({
    family,
    label: FAMILY_LABELS[family],
    models: MODEL_CATALOG.filter((m) => m.family === family && m.roles.includes(role)),
  })).filter((g) => g.models.length > 0);
}

/** "$5 / $25 per M" */
export function priceLabel(spec: ModelSpec): string {
  const fmt = (n: number) => (Number.isInteger(n) ? `$${n}` : `$${n.toFixed(2).replace(/0$/, "")}`);
  return `${fmt(spec.priceInPerM)} in / ${fmt(spec.priceOutPerM)} out per M`;
}

/** Text for a `<option>`: label, note and price. */
export function modelOptionText(spec: ModelSpec): string {
  return `${spec.label} — ${spec.note} · ${priceLabel(spec)}`;
}

/** One-line caveat shown under a select when this model is chosen, or null. */
export function modelCaveat(id: ModelId): string | null {
  if (id === "claude-fable-5-1") {
    return "Fable requires 30-day data retention on your Anthropic org and may decline some requests; declines fall back automatically.";
  }
  return null;
}

export interface TokenCounts {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
}

/**
 * Dollar cost of one call on `id`. Unknown ids cost 0 (we cannot price what we
 * do not know, and a wrong number is worse than none).
 */
export function costOf(id: ModelId, usage: TokenCounts): number {
  const spec = modelSpec(id);
  if (!spec) return 0;
  const perM = 1_000_000;
  const usd =
    (Math.max(0, usage.inputTokens) * spec.priceInPerM +
      Math.max(0, usage.outputTokens) * spec.priceOutPerM +
      Math.max(0, usage.cacheReadTokens) * spec.priceCacheReadPerM +
      Math.max(0, usage.cacheWriteTokens) * spec.priceCacheWritePerM) /
    perM;
  return usd;
}

/**
 * Assumed tokens per call for the pre-run estimate, calibrated on the recorded
 * full-sheet run in `lib/store/fixtures/ml-lending-fairness-audit.json`
 * (Opus 5 structured CoT, Sonnet 5 × 5 judges, uncached: 24.4k input and
 * 9.6k output tokens per variant across 6 calls, $0.285 per variant).
 * `inputTokens` is the whole prompt; `ESTIMATE_CACHE_PREFIX_TOKENS` of it is
 * the shared prefix. Output includes thinking, which is billed as output; the
 * structured-CoT scaffold roughly doubles it.
 */
export const ESTIMATE_TOKENS = {
  generation: { inputTokens: 6000, outputTokens: 7500 },
  generationLight: { inputTokens: 6000, outputTokens: 4000 },
  judge: { inputTokens: 3700, outputTokens: 500 },
} as const;

/**
 * Shared prefix (system + blueprint/rubric/solution block) assumed to be served
 * from the cache on every call after the first per model and call kind. A
 * deliberately conservative figure: a full assignment sheet is larger.
 */
export const ESTIMATE_CACHE_PREFIX_TOKENS = 1500;

/** Wall-clock assumption per variant (generation runs 3-wide in the orchestrator). */
export const ESTIMATE_SECONDS_PER_VARIANT = 20;

export interface RunEstimate {
  usd: number;
  minutes: number;
  /** One version per student, so this is the run cost divided by `n`. */
  perStudentUsd: number;
}

/**
 * Cost of `calls` identical-prefix calls on `id`: the first writes the prefix
 * (1.25× input), the rest read it (the model's cache-read rate). Models whose
 * minimum cacheable prefix is above the assumed prefix are priced uncached.
 */
function cachedSeriesCost(id: ModelId, calls: number, tokens: { inputTokens: number; outputTokens: number }): number {
  if (calls <= 0) return 0;
  const spec = modelSpec(id);
  const prefix = Math.min(ESTIMATE_CACHE_PREFIX_TOKENS, tokens.inputTokens);
  const cacheable = !!spec && prefix >= spec.minCacheTokens;
  if (!cacheable) return calls * costOf(id, { ...tokens, cacheReadTokens: 0, cacheWriteTokens: 0 });
  const rest = tokens.inputTokens - prefix;
  const first = costOf(id, { inputTokens: rest, outputTokens: tokens.outputTokens, cacheReadTokens: 0, cacheWriteTokens: prefix });
  const later = costOf(id, { inputTokens: rest, outputTokens: tokens.outputTokens, cacheReadTokens: prefix, cacheWriteTokens: 0 });
  return first + (calls - 1) * later;
}

/**
 * Pre-run estimate for the Generate page: `n` generation calls on the
 * generator plus `n × judgeSamples` judge calls on the judge, priced from the
 * catalog with the assumed token counts above and the shared prefix read from
 * cache after the first call per model. Structured CoT assumes the heavier
 * generation output; every other strategy the lighter one.
 */
export function estimateRunCost(
  n: number,
  judgeSamples: number,
  generatorId: ModelId = DEFAULT_GENERATOR,
  judgeId: ModelId = DEFAULT_JUDGE,
  strategy: Strategy = "structured-cot",
): RunEstimate {
  const variants = Math.max(0, Math.floor(n));
  const samples = Math.max(0, Math.floor(judgeSamples));
  const genTokens = strategy === "structured-cot" ? ESTIMATE_TOKENS.generation : ESTIMATE_TOKENS.generationLight;
  const usd = cachedSeriesCost(generatorId, variants, genTokens) + cachedSeriesCost(judgeId, variants * samples, ESTIMATE_TOKENS.judge);
  const minutes = Math.ceil((variants * ESTIMATE_SECONDS_PER_VARIANT) / 60 / 3);
  const perStudent = variants > 0 ? usd / variants : 0;
  return { usd: Math.round(usd * 100) / 100, minutes, perStudentUsd: Math.round(perStudent * 100) / 100 };
}

// ---------------------------------------------------------------------------
// Run presets (wave 6d)
// ---------------------------------------------------------------------------

export type RunPreset = "high-stakes" | "formative" | "custom";

export interface RunPresetSpec {
  id: RunPreset;
  label: string;
  generator: ModelId;
  judge: ModelId;
  judgeSamples: number;
  /** The strategy the preset is designed around; Generate's threat profile picks the actual strategy. */
  strategy: Strategy;
  /** Short claim; the live price is appended by `presetDescription`. */
  claim: string;
}

export const RUN_PRESETS: Record<Exclude<RunPreset, "custom">, RunPresetSpec> = {
  "high-stakes": {
    id: "high-stakes",
    label: "High-stakes",
    generator: "claude-opus-5",
    judge: "claude-sonnet-5",
    judgeSamples: 5,
    strategy: "structured-cot",
    claim: "Highest construct fidelity",
  },
  formative: {
    id: "formative",
    label: "Formative",
    generator: "claude-sonnet-5",
    judge: "claude-sonnet-5",
    judgeSamples: 3,
    strategy: "dimension-preserving",
    claim: "Surface separation",
  },
};

export const PRESET_ORDER: RunPreset[] = ["high-stakes", "formative", "custom"];
export const DEFAULT_PRESET: RunPreset = "high-stakes";

export function presetSpec(id: RunPreset): RunPresetSpec | null {
  return id === "custom" ? null : RUN_PRESETS[id];
}

/** Per-student cost of a preset at list prices, caching assumed (single-variant runs pay the cache write, so estimate on a class of 30). */
export function presetPerStudentUsd(id: Exclude<RunPreset, "custom">): number {
  const p = RUN_PRESETS[id];
  return estimateRunCost(30, p.judgeSamples, p.generator, p.judge, p.strategy).perStudentUsd;
}

/**
 * One line under the preset control, with the price computed live from the
 * catalog. Formative is described relative to high-stakes.
 */
export function presetDescription(id: RunPreset, current?: { generator: ModelId; judge: ModelId; judgeSamples: number; strategy: Strategy }): string {
  if (id === "custom") {
    if (!current) return "Your own generator, judge and sample count.";
    const usd = estimateRunCost(30, current.judgeSamples, current.generator, current.judge, current.strategy).perStudentUsd;
    return `Your own generator, judge and sample count; about $${usd.toFixed(2)} per student.`;
  }
  const usd = presetPerStudentUsd(id);
  if (id === "high-stakes") return `${RUN_PRESETS[id].claim}; about $${usd.toFixed(2)} per student.`;
  const high = presetPerStudentUsd("high-stakes");
  const ratio = usd > 0 ? high / usd : 0;
  const fraction = ratio >= 8 ? "about a tenth" : ratio >= 3.5 ? "about a quarter" : ratio >= 2.5 ? "about a third" : ratio >= 1.5 ? "about half" : "a little under";
  return `${RUN_PRESETS[id].claim} at ${fraction} of the cost; about $${usd.toFixed(2)} per student.`;
}
