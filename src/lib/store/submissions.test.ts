import { beforeEach, describe, expect, it } from "vitest";
import { useWorkspace } from "./workspace";
import { DEMO_RUN_ID } from "./seed";
import { submissionForVariant, submissionImportPreview } from "./selectors";

describe("submissions: import, paste, pre-score", () => {
  beforeEach(() => {
    useWorkspace.getState().resetToDemo();
  });

  it("imports submissions onto variants and replaces on re-import", () => {
    const ws = useWorkspace.getState();
    const before = submissionForVariant(ws, "v-27", DEMO_RUN_ID);
    expect(before?.submittedAt ?? null).toBeNull();
    const [sub] = ws.importSubmissions([{ variantId: "v-27", text: "Fairness. The card omits subgroup rates.", sourceFile: "Ivanov.txt" }], DEMO_RUN_ID);
    expect(sub.text).toContain("Fairness");
    expect(sub.sourceFile).toBe("Ivanov.txt");
    expect(sub.submittedAt).not.toBeNull();
    const again = useWorkspace.getState().setSubmissionText("v-27", "Second draft.", "Ivanov_v2.txt", DEMO_RUN_ID);
    expect(again.id).toBe(sub.id);
    expect(again.text).toBe("Second draft.");
    expect(useWorkspace.getState().submissions.filter((s) => s.variantId === "v-27").length).toBe(1);
  });

  it("previews matches against the roster", () => {
    const ws = useWorkspace.getState();
    const rows = submissionImportPreview(ws, DEMO_RUN_ID, ["Bhatt_audit.docx", "nobody.txt"]);
    expect(rows[0]).toMatchObject({ variantId: "v-07", reason: "surname", alreadySubmitted: true });
    expect(rows[1].reason).toBe("unmatched");
  });

  it("stores a pre-score beside the submission without touching the grade", () => {
    const ws = useWorkspace.getState();
    const crit = ws.blueprints.find((b) => b.id === ws.activeBlueprintId)!.rubric;
    const scores = Object.fromEntries(crit.map((c, i) => [c.id, (i % 4) as 0 | 1 | 2 | 3]));
    const sub = ws.applyPreScore("v-07", { scores, rationale: { [crit[0].id]: "cites the shortlist rate" }, summary: "ok" }, "claude-sonnet-5", DEMO_RUN_ID);
    expect(sub.preScore?.model).toBe("claude-sonnet-5");
    expect(sub.preScore?.scores).toEqual(scores);
    expect(sub.grade).toBeNull();
    expect(() => useWorkspace.getState().applyPreScore("v-99", { scores: {}, rationale: {}, summary: "" }, "x", DEMO_RUN_ID)).toThrow();
  });
});
