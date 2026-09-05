import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { SAMPLES, SAMPLE_IDS, sampleById } from "./samples";

const PUB = join(process.cwd(), "public", "samples");

describe("sample assessments index", () => {
  it("has five samples from five industries", () => {
    expect(SAMPLES).toHaveLength(5);
    expect(new Set(SAMPLES.map((s) => s.industry)).size).toBe(5);
    expect([...SAMPLE_IDS]).toEqual(SAMPLES.map((s) => s.id));
  });

  it.each(SAMPLES.map((s) => [s.id]))("%s deep-equals its public manifest and its files exist", (id) => {
    const dir = join(PUB, id);
    const manifest = JSON.parse(readFileSync(join(dir, "manifest.json"), "utf8"));
    expect(sampleById(id)).toEqual(manifest);
    for (const f of manifest.files) expect(existsSync(join(dir, f.path))).toBe(true);
    const assignment = readFileSync(join(dir, "assignment.md"), "utf8");
    expect(assignment).toMatch(/## Rubric/);
    expect(assignment).toMatch(/## What you must produce/);
    expect(manifest.skills.length).toBeGreaterThanOrEqual(4);
    expect(manifest.preExtracted).toBeNull();
  });
});
