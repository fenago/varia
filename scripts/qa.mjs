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
  "/": ["Home", "Proof an employer can verify"],
  "/start": ["Orientation", "Getting started"],
  "/summary": ["Orientation", "Executive summary"],
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
    await shot(path === "/" ? "home" : path.slice(1).replace(/\//g, "_"));
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
  for (const l of ["Home", "Who it's for", "Getting started", "Design notes", "About", "0 · Load your assessment", "1 · Blueprint", "2 · Generate variants", "3 · Integrity report", "4 · Release & roster", "5 · Grade with rubric", "Trade-off surface", "Compliance console", "API key & models"]) assert(rail.includes(l), `label ${l}`);
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


// ---------------------------------------------------------------------------
// Employer-outcomes bridge
// ---------------------------------------------------------------------------
async function resetDemo() {
  await go("/settings");
  await page.getByRole("button", { name: /Reset to demo data/ }).click();
  await page.locator(".dialog .btn-primary, .dialog button.blueprint").first().click();
  await page.waitForTimeout(300);
}
function fieldInput(scope, label) { return scope.locator(`.field:has(label:has-text("${label}"))`).locator("input, textarea").first(); }
async function fillReviewForm(p, { name, role, org, email, status = "Validated", attest = true, scenarioValue = null, likert = 4 }) {
  if (scenarioValue) {
    const add = p.locator('input[aria-label="Add a organisation and scenario"]');
    await add.fill(scenarioValue);
    await add.press("Enter");
    await p.waitForTimeout(100);
  }
  await fieldInput(p, "Your name").fill(name);
  await fieldInput(p, "Your role").fill(role);
  await fieldInput(p, "Organisation").fill(org);
  await fieldInput(p, "Work email").fill(email);
  await p.locator('label:has(input[name="status"])', { hasText: status }).first().click();
  if (attest) await p.locator('label:has-text("This rubric reflects what we hire or promote for") input[type="checkbox"]').check();
  const groups = p.locator(".va-likert .seg");
  const n = await groups.count();
  for (let i = 0; i < n; i++) await groups.nth(i).locator("label", { hasText: new RegExp(`^\\s*${likert}\\s*$`) }).click();
}
let mcaBlueprintId = null;
let verifyLink = null;

console.log("\n15. Employer validation page");
await check("rail + employer page tiles, partners, blueprints, history, records", async () => {
  await resetDemo();
  await go("/employer");
  const rail = await page.locator(".va-rail").innerText();
  assert(rail.includes("Employer validation"), "rail label");
  const t = await snapshotText("/employer-seeded");
  for (const s of ["67%", "33%", "4.3", "goal 75%", "goal 50%"]) assert(t.includes(s), `tile text ${s}`);
  for (const org of ["Bayfront Regional Bank", "Coral Health Network", "Northline Talent Systems"]) assert(await page.locator("tr", { hasText: org }).count() >= 1, `partner ${org}`);
  assert(await page.locator("tr", { hasText: "Bayfront Regional Bank" }).filter({ has: page.locator('input[type="checkbox"]') }).first().locator('input[type="checkbox"]').isChecked(), "Bayfront adopted checked");
  const mca = await page.locator("tr", { hasText: "Model card audit" }).filter({ hasNot: page.locator('button:has-text("In use"), button:has-text("Use in blueprint")') }).first().innerText();
  assert(/pending/i.test(mca), `B1 pending: ${mca}`);
  for (const bp of ["Stakeholder memo", "Ethical risk decomposition"]) assert(/validated/i.test(await page.locator("tr", { hasText: bp }).first().innerText()), `${bp} validated`);
  const hist = await page.locator("text=Validation history").locator("..").innerText();
  assert(hist.includes("Bayfront Regional Bank") && hist.includes("Coral Health Network"), "history two entries");
  assert(t.includes("VR-2026-0001") && t.includes("VR-2026-0002"), "evidence records table");
  await shot("employer");
});

console.log("\n16. In-workspace employer review");
await check("review pending blueprint in this browser", async () => {
  await go("/employer");
  await page.locator("tr", { hasText: "Model card audit" }).filter({ has: page.getByRole("button", { name: /^Review here$/ }) }).first().getByRole("button", { name: /^Review here$/ }).click();
  await page.waitForURL(/\/review\/[^/?]+/);
  mcaBlueprintId = page.url().match(/\/review\/([^/?#]+)/)[1];
  await page.waitForTimeout(200);
  const t = await snapshotText("/review-workspace");
  assert(await page.locator(".va-rail").count() === 0, "no instructor rail");
  assert(await page.locator(".va-review-bar").count() === 1, "review bar");
  for (const s of ["What this assessment measures", "The rubric", "The scenario bank", "Sample versions", "Integrity of the version set", "Sign off"]) assert(t.toLowerCase().includes(s.toLowerCase()), `section ${s}`);
  assert(/fairness/i.test(t) && /robustness/i.test(t) && /documentation/i.test(t) && /prioritis/i.test(t), "four criteria");
  assert(await page.locator(".va-chips").count() >= 4, "chip editors for unlocked dims");
  assert(await page.locator(".va-stamp").count() >= 4, "integrity stamps");
  await shot("review");
  await fillReviewForm(page, { name: "Priya Natarajan", role: "HR director", org: "Northline Talent Systems", email: "hr@northline.example", scenarioValue: "QA Test Scenario · returns classifier" });
  await page.getByRole("button", { name: /^Record this review$/ }).click();
  await page.waitForURL("**/employer");
  await page.waitForTimeout(200);
  const e = await snapshotText("/employer-after-review");
  assert(e.includes("100%"), "validated tile 100%");
  assert(/validated/i.test(await page.locator("tr", { hasText: "Model card audit" }).filter({ hasNot: page.locator('button:has-text("In use"), button:has-text("Use in blueprint")') }).first().innerText()), "B1 validated");
  await go(`/review/${mcaBlueprintId}`);
  assert((await page.locator("body").innerText()).includes("QA Test Scenario"), "scenario value persisted on blueprint");
});

console.log("\n17. Link round-trip in a fresh browser context");
await check("copy review link → fresh context review → result link → applied", async () => {
  await go("/employer");
  const row = page.locator("tr", { hasText: "Stakeholder memo" }).first();
  await row.locator('select[aria-label="Partner for the review link"]').selectOption({ label: "Northline Talent Systems" });
  await row.getByRole("button", { name: /^Copy review link$/ }).click();
  const link = await row.locator(".va-copyfield input").inputValue();
  assert(link.includes("/review#pkg="), `link ${link.slice(0, 60)}`);
  const ctx2 = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const p2 = await ctx2.newPage();
  const errs2 = [];
  p2.on("pageerror", (e) => errs2.push(e.message));
  await p2.goto(link, { waitUntil: "networkidle" });
  await p2.waitForTimeout(300);
  const bar = await p2.locator(".va-review-bar").innerText();
  assert(bar.includes("Reviewing for Northline Talent Systems"), `bar: ${bar}`);
  await fillReviewForm(p2, { name: "Priya Natarajan", role: "HR director", org: "Northline Talent Systems", email: "hr@northline.example" });
  await p2.getByRole("button", { name: /^Finish review$/ }).click();
  await p2.locator(".va-copyfield input").first().waitFor({ timeout: 5000 });
  const result = await p2.locator(".va-copyfield input").first().inputValue();
  assert(result.includes("/employer#result="), `result ${result.slice(0, 60)}`);
  assert(errs2.length === 0, errs2.join(" | "));
  await ctx2.close();
  const before = await page.locator("text=Validation history").locator("..").innerText().catch(() => "");
  await page.goto(result, { waitUntil: "networkidle" });
  await page.waitForTimeout(400);
  const t = await snapshotText("/employer-result-applied");
  assert(t.includes("Applied: Northline Talent Systems validated"), "applied line");
  const hist = await page.locator("text=Validation history").locator("..").innerText();
  assert(hist.includes("imported"), "history entry marked imported");
  assert(hist.length > before.length, "history grew");
});

console.log("\n18. Consumer email warning");
await check("gmail address warns", async () => {
  await go(`/review/${mcaBlueprintId}`);
  await fieldInput(page, "Organisation").fill("Acme Corp");
  await fieldInput(page, "Work email").fill("someone@gmail.com");
  await fieldInput(page, "Your name").click();
  await page.waitForTimeout(100);
  assert((await page.locator("body").innerText()).includes("Use your work address at Acme Corp"), "warning text");
});

console.log("\n19. Evidence record v-04 / v-07");
await check("evidence v-04 content, Open Badges download, sign, links", async () => {
  await go("/evidence/v-04");
  const t = await snapshotText("/evidence-v04");
  assert(t.includes("VR-2026-0001"), "record id");
  assert(/L-[0-9a-f]{12}/.test(t), "learner id");
  assert(/Signed ·|Unsigned/i.test(t), "signature stamp");
  for (const s of ["Employer validation", "Integrity of the assessment set", "How to verify"]) assert(t.toLowerCase().includes(s.toLowerCase()), `section ${s}`);
  assert(/[0-9a-f]{64}/.test(t), "hash");
  assert(await page.locator(".va-stamp").count() >= 6, "stamps");
  const [dl] = await Promise.all([page.waitForEvent("download", { timeout: 5000 }), page.getByRole("button", { name: /Download Open Badges 3\.0/ }).click()]);
  const path = await dl.path();
  const json = JSON.parse(readFileSync(path, "utf8"));
  const ctxs = JSON.stringify(json["@context"]);
  assert(ctxs.includes("https://www.w3.org/ns/credentials/v2") && ctxs.includes("purl.imsglobal.org/spec/ob/v3p0"), `contexts ${ctxs}`);
  assert(!JSON.stringify(json).includes("Alvarez"), "no student name in credential");
  const sign = page.getByRole("button", { name: /^Sign record$/ });
  if (await sign.count()) {
    await sign.click();
    await page.waitForTimeout(600);
    assert(/Signed ·/i.test(await page.locator("body").innerText()), "signed after click");
  }
  assert(await page.locator('a[href="/verify/VR-2026-0001"]').count() === 1, "verify link");
  assert(await page.locator('a[href="/share/VR-2026-0001"]').count() === 1, "share link");
  await shot("evidence_v04");
});
await check("evidence v-07 not graded → grade → issue VR-2026-0003", async () => {
  await go("/evidence/v-07");
  const t = await page.locator("body").innerText();
  assert(/not graded/i.test(t), "not graded stamp");
  assert(await page.getByRole("button", { name: /^Issue record$/ }).count() === 0, "no issue button");
  await go("/grade/v-07");
  const groups = page.locator('[role="radiogroup"]');
  for (let i = 0; i < 4; i++) await groups.nth(i).locator("label", { hasText: /^\s*3\s*$/ }).click();
  await page.getByRole("button", { name: /Save score/ }).click();
  await page.waitForTimeout(300);
  await go("/evidence/v-07");
  await page.getByRole("button", { name: /^Issue record$/ }).click();
  await page.waitForTimeout(600);
  const after = await snapshotText("/evidence-v07-issued");
  assert(after.includes("VR-2026-0003"), `issued id missing: ${after.slice(0, 300)}`);
});

console.log("\n20. Student share → verify in a fresh context → record verification");
await check("share, verify (no name), record verification, audit", async () => {
  await go("/share/VR-2026-0001");
  const t = await snapshotText("/share");
  assert(t.includes("Alvarez"), "student sees own name");
  await page.locator('input[placeholder="e.g. Bayfront Regional Bank"]').fill("Coral Health Network");
  await page.locator('label:has-text("I choose to share") input[type="checkbox"]').check();
  await page.getByRole("button", { name: /Share and get a verify link/ }).click();
  await page.locator(".va-copyfield input").first().waitFor({ timeout: 8000 });
  verifyLink = await page.locator(".va-copyfield input").first().inputValue();
  assert(verifyLink.includes("/verify/VR-2026-0001#rec="), `verify link ${verifyLink.slice(0, 60)}`);
  await shot("share");
  const ctx2 = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const p2 = await ctx2.newPage();
  const errs2 = [];
  p2.on("pageerror", (e) => errs2.push(e.message));
  await p2.goto(verifyLink, { waitUntil: "networkidle" });
  await p2.getByText("Record verified").waitFor({ timeout: 8000 });
  const v = await p2.locator("body").innerText();
  assert(!v.includes("Alvarez"), "no student name on verify page");
  assert(/Signed ·/i.test(v), "signature verified line");
  await p2.screenshot({ path: `${SHOTS}/verify_bundle.png`, fullPage: true });
  assert(errs2.length === 0, errs2.join(" | "));
  await ctx2.close();
  await go("/verify/VR-2026-0001");
  await page.getByText("Record verified").waitFor({ timeout: 8000 });
  await page.locator('input[placeholder="e.g. Bayfront Regional Bank"]').fill("Coral Health Network");
  await page.getByRole("button", { name: /^Record this verification$/ }).click();
  await page.waitForTimeout(200);
  assert((await page.locator("body").innerText()).includes("Recorded"), "recorded");
  await go("/console");
  const audit = await page.locator("text=Audit trail").locator("..").innerText();
  assert(/Coral Health Network verified VR-2026-0001/.test(audit), `audit: ${audit.slice(0, 200)}`);
});

console.log("\n21. Tamper check");
await check("tampered bundle does not verify and does not crash", async () => {
  const i = verifyLink.indexOf("#rec=") + 5 + 40;
  const ch = verifyLink[i] === "A" ? "B" : "A";
  const tampered = verifyLink.slice(0, i) + ch + verifyLink.slice(i + 1);
  const ctx2 = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const p2 = await ctx2.newPage();
  const errs2 = [];
  p2.on("pageerror", (e) => errs2.push(e.message));
  await p2.goto(tampered, { waitUntil: "networkidle" });
  await p2.waitForTimeout(1500);
  const v = await p2.locator("body").innerText();
  assert(!v.includes("Record verified"), "must not verify");
  assert(/Hash mismatch|Signature invalid|could not|invalid|not a varia|unreadable|corrupt|failed/i.test(v), `no clear failure text: ${v.slice(0, 300)}`);
  assert(errs2.length === 0, errs2.join(" | "));
  await ctx2.close();
});

console.log("\n22. Print media");
await check("print hides chrome, shows record header", async () => {
  await go("/evidence/v-04");
  await page.emulateMedia({ media: "print" });
  await page.waitForTimeout(100);
  assert(!(await page.locator(".va-review-bar").isVisible()), "bar hidden");
  assert(!(await page.getByRole("button", { name: /Print \/ Save as PDF/ }).isVisible()), "action row hidden");
  const ph = page.locator(".va-print-header");
  assert(await ph.isVisible(), "print header visible");
  assert((await ph.innerText()).includes("VR-2026-0001"), "print header id");
  await page.screenshot({ path: `${SHOTS}/evidence_print.png`, fullPage: true });
  await page.emulateMedia({ media: "screen" });
});

console.log("\n23. Console / Roster / Grade wiring");
await check("employer tiles, evidence column, grade line", async () => {
  await go("/console");
  const c = await page.locator("body").innerText();
  assert(/employer outcomes/i.test(c) && /Manage on Employer validation/i.test(c), "console employer row");
  await go("/roster");
  assert((await page.locator("tr", { hasText: "Alvarez, R." }).innerText()).includes("VR-2026-0001"), "Alvarez evidence");
  assert((await page.locator("tr", { hasText: "Ferreira, M." }).innerText()).includes("VR-2026-0002"), "Ferreira evidence");
  await go("/grade/v-04");
  const g = await page.locator("body").innerText();
  assert(/Evidence record\s+VR-2026-0001\s+issued/.test(g.replace(/\n/g, " ")), "grade evidence line");
});

console.log("\n24. Migration from a pre-bridge workspace");
await check("stripped workspace loads with employer data and bridge fields", async () => {
  await resetDemo();
  await go("/settings");
  await page.evaluate(() => {
    const raw = localStorage.getItem("varia.workspace.v1");
    const obj = JSON.parse(raw);
    for (const k of ["employerPartners", "employerValidations", "evidenceRecords", "verificationEvents", "signingKey"]) delete obj.state[k];
    localStorage.setItem("varia.workspace.v1", JSON.stringify(obj));
  });
  await page.reload({ waitUntil: "networkidle" });
  await go("/employer");
  const t = await page.locator("body").innerText();
  for (const s of ["Bayfront Regional Bank", "Coral Health Network", "Northline Talent Systems", "VR-2026-0001", "VR-2026-0002"]) assert(t.includes(s), `after migration ${s}`);
  await go("/evidence/v-04");
  assert(/L-[0-9a-f]{12}/.test(await page.locator("body").innerText()), "learner id after migration");
});

console.log("\n25. Reset restores employer tiles");
await check("reset → 67% / 33% / 4.3", async () => {
  await resetDemo();
  await go("/employer");
  const t = await page.locator("body").innerText();
  for (const s of ["67%", "33%", "4.3"]) assert(t.includes(s), `tile ${s}`);
});

console.log("\n26. Label audit for the new pages");
await check("employer/review/evidence headings present", async () => {
  const want = ["Employer partners", "Blueprints and their validation", "Bring in a result", "Validation history", "Evidence records",
    "What this assessment measures", "The rubric", "The scenario bank", "Sample versions", "Sign off",
    "What was assessed", "The task this student received", "Rubric and result", "Employer validation", "Integrity of the assessment set", "How to verify"];
  const all = corpus.map((c) => c.text.replace(/\s+/g, " ")).join("\n").toLowerCase();
  const missing = want.filter((l) => !all.includes(l.toLowerCase()));
  assert(missing.length === 0, `missing: ${missing.join(" | ")}`);
  return `${want.length} labels`;
});


// ---------------------------------------------------------------------------
// Employability bridge
// ---------------------------------------------------------------------------
async function selectByLabel(sel, re) {
  const opts = await sel.locator("option").all();
  for (const o of opts) { if (re.test(await o.innerText())) { await sel.selectOption(await o.getAttribute("value")); return; } }
  throw new Error(`no option matching ${re}`);
}
async function funnelValues(scope = page) {
  const cells = scope.locator(".va-funnel .va-funnel-cell");
  const n = await cells.count();
  const out = {};
  for (let i = 0; i < n; i++) {
    const t = (await cells.nth(i).innerText()).trim();
    const m = t.match(/^(\d+)\s*\n\s*([^\n]+)/);
    if (m) out[m[2].trim()] = Number(m[1]);
  }
  return out;
}
function expectFunnel(f, want) {
  for (const [k, v] of Object.entries(want)) assert(f[k] === v, `funnel ${k}: ${f[k]} (want ${v}) — ${JSON.stringify(f)}`);
}
const FUNNEL_SEED = { "Challenges contributed": 3, "Students who completed one": 11, "Work samples shared": 1, "Endorsed": 1, "Interviewed": 1, "Hired": 0 };
async function wsState() { return page.evaluate(() => JSON.parse(localStorage.getItem("varia.workspace.v1")).state); }
async function partnerIds() { const st = await wsState(); return Object.fromEntries(st.employerPartners.map((p) => [p.organisation, p.id])); }
async function recordHash(id) { const st = await wsState(); return st.evidenceRecords.find((r) => r.id === id)?.hash; }

const AUDIENCE = {
  students: { promise: "Your work counts, and it travels.", action: "/portfolio" },
  instructors: { promise: "Keep your assignment. Lose the proctoring.", action: "/import" },
  institutions: { promise: "Integrity you can audit, without surveillance.", action: "/console" },
  employers: { promise: "Hire from work samples, on your problems.", action: "/talent" },
};

console.log("\n27. Who it's for — overview, audience pages, Start strip");
await check("/for overview and the four audience pages", async () => {
  await go("/for");
  const t = await page.locator("body").innerText();
  assert(t.includes("Four people, one artifact"), "hero title");
  for (const s of ["Challenge", "Version", "Work sample", "Portfolio", "Talent view", "Outcome"]) assert(t.includes(s), `pipeline step ${s}`);
  assert(t.toLowerCase().includes("read the executive summary"), "exec summary link");
  await page.getByRole("button", { name: /read the executive summary/i }).click();
  await page.waitForURL("**/summary");
  const st0 = (await page.locator("body").innerText()).toLowerCase();
  for (const k of ["why now", "what varia does", "what the college gets", "the evidence behind it", "what an administrator can do this term"]) assert(st0.includes(k), `summary section ${k}`);
  await go("/for");
  const readMore = page.getByRole("link", { name: /Read more/ });
  assert((await readMore.count()) === 4, `read-more links ${await readMore.count()}`);
  await shot("for");
  for (const [key, a] of Object.entries(AUDIENCE)) {
    await go("/for");
    await page.locator(`a[href="/for/${key}"]`).first().click();
    await page.waitForURL(`**/for/${key}`);
    await page.waitForTimeout(150);
    const tt = await snapshotText(`/for/${key}`);
    assert(tt.includes(a.promise), `${key} promise`);
    assert(tt.toLowerCase().includes("what it costs you"), `${key} cost box`);
    const blocks = await page.locator(".va-two .blueprint, .va-two > .blueprint").count();
    assert(blocks >= 5, `${key} what-you-get blocks ${blocks}`);
    if (key === "employers") await shot("for_employers");
    await page.locator(".btn-primary.blueprint").first().click();
    await page.waitForURL(`**${a.action}**`);
  }
  await go("/for/unknown");
  assert(/\/for\/?$/.test(page.url()), `unknown audience url ${page.url()}`);
  await go("/start");
  const st = await page.locator("body").innerText();
  const stl = st.toLowerCase(); const i1 = stl.indexOf("who this is for"), i2 = stl.indexOf("the whole thing, in six steps");
  assert(i1 > 0 && i2 > i1, `start strip order ${i1} ${i2}`);
});

console.log("\n27b. Home page demonstrates value");
await check("home: north star, six live path panels, bottom line, four shift columns, trust", async () => {
  await go("/");
  const t = (await page.locator("body").innerText()).toLowerCase();
  assert(t.includes("every student does real work on an employer's problem"), "north star line");
  assert(t.includes("one student's path, with the real records"), "path heading");
  for (const k of ["brings a real problem", "gets a version that is theirs", "releases a set that measured fair", "grades the work", "verifies and endorses it", "gets the interview, then the offer"]) assert(t.includes(k), `path step ${k}`);
  assert(t.includes("bayfront regional bank"), "live challenge organisation");
  assert(t.includes("10 / 12"), "live grade");
  assert(t.includes("leave with proof, not a promise."), "students bottom line");
  assert(t.includes("hire from work, not transcripts."), "employers bottom line");
  for (const k of ["students", "instructors", "institutions", "employers"]) assert(t.includes(`for ${k} →`), `shift link ${k}`);
  assert(t.includes("why an employer can trust it"), "trust block");
  await page.getByRole("link", { name: /the work sample/i }).first().click();
  await page.waitForURL("**/evidence/v-04");
  await go("/");
  await page.getByRole("button", { name: /how to run it/i }).click();
  await page.waitForURL("**/start");
  await shot("home");
});

console.log("\n28. Employer funnel and challenges");
await check("funnel 3/11/1/1/1/0, challenges in use, contribute + link", async () => {
  await resetDemo();
  await go("/employer");
  expectFunnel(await funnelValues(), FUNNEL_SEED);
  assert((await page.locator('button:has-text("In use")').count()) === 3, "three challenges in use");
  await page.getByRole("button", { name: /^Contribute a challenge$/ }).click();
  const form = page.locator("form", { has: page.locator('input[placeholder="Audit our loan-default classifier"]') });
  await selectByLabel(form.locator("select").first(), /Coral Health/);
  await form.locator('input[placeholder="Audit our loan-default classifier"]').fill("Triage our readmission-risk model");
  await form.locator("textarea").first().fill("Our readmission-risk model flags patients for follow-up calls. Nursing says the list skews toward one unit. Tell us whether the model is fair and what to fix first.");
  await form.locator('input[placeholder="Lending"]').fill("Healthcare");
  await form.locator('input[placeholder="Risk officer"]').fill("Quality lead");
  const skillBoxes = form.locator('input[type="checkbox"]');
  await skillBoxes.nth(0).check(); await skillBoxes.nth(1).check();
  await form.locator('input[placeholder="Add a skill your organisation names"]').fill("Clinical data literacy");
  await form.getByRole("button", { name: /^Add a skill$/ }).click();
  await page.waitForTimeout(100);
  assert((await form.innerText()).includes("Clinical data literacy"), "new skill appears in the list");
  await form.getByRole("button", { name: /Contribute challenge/ }).click();
  await page.waitForTimeout(200);
  expectFunnel(await funnelValues(), { "Challenges contributed": 4 });
  const row = page.locator("tr", { hasText: "Triage our readmission-risk model" });
  assert((await row.count()) === 1, "new challenge row");
  await row.getByRole("button", { name: /Use in blueprint/ }).click();
  await page.waitForTimeout(200);
  assert((await row.innerText()).includes("In use"), "row shows In use");
  const st = await wsState();
  const bp = st.blueprints.find((b) => b.id === st.activeBlueprintId);
  const stake = bp.surfaceDimensions.find((d) => d.key === "stakeholder")?.values ?? [];
  assert(stake.some((v) => v.toLowerCase() === "quality lead"), `stakeholder values ${stake.join(",")}`);
  assert((bp.challengeIds ?? []).length === 4, `challengeIds ${bp.challengeIds}`);
  const t = (await page.locator("body").innerText()).toLowerCase();
  assert(t.includes("hires logged\n0"), "Hires logged 0 tile");
  await shot("employer_funnel");
});

console.log("\n29. Portfolio — outcome, share, revoke, Open Badges");
let alvarezLearner = null;
await check("portfolio for Alvarez", async () => {
  await go("/portfolio");
  await page.waitForURL("**/portfolio/L-**");
  alvarezLearner = page.url().split("/portfolio/")[1].split(/[?#]/)[0];
  await page.waitForTimeout(150);
  const t = await snapshotText("/portfolio");
  assert(t.includes("Alvarez"), "student name");
  assert(/L-[0-9a-f]{12}/.test(t), "learner id");
  for (const s of ["Endorsed by Bayfront", "Interviewed", "Offered", "10 / 12", "Submission included"]) assert(t.toLowerCase().includes(s.toLowerCase()), `card ${s}`);
  await shot("portfolio");
  // log outcome: hired at Bayfront
  await page.getByRole("button", { name: /^Log an outcome$/ }).first().click();
  const oform = page.locator("select.input").filter({ has: page.locator('option[value="hired"]') }).first();
  await oform.selectOption("hired");
  await page.locator('input[list^="orgs-"]').first().fill("Bayfront Regional Bank");
  await page.getByRole("button", { name: /^Log it$/ }).click();
  await page.waitForTimeout(200);
  assert((await page.locator(".va-stamp").allInnerTexts()).some((x) => /hired/i.test(x)), "hired stamp");
  await go("/employer");
  expectFunnel(await funnelValues(), { "Hired": 1 });
  await go("/console");
  assert((await page.locator("body").innerText()).toLowerCase().includes("hires logged\n1"), "console hires logged 1");
  // share with Coral
  await go(`/portfolio/${alvarezLearner}`);
  await page.getByRole("button", { name: /^Share with an employer$/ }).first().click();
  const sel = page.locator("select.input").filter({ has: page.locator("option", { hasText: "Another organisation" }) }).first();
  await selectByLabel(sel, /Coral Health/);
  await page.getByRole("button", { name: /^Share$/ }).click();
  await page.waitForTimeout(200);
  const link = await page.locator(".va-copyfield input, input[readonly]").first().inputValue();
  assert(link.includes("/talent/"), `share link ${link}`);
  let tt = await page.locator("body").innerText();
  assert(tt.includes("Coral Health Network"), "share listed");
  const coralRow = page.locator("li, div", { hasText: /Coral Health Network/ }).filter({ has: page.getByRole("button", { name: /^Revoke$/ }) }).last();
  await coralRow.getByRole("button", { name: /^Revoke$/ }).click();
  await page.waitForTimeout(200);
  const st = await wsState();
  const active = st.portfolioShares.filter((s) => !s.revokedAt && s.toOrganisation === "Coral Health Network");
  assert(active.length === 0, "coral share revoked");
  // Open Badges download
  const [dl] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: /Download Open Badges 3.0/ }).first().click()]);
  const path = await dl.path();
  const json = JSON.parse(readFileSync(path, "utf8"));
  const ob = JSON.stringify(json);
  assert(Array.isArray(json.credentialSubject?.achievement?.alignment) && json.credentialSubject.achievement.alignment.length > 0, "alignment entries");
  assert(/Employer endorsements/.test(ob), "endorsements evidence item");
  assert(!/Alvarez/.test(ob), "no student name in badge");
});

console.log("\n30. Talent view — Bayfront and Coral");
await check("talent view flows", async () => {
  const ids = await partnerIds();
  const bay = ids["Bayfront Regional Bank"], coral = ids["Coral Health Network"];
  assert(bay && coral, `partner ids ${JSON.stringify(ids)}`);
  await go("/talent");
  await page.waitForURL("**/talent/**");
  assert(Object.values(ids).some((id) => page.url().includes(id)), `redirect url ${page.url()}`);
  await go(`/talent/${bay}`);
  let t = await snapshotText("/talent-bayfront");
  assert(t.includes("Audit our loan-default classifier"), "challenge card");
  expectFunnel(await funnelValues(), { "Challenges contributed": 1 });
  assert((await page.getByRole("button", { name: /Read the work sample/ }).count()) === 1, "one candidate");
  assert(!t.includes("Alvarez"), "no student name on talent view");
  assert(/L-[0-9a-f]{12}/.test(t), "learner id shown");
  await page.getByRole("button", { name: /Read the work sample/ }).click();
  await page.waitForTimeout(100);
  t = await page.locator("body").innerText();
  assert(/Fairness/.test(t), "submission text expanded");
  assert(t.includes("You endorsed this sample"), "already endorsed line");
  await shot("talent_bayfront");
  // log outcome ramped 40h
  await page.getByRole("button", { name: /^Log outcome$/ }).first().click();
  await page.locator("select.input").filter({ has: page.locator('option[value="ramped"]') }).first().selectOption("ramped");
  await page.locator('input[type="number"]').first().fill("40");
  await page.getByRole("button", { name: /^Log it$/ }).click();
  await page.waitForTimeout(200);
  assert((await page.locator(".va-stamp").allInnerTexts()).some((x) => /ramped/i.test(x)), "ramped stamp");
  await go("/console");
  assert((await page.locator("body").innerText()).includes("mean 40 h to productive"), "console mean hours");
  // Coral: empty, then share, then endorse
  await go(`/talent/${coral}`);
  assert((await page.locator("body").innerText()).includes("No learner has shared a sample with Coral Health Network yet"), "coral empty state");
  await go(`/portfolio/${alvarezLearner}`);
  await page.getByRole("button", { name: /^Share with an employer$/ }).first().click();
  await selectByLabel(page.locator("select.input").filter({ has: page.locator("option", { hasText: "Another organisation" }) }).first(), /Coral Health/);
  await page.getByRole("button", { name: /^Share$/ }).click();
  await page.waitForTimeout(200);
  await go(`/talent/${coral}`);
  assert((await page.getByRole("button", { name: /Read the work sample/ }).count()) === 1, "coral candidate after share");
  await page.getByRole("button", { name: /^Endorse$/ }).first().click();
  await fieldInput(page, "Your name").fill("Dr. Ana Reyes");
  await fieldInput(page, "Work email").fill("areyes@coralhealth.example");
  await page.locator(".seg label.seg-opt", { hasText: /^5$/ }).last().click();
  const meets = page.locator('label:has-text("bar") input[type="checkbox"], label:has-text("Meets") input[type="checkbox"]').first();
  if (!(await meets.isChecked())) await meets.check();
  await fieldInput(page, "Comment").fill("Clear prioritisation; would interview.");
  await page.getByRole("button", { name: /Save endorsement/ }).click();
  await page.waitForTimeout(200);
  assert((await page.locator("body").innerText()).includes("You endorsed this sample"), "coral endorsement saved");
  await go("/evidence/v-04");
  const ev = await page.locator("body").innerText();
  const sec = ev.slice(ev.toLowerCase().indexOf("employer endorsements"));
  assert(/bayfront regional bank/i.test(sec) && /coral health network/i.test(sec), "two endorsements on evidence");
});

console.log("\n31. Evidence v3 sections, submission consent re-hash, verify");
await check("evidence sections, include-toggle re-hash, verify", async () => {
  await go("/evidence/v-04");
  const t = await snapshotText("/evidence-v3");
  const tl = t.toLowerCase();
  for (const s of ["skills evidenced", "work sample", "employer endorsements", "outcomes"]) assert(tl.includes(s), `section ${s}`);
  assert(/fairness/.test(tl.slice(tl.indexOf("work sample"))), "submission text in work sample");
  const sign = page.getByRole("button", { name: /^Sign record$/ });
  if (await sign.count()) { await sign.click(); await page.waitForTimeout(600); }
  const h0 = await recordHash("VR-2026-0001");
  await go("/share/VR-2026-0001");
  const box = page.locator('label:has-text("Include my submission") input[type="checkbox"]').first();
  assert((await box.count()) === 1, "include checkbox present");
  assert(await box.isChecked(), "starts included");
  await box.uncheck(); await page.waitForTimeout(500);
  const h1 = await recordHash("VR-2026-0001");
  assert(h1 && h1 !== h0, "hash changed when submission withheld");
  await page.locator('label:has-text("Include my submission") input[type="checkbox"]').first().check(); await page.waitForTimeout(500);
  const h2 = await recordHash("VR-2026-0001");
  assert(h2 === h0, `hash restored (${h2} vs ${h0})`);
  await go("/verify/VR-2026-0001");
  assert(/record verified/i.test(await page.locator("body").innerText()), "verify after toggles");
});

console.log("\n32. Grade page portfolio line");
await check("grade v-04 links to the portfolio", async () => {
  await go("/grade/v-04");
  const t = await page.locator("body").innerText();
  assert(t.includes("verified sample in the student's portfolio"), "portfolio line");
  const href = await page.locator('a[href^="/portfolio/"]').first().getAttribute("href");
  assert(href && /\/portfolio\/L-/.test(href), `portfolio href ${href}`);
});

console.log("\n33. Migration from a pre-employability workspace");
await check("strip employability arrays and workSample → v3 on reload", async () => {
  await resetDemo();
  await go("/settings");
  await page.evaluate(() => {
    const obj = JSON.parse(localStorage.getItem("varia.workspace.v1"));
    for (const k of ["skills", "challenges", "endorsements", "outcomes", "portfolioShares"]) delete obj.state[k];
    for (const r of obj.state.evidenceRecords) { if (r.bridge) { delete r.bridge.workSample; r.bridge.schemaVersion = 2; } }
    localStorage.setItem("varia.workspace.v1", JSON.stringify(obj));
  });
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForTimeout(300);
  // zustand persist only writes back on the next mutation, so assert through the rendered store, not localStorage.
  await go("/employer");
  assert((await page.locator('button:has-text("In use")').count()) === 3, "challenges refilled from seed");
  await go("/evidence/v-04");
  const ev = (await page.locator("body").innerText()).toLowerCase();
  assert(ev.includes("skills evidenced") && (await page.locator(".tag").count()) > 3, "record upgraded with skills");
  await go("/portfolio");
  assert(/L-[0-9a-f]{12}/.test(await page.locator("body").innerText()), "portfolio renders");
  await go("/talent");
  assert((await page.locator(".va-funnel").count()) === 1, "talent renders");
});

console.log("\n34. Reset restores the funnel");
await check("reset → 3/11/1/1/1/0", async () => {
  await resetDemo();
  await go("/employer");
  expectFunnel(await funnelValues(), FUNNEL_SEED);
});

console.log("\n13. Label audit vs mockup");
await check("mockup h6/th labels present", async () => {
  const html = readFileSync("mockups/VARIA App.dc.html", "utf8");
  const labels = new Set();
  for (const m of html.matchAll(/<(h6|th)[^>]*>([\s\S]*?)<\/\1>/g)) {
    const txt = m[2].replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&gt;/g, ">").replace(/\s+/g, " ").trim();
    if (txt && txt !== "—") labels.add(txt);
  }
  // Deliberate renames since the mockup: the Getting started grid gained a sixth step.
  const RENAMED = new Map([["The whole thing, in five steps", "The whole thing, in six steps"]]);
  for (const [from, to] of RENAMED) if (labels.delete(from)) labels.add(to);
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
