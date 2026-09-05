import { cosine, pairwiseCosineMean, tfidfVectors } from "./cosine";

describe("tfidfVectors", () => {
  it("produces L2-normalised vectors over unigrams and bigrams", () => {
    const [v] = tfidfVectors(["red fish blue fish"]);
    expect([...v.keys()].sort()).toEqual(
      ["blue", "blue fish", "fish", "fish blue", "red", "red fish"].sort(),
    );
    let ss = 0;
    for (const w of v.values()) ss += w * w;
    expect(ss).toBeCloseTo(1, 10);
  });

  it("uses idf = ln((1+N)/(1+df)) + 1 with raw tf", () => {
    const vecs = tfidfVectors(["x y", "x y", "y x"]);
    const N = 3;
    const idf = (df: number) => Math.log((1 + N) / (1 + df)) + 1;
    // doc 0: x (df3), y (df3), "x y" (df2)
    const raw0 = [idf(3), idf(3), idf(2)];
    const norm0 = Math.sqrt(raw0.reduce((s, w) => s + w * w, 0));
    expect(vecs[0].get("x")).toBeCloseTo(idf(3) / norm0, 10);
    expect(vecs[0].get("x y")).toBeCloseTo(idf(2) / norm0, 10);
    expect(vecs[0].has("y x")).toBe(false);
  });
});

describe("cosine", () => {
  it("identical = 1, disjoint = 0, empty = 0", () => {
    const [a, b, c] = tfidfVectors(["alpha beta gamma", "alpha beta gamma", "delta epsilon"]);
    expect(cosine(a, b)).toBeCloseTo(1, 10);
    expect(cosine(a, c)).toBe(0);
    expect(cosine(new Map(), a)).toBe(0);
  });
});

describe("pairwiseCosineMean", () => {
  it("is 0 for fewer than two texts", () => {
    expect(pairwiseCosineMean([])).toBe(0);
    expect(pairwiseCosineMean(["only one"])).toBe(0);
  });

  it("mean of three texts: two identical, one disjoint → 1/3", () => {
    // 'a' is a stop word under metric v2; use content tokens.
    expect(pairwiseCosineMean(["alpha", "alpha", "beta"])).toBeCloseTo(1 / 3, 10);
  });

  it("mean of three texts with shared unigrams, hand-computed", () => {
    const N = 3;
    const idf = (df: number) => Math.log((1 + N) / (1 + df)) + 1;
    // doc0 = doc1 = {x, y, "x y"}; doc2 = {x, y, "y x"}
    const n0 = Math.sqrt(2 * idf(3) ** 2 + idf(2) ** 2);
    const n2 = Math.sqrt(2 * idf(3) ** 2 + idf(1) ** 2);
    const cos02 = (2 * idf(3) ** 2) / (n0 * n2);
    const expected = (1 + cos02 + cos02) / 3;
    expect(pairwiseCosineMean(["x y", "x y", "y x"])).toBeCloseTo(expected, 10);
    expect(expected).toBeGreaterThan(0.6);
    expect(expected).toBeLessThan(0.7);
  });
});
