import { describe, expect, it } from "vitest";
import type { Blueprint, GenerateVariantInput, Strategy } from "@shared/types";
import { COST_MODEL, DEFAULT_THRESHOLDS } from "@shared/thresholds";
import { buildGenerationPrompt } from "./strategies";
import { buildJudgePrompt } from "./judge";
import { buildExtractPrompt } from "./extract";
import { buildFewShotAnchorsPrompt } from "./anchors";

import { estimateRunCost } from "../cost";

const blueprint: Blueprint = {
  id: "bp-test",
  code: "B1",
  name: "Model card audit",
  courseId: "c1",
  construct:
    "Given a deployed classifier scenario and a partial model card, produce a structured audit that identifies fairness, robustness and documentation gaps.",
  constructDimensions: ["Identifies fairness gaps", "Identifies robustness gaps", "Identifies documentation gaps"],
  rubric: [
    { id: "c1", name: "Fairness analysis", points: 10, weight: 0.4, levels: 4, anchors: ["none", "weak", "good", "expert"], anchorsConfidence: "high" },
    { id: "c2", name: "Robustness analysis", points: 10, weight: 0.4, levels: 4, anchors: null, anchorsConfidence: "missing" },
    { id: "c3", name: "Documentation gaps", points: 5, weight: 0.2, levels: 4, anchors: null, anchorsConfidence: "missing" },
  ],
  canonicalSolution: "1. Subgroup FPR gap.\n2. Shift sensitivity.\n3. Missing intended-use section.",
  canonicalSolutionSource: "found",
  surfaceDimensions: [
    { key: "domain", label: "Domain", values: ["lending", "hiring"], locked: false, enabled: true, note: "2 found" },
    { key: "stakeholder", label: "Stakeholder", values: ["CRO", "HR director"], locked: false, enabled: true, note: "2 drafted" },
    { key: "scenario", label: "Scenario", values: [], locked: false, enabled: false },
    { key: "jargon", label: "Jargon", values: [], locked: false, enabled: true },
    { key: "readingLevel", label: "Reading level", values: [], locked: true, enabled: false, note: "held constant" },
    { key: "stepCount", label: "Step count", values: [], locked: true, enabled: false, note: "held constant" },
  ],
  taskPrompt: "You are handed a partial model card for a loan-approval classifier. Write an audit memo.",
  source: { files: [], extractedAt: null, extractionConfidence: null },
  fewShotAnchors: {
    positive: ["POSITIVE ANCHOR ONE text", "POSITIVE ANCHOR TWO text"],
    negative: ["NEAR COPY anchor text", "DRIFTED anchor text"],
  },
  createdAt: "2026-09-01T00:00:00Z",
  updatedAt: "2026-09-01T00:00:00Z",
};

function input(strategy: Strategy): GenerateVariantInput {
  return {
    blueprint,
    strategy,
    index: 3,
    n: 34,
    surfaceAssignment: { domain: "hospital triage", stakeholder: "chief medical officer", jargon: "clinical" },
    priorVariantTexts: ["A".repeat(500), "Second prior variant about shipping logistics"],
    generatorModel: "claude-opus-5",
  };
}

