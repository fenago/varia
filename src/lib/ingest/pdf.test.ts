import { describe, it, expect } from "vitest";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { extractPdf, SCANNED_CHARS_PER_PAGE } from "./pdf";
import { parseFiles } from "./index";

async function textPdf(): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const page = doc.addPage([612, 792]);
  const lines = [
    "Assignment 3 — Model Card Audit (12 points)",
    "You are auditing a deployed classifier. Produce a structured audit.",
    "Rubric",
    "Fairness gaps with evidence (3 points)",
    "Robustness under subgroup shift (3 points)",
  ];
  lines.forEach((l, i) => page.drawText(l, { x: 50, y: 740 - i * 24, size: 12, font }));
  return doc.save();
}

/** An image-only PDF: one blank raster page, no text layer at all. */
async function scannedPdf(pages = 2): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  // 1x1 white PNG
  const png = Uint8Array.from(atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII="), (c) => c.charCodeAt(0));
  const img = await doc.embedPng(png);
  for (let i = 0; i < pages; i++) {
    const page = doc.addPage([612, 792]);
    page.drawImage(img, { x: 0, y: 0, width: 612, height: 792 });
  }
  return doc.save();
}

const asFile = (bytes: Uint8Array, name: string) => new File([bytes as unknown as BlobPart], name, { type: "application/pdf" });

describe("pdf ingest", () => {
  it("reads a text PDF and does not call it a scan", async () => {
    const r = await extractPdf(asFile(await textPdf(), "assignment.pdf"));
    expect(r.pageCount).toBe(1);
    expect(r.scanned).toBe(false);
    expect(r.text).toMatch(/Rubric/);
    expect(r.text.length).toBeGreaterThan(SCANNED_CHARS_PER_PAGE);
  });

  it("flags an image-only PDF as scanned", async () => {
    const r = await extractPdf(asFile(await scannedPdf(2), "scan.pdf"));
    expect(r.pageCount).toBe(2);
    expect(r.scanned).toBe(true);
    expect(r.text).toBe("");
  });

  it("parseFiles keeps a scanned PDF as a readable source with the bytes available for Claude, and OCR off in Node", async () => {
    const parsed = await parseFiles([asFile(await scannedPdf(1), "scan.pdf")], "c1", { ocr: false });
    expect(parsed.sources).toHaveLength(1);
    expect(parsed.sources[0].scanned).toBe(true);
    expect(parsed.sources[0].status).toBe("read");
    expect(parsed.sources[0].recognisedAs).toMatch(/Scanned PDF/);
    expect(parsed.documents).toHaveLength(1);
    expect(parsed.documents[0].scanned).toBe(true);
    expect(parsed.documents[0].base64.length).toBeGreaterThan(100);
  });

  it("parseFiles on a text PDF classifies it and carries the PDF for Claude", async () => {
    const parsed = await parseFiles([asFile(await textPdf(), "assignment.pdf")], "c1", { ocr: false });
    expect(parsed.sources[0].kind).toBe("task+rubric");
    expect(parsed.sources[0].scanned).toBe(false);
    expect(parsed.documents[0].scanned).toBe(false);
    expect(parsed.rawText).toMatch(/Rubric/);
  });
});
