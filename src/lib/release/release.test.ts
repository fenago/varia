import { describe, expect, it } from "vitest";
import { buildDemoWorkspace, DEMO_RUN_ID } from "@lib/store/seed";
import { decodePackage } from "@lib/share";
import { buildTaskPackage, studentLabel, taskAsText, taskLink, type TaskPackage } from "./taskPackage";
import { matchSubmissionFiles } from "./submissionMatch";
import { taskAsMarkdown } from "./versionsZip";

const ws = buildDemoWorkspace();
const run = ws.runs.find((r) => r.id === DEMO_RUN_ID)!;

describe("task package", () => {
  it("carries the task and rubric names only", () => {
    const pkg = buildTaskPackage(ws, "v-04", run.id)!;
    expect(pkg.variantId).toBe("v-04");
    expect(pkg.text.length).toBeGreaterThan(100);
    expect(pkg.rubric.length).toBe(4);
    expect(pkg.maxPoints).toBe(12);
    const json = JSON.stringify(pkg);
    const v = run.variants.find((x) => x.id === "v-04")!;
    expect(json).not.toContain(v.adaptedSolution.slice(0, 40));
    expect(json).not.toMatch(/fleschEase|equivalence|judgeSamples|anchors/);
    expect(pkg.studentLabel).toBe("R. Alvarez");
    expect(pkg.text).not.toContain("v-07");
  });

  it("round-trips through the share link", async () => {
    const pkg = buildTaskPackage(ws, "v-07", run.id)!;
    const link = await taskLink(pkg);
    expect(link).toContain("/task/v-07#pkg=");
    const enc = link.split("#pkg=")[1];
    const back = await decodePackage<TaskPackage>(enc);
    expect(back).toEqual(pkg);
  });

  it("renders text and markdown with the deliverable and rubric", () => {
    const pkg = buildTaskPackage(ws, "v-11", run.id)!;
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
  const alvarez = roster.students.find((s) => s.name.startsWith("Alvarez"))!;
  const bhatt = roster.students.find((s) => s.name.startsWith("Bhatt"))!;

  it("matches by email, surname and variant id, in that order", () => {
    const withEmail = { ...roster, students: roster.students.map((s) => (s.id === alvarez.id ? { ...s, email: "ralvarez@students.mdc.example" } : s)) };
    const [a, b, c] = matchSubmissionFiles(["ralvarez@students.mdc.example.docx", "Bhatt_final.pdf", "submission v-11.txt"], withEmail, run);
    expect(a).toMatchObject({ studentId: alvarez.id, variantId: "v-04", reason: "email" });
    expect(b).toMatchObject({ studentId: bhatt.id, variantId: "v-07", reason: "surname" });
    expect(c).toMatchObject({ variantId: "v-11", reason: "variant" });
  });

  it("leaves ambiguous and unknown files unmatched", () => {
    const twoLees = {
      ...roster,
      students: [...roster.students, { id: "s-x1", name: "Lee, A." }, { id: "s-x2", name: "Lee, B." }],
    };
    const runWithLees = { ...run, variants: [...run.variants, { ...run.variants[0], id: "v-98", studentId: "s-x1" }, { ...run.variants[1], id: "v-99", studentId: "s-x2" }] };
    const [amb, none] = matchSubmissionFiles(["lee_essay.txt", "mystery.txt"], twoLees, runWithLees);
    expect(amb.reason).toBe("ambiguous");
    expect(amb.candidates?.length).toBe(2);
    expect(none.reason).toBe("unmatched");
    expect(none.variantId).toBeNull();
  });

  it("does not match a surname inside another word", () => {
    const [r] = matchSubmissionFiles(["chenille_report.txt"], roster, run);
    expect(r.reason).not.toBe("surname");
  });
});