describe("buildGenerationPrompt", () => {
  it("zero-shot states the four properties as constraints and no examples", () => {
    const p = buildGenerationPrompt(input("zero-shot"), DEFAULT_THRESHOLDS);
    expect(p.schema).toBe("variant");
    expect(p.system).toMatch(/P1 Surface diversity/);
    expect(p.system).toMatch(/P2 Construct equivalence/);
    expect(p.system).toMatch(/P3 Rubric stability/);
    expect(p.system).toMatch(/P4 Difficulty parity/);
    expect(p.system).toMatch(/zero-shot/);
    expect(p.user).not.toMatch(/POSITIVE ANCHOR/);
  });

  it("few-shot includes the cached positive and negative anchors", () => {
    const p = buildGenerationPrompt(input("few-shot"), DEFAULT_THRESHOLDS);
    expect(p.schema).toBe("variant");
    expect(p.user).toContain("POSITIVE ANCHOR ONE text");
    expect(p.user).toContain("POSITIVE ANCHOR TWO text");
    expect(p.user).toContain("NEAR COPY anchor text");
    expect(p.user).toContain("DRIFTED anchor text");
    expect(p.system).toMatch(/paraphrastic near-copy/i);
    expect(p.system).toMatch(/construct drift/i);
  });

  it("structured-cot asks for constructMap → surfacePlan → draft → self-check → final", () => {
    const p = buildGenerationPrompt(input("structured-cot"), DEFAULT_THRESHOLDS);
    expect(p.schema).toBe("structured-cot");
    expect(p.system).toMatch(/self-check/i);
    const strategyBlock = p.system.slice(p.system.indexOf("STRATEGY: structured chain-of-thought"));
    const order = ["constructMap", "surfacePlan", "draft", "selfCheck", "final", "adaptedSolution"].map((k) =>
      strategyBlock.indexOf(k),
    );
    expect(order.every((i) => i >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });

  it("dimension-preserving fixes the assignment tuple and states parity constraints", () => {
    const p = buildGenerationPrompt(input("dimension-preserving"), DEFAULT_THRESHOLDS);
    expect(p.schema).toBe("variant");
    expect(p.user).toMatch(/MANDATORY SURFACE ASSIGNMENT/);
    expect(p.user).toContain("domain: hospital triage");
    expect(p.user).toContain("stakeholder: chief medical officer");
    expect(p.user).toContain("jargon: clinical");
    expect(p.system).toMatch(/same reading level/i);
    expect(p.system).toMatch(/same number of required findings or steps/i);
    expect(p.system).toMatch(/same number of rubric criteria/i);
    expect(p.system).toContain("(3)");
  });

  it("every strategy carries prior-variant summaries, the adapted solution and the rubric criteria", () => {
    const strategies: Strategy[] = ["zero-shot", "few-shot", "structured-cot", "dimension-preserving"];
    for (const s of strategies) {
      const p = buildGenerationPrompt(input(s), DEFAULT_THRESHOLDS);
      expect(p.user).toMatch(/must differ in scenario from all of these/);
      expect(p.user).toContain("Second prior variant about shipping logistics");
      // 500 A's are truncated to 200 + ellipsis
      expect(p.user).toContain("A".repeat(200) + "…");
      expect(p.user).not.toContain("A".repeat(201));
      expect(p.system).toMatch(/adaptedSolution/);
      expect(p.system).toContain("Fairness analysis; Robustness analysis; Documentation gaps");
      expect(p.user).toContain("Reading level");
      expect(p.user).toContain("LOCKED");
    }
  });

  it("caps prior variants at the eight most recent", () => {
    const many = Array.from({ length: 12 }, (_, i) => `prior-${i}`);
    const p = buildGenerationPrompt({ ...input("zero-shot"), priorVariantTexts: many }, DEFAULT_THRESHOLDS);
    expect(p.user).toContain("prior-11");
    expect(p.user).toContain("prior-4");
    expect(p.user).not.toContain("prior-3\n");
    expect(p.user).not.toMatch(/\bprior-0\b/);
  });
});

describe("buildJudgePrompt", () => {
  it("shows construct, dimensions, criteria, original and exactly one candidate", () => {
    const p = buildJudgePrompt(blueprint, "CANDIDATE TEXT");
    expect(p.user).toContain(blueprint.construct);
    for (const d of blueprint.constructDimensions) expect(p.user).toContain(d);
    expect(p.user).toContain("Fairness analysis");
    expect(p.user).toContain(blueprint.taskPrompt);
    expect(p.user).toContain("CANDIDATE TEXT");
    expect(p.user.match(/<candidate_task>/g)?.length).toBe(1);
    expect(p.system).toMatch(/1 to 5/);
    expect(p.system).toMatch(/two sentences/i);
  });
});

describe("buildExtractPrompt", () => {
  it("wraps the raw text and asks for the locked dimensions", () => {
    const p = buildExtractPrompt({
      files: [{ name: "task.docx", kind: "task+rubric", recognisedAs: "Task prompt + rubric", sizeBytes: 10, status: "read" }],
      rawText: "RAW MATERIAL",
      course: { id: "c1", code: "DAT 4100", term: "Fall 2026", title: "Applied AI", instructor: { name: "E. Lee", institution: "X", role: "Instructor" } },
    });
    expect(p.user).toContain("RAW MATERIAL");
    expect(p.user).toContain("task.docx");
    expect(p.system).toMatch(/Given X, produce Y/);
    expect(p.system).toMatch(/readingLevel, stepCount — locked = true/);
    expect(p.system).toMatch(/held constant/);
  });
});

describe("buildFewShotAnchorsPrompt", () => {
  it("asks for two positives and the two named negatives", () => {
    const p = buildFewShotAnchorsPrompt(blueprint, DEFAULT_THRESHOLDS);
    expect(p.system).toMatch(/paraphrastic near-copy/);
    expect(p.system).toMatch(/construct-drifted/);
    expect(p.system).toMatch(/positive\[0\] and positive\[1\]/);
  });
});

describe("estimateRunCost", () => {
  it("matches the mockup's ~$0.60 for 34 variants × 5 judge samples", () => {
    const { usd, minutes } = estimateRunCost(34, 5);
    expect(usd).toBeGreaterThanOrEqual(0.4);
    expect(usd).toBeLessThanOrEqual(0.9);
    // Formula from the build spec: ceil(n · perVariantSeconds / 60 / 3), generation 3-wide.
    const expectedMinutes = Math.ceil((34 * COST_MODEL.perVariantSeconds) / 60 / 3);
    expect(minutes).toBe(expectedMinutes);
    expect(minutes).toBeGreaterThanOrEqual(1);
    expect(minutes).toBeLessThanOrEqual(5);
  });
});
