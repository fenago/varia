/**
 * VARIA integration QA. Drives the production build (vite preview on :4173)
 * through the instructor, employer, student and oversight flows in headless
 * Chromium. Expected values are read from the recorded fixtures under
 * src/lib/store/fixtures at runtime, so the checks stay true when fixtures
 * are re-recorded. Nothing here asserts a typed-in number.
 *
 *   npx vite build && npx vite preview --port 4173 &   # then
 *   node scripts/qa.mjs
 */
import { chromium } from "playwright";
import { readFileSync, readdirSync, mkdirSync } from "node:fs";
import path from "node:path";

const BASE = process.env.QA_BASE ?? "http://localhost:4173";
const SHOTS = "qa/screenshots";
mkdirSync(SHOTS, { recursive: true });

// ---------------------------------------------------------------------------
// Fixtures: the source of every expected value
// ---------------------------------------------------------------------------
const FIX_DIR = "src/lib/store/fixtures";
const FLAGSHIP = "ml-lending-fairness-audit";
const FIXTURES = readdirSync(FIX_DIR)
  .filter((f) => f.endsWith(".json"))
  .map((f) => JSON.parse(readFileSync(path.join(FIX_DIR, f), "utf8")))
  .filter((f) => f && f.version === 1)
  .sort((a, b) => (a.sampleId === FLAGSHIP ? -1 : b.sampleId === FLAGSHIP ? 1 : a.sampleId.localeCompare(b.sampleId)));
const SAMPLES = Object.fromEntries(
  readdirSync("public/samples").map((id) => [id, JSON.parse(readFileSync(path.join("public/samples", id, "manifest.json"), "utf8"))]),
);
const F = FIXTURES.find((f) => f.sampleId === FLAGSHIP) ?? FIXTURES[0];
if (!F) throw new Error("No recorded fixtures found; run `npm run record` first.");
const S = SAMPLES[F.sampleId];
const SHORT = { "ml-lending-fairness-audit": "len", "data-mining-churn": "chn", "marketing-web-analytics-attribution": "mkt", "ai-in-business-vendor-case": "biz", "nlp-support-ticket-triage": "nlp" };
const code = (id) => SHORT[id] ?? id.replace(/[^a-z]/g, "").slice(0, 3);
const vid = (f, id) => (id.startsWith(`${code(f.sampleId)}-`) ? id : `${code(f.sampleId)}-${id}`);
const BP = F.blueprint;
const RUN = { ...F.run, variants: F.run.variants.map((v) => ({ ...v, id: vid(F, v.id) })), report: F.run.report ? { ...F.run.report, outliers: F.run.report.outliers.map((o) => vid(F, o)) } : null };
const REPORT = RUN.report;
const V = RUN.variants.filter((v) => v.text && !v.error);
const NV = V.length;
const student = (id) => F.roster.students.find((s) => s.id === id);
const surname = (name) => name.split(",")[0].trim();
const uniqueSurname = (v) => {
  const s = surname(student(v.studentId).name);
  return F.roster.students.filter((x) => surname(x.name).toLowerCase() === s.toLowerCase()).length === 1 ? s : null;
};
const SAMPLE_SUBS = (F.sampleSubmissions ?? []).map((x) => ({ ...x, variantId: vid(F, x.variantId) }));
const withSample = new Set(SAMPLE_SUBS.map((s) => s.variantId));
const FRESH = V.filter((v) => !withSample.has(v.id) && uniqueSurname(v)); // ungraded versions with unique surnames
const [VA, VB, VC] = FRESH;
if (!VC) throw new Error("Need at least three ungraded versions with unique surnames in the flagship fixture.");
const J2 = REPORT.joint.toFixed(2);
const GATE = Object.fromEntries(Object.values(REPORT.checks).map((c) => [c.property, c.gate]));
const PILL = { pass: "Pass", fail: "Over threshold", advisory: "Advisory" };
const TOTAL_SAMPLES = FIXTURES.reduce((a, f) => a + (f.sampleSubmissions?.length ?? 0), 0);
const ORG = S.organisation;
const ORG2 = (FIXTURES.map((f) => SAMPLES[f.sampleId]?.organisation).find((o) => o && o !== ORG)) ?? "Another Organisation";
const BP2 = FIXTURES.find((f) => f.sampleId !== F.sampleId)?.blueprint.name ?? null;
const MAX_POINTS = BP.rubric.reduce((a, c) => a + c.points, 0);

console.log(`Fixtures: ${FIXTURES.map((f) => `${f.sampleId} (${f.recordedWith}, ${f.run.variants.length} versions, J ${f.run.report?.joint?.toFixed(3)})`).join("; ")}`);
console.log(`Flagship: ${F.sampleId} · ${ORG} · ${NV} versions · J ${J2} · gates ${JSON.stringify(GATE)} · sample submissions ${SAMPLE_SUBS.length}`);

// ---------------------------------------------------------------------------
// Harness
// ---------------------------------------------------------------------------
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
const lc = (s) => s.toLowerCase();
const rx = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
await ctx.grantPermissions(["clipboard-read", "clipboard-write"]).catch(() => {});
const page = await ctx.newPage();
const consoleErrors = [];
page.on("console", (m) => {
  if (m.type() !== "error") return;
  if (/Failed to load resource.*401/.test(m.text())) return; // the fake-key verify step
  consoleErrors.push(m.text());
});
page.on("pageerror", (e) => consoleErrors.push("pageerror: " + e.message));

async function go(p) {
  await page.goto(BASE + p, { waitUntil: "networkidle" });
  await page.waitForTimeout(150);
  await snapshotText(p);
}
async function snapshotText(tag) {
  const t = await page.locator("body").innerText();
  corpus.push({ tag, text: t });
  return t;
}
async function shot(name) { await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true }); }
async function wsState() { return page.evaluate(() => JSON.parse(localStorage.getItem("varia.workspace.v1")).state); }
async function resetDemo() {
  await go("/settings");
  await page.getByRole("button", { name: /Reset to the recorded runs/ }).click();
  await page.locator(".dialog .btn-primary, .dialog button.blueprint").first().click();
  await page.waitForTimeout(400);
}
function fieldInput(scope, label) { return scope.locator(`.field:has(label:has-text("${label}"))`).locator("input, textarea").first(); }
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
async function pasteSubmission(variantId, text) {
  await go(`/grade/${variantId}`);
  await page.getByRole("button", { name: /Paste a submission|Replace submission/ }).click();
  await page.locator('[data-testid="paste-submission"]').fill(text);
  await page.getByRole("button", { name: /Save submission/ }).click();
  await page.getByRole("button", { name: /Replace submission/ }).waitFor({ timeout: 8000 });
}
async function gradeAll(level) {
  const groups = page.locator('[role="radiogroup"]');
  const n = await groups.count();
  for (let i = 0; i < n; i++) await groups.nth(i).locator("label", { hasText: new RegExp(`^\\s*${level}\\s*$`) }).click();
  await page.getByRole("button", { name: /Save score/ }).click();
  await page.waitForTimeout(300);
}
async function showAllRows() {
  const show = page.getByRole("button", { name: /Show all/ });
  if (await show.count()) await show.click();
}
const SUBMISSION = (who) => `Finding 1 (fairness). The card reports aggregate accuracy only; subgroup false-positive and false-negative rates are absent, so the complaint from ${who} cannot be assessed or dismissed from the card. Finding 2 (robustness). Validation uses the same window as training, so nothing speaks to the shift. Finding 3 (documentation). Intended use is stated; out-of-scope uses are not. Prioritisation: subgroup reporting first, then a temporal holdout, then the documentation gaps.`;

