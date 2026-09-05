import { beforeEach, describe, expect, it } from "vitest";
import { useWorkspace } from "./workspace";
import { submissionForVariant, submissionImportPreview } from "./selectors";
import { lendingIds, lendingWorkspace } from "./testWorkspace";

describe("submissions: import, paste, pre-score (recorded lending run)", () => {
  beforeEach(() => {
    useWorkspace.setState({ ...lendingWorkspace(), runAbort: null });
  });

  it("imports submissions onto variants and replaces on re-import", () => {
    const ws = useWorkspace.getState();
    const { v0, runId } = lendingIds(ws);
    const before = submissionForVariant(ws, v0.id, runId);
    expect(before?.submittedAt ?? null).toBeNull();
    const [sub] = ws.importSubmissions([{ variantId: v0.id, text: "Fairness. The card omits subgroup rates.", sourceFile: "first.txt" }], runId);
    expect(sub.text).toContain("Fairness");
    expect(sub.sourceFile).toBe("first.txt");
    expect(sub.submittedAt).not.toBeNull();
    const again = useWorkspace.getState().setSubmissionText(v0.id, "Second draft.", "second.txt", runId);
    expect(again.id).toBe(sub.id);
    expect(again.text).toBe("Second draft.");
    expect(useWorkspace.getState().submissions.filter((s) => s.variantId === v0.id).length).toBe(1);
  });

  it("previews matches against the roster", () => {
    const ws = useWorkspace.getState();
    const { v1, runId } = lendingIds(ws);
    const surname = ws.roster.students.find((s) => s.id === v1.studentId)!.name.split(",")[0].trim();
    const rows = submissionImportPreview(ws, runId, [`${surname}_audit.docx`, "nobody.txt"]);
    expect(rows[0]).toMatchObject({ variantId: v1.id, reason: "surname", alreadySubmitted: false });
    expect(rows[1].reason).toBe("unmatched");
  });

  it("stores a pre-score beside the submission without touching the grade", () => {
    const ws = useWorkspace.getState();
    const { v1, runId, bp } = lendingIds(ws);
    const crit = bp.rubric;
    const scores = Object.fromEntries(crit.map((c, i) => [c.id, (i % 4) as 0 | 1 | 2 | 3]));
    ws.setSubmissionText(v1.id, "A short submission about the regional rate.", "b.txt", runId);
    const sub = useWorkspace.getState().applyPreScore(v1.id, { scores, rationale: { [crit[0].id]: "cites the regional rate" }, summary: "ok" }, "claude-sonnet-5", runId);
    expect(sub.preScore?.model).toBe("claude-sonnet-5");
    expect(sub.preScore?.scores).toEqual(scores);
    expect(sub.grade).toBeNull();
    expect(() => useWorkspace.getState().applyPreScore("v-99", { scores: {}, rationale: {}, summary: "" }, "x", runId)).toThrow();
  });
});
