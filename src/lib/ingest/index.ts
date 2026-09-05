/**
 * Browser-side file parsing: docx, pdf, csv, txt, md → SourceFile[] + roster.
 * Nothing leaves the browser here; the LLM extraction happens later.
 */

import type { Roster, SourceFile, SourceKind } from "@shared/types";
import { parseRosterCsv } from "./csv";
import { extractDocxText } from "./docx";
import { extractPdf, pdfBase64 } from "./pdf";
import { OCR_SECONDS_PER_PAGE, ocrPdf } from "./ocr";

export { parseRosterCsv, toRosterName } from "./csv";

export interface ParsedFiles {
  sources: SourceFile[];
  roster: Roster | null;
  /** All non-roster text, separated by file headers */
  rawText: string;
  readSeconds: number;
  /** PDFs as base64 for a Claude `document` block. In memory only; never persist. */
  documents: { name: string; mediaType: "application/pdf"; base64: string; scanned?: boolean }[];
}

export interface ParseOptions {
  /** Progress for long steps (OCR). phase: "ocr" */
  onPhase?: (phase: "reading" | "ocr", message: string, detail?: { page?: number; pages?: number; file?: string }) => void;
  /** Run in-browser OCR on scanned PDFs (default true in a browser, false in Node) */
  ocr?: boolean;
  signal?: AbortSignal;
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

interface ReadResult {
  text: string;
  pdf?: { base64: string; scanned: boolean; pageCount: number; ocr?: SourceFile["ocr"] };
}

async function readText(file: File, opts: ParseOptions): Promise<ReadResult> {
  const e = ext(file.name);
  if (e === "docx") return { text: await extractDocxText(file) };
  if (e === "pdf") {
    const pdf = await extractPdf(file);
    const base64 = pdfBase64(pdf.bytes);
    if (!pdf.scanned) return { text: pdf.text, pdf: { base64, scanned: false, pageCount: pdf.pageCount } };
    const canOcr = opts.ocr ?? typeof document !== "undefined";
    if (!canOcr) return { text: "", pdf: { base64, scanned: true, pageCount: pdf.pageCount } };
    opts.onPhase?.("ocr", `Reading a scanned PDF · ${pdf.pageCount} page${pdf.pageCount === 1 ? "" : "s"} · about ${OCR_SECONDS_PER_PAGE} seconds a page`, { pages: pdf.pageCount, file: file.name });
    const r = await ocrPdf(pdf.bytes, {
      signal: opts.signal,
      onProgress: (page, total) => opts.onPhase?.("ocr", `Reading a scanned PDF · page ${page} of ${total} · this takes about ${OCR_SECONDS_PER_PAGE} seconds a page`, { page, pages: total, file: file.name }),
    });
    return { text: r.text, pdf: { base64, scanned: true, pageCount: pdf.pageCount, ocr: { engine: "tesseract", confidence: Math.round(r.confidence) } } };
  }
  return { text: (await file.text()).replace(/\r\n/g, "\n").trim() };
}

export async function parseFiles(files: File[], courseId = "dat4100", opts: ParseOptions = {}): Promise<ParsedFiles> {
  const started = performance.now();
  const sources: SourceFile[] = [];
  let roster: Roster | null = null;
  const chunks: string[] = [];
  const documents: ParsedFiles["documents"] = [];

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
      const { text, pdf } = await readText(file, opts);
      if (pdf) documents.push({ name: file.name, mediaType: "application/pdf", base64: pdf.base64, scanned: pdf.scanned });
      if (!text) {
        // A scanned PDF with no OCR available (Node, or OCR switched off): Claude can still read
        // the pages when a key is set, so keep it as a readable source with an honest label.
        if (pdf?.scanned) {
          sources.push({ name: file.name, kind: "unknown", recognisedAs: `Scanned PDF · ${pdf.pageCount} page${pdf.pageCount === 1 ? "" : "s"} · no text layer`, sizeBytes: file.size, status: "read", scanned: true, pageCount: pdf.pageCount });
          continue;
        }
        sources.push({ name: file.name, kind: "unknown", recognisedAs: "No readable text", sizeBytes: file.size, status: "failed" });
        continue;
      }
      const { kind, recognisedAs } = detectKind(file.name, text);
      const label = pdf?.scanned ? `${recognisedAs} · scanned, read by OCR` : recognisedAs;
      sources.push({ name: file.name, kind, recognisedAs: label, sizeBytes: file.size, status: "read", text, ...(pdf ? { scanned: pdf.scanned, pageCount: pdf.pageCount, ...(pdf.ocr ? { ocr: pdf.ocr } : {}) } : {}) });
      chunks.push(`===== ${file.name} (${label}) =====\n${text}`);
    } catch (err) {
      sources.push({ name: file.name, kind: "unknown", recognisedAs: `Could not read: ${(err as Error).message}`, sizeBytes: file.size, status: "failed" });
    }
  }

  return {
    sources,
    roster,
    rawText: chunks.join("\n\n"),
    readSeconds: Math.max(1, Math.round((performance.now() - started) / 1000)),
    documents,
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
