import { describe, expect, it } from "vitest";
import { layoutBadge, wrapText, type BadgeOptions } from "./badgeImage";

const opts: BadgeOptions = {
  achievementName: "Classifier Audit for Lender",
  issuer: "Miami Dade College",
  endorsedBy: ["Bayfront Regional Bank"],
  issuedAt: "2026-09-05T12:00:00Z",
  credentialId: "CR-2026-0001",
  verifyUrl: "https://varia.cloud/verify/VR-2026-0001",
  skills: ["Fairness analysis", "Robustness evaluation", "Technical documentation review", "Risk prioritisation", "Model auditing", "Evidence-based reasoning"],
};

describe("layoutBadge", () => {
  it("lays out a 1200×630 card with kicker, headline, endorsement, chips and footer inside the frame", () => {
    const L = layoutBadge(opts, "card");
    expect(L.width).toBe(1200);
    expect(L.height).toBe(630);
    const kinds = L.blocks.map((b) => b.kind);
    expect(kinds).toContain("kicker");
    expect(kinds).toContain("headline");
    expect(kinds.filter((k) => k === "mark")).toHaveLength(4);
    expect(L.blocks.find((b) => b.kind === "kicker")?.text).toContain("MIAMI DADE COLLEGE");
    expect(L.blocks.some((b) => b.kind === "line" && b.text.startsWith("Endorsed by Bayfront"))).toBe(true);
    const chips = L.blocks.filter((b) => b.kind === "chip");
    expect(chips.length).toBeGreaterThan(0);
    expect(chips.length).toBeLessThanOrEqual(opts.skills.length);
    for (const b of L.blocks.filter((b) => b.kind !== "mark")) {
      expect(b.x).toBeGreaterThanOrEqual(64);
      expect(b.y).toBeGreaterThanOrEqual(64);
      expect(b.y).toBeLessThan(630 - 40);
    }
    const footer = L.blocks.filter((b) => b.kind === "small");
    expect(footer.map((b) => b.text).join(" ")).toContain("CR-2026-0001");
    expect(footer.map((b) => b.text).join(" ")).toContain(opts.verifyUrl);
  });

  it("omits the learner name unless a label is passed", () => {
    const without = layoutBadge(opts, "card");
    expect(without.blocks.some((b) => b.text.includes("Alvarez"))).toBe(false);
    const withName = layoutBadge({ ...opts, learnerLabel: "R. Alvarez" }, "card");
    expect(withName.blocks.some((b) => b.text === "R. Alvarez")).toBe(true);
  });

  it("produces a 1080×1080 square with more room for chips", () => {
    const L = layoutBadge(opts, "square");
    expect(L.width).toBe(1080);
    expect(L.height).toBe(1080);
    expect(L.blocks.filter((b) => b.kind === "chip").length).toBe(opts.skills.length);
  });

  it("wraps long headlines instead of overflowing", () => {
    const lines = wrapText("A very long achievement name that certainly will not fit on a single line of the card", 56, "heading", 1072);
    expect(lines.length).toBeGreaterThan(1);
    expect(lines.join(" ")).toContain("single line");
  });
});
