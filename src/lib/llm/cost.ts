import { COST_MODEL } from "@shared/thresholds";

/**
 * Estimate for the Generate page. Generation runs 3-wide (p-limit(3) in the
 * orchestrator), so wall-clock is the serial generation time divided by three.
 */
export function estimateRunCost(n: number, judgeSamples: number): { usd: number; minutes: number } {
  const variants = Math.max(0, Math.floor(n));
  const samples = Math.max(0, Math.floor(judgeSamples));
  const usd = variants * COST_MODEL.perVariantGeneration + variants * samples * COST_MODEL.perJudgeSample;
  const minutes = Math.ceil((variants * COST_MODEL.perVariantSeconds) / 60 / 3);
  return { usd: Math.round(usd * 100) / 100, minutes };
}
