import { describe, expect, it } from "vitest";
import { describeProgress, etaText, formatElapsed, progressStart, progressUpdate } from "./progress";

describe("progressUpdate", () => {
  it("sets startedAt once and resets phaseStartedAt on phase change", () => {
    const t0 = 1_000_000;
    let p = progressStart(10, "queued", "Queued", t0);
    p = progressUpdate(p, { phase: "generating", message: "Generating 10 versions", now: t0 + 500 });
    expect(p.startedAt).toBe(new Date(t0).toISOString());
    expect(p.phaseStartedAt).toBe(new Date(t0 + 500).toISOString());
    const s = p.startedAt;
    p = progressUpdate(p, { phase: "judging", message: "Judging · 5 samples", now: t0 + 9_000 });
    expect(p.startedAt).toBe(s);
    expect(p.phaseStartedAt).toBe(new Date(t0 + 9_000).toISOString());
  });

  it("estimates remaining time from observed per-item durations", () => {
    const t0 = 0;
    let p = progressStart(10, "generating", "Generating", t0);
    expect(p.etaSeconds).toBeNull();
    p = progressUpdate(p, { done: 1, itemJustFinished: true, now: t0 + 10_000 }); // 10 s
    p = progressUpdate(p, { done: 2, itemJustFinished: true, now: t0 + 20_000 }); // 10 s
    p = progressUpdate(p, { done: 3, itemJustFinished: true, now: t0 + 30_000 }); // 10 s
    expect(p.etaSeconds).toBeGreaterThanOrEqual(60);
    expect(p.etaSeconds).toBeLessThanOrEqual(80);
    // A new phase forgets the old pace.
    p = progressUpdate(p, { phase: "judging", done: 0, total: 50, message: "Judging · 5 samples", now: t0 + 31_000 });
    expect(p.etaSeconds).toBeNull();
    p = progressUpdate(p, { done: 5, itemJustFinished: true, now: t0 + 33_000 });
    expect(p.etaSeconds).not.toBeNull();
  });

  it("tracks current and lastDone and clears current when terminal", () => {
    let p = progressStart(3, "generating", "Generating", 0);
    p = progressUpdate(p, { current: "v-01 · writing", now: 1 });
    expect(p.current).toBe("v-01 · writing");
    p = progressUpdate(p, { done: 1, lastDone: "v-01 generated (900 words)", current: "v-02 · writing", itemJustFinished: true, now: 5_000 });
    expect(p.lastDone).toBe("v-01 generated (900 words)");
    expect(p.current).toBe("v-02 · writing");
    p = progressUpdate(p, { phase: "complete", done: 3, message: "All done", now: 20_000 });
    expect(p.current).toBeUndefined();
    expect(p.etaSeconds).toBe(0);
    expect(p.lastDone).toBe("v-01 generated (900 words)");
  });

  it("appends warnings without duplicates and caps them", () => {
    let p = progressStart(2, "generating", "Generating", 0);
    p = progressUpdate(p, { warning: "v-01: retried after a rate limit", now: 1 });
    p = progressUpdate(p, { warning: "v-01: retried after a rate limit", now: 2 });
    p = progressUpdate(p, { warning: "v-02 failed: refusal", now: 3 });
    expect(p.warnings).toEqual(["v-01: retried after a rate limit", "v-02 failed: refusal"]);
    for (let i = 0; i < 30; i++) p = progressUpdate(p, { warning: `w${i}`, now: 10 + i });
    expect(p.warnings!.length).toBe(20);
    // A plain patch keeps the warnings.
    p = progressUpdate(p, { done: 1, now: 100 });
    expect(p.warnings!.length).toBe(20);
  });

  it("works on progress objects that did not come from progressStart (older persisted runs)", () => {
    const legacy = { phase: "generating" as const, done: 4, total: 10, message: "Generating" };
    const p = progressUpdate(legacy, { done: 5, itemJustFinished: true, now: 5_000 });
    expect(p.startedAt).toBeTruthy();
    expect(p.done).toBe(5);
  });
});

describe("describeProgress / text helpers", () => {
  it("names phases and computes pct", () => {
    const p = progressUpdate(progressStart(10, "judging", "Judging every version · 5 samples", 0), { done: 5, now: 1 });
    const d = describeProgress(p);
    expect(d.headline).toBe("Judging each version 5 times");
    expect(d.pct).toBe(50);
    expect(d.terminal).toBe(false);
    expect(d.eta).toBe("estimating…");
  });
  it("detects regeneration and resume from the message", () => {
    expect(describeProgress({ phase: "generating", done: 0, total: 3, message: "Regenerating 3 versions" }).headline).toBe("Regenerating 3 versions");
    expect(describeProgress({ phase: "generating", done: 2, total: 10, message: "Resuming: generating the missing versions" }).headline).toMatch(/^Resuming/);
  });
  it("terminal states carry tone and detail", () => {
    expect(describeProgress({ phase: "complete", done: 10, total: 10, message: "10 versions" }).tone).toBe("pass");
    expect(describeProgress({ phase: "partial", done: 6, total: 10, message: "Cancelled; work kept" }).headline).toBe("Stopped, work kept");
    expect(describeProgress({ phase: "failed", done: 1, total: 10, message: "Key rejected" }).detail).toBe("Key rejected");
  });
  it("formats eta and elapsed", () => {
    expect(etaText(null)).toBe("estimating…");
    expect(etaText(30)).toBe("under a minute");
    expect(etaText(70)).toBe("about a minute left");
    expect(etaText(150)).toBe("about 3 min left"); // 2.5 rounds to 3
    expect(etaText(0)).toBe("");
    expect(formatElapsed(42)).toBe("42s");
    expect(formatElapsed(125)).toBe("2m 05s");
  });
});
