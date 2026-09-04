import type { LlmProvider, Settings } from "@shared/types";
import { createDemoProvider } from "@lib/store/demoProvider";
import { createLiveProvider } from "./live";

export { estimateRunCost } from "./cost";
export { LlmError, toLlmError, withRetry } from "./errors";
export type { LlmErrorKind } from "./errors";
export { createLiveProvider } from "./live";
export { makeClient } from "./client";
export { buildGenerationPrompt } from "./prompts/strategies";
export { buildJudgePrompt } from "./prompts/judge";
export { buildExtractPrompt } from "./prompts/extract";
export {
  buildDraftAnchorsPrompt,
  buildCanonicalSolutionPrompt,
  buildFewShotAnchorsPrompt,
} from "./prompts/anchors";

/**
 * Live provider when the user has pasted a key, demo provider otherwise.
 * The key is read from the Settings object only; never from the environment.
 */
export function createProvider(settings: Settings): LlmProvider {
  const key = typeof settings.apiKey === "string" ? settings.apiKey.trim() : "";
  if (key.length > 0) return createLiveProvider({ ...settings, apiKey: key });
  return createDemoProvider();
}
