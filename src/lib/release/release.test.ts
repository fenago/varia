import { describe, expect, it } from "vitest";
import { lendingIds } from "@lib/store/testWorkspace";
import { decodePackage } from "@lib/share";
import { buildTaskPackage, studentLabel, taskAsText, taskLink, type TaskPackage } from "./taskPackage";
import { matchSubmissionFiles } from "./submissionMatch";
import { taskAsMarkdown } from "./versionsZip";

const { ws, run, bp, v0, v1, variants } = lendingIds();

describe("task package", () => {
  it("carries the task and rubric names only", () => {
    const pkg = buildTaskPackage(ws, v0.id, run.id)!;
    expect(pkg.variantId).toBe(v0.id);
    expect(pkg.text.length).toBeGreaterThan(100);
    expect(pkg.rubric.length).toBe(bp.rubric.length);
    expect(pkg.maxPoints).toBe(bp.rubric.reduce((a, c) => a + c.points, 0));
    const json = JSON.stringify(pkg);
    expect(json).not.toContain(v0.adaptedSolution.slice(0, 40));
    expect(json).not.toMatch(/fleschEase|equivalence|judgeSamples|anchors/);
    const student = ws.roster.students.find((s) => s.id === v0.studentId)!;
    expect(pkg.studentLabel).toBe(studentLabel(student.name));
    expect(pkg.text).not.toContain(v1.id);
  });

  it("round-trips through the share link", async () => {
    const pkg = buildTaskPackage(ws, v1.id, run.id)!;
    const link = await taskLink(pkg);
    expect(link).toContain(`/task/${v1.id}#pkg=`);
    const enc = link.split("#pkg=")[1];
    const back = await decodePackage<TaskPackage>(enc);
    expect(back).toEqual(pkg);
  });

  it("renders text and markdown with the deliverable and rubric", () => {
    const pkg = buildTaskPackage(ws, variants[2].id, run.id)!;
    const txt = taskAsText(pkg);
    expect(txt).toContain("HOW IT IS GRADED");
    expect(txt).toContain(pkg.rubric[0].name);
    const md = taskAsMarkdown(pkg);
    expect(md.startsWith("# ")).toBe(true);
    expect(md).toContain("## Your task");
  });

  it("abbreviates names", () => {
    expect(studentLabel("Alvarez, R.")).toBe("R. Alvarez");
    expect(studentLabel("Pumariega, Madeline")).toBe("M. Pumariega");
    expect(studentLabel("Cher")).toBe("Cher");
  });
});

describe("submission matching", () => {
  const roster = ws.roster;
  const s0 = roster.students.find((s) => s.id === v0.studentId)!;
  const s1 = roster.students.find((s) => s.id === v1.studentId)!;
  const surname = (name: string) => name.split(",")[0].trim();

  it("matches by email, surname and variant id, in that order", () => {
    const [a, b, c] = matchSubmissionFiles([`${s0.email}.docx`, `${surname(s1.name)}_final.pdf`, `submission ${variants[2].id}.txt`], roster, run);
    expect(a).toMatchObject({ studentId: s0.id, variantId: v0.id, reason: "email" });
    expect(b).toMatchObject({ studentId: s1.id, variantId: v1.id, reason: "surname" });
    expect(c).toMatchObject({ variantId: variants[2].id, reason: "variant" });
  });

  it("leaves ambiguous and unknown files unmatched", () => {
    const twoLees = { ...roster, students: [...roster.students, { id: "s-x1", name: "Lee, A." }, { id: "s-x2", name: "Lee, B." }] };
    const runWithLees = { ...run, variants: [...run.variants, { ...run.variants[0], id: "v-98", studentId: "s-x1" }, { ...run.variants[1], id: "v-99", studentId: "s-x2" }] };
    const [amb, none] = matchSubmissionFiles(["lee_essay.txt", "mystery.txt"], twoLees, runWithLees);
    expect(amb.reason).toBe("ambiguous");
    expect(amb.candidates?.length).toBe(2);
    expect(none.reason).toBe("unmatched");
    expect(none.variantId).toBeNull();
  });

  it("does not match a surname inside another word", () => {
    const sn = surname(s0.name).toLowerCase();
    const [r] = matchSubmissionFiles([`${sn}ville_report.txt`], roster, run);
    expect(r.reason).not.toBe("surname");
  });
});
