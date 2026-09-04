import { describe, expect, it } from "vitest";
import { parseRosterCsv, toRosterName } from "./csv";
import { detectKind, parsePastedText } from "./index";

describe("roster csv", () => {
  it("reads a name column into 'Last, F.' names sorted alphabetically", () => {
    const r = parseRosterCsv("name,email\nRosa Alvarez,ra@x.edu\nNikhil Bhatt,nb@x.edu\nWei Chen,wc@x.edu\n");
    expect(r.students.map((s) => s.name)).toEqual(["Alvarez, R.", "Bhatt, N.", "Chen, W."]);
    expect(r.students[0].email).toBe("ra@x.edu");
    expect(r.students[0].id).toBe("s-alvarez-r");
  });

  it("reads last + first columns and student ids", () => {
    const r = parseRosterCsv("Student ID,Last Name,First Name\n1001,Gordon,Tamsin\n1002,Duarte,Sofia\n");
    expect(r.students.map((s) => s.name)).toEqual(["Duarte, S.", "Gordon, T."]);
    expect(r.students.find((s) => s.name === "Gordon, T.")?.id).toBe("s-1001");
  });

  it("handles 'Last, First' names and single-column files", () => {
    expect(toRosterName("Ivanov, Dmitri")).toBe("Ivanov, D.");
    expect(toRosterName("Hassan")).toBe("Hassan");
    const r = parseRosterCsv("student\nHassan, Layla\nIvanov, Dmitri\n");
    expect(r.students).toHaveLength(2);
  });

  it("returns an empty roster when no name column exists", () => {
    expect(parseRosterCsv("a,b\n1,2\n").students).toHaveLength(0);
  });
});

describe("kind detection", () => {
  it("classifies task + rubric, solutions and pasted text", () => {
    expect(detectKind("DAT4100_Assignment3.docx", "Assignment 3. You are auditing a classifier. Produce an audit. Rubric — Fairness (3 points)").kind).toBe("task+rubric");
    expect(detectKind("instructor_model_answer.docx", "Finding 1 ...").kind).toBe("solution");
    const p = parsePastedText("Assignment: write a memo. Rubric: clarity (3 points)");
    expect(p.sources[0].kind).toBe("task+rubric");
    expect(p.rawText).toContain("Pasted text");
    expect(parsePastedText("   ").sources).toHaveLength(0);
  });
});
