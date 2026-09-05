import { describe, expect, it } from "vitest";
import type { Blueprint, GenerateVariantInput, Strategy } from "@shared/types";
import { DEFAULT_THRESHOLDS } from "@shared/thresholds";
import { modelSpec } from "@shared/models";
import { lendingBlueprint } from "@lib/store/testWorkspace";
import { CACHE_CONTROL, buildGenerationRequest, buildJudgeRequest, buildPreScoreRequest, shapeRequest } from "./live";

type TextBlock = { type: "text"; text: string; cache_control?: { type: string } };

/** The two text blocks of the single user message. */
function blocks(messages: unknown[]): [TextBlock, TextBlock] {
  expect(messages).toHaveLength(1);
  const m = messages[0] as { role: string; content: TextBlock[] };
  expect(m.role).toBe("user");
  expect(m.content).toHaveLength(2);
  return [m.content[0], m.content[1]];
}

/** Rough token count (4 chars per token), enough to compare against the cache minimums. */
const approxTokens = (s: string) => Math.round(s.length / 4);

function variantInput(bp: Blueprint, strategy: Strategy, index: number): GenerateVariantInput {
  const assignments = [
    { domain: "lending", stakeholder: "chief risk officer", jargon: "banking" },
    { domain: "hospital triage", stakeholder: "chief medical officer", jargon: "clinical" },
  ];
  return {
    blueprint: bp,
    strategy,
    index,
    n: 30,
    surfaceAssignment: assignments[index % 2],
    priorVariantTexts: Array.from({ length: index }, (_, i) => `Prior variant ${i} about something else entirely.`),
    generatorModel: "claude-opus-5",
    advanced: { negativeAnchors: true, constructMap: true, readabilityBand: 8, outlierSigma: 1, outlierMinNamed: 2, concurrencyGenerate: 3, concurrencyJudge: 4 },
  };
}

const bp: Blueprint = {
  ...lendingBlueprint(),
  fewShotAnchors: { positive: ["POSITIVE ONE", "POSITIVE TWO"], negative: ["NEAR COPY", "DRIFT"] },
};

