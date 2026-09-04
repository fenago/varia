import { jaccard, pairwiseJaccard4Mean, tokenize, wordNgrams } from "./ngram";

describe("tokenize / wordNgrams", () => {
  it("lowercases and keeps alphanumerics", () => {
    expect(tokenize("Hello, World! v2")).toEqual(["hello", "world", "v2"]);
    expect(tokenize("")).toEqual([]);
  });

  it("builds n-grams", () => {
    expect([...wordNgrams(["a", "b", "c", "d"], 2)]).toEqual(["a b", "b c", "c d"]);
    expect(wordNgrams(["a", "b"], 4).size).toBe(0);
  });
});

describe("jaccard", () => {
  it("identical = 1, disjoint = 0, both empty = 0", () => {
    const a = new Set(["x", "y"]);
    expect(jaccard(a, new Set(a))).toBe(1);
    expect(jaccard(a, new Set(["p", "q"]))).toBe(0);
    expect(jaccard(new Set(), new Set())).toBe(0);
    expect(jaccard(new Set(["x", "y", "z"]), new Set(["y", "z", "w"]))).toBeCloseTo(0.5, 10);
  });
});

describe("pairwiseJaccard4Mean", () => {
  it("identical texts → 1, disjoint → 0, <2 texts → 0", () => {
    const t = "one two three four five six";
    expect(pairwiseJaccard4Mean([t, t, t])).toBe(1);
    expect(
      pairwiseJaccard4Mean(["one two three four five", "six seven eight nine ten"]),
    ).toBe(0);
    expect(pairwiseJaccard4Mean([t])).toBe(0);
    expect(pairwiseJaccard4Mean([])).toBe(0);
  });

  it("averages over all unordered pairs", () => {
    const t = "one two three four five";
    // pairs: (t,t)=1, (t,other)=0, (t,other)=0 → 1/3
    expect(pairwiseJaccard4Mean([t, t, "a b c d e"])).toBeCloseTo(1 / 3, 10);
  });
});
