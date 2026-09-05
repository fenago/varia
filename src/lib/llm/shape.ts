/**
 * Per-model request shaping. Pure: no SDK import, so it is unit-testable and
 * the rules live in one place.
 *
 * Rules (from the claude-api skill, cached 2026-06-24):
 * - `thinking: "always"` (Fable): thinking cannot be configured, so the key is
 *   omitted. Depth via `output_config.effort`.
 * - `thinking: "adaptive"` (Opus 5 / 4.x, Sonnet 5 / 4.6): `{ type: "adaptive" }`
 *   plus `output_config.effort`.
 * - `thinking: "budget"` (Haiku 4.5): `{ type: "enabled", budget_tokens }` only
 *   when max_tokens leaves room (> 3000); `effort` is rejected and never sent.
 * - Sampling params (`temperature`, `top_p`, `top_k`) are never sent to any model.
 * - Models whose classifiers can refuse get server-side fallbacks:
 *   `betas: ["server-side-fallback-2026-07-01"]` + `fallbacks: "default"`.
 */

import type { ModelSpec } from "@shared/models";
import type { ModelId } from "@shared/types";

export type RequestKind = "generate" | "judge" | "extract" | "short";

export type Effort = "low" | "medium" | "high" | "xhigh" | "max";

export const FALLBACK_BETA = "server-side-fallback-2026-07-01";
export const HAIKU_BUDGET_TOKENS = 2048;
/** Budget thinking needs headroom under max_tokens; below this we skip it. */
export const BUDGET_MIN_MAX_TOKENS = 3000;

/** The fields the caller supplies; everything model-specific is added here. */
export interface BaseRequest {
  model: ModelId;
  max_tokens: number;
  system?: string;
  messages: unknown[];
  output_config?: Record<string, unknown>;
  /** Anything else the caller wants passed through (e.g. `stream: true`). */
  [k: string]: unknown;
}

export interface ShapedRequest extends BaseRequest {
  thinking?: { type: "adaptive" } | { type: "enabled"; budget_tokens: number };
  output_config?: { effort?: Effort; [k: string]: unknown };
  betas?: string[];
  fallbacks?: "default";
}

export function effortFor(kind: RequestKind): Effort {
  return kind === "generate" || kind === "extract" ? "high" : "low";
}

const SAMPLING_KEYS = ["temperature", "top_p", "top_k"] as const;

export function shapeRequest(spec: ModelSpec, kind: RequestKind, base: BaseRequest): ShapedRequest {
  const out: ShapedRequest = { ...base };
  for (const k of SAMPLING_KEYS) delete (out as Record<string, unknown>)[k];
  delete out.thinking;
  delete out.betas;
  delete out.fallbacks;

  const config: { effort?: Effort; [k: string]: unknown } = { ...(base.output_config ?? {}) };
  delete config.effort;

  switch (spec.thinking) {
    case "always":
      // Thinking is on and not configurable: sending the key is a 400.
      break;
    case "adaptive":
      out.thinking = { type: "adaptive" };
      break;
    case "budget":
      if (base.max_tokens > BUDGET_MIN_MAX_TOKENS) {
        out.thinking = { type: "enabled", budget_tokens: HAIKU_BUDGET_TOKENS };
      }
      break;
    case "none":
      break;
  }

  if (spec.supportsEffort) config.effort = effortFor(kind);
  if (Object.keys(config).length > 0) out.output_config = config;
  else delete out.output_config;

  if (spec.needsRefusalFallback) {
    out.betas = [FALLBACK_BETA];
    out.fallbacks = "default";
  }

  return out;
}
