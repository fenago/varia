import { describe, expect, it } from "vitest";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import {
  AnchorsSchema,
  BlueprintDraftSchema,
  CanonicalSolutionSchema,
  FewShotAnchorsSchema,
  JudgeSchema,
  StructuredCotSchema,
  VariantSchema,
  pairsToRecord,
} from "./schemas";

const all = {
  AnchorsSchema,
  BlueprintDraftSchema,
  CanonicalSolutionSchema,
  FewShotAnchorsSchema,
  JudgeSchema,
  StructuredCotSchema,
  VariantSchema,
};

/** Walk the wire schema and assert the structured-outputs rules the API enforces. */
function walk(node: unknown, path: string, problems: string[]) {
  if (!node || typeof node !== "object") return;
  const n = node as Record<string, unknown>;
  if (n.type === "object") {
    if (n.additionalProperties !== false) problems.push(`${path}: additionalProperties must be false`);
    const props = (n.properties ?? {}) as Record<string, unknown>;
    if (Object.keys(props).length === 0) problems.push(`${path}: empty object (a z.record leaked through)`);
    for (const [k, v] of Object.entries(props)) walk(v, `${path}.${k}`, problems);
  }
  if (n.type === "array") walk(n.items, `${path}[]`, problems);
  if (Array.isArray(n.anyOf)) n.anyOf.forEach((v, i) => walk(v, `${path}|${i}`, problems));
  for (const key of ["minimum", "maximum", "minLength", "maxLength", "minItems", "maxItems", "prefixItems"]) {
    if (key in n && !(key === "minItems" && (n[key] === 0 || n[key] === 1))) problems.push(`${path}: ${key} unsupported`);
  }
}

describe("structured-output schemas", () => {
  for (const [name, schema] of Object.entries(all)) {
    it(`${name} transforms to an API-safe JSON schema`, () => {
      const fmt = zodOutputFormat(schema);
      expect(fmt.type).toBe("json_schema");
      const problems: string[] = [];
      walk(fmt.schema, name, problems);
      expect(problems).toEqual([]);
    });
  }

  it("JudgeSchema validates a well-formed sample and rejects a bad one", () => {
    const fmt = zodOutputFormat(JudgeSchema);
    const ok = fmt.parse(JSON.stringify({ dimensionScores: [{ dimension: "A", score: 4 }], rationale: "x. y." }));
    expect(ok.dimensionScores[0].score).toBe(4);
    expect(() => fmt.parse(JSON.stringify({ dimensionScores: [{ dimension: "A", score: "high" }] }))).toThrow();
  });

  it("StructuredCotSchema keeps the paper's field order", () => {
    const keys = Object.keys(StructuredCotSchema.shape);
    expect(keys).toEqual(["constructMap", "surfacePlan", "draft", "selfCheck", "final", "adaptedSolution", "surfaceAssignment"]);
  });

  it("pairsToRecord converts key/value lists", () => {
    expect(pairsToRecord([{ key: " domain ", value: "lending " }, { key: "", value: "x" }])).toEqual({ domain: "lending" });
  });
});
