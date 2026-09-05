import { describe, it, expect } from "vitest";
import { GLOSSARY, glossaryTerm, glossaryByGroup, GLOSSARY_GROUPS } from "./glossary";

const REQUIRED = ["assessment","blueprint","construct","competency","rubric","criterion","anchors","model-answer","canonical-solution","surface-dimension","domain","stakeholder","scenario","jargon-register","reading-level","version","variant","strategy","zero-shot","few-shot","structured-cot","dimension-preserving","threat-profile","generator","judge","judge-samples","self-consistency","four-checks","p1","p2","p3","p4","cosine","four-gram","closest-pair","equivalence","rubric-stability","flesch","sigma-flesch","joint-score","threshold","release","over-threshold","regenerate","outlier","roster","student-link","submission","pre-score","evidence-record","work-sample","learner-id","signature","hash","verify","credential","open-badges","endorsement","employer-validation","challenge","portfolio","talent-view","preset","high-stakes","formative","actual-cost","recorded-run","ai-sample"];

describe("glossary", () => {
  it("covers every required slug", () => {
    const missing = REQUIRED.filter((s) => !GLOSSARY[s]);
    expect(missing).toEqual([]);
  });
  it("every entry has a term, two-sentence plain text and a group", () => {
    for (const [slug, e] of Object.entries(GLOSSARY)) {
      expect(e.term.length, slug).toBeGreaterThan(2);
      expect(e.plain.split(/[.!?]["\u201d]?\s/).length, slug).toBeGreaterThanOrEqual(2);
      expect(GLOSSARY_GROUPS).toContain(e.group);
    }
  });
  it("glossaryTerm returns null for unknown slugs and groups cover everything", () => {
    expect(glossaryTerm("no-such-term")).toBeNull();
    const total = glossaryByGroup().reduce((n, g) => n + g.entries.length, 0);
    expect(total).toBe(Object.keys(GLOSSARY).length);
  });
});
