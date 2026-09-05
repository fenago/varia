import { describe, it, expect } from "vitest";
import { journeyState, JOURNEY_LABELS } from "./journey";
import { lendingWorkspace } from "./testWorkspace";

describe("journeyState", () => {
  it("has six 1-based steps with plain labels", () => {
    expect(JOURNEY_LABELS.map((l) => l.label)).toEqual(["1 · Load your assignment", "2 · Check what we found", "3 · Make the versions", "4 · Check the versions", "5 · Release to students", "6 · Grade the work"]);
  });
  it("marks loaded, ready, reported and released steps done on the recorded workspace and the next one current", () => {
    const ws = lendingWorkspace();
    const { steps, current } = journeyState(ws as any);
    expect(steps.length).toBe(6);
    expect(steps[0].status).toBe("done");
    expect(steps[1].status).toBe("done");
    expect(steps[2].status).toBe("done");
    const firstTodo = steps.findIndex((s) => s.status !== "done");
    expect(current?.n).toBe(firstTodo + 1);
    expect(steps.slice(firstTodo + 1).every((s) => s.status === "todo")).toBe(true);
  });
  it("an empty workspace starts at step 1", () => {
    const ws = lendingWorkspace();
    const empty = { ...ws, blueprints: [], runs: [], submissions: [], activeBlueprintId: null, activeRunId: null };
    const { steps, current } = journeyState(empty as any);
    expect(current?.n).toBe(1);
    expect(steps[0].status).toBe("current");
  });
});
