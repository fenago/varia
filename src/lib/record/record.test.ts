import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { SAMPLE_IDS } from "@shared/samples";
import { createDemoProvider } from "@lib/store/demoProvider";
import { recordSample } from "./recordSample";

const root = path.resolve(__dirname, "..", "..", "..");
const read = (id: string) => (p: string) => readFile(path.join(root, "public", "samples", id, p), "utf8");

describe("recordSample (dry run with the demo provider)", () => {
  it("produces a complete fixture for the first sample", async () => {
    const id = SAMPLE_IDS[0];
    const fx = await recordSample({ sampleId: id, provider: createDemoProvider(), readFile: read(id), n: 4, judgeSamples: 2 });
    expect(fx.version).toBe(1);
    expect(fx.sampleId).toBe(id);
    expect(fx.recordedWith).toBe("demo-provider");
    expect(fx.models.generator).toBeTruthy();
    expect(fx.blueprint.rubric.length).toBeGreaterThanOrEqual(3);
    expect(fx.blueprint.rubric.every((c) => c.anchors?.length === 4)).toBe(true);
    expect(fx.blueprint.canonicalSolution.length).toBeGreaterThan(200);
    expect(fx.roster.students.length).toBeGreaterThanOrEqual(24);
    expect(fx.run.n).toBe(4);
    expect(fx.run.variants.length).toBe(4);
    expect(fx.run.variants.every((v) => v.text && v.adaptedSolution)).toBe(true);
    expect(fx.run.variants.every((v) => v.metrics.equivalence != null)).toBe(true);
    expect(fx.run.report).not.toBeNull();
    expect(["complete", "partial"]).toContain(fx.run.status);
    expect(fx.extraction.by).toBe("local parser");
    // Variants are assigned to roster students in order.
    expect(fx.run.variants[0].studentId).toBe(fx.roster.students[0].id);
  }, 30000);

  it("records every sample without unresolved extraction problems", async () => {
    for (const id of SAMPLE_IDS) {
      const fx = await recordSample({ sampleId: id, provider: createDemoProvider(), readFile: read(id), n: 2, judgeSamples: 1 });
      expect(fx.extraction.unresolved, id).toEqual([]);
      expect(fx.run.variants.length, id).toBe(2);
    }
  }, 60000);
});
