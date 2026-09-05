/**
 * The model catalog: every Claude model the app can call, with the request
 * shape it needs and the first-party price per million tokens.
 *
 * Prices and capabilities come from the `claude-api` skill's model table
 * (cached 2026-06-24). Cache reads are 0.1× input on every model except the
 * Fable tier: Fable 5.1 reads at $0.25/MTok, Fable 5 at $1.00/MTok. Cache
 * writes (5-minute) are 1.25× input everywhere.
 */

import type { ModelId } from "./types";

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

/** Assumed tokens per call for the pre-run estimate. */
export const ESTIMATE_TOKENS = {
  generation: { inputTokens: 1500, outputTokens: 1200 },
  judge: { inputTokens: 1200, outputTokens: 250 },
} as const;

/** Wall-clock assumption per variant (generation runs 3-wide in the orchestrator). */
export const ESTIMATE_SECONDS_PER_VARIANT = 20;

/**
 * Pre-run estimate for the Generate page: `n` generation calls on the
 * generator plus `n × judgeSamples` judge calls on the judge, priced from the
 * catalog with the assumed token counts above.
 */
export function estimateRunCost(
  n: number,
  judgeSamples: number,
  generatorId: ModelId = DEFAULT_GENERATOR,
  judgeId: ModelId = DEFAULT_JUDGE,
): { usd: number; minutes: number } {
  const variants = Math.max(0, Math.floor(n));
  const samples = Math.max(0, Math.floor(judgeSamples));
  const perGeneration = costOf(generatorId, { ...ESTIMATE_TOKENS.generation, cacheReadTokens: 0, cacheWriteTokens: 0 });
  const perJudge = costOf(judgeId, { ...ESTIMATE_TOKENS.judge, cacheReadTokens: 0, cacheWriteTokens: 0 });
  const usd = variants * perGeneration + variants * samples * perJudge;
  const minutes = Math.ceil((variants * ESTIMATE_SECONDS_PER_VARIANT) / 60 / 3);
  return { usd: Math.round(usd * 100) / 100, minutes };
}