const ROUTES = {
  "/": ["Home", "Proof an employer can verify"],
  "/start": ["Orientation", "Getting started"],
  "/summary": ["Orientation", "Executive summary"],
  "/research": ["Orientation", "Research grounding"],
  "/notes": ["Orientation", "Design notes and assumptions"],
  "/about": ["Orientation", "About VARIA"],
  "/import": ["Instructor · step 0 of 5", "Load an assessment you already have"],
  "/blueprint": ["Instructor · step 1 of 5", "Assessment blueprint"],
  "/generate": ["Instructor · step 2 of 5", "Generate student versions"],
  "/report": ["Instructor · step 3 of 5", `Integrity report — ${BP.name}`],
  "/roster": ["Instructor · step 4 of 5", "Release and roster"],
  "/grade": ["Instructor · step 5 of 5", "Grade with the rubric"],
  [`/grade/${VA.id}`]: ["Instructor · step 5 of 5", "Grade with the rubric"],
  "/surface": ["Oversight", "Strategy trade-off surface"],
  "/console": ["Oversight", "Institution compliance console"],
  "/settings": ["Setup", "Your Claude key and models"],
};

// ---------------------------------------------------------------------------
console.log("\n0. No-key default is the recorded runs");
await check("default workspace: one blueprint and one released run per fixture, nothing invented", async () => {
  await go("/");
  await page.evaluate(() => localStorage.removeItem("varia.workspace.v1"));
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForTimeout(300);
  await go("/settings"); // any mutation-free navigation; persist writes on first state change, so read via reset
  await resetDemo();
  const st = await wsState();
  assert(st.blueprints.length === FIXTURES.length, `blueprints ${st.blueprints.length} vs fixtures ${FIXTURES.length}`);
  const releasable = FIXTURES.filter((f) => f.run.report?.releasable).map((f) => f.run.id);
  const released = st.runs.filter((r) => r.release).map((r) => r.id);
  assert(released.length === releasable.length && releasable.every((id) => released.includes(id)), `released runs ${released.join(",")} vs releasable ${releasable.join(",")}`);
  for (const r of st.runs.filter((r) => !r.release)) assert(r.report && r.report.releasable === false, `${r.id} unreleased but not over threshold`);
  assert(st.institutionSets.length === 0 && st.employerValidations.length === 0 && st.endorsements.length === 0 && st.outcomes.length === 0, "no invented institution rows or events");
  assert(st.activeRunId === RUN.id, `active run ${st.activeRunId}`);
  assert(st.submissions.length === TOTAL_SAMPLES && st.submissions.every((s) => s.origin === "ai-sample"), `submissions ${st.submissions.length} all ai-sample`);
  const real = st.runs.find((r) => r.id === RUN.id);
  assert(Math.abs(real.report.joint - REPORT.joint) < 1e-9, "flagship report is the recorded one");
  return `${FIXTURES.length} fixtures, ${released.length} released, ${FIXTURES.length - released.length} held over threshold, ${TOTAL_SAMPLES} labelled sample submissions`;
});

