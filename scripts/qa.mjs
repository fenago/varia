/**
 * VARIA integration QA. Drives the production build (vite preview on :4173)
 * through the instructor and oversight flows in headless Chromium.
 *
 *   npx vite build && npx vite preview --port 4173 &   # then
 *   node scripts/qa.mjs
 */
import { chromium } from "playwright";
import { readFileSync, mkdirSync } from "node:fs";

const BASE = process.env.QA_BASE ?? "http://localhost:4173";
const SHOTS = "qa/screenshots";
mkdirSync(SHOTS, { recursive: true });

const results = [];
const corpus = []; // innerText of every state visited, for the label audit
let failures = 0;

function pass(item, note = "") { results.push({ item, ok: true, note }); console.log(`  ✓ ${item}${note ? " — " + note : ""}`); }
function fail(item, note = "") { results.push({ item, ok: false, note }); failures++; console.log(`  ✗ ${item}${note ? " — " + note : ""}`); }
async function check(item, fn) {
  try { const note = await fn(); pass(item, typeof note === "string" ? note : ""); }
  catch (e) { fail(item, e?.message ?? String(e)); }
}
function assert(cond, msg) { if (!cond) throw new Error(msg); }

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
await ctx.grantPermissions(["clipboard-read", "clipboard-write"]).catch(() => {});
const page = await ctx.newPage();
const consoleErrors = [];
page.on("console", (m) => {
  if (m.type() !== "error") return;
  // The fake-key verify step deliberately triggers a 401 from api.anthropic.com; the browser logs it as a resource error.
  if (/Failed to load resource.*401/.test(m.text())) return;
  consoleErrors.push(m.text());
});
page.on("pageerror", (e) => consoleErrors.push("pageerror: " + e.message));

async function go(path) {
  await page.goto(BASE + path, { waitUntil: "networkidle" });
  await page.waitForTimeout(150);
  await snapshotText(path);
}
async function snapshotText(tag) {
  const t = await page.locator("body").innerText();
  corpus.push({ tag, text: t });
  return t;
}
async function shot(name) { await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true }); }

const ROUTES = {
  "/": ["Orientation", "Getting started"],
  "/notes": ["Orientation", "Design notes and assumptions"],
  "/about": ["Orientation", "About VARIA"],
  "/import": ["Instructor · step 0 of 5", "Load an assessment you already have"],
  "/blueprint": ["Instructor · step 1 of 5", "Assessment blueprint"],
  "/generate": ["Instructor · step 2 of 5", "Generate student versions"],
  "/report": ["Instructor · step 3 of 5", "Integrity report — Model card audit"],
  "/roster": ["Instructor · step 4 of 5", "Release and roster"],
  "/grade": ["Instructor · step 5 of 5", "Grade with the rubric"],
  "/grade/v-07": ["Instructor · step 5 of 5", "Grade with the rubric"],
  "/surface": ["Oversight", "Strategy trade-off surface"],
  "/console": ["Oversight", "Institution compliance console"],
  "/settings": ["Setup", "Your Claude key and models"],
};

