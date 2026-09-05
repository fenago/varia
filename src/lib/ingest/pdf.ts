/**
 * PDFs, parsed in the browser with pdf.js (worker loaded from the bundle).
 * A PDF whose text layer is empty or nearly so is a scan; the caller can run
 * OCR on the bytes (`./ocr`) or hand the pages to Claude directly.
 */

export interface PdfExtraction {
  text: string;
  pages: string[];
  pageCount: number;
  /** true when the text layer averages under SCANNED_CHARS_PER_PAGE characters per page */
  scanned: boolean;
  bytes: Uint8Array;
}

/** Below this many characters per page the PDF is treated as a scan. */
export const SCANNED_CHARS_PER_PAGE = 40;

async function loadPdfjs() {
  const pdfjs = await import("pdfjs-dist");
  if (!pdfjs.GlobalWorkerOptions.workerSrc) {
    pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();
  }
  return pdfjs;
}

export async function extractPdf(file: File | Blob): Promise<PdfExtraction> {
  const pdfjs = await loadPdfjs();
  const bytes = new Uint8Array(await file.arrayBuffer());
  const doc = await pdfjs.getDocument({ data: bytes.slice() }).promise;
  const pages: string[] = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    const line = content.items
      .map((it) => ("str" in it ? it.str : ""))
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
    pages.push(line);
  }
  const text = pages.join("\n\n").trim();
  const scanned = doc.numPages > 0 && text.length / doc.numPages < SCANNED_CHARS_PER_PAGE;
  return { text, pages, pageCount: doc.numPages, scanned, bytes };
}

/** Back-compatible: text only. */
export async function extractPdfText(file: File): Promise<string> {
  return (await extractPdf(file)).text;
}

/** Base64 of the raw PDF bytes, for a Claude `document` block. Kept in memory only. */
export function pdfBase64(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + 0x8000)));
  return btoa(bin);
}
