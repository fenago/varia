import {
  countSentences,
  countSyllables,
  countWords,
  fleschReadingEase,
  stepCount,
  typeTokenRatio,
} from "./flesch";

describe("countSyllables", () => {
  it.each([
    ["the", 1],
    ["table", 2],
    ["audit", 2],
    ["classifier", 3], // heuristic: a / i / ie vowel groups
    ["walked", 1],
    ["audited", 3],
    ["make", 1],
    ["whale", 1],
    ["simple", 2],
    ["yellow", 2],
    ["classes", 2],
    ["action", 2],
    ["cat", 1],
    ["", 1],
    ["42", 1],
  ])("%s → %d", (word, n) => {
    expect(countSyllables(word)).toBe(n);
  });
});

describe("countWords / countSentences", () => {
  it("counts words with apostrophes and digits", () => {
    expect(countWords("Don't count 3 things twice.")).toBe(5);
    expect(countWords("")).toBe(0);
  });

  it("counts sentences by terminal punctuation, min 1", () => {
    expect(countSentences("Hello world. How are you? Fine!")).toBe(3);
    expect(countSentences("no terminal punctuation")).toBe(1);
    expect(countSentences("")).toBe(1);
  });
});

describe("fleschReadingEase", () => {
  it("matches a hand computation", () => {
    // 6 words, 1 sentence, 6 syllables → 206.835 − 1.015·6 − 84.6·1 = 116.145
    expect(fleschReadingEase("The cat sat on the mat.")).toBeCloseTo(116.145, 3);
  });

  it("is 0 for empty text and is not clamped", () => {
    expect(fleschReadingEase("")).toBe(0);
    expect(fleschReadingEase("   ")).toBe(0);
    const dense =
      "Organisational epistemological considerations necessitate multidimensional interpretability investigations.";
    expect(fleschReadingEase(dense)).toBeLessThan(0);
  });
});

describe("typeTokenRatio", () => {
  it("unique / total over lowercase alpha tokens", () => {
    expect(typeTokenRatio("The cat and the dog")).toBeCloseTo(0.8, 10);
    expect(typeTokenRatio("")).toBe(0);
    expect(typeTokenRatio("a a a a")).toBe(0.25);
  });
});

describe("stepCount", () => {
  it("counts numbered, bulleted and Step/Finding lines", () => {
    const text = [
      "Intro paragraph without markers.",
      "1. First",
      "2) Second",
      "- third",
      "• fourth",
      "* fifth",
      "Step 6: do the thing",
      "Finding 7 — something",
      "## Step 8",
      "**Finding 9**",
      "",
      "-5 is a negative number, not a bullet",
    ].join("\n");
    expect(stepCount(text)).toBe(9);
  });

  it("is 0 when nothing looks like a step", () => {
    expect(stepCount("Just prose.\nMore prose.")).toBe(0);
    expect(stepCount("")).toBe(0);
  });
});