console.log("\n1. Routes render with rail, crumb, title, no console errors");
for (const [path, [crumb, title]] of Object.entries(ROUTES)) {
  await check(`route ${path}`, async () => {
    await go(path);
    const header = await page.locator(".va-header").innerText();
    assert(header.toLowerCase().includes(crumb.toLowerCase()), `crumb missing: ${header}`);
    assert(header.includes(title), `title missing: ${header}`);
    assert(await page.locator("aside, .va-rail").count() > 0, "rail missing");
    await shot(path === "/" ? "start" : path.slice(1).replace(/\//g, "_"));
  });
}
await check("deep-link hard reload on /roster", async () => {
  await go("/roster");
  await page.reload({ waitUntil: "networkidle" });
  assert((await page.locator(".va-header").innerText()).includes("Release and roster"), "title after reload");
});
await check("no console errors so far", async () => { assert(consoleErrors.length === 0, consoleErrors.join(" | ")); });

console.log("\n2. Header chips");
await check("header shows course tag and demo chip", async () => {
  await go("/");
  const h = await page.locator(".va-header").innerText();
  assert(h.includes("DAT 4100 · Fall 2026"), "course tag");
  assert(h.includes("Demo mode · add a key"), "demo chip");
  await page.locator(".va-header").getByText("Demo mode · add a key").click();
  await page.waitForURL("**/settings");
});

console.log("\n3. Rail");
await check("rail sections and labels", async () => {
  await go("/notes");
  const rail = await page.locator("aside, .va-rail").first().innerText();
  for (const s of ["Orientation", "Instructor", "Oversight", "Setup"]) assert(rail.toLowerCase().includes(s.toLowerCase()), `section ${s}`);
  for (const l of ["Getting started", "Design notes", "About", "0 · Load your assessment", "1 · Blueprint", "2 · Generate variants", "3 · Integrity report", "4 · Release & roster", "5 · Grade with rubric", "Trade-off surface", "Compliance console", "API key & models"]) assert(rail.includes(l), `label ${l}`);
  const current = await page.locator('[aria-current="page"]').innerText();
  assert(current.includes("Design notes"), `aria-current is ${current}`);
});

console.log("\n4. Report (seeded run)");
await check("report content", async () => {
  await go("/report");
  const t = await snapshotText("/report-seeded");
  assert(t.includes("0.87"), "J 0.87");
  const labels = ["Versions look different", "Same skill measured", "One rubric grades them all", "Equally hard to read"];
  let last = -1;
  for (const l of labels) { const i = t.indexOf(l); assert(i > last, `order ${l}`); last = i; }
  const pills = await page.locator(".va-check .va-pill, .va-pill").allInnerTexts();
  const seq = pills.map((p) => p.trim());
  for (const p of ["Pass", "Advisory", "Over threshold"]) assert(seq.some((x) => x.toLowerCase() === p.toLowerCase()), `pill ${p}: ${seq.join(",")}`);
  assert(t.includes("Three versions read three grade levels above the rest"), "P4 note");
  const polylines = await page.locator("svg polyline").count();
  assert(polylines === 34, `polylines ${polylines}`);
  assert(t.includes("v-12, v-19, v-27"), "outlier label");
  assert(await page.getByRole("button", { name: /Regenerate 3 and release/ }).count() === 1, "regenerate button");
  assert(t.includes("Open roster") || t.includes("Release all 34 anyway"), "release/roster action");
  return `${polylines} polylines`;
});

console.log("\n5. Roster");
await check("roster tiles and rows", async () => {
  await go("/roster");
  const t = await snapshotText("/roster-seeded");
  for (const s of ["Released\n34", "Submitted\n27", "Graded\n11", "Difficulty appeals\n1"]) assert(t.toLowerCase().includes(s.toLowerCase()), `tile ${s}`);
  const alvarez = await page.locator("tr", { hasText: "Alvarez, R." }).innerText();
  for (const s of ["v-04", "Lending · risk officer", "52.1", "Graded", "10 / 12"]) assert(alvarez.includes(s), `Alvarez ${s}`);
  const gordon = await page.locator("tr", { hasText: "Gordon, T." }).innerText();
  assert(gordon.includes("v-19") && /appeal/i.test(gordon), "Gordon appeal");
  assert(t.includes("Showing 8 of 34"), "showing 8 of 34");
  await page.locator("tr", { hasText: "Bhatt, N." }).click();
  await page.waitForURL("**/grade/v-07");
});

console.log("\n6. Grade v-07");
await check("grade and save", async () => {
  await go("/grade/v-07");
  const t = await snapshotText("/grade-v07");
  assert(t.includes("Bhatt, N."), "student");
  assert(t.includes("Northline Talent Systems"), "task text");
  assert(/submission/i.test(t), "submission block");
  const groups = page.locator('[role="radiogroup"]');
  assert(await groups.count() >= 4, "four rubric rows");
  const picks = [3, 2, 2, 3];
  for (let i = 0; i < 4; i++) {
    await groups.nth(i).locator("label", { hasText: new RegExp(`^\\s*${picks[i]}\\s*$`) }).click();
  }
  const save = page.getByRole("button", { name: /Save score/ });
  assert(await save.isEnabled(), "save enabled");
  await save.click();
  await page.waitForTimeout(400);
  assert(!page.url().endsWith("/grade/v-07"), `did not advance: ${page.url()}`);
  await go("/roster");
  const bhatt = await page.locator("tr", { hasText: "Bhatt, N." }).innerText();
  assert(bhatt.includes("Graded") && /\d+ \/ 12/.test(bhatt), `Bhatt row: ${bhatt}`);
  return bhatt.match(/\d+ \/ 12/)[0];
});

console.log("\n7. Surface / About / Console (read-only)");
await check("surface legend and table", async () => {
  await go("/surface");
  const t = await page.locator("body").innerText();
  for (const s of ["1 — Zero-shot · J 0.867", "2 — Structured CoT · J 0.876", "3 — No-construct-map CoT · J 0.877", "4 — Dimension-preserving · J 0.819", "5 — Few-shot · J 0.806", "6 — No-negative-anchors few-shot · J 0.807"]) assert(t.includes(s), `legend ${s}`);
  assert(t.includes("Llama 3.2 3B") && t.includes("GPT-2 small"), "reference labels");
  const rows = await page.locator("table tbody tr").count();
  assert(rows >= 8, `condition rows ${rows}`);
});
await check("about page", async () => {
  await go("/about");
  const link = page.locator('a[href="https://osf.io/preprints/edarxiv/u6xef_v1"]').first();
  assert(await link.count() > 0, "paper link");
  assert((await link.getAttribute("target")) === "_blank", "target blank");
  const t = await page.locator("body").innerText();
  assert(t.includes("VARIA is developed at Miami Dade College under the AI Assessment Grant"), "grant paragraph");
  assert(t.includes("Lead faculty") && t.includes("Dr. Ernesto Lee"), "facts table");
  await page.getByRole("button", { name: /Copy citation/ }).click();
  await page.waitForTimeout(200);
});
await check("console tiles, rows, filter", async () => {
  await go("/console");
  const t = await snapshotText("/console-seeded");
  for (const s of ["Variant sets in use\n63", "Passing all four\n54", "Released over threshold\n7", "Unreviewed > 14 days\n2"]) assert(t.toLowerCase().includes(s.toLowerCase()), `tile ${s}`);
  const mca = await page.locator("tr", { hasText: "DAT 4100 · Model card audit" }).innerText();
  assert(/over threshold/i.test(mca), "MCA over threshold");
  const enc = await page.locator("tr", { hasText: "ENC 1102 · Source evaluation" }).innerText();
  assert(/blocked/i.test(enc), "ENC blocked");
  const before = await page.locator("table tbody tr").count();
  await page.locator('label.seg-opt', { hasText: "Flagged" }).first().click();
  await page.waitForTimeout(100);
  const flaggedRows = await page.locator("table").first().locator("tbody tr").allInnerTexts();
  assert(flaggedRows.every((r) => /over threshold|blocked/i.test(r)), "flagged filter shows only flagged");
  assert(await page.locator("table").first().locator("tbody tr").count() <= before, "filter reduced or equal");
  await page.locator('label.seg-opt', { hasText: "All" }).first().click();
});

console.log("\n8. Import (demo) — paste text → draft → blueprint");
await check("paste text extraction", async () => {
  await go("/import");
  await page.getByRole("button", { name: /Paste text instead/ }).click();
  await page.locator("textarea").first().fill("Assignment 4 — Stakeholder memo (10 points)\nTranslate a confusion-matrix finding into a one-page memo for a non-technical executive.\nRubric\nDecision relevance (4) · Accuracy of the technical claim (3) · Clarity for a non-technical reader (3)");
  await page.getByRole("button", { name: /Read text/ }).click();
  await page.getByText("What the system pulled out").waitFor({ timeout: 8000 });
  await page.waitForTimeout(300);
  const t = await snapshotText("/import-draft");
  assert(/uploaded/i.test(t), "uploaded table");
  assert(/criterion/i.test(t), "criteria table");
  assert(t.includes("One thing needs you") || t.includes("needs you"), "needs-you panel");
  await shot("import_draft");
  await page.getByRole("button", { name: /^Open as blueprint$/ }).click();
  await page.waitForURL("**/blueprint");
  await snapshotText("/blueprint-after-import");
});

console.log("\n9. Generate (demo) → report → regenerate → roster");
await check("demo generate flow", async () => {
  await go("/generate");
  const btn = page.getByRole("button", { name: /Generate \d+ versions/ });
  const label = await btn.innerText();
  await btn.click();
  await page.locator(".va-progress, [class*=progress]").first().waitFor({ timeout: 5000 }).catch(() => {});
  await snapshotText("/generate-progress");
  await page.waitForURL("**/report", { timeout: 40000 });
  await page.waitForTimeout(300);
  const t = await snapshotText("/report-generated");
  assert(t.includes("Versions look different") && t.includes("Equally hard to read"), "four checks");
  await shot("report_generated");
  const regen = page.getByRole("button", { name: /Regenerate \d+ and release/ });
  if (await regen.count()) {
    await regen.click();
    await page.getByText(/^Released /).first().waitFor({ timeout: 40000 });
  } else {
    const clean = page.getByRole("button", { name: /^Release \d+ versions$/ });
    assert(await clean.count() === 1, "expected regenerate or clean release button");
    await clean.click();
    await page.getByText(/^Released /).first().waitFor({ timeout: 5000 });
  }
  await snapshotText("/report-released");
  await go("/roster");
  const r = await page.locator("body").innerText();
  assert(/Released\n34/i.test(r), "roster Released 34");
  return label;
});

console.log("\n10. Settings — key, verify, forget, export, reset");
await check("settings key flow", async () => {
  await go("/settings");
  await page.locator('input[placeholder="sk-ant-…"]').fill("sk-ant-test");
  await page.getByRole("button", { name: /^Save key$/ }).click();
  await page.waitForTimeout(200);
  const h = await page.locator(".va-header").innerText();
  assert(!h.includes("Demo mode"), `header still demo: ${h}`);
  assert(/Claude (Opus|Sonnet)/.test(h), `header model chip: ${h}`);
  await page.getByRole("button", { name: /^Verify key$/ }).click();
  await page.waitForTimeout(6000);
  const t = await snapshotText("/settings-verified");
  assert(/rejected|could not reach|invalid|failed/i.test(t), "verify feedback shown");
  await shot("settings_key");
  await page.getByRole("button", { name: /^Forget key$/ }).first().click();
  await page.locator(".dialog").getByRole("button", { name: /Forget key/ }).click();
  await page.waitForTimeout(200);
  assert((await page.locator(".va-header").innerText()).includes("Demo mode"), "back to demo");
});
await check("export workspace download", async () => {
  await go("/settings");
  const [dl] = await Promise.all([page.waitForEvent("download", { timeout: 5000 }), page.getByRole("button", { name: /Export workspace/ }).click()]);
  assert((dl.suggestedFilename() || "").length > 0, "filename");
  return dl.suggestedFilename();
});
await check("reset to demo restores seeded report", async () => {
  await go("/settings");
  await page.getByRole("button", { name: /Reset to demo data/ }).click();
  await page.locator(".dialog .btn-primary, .dialog button.blueprint").first().click();
  await page.waitForTimeout(300);
  await go("/report");
  const t = await page.locator("body").innerText();
  assert(t.includes("0.87") && t.includes("Three versions read three grade levels"), "seeded report back");
});

console.log("\n11. Import — CSV roster upload");
await check("csv roster upload", async () => {
  await go("/import");
  const csv = "name,email\nAlvarez, R.,ra@x.edu\nBhatt, N.,nb@x.edu\nChen, W.,wc@x.edu\nDuarte, S.,sd@x.edu\nFerreira, M.,mf@x.edu\n";
  await page.locator('input[type="file"]').first().setInputFiles({ name: "roster.csv", mimeType: "text/csv", buffer: Buffer.from(csv) });
  await page.waitForTimeout(2500);
  const t = await snapshotText("/import-csv");
  assert(t.includes("5 enrolled students"), `roster not recognised:\n${t.slice(0, 600)}`);
});

console.log("\n12. Console — threshold edit does not re-clear released sets");
await check("threshold edit + audit", async () => {
  await go("/settings");
  await page.getByRole("button", { name: /Reset to demo data/ }).click();
  await page.locator(".dialog .btn-primary, .dialog button.blueprint").first().click();
  await page.waitForTimeout(300);
  await go("/console");
  const row = page.locator("tr", { hasText: "Difficulty parity" }).last();
  await row.getByRole("button", { name: /^Edit$/ }).click();
  const input = row.locator('input[type="number"]');
  await input.fill("9");
  await input.press("Enter");
  await page.waitForTimeout(200);
  const t = await snapshotText("/console-threshold");
  assert(t.includes("≤ 9"), "threshold shows 9");
  const audit = await page.locator("text=Audit trail").locator("..").innerText();
  assert(/Difficulty parity.*(8|9)/.test(audit.split("\n").slice(0, 4).join(" ")), `audit top: ${audit.slice(0, 200)}`);
  await go("/report");
  const pills = (await page.locator(".va-pill").allInnerTexts()).map((p) => p.trim().toLowerCase());
  assert(pills.includes("over threshold"), `report pill changed: ${pills.join(",")}`);
});

console.log("\n13. Label audit vs mockup");
await check("mockup h6/th labels present", async () => {
  const html = readFileSync("mockups/VARIA App.dc.html", "utf8");
  const labels = new Set();
  for (const m of html.matchAll(/<(h6|th)[^>]*>([\s\S]*?)<\/\1>/g)) {
    const txt = m[2].replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&gt;/g, ">").replace(/\s+/g, " ").trim();
    if (txt && txt !== "—") labels.add(txt);
  }
  const all = corpus.map((c) => c.text.replace(/\s+/g, " ")).join("\n").toLowerCase();
  const missing = [...labels].filter((l) => !all.includes(l.toLowerCase()));
  assert(missing.length === 0, `missing: ${missing.join(" | ")}`);
  return `${labels.size} labels`;
});

console.log("\n14. Console errors across the whole run");
await check("no console/page errors", async () => { assert(consoleErrors.length === 0, consoleErrors.join(" | ")); });

await browser.close();
console.log(`\n${results.filter((r) => r.ok).length} passed, ${failures} failed`);
process.exit(failures ? 1 : 0);
