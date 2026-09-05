import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { BlueprintDraft, SourceFile } from "@shared/types";
import { sampleById } from "@shared/samples";
import { guardDraft } from "./extractGuard";

const root = path.resolve(__dirname, "..", "..", "..");
const sample = sampleById("ml-lending-fairness-audit")!;
const files: SourceFile[] = sample.files
  .filter((f) => !f.name.endsWith(".csv"))
  .map((f) => ({
    name: f.name,
    kind: f.kind,
    recognisedAs: f.kind,
    sizeBytes: 1,
    status: "read",
    text: readFileSync(path.join(root, "public", "samples", sample.id, f.path), "utf8"),
  }));

function thinDraft(): BlueprintDraft {
  return {
    name: "Thin",
    construct: "",
    constructDimensions: [],
    rubric: [
      { id: "a", name: "Fairness gaps with evidence", points: 3, weight: 0.5, levels: 4, anchors: null, anchorsConfidence: "missing" },
      { id: "b", name: "Robustness under subgroup shift", points: 3, weight: 0.5, levels: 4, anchors: null, anchorsConfidence: "missing" },
    ],
    canonicalSolution: "",
    canonicalSolutionSource: "drafted",
    surfaceDimensions: [{ key: "domain", label: "Domain", values: ["lending"], locked: false, enabled: true }],
    taskPrompt: "",
    source: { files: [], extractedAt: null, extractionConfidence: "high" },
    fewShotAnchors: null,
    lastUsed: null,
  };
}

describe("guardDraft", () => {
  it("repairs a thin live extraction from the source files", () => {
    const { draft, repairs, unresolved } = guardDraft(thinDraft(), files, sample);
    expect(unresolved).toEqual([]);
    expect(draft.rubric.length).toBeGreaterThanOrEqual(3);
    expect(draft.rubric.every((c) => c.anchors?.length === 4)).toBe(true);
    expect(Math.abs(draft.rubric.reduce((a, c) => a + c.weight, 0) - 1)).toBeLessThan(0.02);
    expect(draft.construct.length).toBeGreaterThan(20);
    expect(draft.constructDimensions.length).toBeGreaterThanOrEqual(2);
    expect(draft.canonicalSolution.length).toBeGreaterThan(200);
    expect(draft.surfaceDimensions.map((d) => d.key)).toEqual(expect.arrayContaining(["domain", "stakeholder", "scenario", "jargon", "readingLevel", "stepCount"]));
    expect(draft.surfaceDimensions.find((d) => d.key === "readingLevel")?.locked).toBe(true);
    expect(draft.source.extractionConfidence).toBe("medium");
    expect(repairs.length).toBeGreaterThan(0);
  });

  it("leaves a complete draft untouched", () => {
    const good = guardDraft(thinDraft(), files, sample).draft;
    const again = guardDraft(good, files, sample);
    expect(again.repairs).toEqual([]);
    expect(again.draft.rubric.length).toBe(good.rubric.length);
  });

  it("reports what it cannot repair without a rubric in the text", () => {
    const noText: SourceFile[] = [{ name: "notes.txt", kind: "task", recognisedAs: "Task", sizeBytes: 1, status: "read", text: "Write something." }];
    const { unresolved } = guardDraft({ ...thinDraft(), rubric: [] }, noText);
    expect(unresolved.some((u) => /rubric/.test(u))).toBe(true);
  });
});
