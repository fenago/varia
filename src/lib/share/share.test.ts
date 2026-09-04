import { describe, expect, it } from "vitest";
import { decodePackage, encodePackage } from "./index";

function bigObject(): Record<string, unknown> {
  const words = ["stakeholder", "classifier", "rubric", "variant", "audit", "fairness", "robustness", "documentation"];
  const variants = Array.from({ length: 40 }, (_, i) => ({
    id: `v-${String(i + 1).padStart(2, "0")}`,
    text: Array.from({ length: 60 }, (_, j) => words[(i + j) % words.length]).join(" "),
    surfaceAssignment: { domain: words[i % 4], stakeholder: words[(i + 2) % 8] },
  }));
  return { version: 1, issuedAt: "2026-09-04T10:00:00Z", blueprint: { name: "Model card audit", rubric: [{ id: "c1", name: "Fairness", points: 3 }] }, variants };
}

describe("share codec", () => {
  it("round-trips a ~20 KB object", async () => {
    const obj = bigObject();
    const json = JSON.stringify(obj);
    expect(json.length).toBeGreaterThan(15_000);
    const encoded = await encodePackage(obj);
    expect(encoded.startsWith("d:") || encoded.startsWith("u:")).toBe(true);
    // URL-safe: no +, /, =
    expect(/^[du]:[A-Za-z0-9_-]+$/.test(encoded)).toBe(true);
    const back = await decodePackage<typeof obj>(encoded);
    expect(back).toEqual(obj);
  });

  it("compresses when the runtime supports CompressionStream", async () => {
    const obj = bigObject();
    const encoded = await encodePackage(obj);
    if (typeof CompressionStream === "function") {
      expect(encoded.startsWith("d:")).toBe(true);
      expect(encoded.length).toBeLessThan(JSON.stringify(obj).length / 2);
    } else {
      expect(encoded.startsWith("u:")).toBe(true);
    }
  });

  it("uncompressed fallback round-trips and decodes without CompressionStream", async () => {
    const obj = { a: 1, b: "two", c: [3, 4, { d: "é ü — unicode" }] };
    const json = new TextEncoder().encode(JSON.stringify(obj));
    const b64 = btoa(String.fromCharCode(...json)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    const back = await decodePackage<typeof obj>("u:" + b64);
    expect(back).toEqual(obj);
  });

  it("rejects strings that are not share links", async () => {
    await expect(decodePackage("hello")).rejects.toThrow(/Not a VARIA share link/);
  });
});
