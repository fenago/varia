import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { SourceFile } from "@shared/types";
import { SAMPLES } from "@shared/samples";
import { detectKind, parseRosterCsv } from "./index";
import { localExtract, parseRubric } from "./localExtract";

const PUB = join(process.cwd(), "public", "samples");

function sourcesFor(id: string): { sources: SourceFile[]; rosterCsv: string } {
  const sample = SAMPLES.find((s) => s.id === id)!;
  const sources: SourceFile[] = [];
  let rosterCsv = "";
  for (const f of sample.files) {
    const text = readFileSync(join(PUB, id, f.path), "utf8");
    if (f.path.endsWith(".csv")) {
      rosterCsv = text;
      continue;
    }
    const { kind, recognisedAs } = detectKind(f.name, text);
    sources.push({ name: f.name, kind, recognisedAs, sizeBytes: text.length, status: "read", text });
  }
  return { sources, rosterCsv };
}

describe("local extraction of the bundled samples", () => {
  it.each(SAMPLES.map((s) => [s.id, s]))("%s yields a complete draft", (id, sample) => {
    const { sources, rosterCsv } = sourcesFor(id);
    // The real ingest classifier must see the assignment as task+rubric and the answer as solution.
    expect(sources.find((s) => s.name === "assignment.md")?.kind).toBe("task+rubric");
    expect(sources.find((s) => s.name === "model-answer.md")?.kind).toBe("solution");

    const draft = localExtract(sources, sample);
    expect(draft.rubric).toHaveLength(4);
    for (const c of draft.rubric) {
      expect(c.anchors).not.toBeNull();
      expect(c.anchors!.every((a) => a.length > 10)).toBe(true);
      expect(c.points).toBe(3);
      expect(c.skillKeys?.length).toBeGreaterThan(0);
    }
    expect(Math.abs(draft.rubric.reduce((a, c) => a + c.weight, 0) - 1)).toBeLessThan(0.01);
    expect(draft.construct.length).toBeGreaterThan(40);
    expect(draft.canonicalSolution.length).toBeGreaterThan(2000);
    expect(draft.canonicalSolutionSource).toBe("found");
    expect(draft.taskPrompt).not.toMatch(/## Rubric/);
    expect(draft.surfaceDimensions.filter((d) => d.locked).map((d) => d.key)).toEqual(["readingLevel", "stepCount"]);
    expect(draft.surfaceDimensions.find((d) => d.key === "scenario")!.values.length).toBeGreaterThanOrEqual(1);
    expect(draft.constructDimensions).toHaveLength(4);

    const roster = parseRosterCsv(rosterCsv, "roster.csv", "x");
    expect(roster.students.length).toBeGreaterThanOrEqual(24);
    expect(roster.students.length).toBeLessThanOrEqual(32);
    expect(roster.students.every((s) => /^[^,]+, \p{Lu}\.$/u.test(s.name))).toBe(true);
  });

  it("parseRubric reads criterion headings and four levels", () => {
    const md = "## Rubric\n\n### Clarity (3 points)\n- 0: none\n- 1: some clarity here\n- 2: mostly clear writing\n- 3: fully clear writing\n";
    const r = parseRubric(md);
    expect(r.criteria).toHaveLength(1);
    expect(r.criteria[0].name).toBe("Clarity");
    expect(r.criteria[0].anchors?.[3]).toBe("fully clear writing");
  });
});
