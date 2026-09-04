/**
 * Browser-side file parsing: docx, pdf, csv, txt, md → SourceFile[] + roster.
 * Nothing leaves the browser here; the LLM extraction happens later.
 */

import type { Roster, SourceFile, SourceKind } from "@shared/types";
import { parseRosterCsv } from "./csv";
import { extractDocxText } from "./docx";
import { extractPdfText } from "./pdf";

export { parseRosterCsv, toRosterName } from "./csv";

export interface ParsedFiles {
  sources: SourceFile[];
  roster: Roster | null;
  /** All non-roster text, separated by file headers */
  rawText: string;
  readSeconds: number;
}

const SOLUTION_HINT = /(answer|solution|key|exemplar|model[-_ ]?response)/i;
const ROSTER_HINT = /(roster|students|enrol|class[-_ ]?list)/i;

function ext(name: string): string {
  const m = /\.([a-z0-9]+)$/i.exec(name);
  return m ? m[1].toLowerCase() : "";
}

/** Classify a text file by its name and content. */
export function detectKind(name: string, text: string): { kind: SourceKind; recognisedAs: string } {
  if (SOLUTION_HINT.test(name)) return { kind: "solution", recognisedAs: "Canonical solution" };
  const t = text.toLowerCase();
  const hasRubric = /\brubric\b|\bcriteri(a|on)\b|\bpoints?\b\s*\)/.test(t);
  const hasTask = /\bassignment\b|\btask\b|\bproduce\b|\bwrite\b|\bsubmit\b|\byou (are|will)\b/.test(t);
  if (hasRubric && hasTask) return { kind: "task+rubric", recognisedAs: "Task prompt + rubric" };
  if (hasRubric) return { kind: "rubric", recognisedAs: "Rubric" };
  if (hasTask) return { kind: "task", recognisedAs: "Task prompt" };
  if (/\bfinding\b|\brecommend/.test(t) && t.length > 1500) return { kind: "solution", recognisedAs: "Canonical solution" };
  return { kind: "unknown", recognisedAs: "Text — could not classify" };
}

async function readText(file: File): Promise<string> {
  const e = ext(file.name);
  if (e === "docx") return extractDocxText(file);
  if (e === "pdf") return extractPdfText(file);
  return (await file.text()).replace(/\r\n/g, "\n").trim();
}

export async function parseFiles(files: File[], courseId = "dat4100"): Promise<ParsedFiles> {
  const started = performance.now();
  const sources: SourceFile[] = [];
  let roster: Roster | null = null;
  const chunks: string[] = [];

  for (const file of files) {
    const e = ext(file.name);
    try {
      if (e === "csv" || (e === "txt" && ROSTER_HINT.test(file.name))) {
        const text = await file.text();
        const r = parseRosterCsv(text, file.name, courseId);
        if (r.students.length) {
          roster = r;
          sources.push({ name: file.name, kind: "roster", recognisedAs: `${r.students.length} enrolled students`, sizeBytes: file.size, status: "read" });
        } else {
          sources.push({ name: file.name, kind: "unknown", recognisedAs: "CSV — no student names found", sizeBytes: file.size, status: "failed" });
        }
        continue;
      }
      if (!["docx", "pdf", "txt", "md", "markdown", "text", ""].includes(e)) {
        sources.push({ name: file.name, kind: "unknown", recognisedAs: `Unsupported type .${e}`, sizeBytes: file.size, status: "failed" });
        continue;
      }
      const text = await readText(file);
      if (!text) {
        sources.push({ name: file.name, kind: "unknown", recognisedAs: "No readable text", sizeBytes: file.size, status: "failed" });
        continue;
      }
      const { kind, recognisedAs } = detectKind(file.name, text);
      sources.push({ name: file.name, kind, recognisedAs, sizeBytes: file.size, status: "read", text });
      chunks.push(`===== ${file.name} (${recognisedAs}) =====\n${text}`);
    } catch (err) {
      sources.push({ name: file.name, kind: "unknown", recognisedAs: `Could not read: ${(err as Error).message}`, sizeBytes: file.size, status: "failed" });
    }
  }

  return {
    sources,
    roster,
    rawText: chunks.join("\n\n"),
    readSeconds: Math.max(1, Math.round((performance.now() - started) / 1000)),
  };
}

export function parsePastedText(text: string): { sources: SourceFile[]; rawText: string } {
  const clean = text.replace(/\r\n/g, "\n").trim();
  if (!clean) return { sources: [], rawText: "" };
  const { kind, recognisedAs } = detectKind("pasted.txt", clean);
  return {
    sources: [{ name: "Pasted text", kind, recognisedAs, sizeBytes: new Blob([clean]).size, status: "read", text: clean }],
    rawText: `===== Pasted text (${recognisedAs}) =====\n${clean}`,
  };
}
