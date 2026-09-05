import JSZip from "jszip";
import { Document, HeadingLevel, Packer, Paragraph, TextRun } from "docx";
import type { Workspace } from "@shared/types";
import { buildTaskPackage, taskAsText, taskLink, type TaskPackage } from "./taskPackage";

export type VersionsFormat = "docx" | "md";

function safe(s: string): string {
  return s.replace(/[^A-Za-z0-9._-]+/g, "_").replace(/^_+|_+$/g, "") || "student";
}

function csvEscape(v: string | number): string {
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function paragraphsOf(text: string): string[] {
  return text
    .split(/\n{2,}|\n(?=[A-Z*\-•\d])/)
    .map((p) => p.trim())
    .filter(Boolean);
}

export async function taskDocx(pkg: TaskPackage): Promise<Blob> {
  const p = (text: string, opts: { bold?: boolean; size?: number; muted?: boolean } = {}) =>
    new Paragraph({ spacing: { after: 160 }, children: [new TextRun({ text, bold: opts.bold, size: opts.size ?? 22, color: opts.muted ? "5D5D60" : undefined })] });
  const doc = new Document({
    creator: pkg.instructorName,
    title: `${pkg.blueprintName} · ${pkg.variantId}`,
    sections: [
      {
        children: [
          new Paragraph({ heading: HeadingLevel.TITLE, children: [new TextRun(`${pkg.blueprintName} (${pkg.maxPoints} points)`)] }),
          p(`${pkg.course.code} · ${pkg.course.term} · ${pkg.course.title}`, { muted: true }),
          p(pkg.studentLabel ? `Prepared for ${pkg.studentLabel} · version ${pkg.variantId}` : `Version ${pkg.variantId}`, { muted: true }),
          p(`Due: ${pkg.dueLabel}`, { bold: true }),
          new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun("Your task")] }),
          ...paragraphsOf(pkg.text).map((t) => p(t)),
          new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun("What you must produce")] }),
          p(pkg.deliverable),
          new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun("How it is graded")] }),
          ...pkg.rubric.map((c) => new Paragraph({ bullet: { level: 0 }, children: [new TextRun(`${c.name} (${c.points} points)`)] })),
          p(`Instructor: ${pkg.instructorName}, ${pkg.course.institution}`, { muted: true }),
        ],
      },
    ],
  });
  return Packer.toBlob(doc);
}

export interface VersionsExport {
  blob: Blob;
  filename: string;
  count: number;
}

/**
 * One document per student (docx or Markdown) plus versions.csv mapping
 * student, email, version, file and task link. Entirely client-side.
 */
export async function buildVersionsZip(ws: Workspace, runId: string, format: VersionsFormat = "docx"): Promise<VersionsExport> {
  const run = ws.runs.find((r) => r.id === runId);
  if (!run) throw new Error("Run not found.");
  const zip = new JSZip();
  const rows: string[] = ["student,email,version,file,link"];
  let count = 0;
  for (const v of run.variants) {
    if (v.error || !v.text) continue;
    const pkg = buildTaskPackage(ws, v.id, run.id);
    if (!pkg) continue;
    const student = v.studentId ? ws.roster.students.find((s) => s.id === v.studentId) : null;
    const base = `${v.id}_${safe(student?.name ?? "unassigned")}`;
    const file = format === "docx" ? `${base}.docx` : `${base}.md`;
    if (format === "docx") zip.file(file, await taskDocx(pkg));
    else zip.file(file, taskAsMarkdown(pkg));
    const link = await taskLink(pkg);
    rows.push([student?.name ?? "", student?.email ?? "", v.id, file, link].map(csvEscape).join(","));
    count += 1;
  }
  zip.file("versions.csv", rows.join("\n"));
  const blob = await zip.generateAsync({ type: "blob" });
  const filename = `${safe(run.blueprintName)}_versions_${format}.zip`;
  return { blob, filename, count };
}

export function taskAsMarkdown(pkg: TaskPackage): string {
  return [
    `# ${pkg.blueprintName} (${pkg.maxPoints} points)`,
    ``,
    `${pkg.course.code} · ${pkg.course.term} · ${pkg.course.title}  `,
    pkg.studentLabel ? `Prepared for ${pkg.studentLabel} · version ${pkg.variantId}  ` : `Version ${pkg.variantId}  `,
    `**Due:** ${pkg.dueLabel}`,
    ``,
    `## Your task`,
    ``,
    pkg.text,
    ``,
    `## What you must produce`,
    ``,
    pkg.deliverable,
    ``,
    `## How it is graded`,
    ``,
    ...pkg.rubric.map((c) => `- ${c.name} (${c.points} points)`),
    ``,
    `_Instructor: ${pkg.instructorName}, ${pkg.course.institution}_`,
  ].join("\n");
}

/** CSV of student,email,version,link for "Copy all links". */
export async function allTaskLinksCsv(ws: Workspace, runId: string): Promise<{ csv: string; count: number }> {
  const run = ws.runs.find((r) => r.id === runId);
  if (!run) throw new Error("Run not found.");
  const rows = ["student,email,version,link"];
  let count = 0;
  for (const v of run.variants) {
    if (v.error || !v.text) continue;
    const pkg = buildTaskPackage(ws, v.id, run.id);
    if (!pkg) continue;
    const student = v.studentId ? ws.roster.students.find((s) => s.id === v.studentId) : null;
    rows.push([student?.name ?? "", student?.email ?? "", v.id, await taskLink(pkg)].map(csvEscape).join(","));
    count += 1;
  }
  return { csv: rows.join("\n"), count };
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

export { taskAsText };
