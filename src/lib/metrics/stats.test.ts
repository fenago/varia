import { clamp01, mean, median, stddev } from "./stats";

describe("stats", () => {
  it("mean", () => {
    expect(mean([])).toBe(0);
    expect(mean([1, 2, 3, 4])).toBe(2.5);
  });

  it("stddev population vs sample", () => {
    const xs = [2, 4, 4, 4, 5, 5, 7, 9]; // classic: population σ = 2
    expect(stddev(xs)).toBeCloseTo(2, 10);
    expect(stddev(xs, true)).toBeCloseTo(2, 10);
    expect(stddev(xs, false)).toBeCloseTo(Math.sqrt(32 / 7), 10);
    expect(stddev([])).toBe(0);
    expect(stddev([5], false)).toBe(0);
    expect(stddev([5], true)).toBe(0);
  });

  it("median odd, even, empty", () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 3, 2])).toBe(2.5);
    expect(median([])).toBe(0);
  });

  it("clamp01", () => {
    expect(clamp01(-1)).toBe(0);
    expect(clamp01(0.4)).toBe(0.4);
    expect(clamp01(7)).toBe(1);
    expect(clamp01(Number.NaN)).toBe(0);
  });
});
