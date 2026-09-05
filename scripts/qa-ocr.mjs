#!/usr/bin/env node
/**
 * Real in-browser OCR check: render a rubric page to an image in Chromium, wrap it as an
 * image-only PDF (no text layer), then run the app's parseFiles (with OCR) on it inside the
 * page via the Vite dev server, and assert the OCR text contains the rubric heading.
 *   node scripts/qa-ocr.mjs   (starts `vite --port 4190` itself)
 */
import { chromium } from "playwright";
import { spawn } from "node:child_process";
import { PDFDocument } from "pdf-lib";
import { mkdirSync, writeFileSync } from "node:fs";

const PORT = Number(process.env.QA_PORT || 4190);
const BASE = process.env.QA_BASE || `http://localhost:${PORT}`;
const dev = process.env.QA_BASE ? null : spawn("npx", ["vite", "--port", String(PORT), "--strictPort"], { stdio: "ignore", shell: true });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
async function up(page) { for (let i = 0; i < 90; i++) { try { const r = await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded", timeout: 3000 }); if (r && r.ok()) return; } catch {} await wait(1000); } throw new Error("dev server did not start"); }

const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1000, height: 800 } });
  await up(page);
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`${BASE}/`, { waitUntil: "networkidle" });

  // 1. Render a page of text to PNG in the browser (150 dpi letter ≈ 1275×1650).
  const pngDataUrl = await page.evaluate(() => {
    const c = document.createElement("canvas"); c.width = 1275; c.height = 1650;
    const ctx = c.getContext("2d"); ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, c.width, c.height);
    ctx.fillStyle = "#000"; ctx.font = "bold 40px Arial"; ctx.fillText("Assignment 3: Model Card Audit (12 points)", 90, 150);
    ctx.font = "28px Arial";
    const lines = ["You are auditing a deployed classifier on behalf of a stakeholder.", "Produce a structured audit that identifies fairness gaps,", "robustness gaps and documentation gaps.", "", "Rubric", "Fairness gaps with evidence (3 points)", "Robustness under subgroup shift (3 points)", "Documentation completeness (3 points)", "Prioritisation quality (3 points)"];
    lines.forEach((l, i) => { if (l === "Rubric") ctx.font = "bold 34px Arial"; ctx.fillText(l, 90, 240 + i * 52); if (l === "Rubric") ctx.font = "28px Arial"; });
    return c.toDataURL("image/png");
  });
  const png = Buffer.from(pngDataUrl.split(",")[1], "base64");
  const doc = await PDFDocument.create();
  const img = await doc.embedPng(png);
  const p = doc.addPage([612, 792]);
  p.drawImage(img, { x: 0, y: 0, width: 612, height: 792 });
  const pdfBytes = await doc.save();
  mkdirSync("qa/fixtures", { recursive: true });
  writeFileSync("qa/fixtures/scanned-rubric.pdf", pdfBytes);

  // 2. Run the app's parser with OCR inside the page.
  const started = Date.now();
  const result = await page.evaluate(async (b64) => {
    const bytes = Uint8Array.from(atob(b64), (ch) => ch.charCodeAt(0));
    const mod = await import("/src/lib/ingest/index.ts");
    const file = new File([bytes], "scanned-rubric.pdf", { type: "application/pdf" });
    const phases = [];
    const parsed = await mod.parseFiles([file], "c1", { ocr: true, onPhase: (ph, msg) => phases.push(`${ph}: ${msg}`) });
    const s = parsed.sources[0];
    return { kind: s.kind, recognisedAs: s.recognisedAs, scanned: s.scanned, ocr: s.ocr, text: (s.text || "").slice(0, 600), phases, docs: parsed.documents.length };
  }, Buffer.from(pdfBytes).toString("base64"));
  const secs = ((Date.now() - started) / 1000).toFixed(1);

  const ok = /rubric/i.test(result.text) && result.scanned === true && result.ocr?.engine === "tesseract" && errors.length === 0;
  console.log(JSON.stringify({ ok, seconds: secs, kind: result.kind, recognisedAs: result.recognisedAs, confidence: result.ocr?.confidence, phases: result.phases.slice(0, 3), docs: result.docs, errors }, null, 1));
  console.log("--- OCR text ---\n" + result.text);
  process.exitCode = ok ? 0 : 1;
} finally {
  await browser.close();
  if (dev) dev.kill();
}
