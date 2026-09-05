/**
 * In-browser OCR for scanned PDFs: render each page with pdf.js to a canvas,
 * read it with Tesseract (loaded lazily; worker from the bundle, language data
 * from Tesseract's default CDN). Nothing leaves the browser.
 */

export const OCR_MAX_PAGES = 30;
/** Rough wall time per page on a laptop, for the progress copy. */
export const OCR_SECONDS_PER_PAGE = 10;

export interface OcrOptions {
  onProgress?: (page: number, total: number) => void;
  /** Tesseract language string, e.g. "eng" or "eng+spa" */
  lang?: string;
  /** Render scale relative to 72 dpi; 2 ≈ 144 dpi */
  scale?: number;
  signal?: AbortSignal;
}

export interface OcrResult {
  text: string;
  /** Mean Tesseract confidence 0–100 across pages */
  confidence: number;
  pages: number;
}

export class OcrTooLongError extends Error {
  constructor(public readonly pages: number) {
    super(`This PDF has ${pages} pages. OCR runs in your browser and is capped at ${OCR_MAX_PAGES} pages; split the file or export a text PDF.`);
  }
}

export async function ocrPdf(bytes: Uint8Array, opts: OcrOptions = {}): Promise<OcrResult> {
  if (typeof document === "undefined") throw new Error("OCR runs in the browser only.");
  const pdfjs = await import("pdfjs-dist");
  if (!pdfjs.GlobalWorkerOptions.workerSrc) {
    pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();
  }
  const doc = await pdfjs.getDocument({ data: bytes.slice() }).promise;
  if (doc.numPages > OCR_MAX_PAGES) throw new OcrTooLongError(doc.numPages);

  const { createWorker } = await import("tesseract.js");
  const workerPath = new URL("tesseract.js/dist/worker.min.js", import.meta.url).toString();
  const worker = await createWorker(opts.lang ?? "eng", 1, { workerPath });
  const scale = opts.scale ?? 2;
  const texts: string[] = [];
  const confidences: number[] = [];
  try {
    for (let p = 1; p <= doc.numPages; p++) {
      if (opts.signal?.aborted) throw new Error("Request cancelled.");
      opts.onProgress?.(p, doc.numPages);
      const page = await doc.getPage(p);
      const viewport = page.getViewport({ scale });
      const canvas = document.createElement("canvas");
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Canvas is not available in this browser.");
      await page.render({ canvasContext: ctx, viewport }).promise;
      const { data } = await worker.recognize(canvas);
      texts.push(`[page ${p}]\n${data.text.trim()}`);
      confidences.push(data.confidence);
    }
  } finally {
    await worker.terminate();
  }
  const confidence = confidences.length ? confidences.reduce((a, b) => a + b, 0) / confidences.length : 0;
  return { text: texts.join("\n\n").trim(), confidence, pages: doc.numPages };
}