console.log("\n1. Routes render with rail, crumb, title, no console errors");
for (const [p, [crumb, title]] of Object.entries(ROUTES)) {
  await check(`route ${p}`, async () => {
    await go(p);
    const header = await page.locator(".va-header").innerText();
    assert(lc(header).includes(lc(crumb)), `crumb missing: ${header}`);
    assert(header.includes(title), `title missing: ${header}`);
    assert(await page.locator("aside, .va-rail").count() > 0, "rail missing");
    await shot(p === "/" ? "home" : p.slice(1).replace(/\//g, "_"));
  });
}
await check("deep-link hard reload on /roster", async () => {
  await go("/roster");
  await page.reload({ waitUntil: "networkidle" });
  assert((await page.locator(".va-header").innerText()).includes("Release and roster"), "title after reload");
});
await check("no console errors so far", async () => { assert(consoleErrors.length === 0, consoleErrors.join(" | ")); });

console.log("\n2. Header chip");
await check("header shows no chip without a key", async () => {
  await go("/");
  const h = await page.locator(".va-header").innerText();
  assert(!h.includes("Demo mode"), "no demo chip");
});

console.log("\n3. Rail");
await check("rail sections and labels", async () => {
  await go("/notes");
  const rail = await page.locator("aside, .va-rail").first().innerText();
  for (const s of ["Orientation", "Instructor", "Oversight", "Setup"]) assert(lc(rail).includes(lc(s)), `section ${s}`);
  for (const l of ["Home", "Who it's for", "Getting started", "Design notes", "Research grounding", "About", "0 · Load your assessment", "1 · Blueprint", "2 · Generate variants", "3 · Integrity report", "4 · Release & roster", "5 · Grade with rubric", "Trade-off surface", "Compliance console", "Employer validation", "API key & models"]) assert(rail.includes(l), `label ${l}`);
  const current = await page.locator('[aria-current="page"]').innerText();
  assert(current.includes("Design notes"), `aria-current is ${current}`);
});

console.log("\n4. Report (recorded run)");
await check("report content matches the recording", async () => {
  await go("/report");
  const t = await snapshotText("/report-recorded");
  assert(t.includes(J2), `J ${J2}`);
  const labels = ["Versions look different", "Same skill measured", "One rubric grades them all", "Equally hard to read"];
  let last = -1;
  for (const l of labels) { const i = t.indexOf(l); assert(i > last, `order ${l}`); last = i; }
  const pills = (await page.locator(".va-check .va-pill, .va-pill").allInnerTexts()).map((p) => lc(p.trim()));
  for (const prop of ["p1", "p2", "p3", "p4"]) assert(pills.includes(lc(PILL[GATE[prop]])), `pill for ${prop} (${GATE[prop]}): ${pills.join(",")}`);
  const polylines = await page.locator("svg polyline").count();
  assert(polylines === NV, `polylines ${polylines} (want ${NV})`);
  if (REPORT.outliers.length) {
    assert(t.includes(REPORT.outliers.join(", ")), "outlier label");
    assert(await page.getByRole("button", { name: new RegExp(`^Regenerate ${REPORT.outliers.length}`) }).count() === 1, "regenerate button");
  } else {
    assert(await page.getByRole("button", { name: /^Regenerate \d+/ }).count() === 0, "no regenerate button on a clean set");
  }
  assert(/Released /.test(t) || t.includes("Open roster"), "released state");
  return `${polylines} polylines · J ${J2}`;
});

console.log("\n5. Roster");
await check("roster tiles and rows follow the recording; AI samples are labelled", async () => {
  await go("/roster");
  const t = await snapshotText("/roster-recorded");
  for (const s of [`Released\n${NV}`, `Submitted\n${SAMPLE_SUBS.length}`, `Graded\n${SAMPLE_SUBS.length}`, "Difficulty appeals\n0"]) assert(lc(t).includes(lc(s)), `tile ${s}`);
  await showAllRows();
  const s0 = student(VA.studentId);
  const row = page.locator("tr", { hasText: s0.name }).first();
  const rt = await row.innerText();
  for (const s of [VA.id, VA.metrics.fleschEase.toFixed(1)]) assert(rt.includes(s), `${s0.name} row has ${s}: ${rt}`);
  assert(/not started/i.test(rt), "ungraded version shows Not started");
  if (SAMPLE_SUBS.length) {
    const sv = SAMPLE_SUBS[0];
    const srow = await page.locator("tr", { hasText: student(V.find((v) => v.id === sv.variantId).studentId).name }).first().innerText();
    assert(/AI sample/i.test(srow) && new RegExp(sv.tier, "i").test(srow), `sample row labelled: ${srow}`);
  }
  await row.click();
  await page.waitForURL(`**/grade/${VA.id}`);
});

console.log("\n6. Grade a recorded version");
await check("paste a submission, grade it, roster shows the score", async () => {
  const s0 = student(VA.studentId);
  await pasteSubmission(VA.id, SUBMISSION("the regional team"));
  const t = await snapshotText(`/grade-${VA.id}`);
  assert(t.includes(s0.name), "student");
  assert(t.includes(VA.text.slice(0, 40)), "task text");
  const groups = page.locator('[role="radiogroup"]');
  assert(await groups.count() === BP.rubric.length, `${BP.rubric.length} rubric rows`);
  const picks = BP.rubric.map((_, i) => [3, 2, 2, 3][i % 4]);
  for (let i = 0; i < picks.length; i++) await groups.nth(i).locator("label", { hasText: new RegExp(`^\\s*${picks[i]}\\s*$`) }).click();
  const save = page.getByRole("button", { name: /Save score/ });
  assert(await save.isEnabled(), "save enabled");
  await save.click();
  await page.waitForTimeout(400);
  await go("/roster");
  await showAllRows();
  const row = await page.locator("tr", { hasText: s0.name }).first().innerText();
  assert(row.includes("Graded") && new RegExp(`\\d+ / ${MAX_POINTS}`).test(row), `row: ${row}`);
  return row.match(new RegExp(`\\d+ / ${MAX_POINTS}`))[0];
});

console.log("\n7. Surface / About / Console (read-only)");
await check("surface legend and table", async () => {
  await go("/surface");
  const t = await page.locator("body").innerText();
  for (const s of ["1 — Zero-shot · J 0.867", "2 — Structured CoT · J 0.876", "3 — No-construct-map CoT · J 0.877", "4 — Dimension-preserving · J 0.819", "5 — Few-shot · J 0.806", "6 — No-negative-anchors few-shot · J 0.807"]) assert(t.includes(s), `legend ${s}`);
  assert(t.includes("Llama 3.2 3B") && t.includes("GPT-2 small"), "reference labels");
  assert((await page.locator("table tbody tr").count()) >= 8, "condition rows");
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
await check("console tiles compute from the recorded runs; rows list every blueprint", async () => {
  await go("/console");
  const t = await snapshotText("/console-recorded");
  const passing = FIXTURES.filter((f) => f.run.report?.releasable).length;
  for (const s of [`Variant sets released\n${passing}`, `Passing all four\n${passing}`, "Released over threshold\n0", "Unreviewed > 14 days\n0"]) assert(lc(t).includes(lc(s)), `tile ${s}`);
  for (const f of FIXTURES) assert(await page.locator("tr", { hasText: f.blueprint.name }).count() >= 1, `row ${f.blueprint.name}`);
  assert(!/ENC 1102|63 sets|Sixty-three/.test(t), "no invented institution rows");
  await page.locator("label.seg-opt", { hasText: "Flagged" }).first().click();
  await page.waitForTimeout(100);
  const flagged = await page.locator("table").first().locator("tbody tr").allInnerTexts();
  assert(flagged.every((r) => /over threshold|blocked|no /i.test(r) || r.trim() === ""), "flagged filter shows only flagged rows");
  await page.locator("label.seg-opt", { hasText: "All" }).first().click();
});

console.log("\n8. Import — paste text → draft → blueprint; sample rows load");
await check("paste text extraction", async () => {
  await go("/import");
  await page.getByRole("button", { name: /Paste text instead/ }).click();
  await page.locator("textarea").first().fill("Assignment 4 — Stakeholder memo (10 points)\nTranslate a confusion-matrix finding into a one-page memo for a non-technical executive.\nRubric\nDecision relevance (4) · Accuracy of the technical claim (3) · Clarity for a non-technical reader (3)");
  await page.getByRole("button", { name: /Read text/ }).click();
  await page.getByText("What the system pulled out").waitFor({ timeout: 12000 });
  await page.waitForTimeout(300);
  const t = await snapshotText("/import-draft");
  assert(/uploaded/i.test(t), "uploaded table");
  assert(/criterion/i.test(t), "criteria table");
  await shot("import_draft");
  await page.getByRole("button", { name: /^Open as blueprint$/ }).click();
  await page.waitForURL("**/blueprint");
  await snapshotText("/blueprint-after-import");
});
await check("sample rows are clickable and load through the local parser", async () => {
  await go("/import");
  const rows = page.locator('[role="button"][aria-label^="Load the"]');
  assert((await rows.count()) === Object.keys(SAMPLES).length, `sample rows ${await rows.count()}`);
  await rows.filter({ hasText: ORG2 }).first().click();
  await page.getByText("What the system pulled out").waitFor({ timeout: 15000 });
  const t = await snapshotText("/import-sample");
  assert(lc(t).includes(lc(`Loaded from the ${ORG2} sample`)), "loaded-from line");
  assert(/criterion/i.test(t), "criteria table");
});

console.log("\n9. Generate (no key) replays a recorded run → report → release → roster");
await check("replayed generate reproduces the recorded report", async () => {
  await resetDemo();
  await go("/generate");
  const btn = page.getByRole("button", { name: /Generate \d+ versions/ });
  const label = await btn.innerText();
  await btn.click();
  await page.locator(".va-progress, [class*=progress]").first().waitFor({ timeout: 5000 }).catch(() => {});
  const prog = await snapshotText("/generate-progress");
  assert(/generating|judging|scoring|reading|versions/i.test(prog), "progress visible");
  await page.waitForURL("**/report", { timeout: 60000 });
  await page.waitForTimeout(300);
  const t = await snapshotText("/report-generated");
  assert(t.includes("Versions look different") && t.includes("Equally hard to read"), "four checks");
  const st = await wsState();
  const run = st.runs.find((r) => r.id === st.activeRunId);
  assert(run && run.report, "new run has a report");
  assert(Math.abs(run.report.joint - REPORT.joint) < 0.02, `replayed J ${run.report.joint.toFixed(3)} vs recorded ${REPORT.joint.toFixed(3)}`);
  assert(run.usage == null || run.usage.costUsd === 0, "no cost in replay");
  await shot("report_generated");
  const regen = page.getByRole("button", { name: /^Regenerate \d+/ });
  if (await regen.count()) {
    await regen.click();
    await page.getByRole("button", { name: /^(Release \d+ versions|Release all \d+ anyway)$/ }).first().waitFor({ timeout: 60000 });
    assert((await page.getByText(/^Released /).count()) === 0, "regenerate must not auto-release");
  }
  const clean = page.getByRole("button", { name: /^Release \d+ versions$/ });
  if (await clean.count()) await clean.click();
  else {
    await page.getByRole("button", { name: /^Release all \d+ anyway$/ }).click();
    await page.locator("textarea").last().fill("QA: formative, low stakes");
    await page.getByRole("button", { name: /Release with this reason/ }).click();
  }
  await page.getByText(/^Released /).first().waitFor({ timeout: 5000 });
  await go("/roster");
  assert(new RegExp(`Released\\n${run.variants.length}`, "i").test(await page.locator("body").innerText()), `roster Released ${run.variants.length}`);
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
  assert(/Claude (Opus|Sonnet|Fable|Haiku)/.test(h), `header model chip: ${h}`);
  await page.getByRole("button", { name: /^Verify key$/ }).click();
  await page.waitForTimeout(6000);
  const t = await snapshotText("/settings-verified");
  assert(/rejected|could not reach|invalid|failed/i.test(t), "verify feedback shown");
  await shot("settings_key");
  await page.getByRole("button", { name: /^Forget key$/ }).first().click();
  await page.locator(".dialog").getByRole("button", { name: /Forget key/ }).click();
  await page.waitForTimeout(200);
  assert(!(await page.locator(".va-header").innerText()).includes("Claude"), "chip gone after forget");
});
await check("export workspace download", async () => {
  await go("/settings");
  const [dl] = await Promise.all([page.waitForEvent("download", { timeout: 5000 }), page.getByRole("button", { name: /Export workspace/ }).click()]);
  assert((dl.suggestedFilename() || "").length > 0, "filename");
  return dl.suggestedFilename();
});
await check("reset restores the recorded report", async () => {
  await resetDemo();
  await go("/report");
  assert((await page.locator("body").innerText()).includes(J2), "recorded report back");
});

console.log("\n11. Import — CSV roster upload");
await check("csv roster upload", async () => {
  await go("/import");
  const csv = "name,email\nRivera, A.,ar@x.edu\nOkafor, B.,bo@x.edu\nLindqvist, C.,cl@x.edu\nNakamura, D.,dn@x.edu\nHaddad, E.,eh@x.edu\n";
  await page.locator('input[type="file"]').first().setInputFiles({ name: "roster.csv", mimeType: "text/csv", buffer: Buffer.from(csv) });
  await page.waitForTimeout(2500);
  const t = await snapshotText("/import-csv");
  assert(t.includes("5 enrolled students"), `roster not recognised:\n${t.slice(0, 600)}`);
});

console.log("\n12. Console — threshold edit does not re-clear released sets");
await check("threshold edit + audit; released report unchanged", async () => {
  await resetDemo();
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
  const pills = (await page.locator(".va-pill").allInnerTexts()).map((p) => lc(p.trim()));
  assert(pills.includes(lc(PILL[GATE.p4])), `report P4 pill unchanged: ${pills.join(",")}`);
});

// ---------------------------------------------------------------------------
// Employer bridge
// ---------------------------------------------------------------------------
async function fillReviewForm(p, { name, role, org, email, status = "Validated", attest = true, scenarioValue = null, likert = 4 }) {
  if (scenarioValue) {
    const add = p.locator('input[aria-label^="Add a"]').first();
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
const bpRow = (name) => page.locator("tr", { hasText: name }).filter({ hasNot: page.locator('button:has-text("In use"), button:has-text("Use in blueprint")') }).first();
const emailFor = (org) => `review@${lc(org).replace(/[^a-z]/g, "")}.example`;
let verifyLink = null;
let recordId = null;
let learnerId = null;

console.log("\n15. Employer validation page starts honest");
await check("tiles at zero, one partner and challenge per fixture, every blueprint pending", async () => {
  await resetDemo();
  await go("/employer");
  const t = await snapshotText("/employer-recorded");
  assert(t.includes("0%"), "validated 0%");
  assert(t.includes(`0 of ${FIXTURES.length} blueprints`), `0 of ${FIXTURES.length} blueprints`);
  for (const f of FIXTURES) {
    const org = SAMPLES[f.sampleId].organisation;
    assert(await page.locator("tr", { hasText: org }).count() >= 1, `partner ${org}`);
    assert(/pending/i.test(await bpRow(f.blueprint.name).innerText()), `${f.blueprint.name} pending`);
  }
  assert(!/VR-2026-/.test(t), "no evidence records yet");
  expectFunnel(await funnelValues(), { "Challenges contributed": FIXTURES.length, "Students who completed one": TOTAL_SAMPLES, "Work samples shared": 0, "Endorsed": 0, "Interviewed": 0, "Hired": 0 });
  await shot("employer");
});

console.log("\n16. In-workspace employer review");
await check("review the flagship blueprint in this browser", async () => {
  await go("/employer");
  await bpRow(BP.name).getByRole("button", { name: /^Review here$/ }).click();
  await page.waitForURL(/\/review\/[^/?]+/);
  await page.waitForTimeout(200);
  const t = await snapshotText("/review-workspace");
  assert(await page.locator(".va-rail").count() === 0, "no instructor rail");
  assert(await page.locator(".va-review-bar").count() === 1, "review bar");
  for (const s of ["What this assessment measures", "The rubric", "The scenario bank", "Sample versions", "Integrity of the version set", "Sign off"]) assert(lc(t).includes(lc(s)), `section ${s}`);
  for (const c of BP.rubric) assert(t.includes(c.name), `criterion ${c.name}`);
  assert(await page.locator(".va-chips").count() >= 3, "chip editors for unlocked dims");
  assert(await page.locator(".va-stamp").count() >= 4, "integrity stamps");
  await shot("review");
  await fillReviewForm(page, { name: "Priya Natarajan", role: "Risk officer", org: ORG, email: emailFor(ORG), scenarioValue: "QA Test Scenario · returns classifier" });
  await page.getByRole("button", { name: /^Record this review$/ }).click();
  await page.waitForURL("**/employer");
  await page.waitForTimeout(200);
  const e = await snapshotText("/employer-after-review");
  assert(e.includes(`${Math.round((1 / FIXTURES.length) * 100)}%`), "validated tile moved");
  assert(/validated/i.test(await bpRow(BP.name).innerText()), "flagship validated");
});

console.log("\n17. Link round-trip in a fresh browser context");
await check("copy review link → fresh context review → result link → applied", async () => {
  assert(BP2, "needs a second recorded blueprint");
  await go("/employer");
  const row = bpRow(BP2);
  await selectByLabel(row.locator('select[aria-label="Partner for the review link"]'), new RegExp(rx(ORG2.split(" ")[0])));
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
  assert(bar.includes(`Reviewing for ${ORG2}`), `bar: ${bar}`);
  await fillReviewForm(p2, { name: "Priya Natarajan", role: "Director", org: ORG2, email: emailFor(ORG2) });
  await p2.getByRole("button", { name: /^Finish review$/ }).click();
  await p2.locator(".va-copyfield input").first().waitFor({ timeout: 5000 });
  const result = await p2.locator(".va-copyfield input").first().inputValue();
  assert(result.includes("/employer#result="), `result ${result.slice(0, 60)}`);
  assert(errs2.length === 0, errs2.join(" | "));
  await ctx2.close();
  await page.goto(result, { waitUntil: "networkidle" });
  await page.waitForTimeout(400);
  const t = await snapshotText("/employer-result-applied");
  assert(t.includes(`Applied: ${ORG2} validated`), "applied line");
  const hist = await page.locator("text=Validation history").locator("..").innerText();
  assert(hist.includes("imported"), "history entry marked imported");
});

console.log("\n18. Consumer email warning");
await check("gmail address warns", async () => {
  const st = await wsState();
  await go(`/review/${st.blueprints.find((b) => b.name === BP.name).id}`);
  await fieldInput(page, "Organisation").fill("Acme Corp");
  await fieldInput(page, "Work email").fill("someone@gmail.com");
  await fieldInput(page, "Your name").click();
  await page.waitForTimeout(100);
  assert((await page.locator("body").innerText()).includes("Use your work address at Acme Corp"), "warning text");
});

console.log("\n19. Evidence records");
await check("ungraded version has no record; grade it, issue VR-2026-0001, badge has no name, sign, links", async () => {
  await go(`/evidence/${VA.id}`);
  let t = await page.locator("body").innerText();
  assert(/not yet issued/i.test(t), "not yet issued");
  await pasteSubmission(VA.id, SUBMISSION("the regional team"));
  await gradeAll(3);
  await go(`/evidence/${VA.id}`);
  await page.getByRole("button", { name: /^Issue record$/ }).click();
  await page.waitForTimeout(600);
  t = await snapshotText(`/evidence-${VA.id}`);
  recordId = (t.match(/VR-\d{4}-\d{4}/) ?? [null])[0];
  assert(recordId === "VR-2026-0001", `record id ${recordId}`);
  assert(/L-[0-9a-f]{12}/.test(t), "learner id");
  for (const s of ["Employer validation", "Integrity of the assessment set", "How to verify", "Skills evidenced"]) assert(lc(t).includes(lc(s)), `section ${s}`);
  assert(/[0-9a-f]{64}/.test(t), "hash");
  const [dl] = await Promise.all([page.waitForEvent("download", { timeout: 5000 }), page.getByRole("button", { name: /Download Open Badges 3\.0/ }).click()]);
  const json = JSON.parse(readFileSync(await dl.path(), "utf8"));
  const ctxs = JSON.stringify(json["@context"]);
  assert(ctxs.includes("https://www.w3.org/ns/credentials/v2") && ctxs.includes("purl.imsglobal.org/spec/ob/v3p0"), `contexts ${ctxs}`);
  assert(!JSON.stringify(json).includes(surname(student(VA.studentId).name)), "no student name in credential");
  const sign = page.getByRole("button", { name: /^Sign record$/ });
  if (await sign.count()) { await sign.click(); await page.waitForTimeout(600); assert(/Signed ·/i.test(await page.locator("body").innerText()), "signed after click"); }
  assert(await page.locator(`a[href="/verify/${recordId}"]`).count() === 1, "verify link");
  assert(await page.locator(`a[href="/share/${recordId}"]`).count() === 1, "share link");
  await shot("evidence_record");
});
await check("second version: grade via the rubric → issue → VR-2026-0002", async () => {
  await pasteSubmission(VB.id, SUBMISSION("the second office"));
  await gradeAll(2);
  await go(`/evidence/${VB.id}`);
  await page.getByRole("button", { name: /^Issue record$/ }).click();
  await page.waitForTimeout(600);
  assert((await snapshotText(`/evidence-${VB.id}`)).includes("VR-2026-0002"), "second id");
});

console.log("\n20. Student share → verify in a fresh context → record verification");
await check("share, verify (no name), record verification, audit", async () => {
  await go(`/share/${recordId}`);
  const t = await snapshotText("/share");
  assert(t.includes(student(VA.studentId).name), "student sees own name");
  await page.locator('input[placeholder^="e.g. "]').first().fill(ORG2);
  await page.locator('label:has-text("I choose to share") input[type="checkbox"]').check();
  await page.getByRole("button", { name: /Share and get a verify link/ }).click();
  await page.locator(".va-copyfield input").first().waitFor({ timeout: 8000 });
  verifyLink = await page.locator(".va-copyfield input").first().inputValue();
  assert(verifyLink.includes(`/verify/${recordId}#rec=`), `verify link ${verifyLink.slice(0, 60)}`);
  await shot("share");
  const ctx2 = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const p2 = await ctx2.newPage();
  const errs2 = [];
  p2.on("pageerror", (e) => errs2.push(e.message));
  await p2.goto(verifyLink, { waitUntil: "networkidle" });
  await p2.getByText("Record verified").waitFor({ timeout: 8000 });
  const v = await p2.locator("body").innerText();
  assert(!v.includes(surname(student(VA.studentId).name)), "no student name on verify page");
  await p2.screenshot({ path: `${SHOTS}/verify_bundle.png`, fullPage: true });
  assert(errs2.length === 0, errs2.join(" | "));
  await ctx2.close();
  await go(`/verify/${recordId}`);
  await page.getByText("Record verified").waitFor({ timeout: 8000 });
  await page.locator('input[placeholder^="e.g. "]').first().fill(ORG2);
  await page.getByRole("button", { name: /^Record this verification$/ }).click();
  await page.waitForTimeout(200);
  assert((await page.locator("body").innerText()).includes("Recorded"), "recorded");
  await go("/console");
  const audit = await page.locator("text=Audit trail").locator("..").innerText();
  assert(new RegExp(`${rx(ORG2)} verified ${recordId}`).test(audit), `audit: ${audit.slice(0, 200)}`);
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
  await go(`/evidence/${VA.id}`);
  await page.emulateMedia({ media: "print" });
  await page.waitForTimeout(100);
  assert(!(await page.locator(".va-review-bar").isVisible()), "bar hidden");
  const ph = page.locator(".va-print-header");
  assert(await ph.isVisible(), "print header visible");
  assert((await ph.innerText()).includes(recordId), "print header id");
  await page.screenshot({ path: `${SHOTS}/evidence_print.png`, fullPage: true });
  await page.emulateMedia({ media: "screen" });
});

console.log("\n23. Console / Roster / Grade wiring");
await check("employer tiles, evidence column, grade line", async () => {
  await go("/console");
  const c = await page.locator("body").innerText();
  assert(/employer outcomes/i.test(c) && /Manage on Employer validation/i.test(c), "console employer row");
  await go("/roster");
  await showAllRows();
  assert((await page.locator("tr", { hasText: student(VA.studentId).name }).first().innerText()).includes(recordId), "evidence column");
  await go(`/grade/${VA.id}`);
  const g = await page.locator("body").innerText();
  assert(new RegExp(`Evidence record\\s+${recordId}\\s+issued`).test(g.replace(/\n/g, " ")), "grade evidence line");
});

console.log("\n24. Migration from an older persisted workspace");
await check("stripped arrays load as empty; partners and bridge fields are rebuilt", async () => {
  await go("/settings");
  await page.evaluate(() => {
    const obj = JSON.parse(localStorage.getItem("varia.workspace.v1"));
    for (const k of ["employerValidations", "verificationEvents", "signingKey", "skills", "challenges", "endorsements", "outcomes", "portfolioShares"]) delete obj.state[k];
    for (const r of obj.state.evidenceRecords) { if (r.bridge) { delete r.bridge.workSample; r.bridge.schemaVersion = 2; } }
    localStorage.setItem("varia.workspace.v1", JSON.stringify(obj));
  });
  await page.reload({ waitUntil: "networkidle" });
  await go("/employer");
  const t = await page.locator("body").innerText();
  for (const f of FIXTURES) assert(t.includes(SAMPLES[f.sampleId].organisation), `partner ${SAMPLES[f.sampleId].organisation}`);
  assert(t.includes(recordId), "record kept");
  await go(`/evidence/${VA.id}`);
  const ev = lc(await page.locator("body").innerText());
  assert(/l-[0-9a-f]{12}/.test(ev) && ev.includes("skills evidenced"), "bridge fields rebuilt");
});

console.log("\n26. Label audit for the employer pages");
await check("employer/review/evidence headings present", async () => {
  const want = ["Employer partners", "Blueprints and their validation", "Bring in a result", "Validation history", "Evidence records",
    "What this assessment measures", "The rubric", "The scenario bank", "Sample versions", "Sign off",
    "What was assessed", "The task this student received", "Rubric and result", "Employer validation", "Integrity of the assessment set", "How to verify"];
  const all = lc(corpus.map((c) => c.text.replace(/\s+/g, " ")).join("\n"));
  const missing = want.filter((l) => !all.includes(lc(l)));
  assert(missing.length === 0, `missing: ${missing.join(" | ")}`);
  return `${want.length} labels`;
});

// ---------------------------------------------------------------------------
// Audiences, home, employability
// ---------------------------------------------------------------------------
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
  await page.getByRole("button", { name: /read the executive summary/i }).click();
  await page.waitForURL("**/summary");
  const st0 = lc(await page.locator("body").innerText());
  for (const k of ["why now", "what varia does", "what the college gets", "the evidence behind it", "what an administrator can do this term"]) assert(st0.includes(k), `summary section ${k}`);
  await go("/for");
  assert((await page.getByRole("link", { name: /Read more/ }).count()) === 4, "read-more links");
  await shot("for");
  for (const [key, a] of Object.entries(AUDIENCE)) {
    await go("/for");
    await page.locator(`a[href="/for/${key}"]`).first().click();
    await page.waitForURL(`**/for/${key}`);
    await page.waitForTimeout(150);
    const tt = await snapshotText(`/for/${key}`);
    assert(tt.includes(a.promise), `${key} promise`);
    assert(lc(tt).includes("what it costs you"), `${key} cost box`);
    await page.locator(".btn-primary.blueprint").first().click();
    await page.waitForURL(`**${a.action}**`);
  }
  await go("/for/unknown");
  assert(/\/for\/?$/.test(page.url()), `unknown audience url ${page.url()}`);
  await go("/start");
  const stl = lc(await page.locator("body").innerText());
  assert(stl.includes("who this is for") && stl.includes("the whole thing, in six steps"), "start strip + steps");
  assert(stl.includes(lc(V[0].text.slice(0, 30))), "start excerpts come from the recorded run");
});

console.log("\n27b. Home page shows the real state, honestly");
await check("home: north star, path panels from real records, 'not yet' where nothing happened", async () => {
  await resetDemo();
  await go("/");
  const t = lc(await page.locator("body").innerText());
  assert(t.includes("every student does real work on an employer's problem"), "north star line");
  assert(t.includes("one student's path, with the real records"), "path heading");
  assert(t.includes(lc(ORG)), "live challenge organisation");
  assert(t.includes(lc(V[0].text.slice(0, 40))), "live version text");
  assert(t.includes("not yet"), "unhappened events say not yet");
  assert(!t.includes("interviewed 3 september") && !t.includes("meets our bar, 4 of 5"), "no invented events");
  for (const k of ["students", "instructors", "institutions", "employers"]) assert(t.includes(`for ${k} →`), `shift link ${k}`);
  await page.getByRole("button", { name: /how to run it/i }).click();
  await page.waitForURL("**/start");
  await shot("home");
});

console.log("\n28. Employer funnel and challenges");
await check("funnel from real state; contribute + link a challenge", async () => {
  await resetDemo();
  await go("/employer");
  expectFunnel(await funnelValues(), { "Challenges contributed": FIXTURES.length, "Students who completed one": TOTAL_SAMPLES });
  assert((await page.locator('button:has-text("In use")').count()) >= 1, "flagship challenge in use");
  await page.getByRole("button", { name: /^Contribute a challenge$/ }).click();
  const form = page.locator("form", { has: page.locator('input[placeholder="Audit our loan-default classifier"]') });
  await selectByLabel(form.locator("select").first(), new RegExp(rx(ORG2.split(" ")[0])));
  await form.locator('input[placeholder="Audit our loan-default classifier"]').fill("Triage our readmission-risk model");
  await form.locator("textarea").first().fill("Our readmission-risk model flags patients for follow-up calls. Nursing says the list skews toward one unit. Tell us whether the model is fair and what to fix first.");
  await form.locator('input[placeholder="Lending"]').fill("Healthcare");
  await form.locator('input[placeholder="Risk officer"]').fill("Quality lead");
  const skillBoxes = form.locator('input[type="checkbox"]');
  await skillBoxes.nth(0).check(); await skillBoxes.nth(1).check();
  await form.locator('input[placeholder="Add a skill your organisation names"]').fill("Clinical data literacy");
  await form.getByRole("button", { name: /^Add a skill$/ }).click();
  await page.waitForTimeout(100);
  await form.getByRole("button", { name: /Contribute challenge/ }).click();
  await page.waitForTimeout(200);
  expectFunnel(await funnelValues(), { "Challenges contributed": FIXTURES.length + 1 });
  const row = page.locator("tr", { hasText: "Triage our readmission-risk model" });
  assert((await row.count()) === 1, "new challenge row");
  await row.getByRole("button", { name: /Use in blueprint/ }).click();
  await page.waitForTimeout(200);
  assert((await row.innerText()).includes("In use"), "row shows In use");
  const st = await wsState();
  const bp = st.blueprints.find((b) => b.id === st.activeBlueprintId);
  assert((bp.surfaceDimensions.find((d) => d.key === "stakeholder")?.values ?? []).some((v) => lc(v) === "quality lead"), "stakeholder value added");
  assert(lc(await page.locator("body").innerText()).includes("hires logged\n0"), "Hires logged 0 tile");
  await shot("employer_funnel");
});

console.log("\n29. Portfolio — outcome, share, revoke, Open Badges");
await check("portfolio for the graded learner", async () => {
  await resetDemo();
  await pasteSubmission(VA.id, SUBMISSION("the regional team"));
  await gradeAll(3);
  await go(`/evidence/${VA.id}`);
  await page.getByRole("button", { name: /^Issue record$/ }).click();
  await page.waitForTimeout(600);
  recordId = ((await page.locator("body").innerText()).match(/VR-\d{4}-\d{4}/) ?? [null])[0];
  assert(recordId, "record issued");
  await go("/portfolio");
  await page.waitForURL("**/portfolio/L-**");
  learnerId = page.url().split("/portfolio/")[1].split(/[?#]/)[0];
  await page.waitForTimeout(150);
  const t = await snapshotText("/portfolio");
  assert(t.includes(student(VA.studentId).name), "student name");
  assert(/L-[0-9a-f]{12}/.test(t), "learner id");
  assert(t.includes(`${MAX_POINTS} / ${MAX_POINTS}`), "rubric result");
  assert(!/Endorsed by/.test(t), "no endorsement invented");
  await shot("portfolio");
  await page.getByRole("button", { name: /^Log an outcome$/ }).first().click();
  await page.locator("select.input").filter({ has: page.locator('option[value="hired"]') }).first().selectOption("hired");
  await page.locator('input[list^="orgs-"]').first().fill(ORG);
  await page.getByRole("button", { name: /^Log it$/ }).click();
  await page.waitForTimeout(200);
  assert((await page.locator(".va-stamp").allInnerTexts()).some((x) => /hired/i.test(x)), "hired stamp");
  await go("/employer");
  expectFunnel(await funnelValues(), { "Hired": 1 });
  await go(`/portfolio/${learnerId}`);
  await page.getByRole("button", { name: /^Share with an employer$/ }).first().click();
  await selectByLabel(page.locator("select.input").filter({ has: page.locator("option", { hasText: "Another organisation" }) }).first(), new RegExp(rx(ORG2.split(" ")[0])));
  await page.getByRole("button", { name: /^Share$/ }).click();
  await page.waitForTimeout(200);
  const link = await page.locator(".va-copyfield input, input[readonly]").first().inputValue();
  assert(link.includes("/talent/"), `share link ${link}`);
  const orgRow = page.locator("li, div", { hasText: new RegExp(rx(ORG2)) }).filter({ has: page.getByRole("button", { name: /^Revoke$/ }) }).last();
  await orgRow.getByRole("button", { name: /^Revoke$/ }).click();
  await page.waitForTimeout(200);
  const st = await wsState();
  assert(st.portfolioShares.filter((s) => !s.revokedAt && s.toOrganisation === ORG2).length === 0, "share revoked");
  const [dl] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: /Download Open Badges 3.0/ }).first().click()]);
  const json = JSON.parse(readFileSync(await dl.path(), "utf8"));
  assert(Array.isArray(json.credentialSubject?.achievement?.alignment) && json.credentialSubject.achievement.alignment.length > 0, "alignment entries");
  assert(!JSON.stringify(json).includes(surname(student(VA.studentId).name)), "no student name in badge");
});

console.log("\n30. Talent view — share, endorse, log outcome");
await check("talent view flows", async () => {
  const st = await wsState();
  const ids = Object.fromEntries(st.employerPartners.map((p) => [p.organisation, p.id]));
  const pid = ids[ORG], pid2 = ids[ORG2];
  assert(pid && pid2, `partner ids ${JSON.stringify(ids)}`);
  await go("/talent");
  await page.waitForURL("**/talent/**");
  await go(`/talent/${pid}`);
  let t = await snapshotText("/talent-flagship");
  assert(t.includes(S.title), "challenge card");
  assert(lc(t).includes(lc(`No learner has shared a sample with ${ORG} yet`)), "empty until shared");
  await go(`/portfolio/${learnerId}`);
  await page.getByRole("button", { name: /^Share with an employer$/ }).first().click();
  await selectByLabel(page.locator("select.input").filter({ has: page.locator("option", { hasText: "Another organisation" }) }).first(), new RegExp(rx(ORG.split(" ")[0])));
  await page.getByRole("button", { name: /^Share$/ }).click();
  await page.waitForTimeout(200);
  const inc = page.locator('label:has-text("Include my submission") input[type="checkbox"]').first();
  if (!(await inc.isChecked())) { await inc.check(); await page.waitForTimeout(500); }
  await go(`/talent/${pid}`);
  t = await snapshotText("/talent-shared");
  assert((await page.getByRole("button", { name: /Read the work sample/ }).count()) === 1, "one candidate");
  assert(!t.includes(surname(student(VA.studentId).name)), "no student name on talent view");
  assert(/L-[0-9a-f]{12}/.test(t), "learner id shown");
  await page.getByRole("button", { name: /Read the work sample/ }).click();
  await page.waitForTimeout(100);
  assert(/Finding 1/.test(await page.locator("body").innerText()), "submission text expanded");
  await page.getByRole("button", { name: /^Endorse$/ }).first().click();
  await fieldInput(page, "Your name").fill("Dr. Ana Reyes");
  await fieldInput(page, "Work email").fill(emailFor(ORG));
  await page.locator(".seg label.seg-opt", { hasText: /^5$/ }).last().click();
  const meets = page.locator('label:has-text("bar") input[type="checkbox"], label:has-text("Meets") input[type="checkbox"]').first();
  if (!(await meets.isChecked())) await meets.check();
  await fieldInput(page, "Comment").fill("Clear prioritisation; would interview.");
  await page.getByRole("button", { name: /Save endorsement/ }).click();
  await page.waitForTimeout(200);
  assert((await page.locator("body").innerText()).includes("You endorsed this sample"), "endorsement saved");
  await shot("talent");
  await page.getByRole("button", { name: /^Log outcome$/ }).first().click();
  await page.locator("select.input").filter({ has: page.locator('option[value="ramped"]') }).first().selectOption("ramped");
  await page.locator('input[type="number"]').first().fill("40");
  await page.getByRole("button", { name: /^Log it$/ }).click();
  await page.waitForTimeout(200);
  assert((await page.locator(".va-stamp").allInnerTexts()).some((x) => /ramped/i.test(x)), "ramped stamp");
  await go("/console");
  assert((await page.locator("body").innerText()).includes("mean 40 h to productive"), "console mean hours");
  await go(`/evidence/${VA.id}`);
  const ev = await page.locator("body").innerText();
  assert(new RegExp(rx(ORG), "i").test(ev.slice(lc(ev).indexOf("employer endorsements"))), "endorsement on evidence");
});

console.log("\n31. Evidence v3 sections, submission consent re-hash, verify");
await check("evidence sections, include-toggle re-hash, verify", async () => {
  await go(`/evidence/${VA.id}`);
  const t = lc(await snapshotText("/evidence-v3"));
  for (const s of ["skills evidenced", "work sample", "employer endorsements", "outcomes"]) assert(t.includes(s), `section ${s}`);
  const sign = page.getByRole("button", { name: /^Sign record$/ });
  if (await sign.count()) { await sign.click(); await page.waitForTimeout(600); }
  const h = async () => (await wsState()).evidenceRecords.find((r) => r.id === recordId)?.hash;
  const h0 = await h();
  await go(`/share/${recordId}`);
  const box = page.locator('label:has-text("Include my submission") input[type="checkbox"]').first();
  const was = await box.isChecked();
  if (was) await box.uncheck(); else await box.check();
  await page.waitForTimeout(500);
  const h1 = await h();
  assert(h1 && h1 !== h0, "hash changed when consent changed");
  const box2 = page.locator('label:has-text("Include my submission") input[type="checkbox"]').first();
  if (was) await box2.check(); else await box2.uncheck();
  await page.waitForTimeout(500);
  assert((await h()) === h0, "hash restored");
  await go(`/verify/${recordId}`);
  assert(/record verified/i.test(await page.locator("body").innerText()), "verify after toggles");
});

console.log("\n32. Grade page portfolio line");
await check("graded version links to the portfolio", async () => {
  await go(`/grade/${VA.id}`);
  const t = await page.locator("body").innerText();
  assert(t.includes("verified sample in the student's portfolio"), "portfolio line");
  const href = await page.locator('a[href^="/portfolio/"]').first().getAttribute("href");
  assert(href && /\/portfolio\/L-/.test(href), `portfolio href ${href}`);
});

console.log("\n34. Reset restores the recorded state");
await check("reset → zero events, recorded funnel", async () => {
  await resetDemo();
  await go("/employer");
  expectFunnel(await funnelValues(), { "Challenges contributed": FIXTURES.length, "Students who completed one": TOTAL_SAMPLES, "Endorsed": 0, "Hired": 0 });
});

console.log("\n13. Label audit vs mockup");
await check("mockup h6/th labels present", async () => {
  const html = readFileSync("mockups/VARIA App.dc.html", "utf8");
  const labels = new Set();
  for (const m of html.matchAll(/<(h6|th)[^>]*>([\s\S]*?)<\/\1>/g)) {
    const txt = m[2].replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&gt;/g, ">").replace(/\s+/g, " ").trim();
    if (txt && txt !== "—") labels.add(txt);
  }
  const RENAMED = new Map([["The whole thing, in five steps", "The whole thing, in six steps"]]);
  for (const [from, to] of RENAMED) if (labels.delete(from)) labels.add(to);
  const all = lc(corpus.map((c) => c.text.replace(/\s+/g, " ")).join("\n"));
  const missing = [...labels].filter((l) => !all.includes(lc(l)));
  assert(missing.length === 0, `missing: ${missing.join(" | ")}`);
  return `${labels.size} labels`;
});

console.log("\n35. Release and grading made real");
await check("student task link opens in a fresh context without the solution", async () => {
  await resetDemo();
  await go("/roster");
  const s0 = student(VA.studentId);
  await page.locator("button", { hasText: new RegExp(`${rx(s0.name)} · ${VA.id}`) }).first().click();
  const link = await page.locator(".va-copyfield input, input[readonly]").last().inputValue();
  assert(link.includes(`/task/${VA.id}#pkg=`), `task link ${link.slice(0, 60)}`);
  const ctxT = await browser.newContext({ viewport: { width: 1200, height: 900 } });
  const pt = await ctxT.newPage();
  const errs = [];
  pt.on("pageerror", (e) => errs.push(e.message));
  await pt.goto(link, { waitUntil: "networkidle" });
  const t = lc(await pt.locator("body").innerText());
  assert(t.includes("your task") && t.includes("how it is graded"), "task sections");
  assert(!t.includes(lc(VA.adaptedSolution.slice(0, 30))), "no adapted solution");
  assert(!t.includes("reading ease"), "no metrics");
  assert(errs.length === 0, errs.join(" | "));
  await pt.screenshot({ path: `${SHOTS}/task_link.png`, fullPage: true });
  await ctxT.close();
});
await check("download all versions produces a zip; copy all links produces a csv", async () => {
  await go("/roster");
  const [dl] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: /Download as Markdown/ }).click()]);
  assert(dl.suggestedFilename().endsWith("_versions_md.zip"), dl.suggestedFilename());
  const [dl2] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: /Download all versions \(Word\)/ }).click()]);
  assert(dl2.suggestedFilename().endsWith("_versions_docx.zip"), dl2.suggestedFilename());
  const [dl3] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: /Copy all links/ }).click()]);
  assert(dl3.suggestedFilename().endsWith("_student_links.csv"), dl3.suggestedFilename());
});
await check("import two .txt submissions matched by surname", async () => {
  await go("/roster");
  const sb = uniqueSurname(VB), sc = uniqueSurname(VC);
  await page.locator('[data-testid="submissions-input"]').setInputFiles([
    { name: `${sb}_audit.txt`, mimeType: "text/plain", buffer: Buffer.from(SUBMISSION("the second office")) },
    { name: `${sc}-final.txt`, mimeType: "text/plain", buffer: Buffer.from(SUBMISSION("the third office")) },
  ]);
  await page.waitForSelector("text=Import matched files");
  assert(lc(await page.locator("table").last().innerText()).includes("surname"), "matched by surname");
  await page.getByRole("button", { name: /Import matched files/ }).click();
  await page.waitForSelector("text=/2 submissions imported/");
  const st = await wsState();
  const sub = st.submissions.find((s) => s.variantId === VB.id);
  assert(sub && sub.text && sub.sourceFile === `${sb}_audit.txt`, "submission stored");
});
await check("suggest scores (no key) → apply → save", async () => {
  await go(`/grade/${VB.id}`);
  await page.getByRole("button", { name: /^Suggest scores$/ }).click();
  await page.waitForSelector("text=/Suggested by/", { timeout: 15000 });
  const pills = await page.locator("text=/suggested [0-3]/").count();
  assert(pills === BP.rubric.length, `suggested pills ${pills}`);
  await page.getByRole("button", { name: /Apply suggestions/ }).click();
  const saveBtn = page.getByRole("button", { name: /Save score/ });
  assert(!(await saveBtn.isDisabled()), "save enabled after apply");
  await saveBtn.click();
  await page.waitForTimeout(200);
  const st = await wsState();
  const sub = st.submissions.find((s) => s.variantId === VB.id);
  assert(sub.grade && sub.preScore && sub.preScore.model === "demo-provider", "grade saved and suggestion kept");
});

console.log("\n14. Console errors across the whole run");
await check("no console/page errors", async () => { assert(consoleErrors.length === 0, consoleErrors.join(" | ")); });

await browser.close();
console.log(`\n${results.filter((r) => r.ok).length} passed, ${failures} failed`);
process.exit(failures ? 1 : 0);