describe("prompt caching: request structure", () => {
  const strategies: Strategy[] = ["zero-shot", "few-shot", "structured-cot", "dimension-preserving"];

  it.each(strategies)("%s: system and the first user block are byte-identical across two variants of one run; only the tail differs", (strategy) => {
    const a = buildGenerationRequest(variantInput(bp, strategy, 0), DEFAULT_THRESHOLDS);
    const b = buildGenerationRequest(variantInput(bp, strategy, 7), DEFAULT_THRESHOLDS);
    expect(a.base.system).toBe(b.base.system);
    const [aStable, aVolatile] = blocks(a.base.messages);
    const [bStable, bVolatile] = blocks(b.base.messages);
    expect(aStable).toEqual(bStable);
    expect(aStable.cache_control).toEqual(CACHE_CONTROL);
    expect(bVolatile.cache_control).toBeUndefined();
    expect(aVolatile.text).not.toBe(bVolatile.text);
    // The per-call material sits after the breakpoint, never before it.
    expect(bVolatile.text).toContain("hospital triage");
    expect(bVolatile.text).toContain("Prior variant 6");
    expect(bVolatile.text).toContain("version 8 of 30");
    expect(bStable.text).not.toContain("hospital triage");
    expect(bStable.text).not.toContain("Prior variant");
    expect(b.base.system).not.toMatch(/version 8/);
    // The stable block carries the blueprint, rubric and canonical solution.
    expect(aStable.text).toContain("<original_task>");
    expect(aStable.text).toContain("<canonical_solution>");
    expect(aStable.text).toContain("RUBRIC");
  });

  it("the stable part carries no timestamps or ids", () => {
    const { base } = buildGenerationRequest(variantInput(bp, "structured-cot", 2), DEFAULT_THRESHOLDS);
    const [stable] = blocks(base.messages);
    const prefix = base.system + stable.text;
    expect(prefix).not.toMatch(/\d{4}-\d{2}-\d{2}T/);
    expect(prefix).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}/);
    expect(prefix).not.toContain(bp.id);
  });

  it("few-shot anchors and dimension-preserving parity counts are in the cached part", () => {
    const fs = buildGenerationRequest(variantInput(bp, "few-shot", 1), DEFAULT_THRESHOLDS);
    expect(blocks(fs.base.messages)[0].text).toContain("POSITIVE ONE");
    expect(blocks(fs.base.messages)[0].text).toContain("NEAR COPY");
    const dp = buildGenerationRequest(variantInput(bp, "dimension-preserving", 1), DEFAULT_THRESHOLDS);
    expect(dp.base.system).toMatch(/same number of rubric criteria referenced \(\d+\)/);
    expect(blocks(dp.base.messages)[1].text).toContain("MANDATORY SURFACE ASSIGNMENT");
  });

  it("judge: every sample of every variant shares the prefix; the candidate is the tail", () => {
    const a = buildJudgeRequest({ blueprint: bp, variantText: "CANDIDATE A" }, "claude-sonnet-5");
    const b = buildJudgeRequest({ blueprint: bp, variantText: "CANDIDATE B" }, "claude-sonnet-5");
    expect(a.system).toBe(b.system);
    const [aStable, aVolatile] = blocks(a.messages);
    const [bStable, bVolatile] = blocks(b.messages);
    expect(aStable).toEqual(bStable);
    expect(aStable.cache_control).toEqual(CACHE_CONTROL);
    expect(aStable.text).toContain("<original_task>");
    expect(aStable.text).not.toContain("CANDIDATE");
    expect(aVolatile.text).toContain("CANDIDATE A");
    expect(bVolatile.text).toContain("CANDIDATE B");
  });

  it("pre-score: the rubric is cached; the version and the submission are the tail", () => {
    const variant = { id: "v-01", text: "VERSION TEXT", adaptedSolution: "ADAPTED" };
    const a = buildPreScoreRequest({ blueprint: bp, variant, submissionText: "SUBMISSION ONE" }, "claude-sonnet-5");
    const b = buildPreScoreRequest({ blueprint: bp, variant: { ...variant, id: "v-02" }, submissionText: "SUBMISSION TWO" }, "claude-sonnet-5");
    const [aStable, aVolatile] = blocks(a.messages);
    const [bStable, bVolatile] = blocks(b.messages);
    expect(aStable).toEqual(bStable);
    expect(aStable.cache_control).toEqual(CACHE_CONTROL);
    expect(aStable.text).toContain("RUBRIC");
    expect(aStable.text).not.toContain("v-01");
    expect(aVolatile.text).toContain("SUBMISSION ONE");
    expect(bVolatile.text).toContain("v-02");
  });

  it("per-model shaping leaves the cached block and its breakpoint untouched", () => {
    const { base } = buildGenerationRequest(variantInput(bp, "zero-shot", 0), DEFAULT_THRESHOLDS);
    for (const id of ["claude-opus-5", "claude-sonnet-5", "claude-haiku-4-5", "claude-fable-5-1"]) {
      const shaped = shapeRequest(modelSpec(id)!, "generate", { ...base, model: id });
      expect(shaped.system).toBe(base.system);
      expect(shaped.messages).toEqual(base.messages);
    }
  });

  it("the demo blueprint's prefix clears the Opus 5 and Sonnet 5 minimums for every call kind", () => {
    const gen = buildGenerationRequest(variantInput(bp, "structured-cot", 0), DEFAULT_THRESHOLDS).base;
    const judge = buildJudgeRequest({ blueprint: bp, variantText: "x" }, "claude-sonnet-5");
    const pre = buildPreScoreRequest({ blueprint: bp, variant: { id: "v", text: "x", adaptedSolution: "y" }, submissionText: "z" }, "claude-sonnet-5");
    const prefixTokens = (r: { system: string; messages: unknown[] }) => approxTokens(r.system + blocks(r.messages)[0].text);
    expect(prefixTokens(gen)).toBeGreaterThanOrEqual(modelSpec("claude-sonnet-5")!.minCacheTokens);
    expect(prefixTokens(judge)).toBeGreaterThanOrEqual(modelSpec("claude-opus-5")!.minCacheTokens);
    expect(prefixTokens(pre)).toBeGreaterThanOrEqual(modelSpec("claude-opus-5")!.minCacheTokens);
  });
});
