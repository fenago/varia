/**
 * Estimate for the Generate page. The arithmetic lives in `@shared/models`
 * (priced from the catalog with assumed tokens per call); this module keeps
 * the old import path and signature working. Generation runs 3-wide
 * (p-limit(3) in the orchestrator), so wall-clock is the serial generation
 * time divided by three.
 */
export { estimateRunCost, costOf, ESTIMATE_TOKENS, ESTIMATE_SECONDS_PER_VARIANT } from "@shared/models";
