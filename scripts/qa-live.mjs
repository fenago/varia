/**
 * Live QA: can a professor paste a key, upload their own assessment, and watch a
 * real run complete in the UI? Runs against the production build on :4174 with
 * a real key read from /tmp/varia-key (never printed, never persisted).
 *
 *   npx vite build && npx vite preview --port 4174 &   # then
 *   node scripts/qa-live.mjs
 */
import { chromium } from "playwright";
import { readFileSync, mkdirSync } from "node:fs";
import { Document, Packer, Paragraph, HeadingLevel, TextRun } from "docx";

const BASE = process.env.QA_BASE ?? "http://localhost:4174";
const SHOTS = "qa/screenshots";
mkdirSync(SHOTS, { recursive: true });
const KEY = readFileSync("/tmp/varia-key", "utf8").trim();
if (!KEY.startsWith("sk-ant-")) throw new Error("No key in /tmp/varia-key");

const results = [];
const timings = {};
let failures = 0;
const t0 = Date.now();
const elapsed = () => ((Date.now() - t0) / 1000).toFixed(0) + "s";
function pass(item, note = "") { results.push({ item, ok: true, note }); console.log(`  ✓ ${item}${note ? " — " + note : ""}`); }
function fail(item, note = "") { results.push({ item, ok: false, note }); failures++; console.log(`  ✗ ${item}${note ? " — " + note : ""}`); }
async function check(item, fn) {
  try { const note = await fn(); pass(item, typeof note === "string" ? note : ""); return true; }
  catch (e) { fail(item, e?.message ?? String(e)); return false; }
}
function assert(cond, msg) { if (!cond) throw new Error(msg); }
const lc = (s) => s.toLowerCase();

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
await ctx.grantPermissions(["clipboard-read", "clipboard-write"]).catch(() => {});
const page = await ctx.newPage();
const consoleErrors = [];
page.on("console", (m) => { if (m.type() === "error") consoleErrors.push(m.text().slice(0, 300)); });
page.on("pageerror", (e) => consoleErrors.push("pageerror: " + e.message));

const body = async () => page.locator("body").innerText();
async function go(p) { await page.goto(BASE + p, { waitUntil: "networkidle" }); await page.waitForTimeout(150); }
/** Client-side navigation (keeps an in-flight run alive). */
async function nav(label) { await page.locator(".va-rail").getByRole("link", { name: label, exact: false }).first().click(); await page.waitForTimeout(300); }
async function shot(name) { await page.screenshot({ path: `${SHOTS}/live_${name}.png`, fullPage: true }); }
async function wsState() { return page.evaluate(() => JSON.parse(localStorage.getItem("varia.workspace.v1")).state); }

// ---------------------------------------------------------------------------
// The professor's own files
// ---------------------------------------------------------------------------
const EMPLOYER = "Harbor Point Credit Union";
const ROSTER = [["Delacroix, M.", "md@students.mdc.example"], ["Okonkwo, T.", "to@students.mdc.example"], ["Villanueva, R.", "rv@students.mdc.example"], ["Petrov, S.", "sp@students.mdc.example"], ["Ashworth, J.", "ja@students.mdc.example"], ["Nakagawa, H.", "hn@students.mdc.example"]];
const P = (t, opts = {}) => new Paragraph({ children: [new TextRun(t)], ...opts });
const H = (t, level = HeadingLevel.HEADING_2) => new Paragraph({ text: t, heading: level });

const assignmentDoc = new Document({
  sections: [{
    children: [
      H("Assignment 4 — Fraud-alert model review for Harbor Point Credit Union (12 points)", HeadingLevel.HEADING_1),
      H("Context"),
      P(`${EMPLOYER} runs a card-fraud alert model that flags transactions for member callbacks. Since May, members in two branches report legitimate purchases declined at a rate the fraud team cannot explain from the model card, which reports aggregate precision of 0.91 and recall of 0.78 with no subgroup or branch breakdown. The fraud manager, Elena Marsh, has asked for an independent review before the next model refresh.`),
      H("What you must produce"),
      P("A structured model review with four findings, each tied to evidence in the model card or the incident summary: (1) a fairness finding on false-positive rates across member segments and branches; (2) a robustness finding on how the model behaves under the seasonal shift in spending; (3) a documentation finding naming what the model card omits and which decision that blocks; (4) a prioritised set of recommendations with an explicit severity rule."),
      H("Constraints"),
      P("Use only the figures in the model card and incident summary; state what cannot be concluded from missing figures. 900 to 1,300 words. Write for the fraud manager, not for a data scientist."),
      H("Rubric"),
      P("Criterion 1 — Identifies fairness gaps with evidence (3 points)"),
      P("0: No fairness gap identified or claims are unsupported."),
      P("1: A gap is named but not tied to figures in the card."),
      P("2: A gap is tied to card figures; subgroup reasoning is partial."),
      P("3: Gaps are tied to specific subgroup or branch rates and calibration, with what is missing stated."),
      P("Criterion 2 — Robustness analysis under shift (3 points)"),
      P("0: Shift is not considered."),
      P("1: Shift is mentioned without linking to the model's training window or thresholds."),
      P("2: Shift is linked to the training window; validation gaps are named."),
      P("3: Shift risks are traced to documented choices and specific validations are proposed."),
      P("Criterion 3 — Documentation completeness (3 points)"),
      P("0: Documentation is not assessed."),
      P("1: Missing items are listed without consequences."),
      P("2: Missing items are linked to at least one blocked decision."),
      P("3: Each missing item is linked to the decision it blocks and to who needs it."),
      P("Criterion 4 — Prioritisation and recommendation quality (3 points)"),
      P("0: No recommendations or no order."),
      P("1: Recommendations without a stated severity rule."),
      P("2: Ordered recommendations with an implicit rule."),
      P("3: Ordered recommendations with an explicit severity rule and owners."),
    ],
  }],
});
const answerDoc = new Document({
  sections: [{
    children: [
      H("Instructor model answer — Harbor Point fraud-alert review", HeadingLevel.HEADING_1),
      P("Finding 1 — Fairness. The card reports precision 0.91 and recall 0.78 in aggregate. Without false-positive rates by member segment or branch, the complaint from the two branches cannot be assessed or dismissed. The incident summary shows 214 member callbacks in May against 61 in March at those branches, a 3.5× rise, while other branches rose 1.2×. The absence of a subgroup breakdown is itself the primary gap; a per-branch false-positive rate and a calibration plot by segment are required before any disparate-impact claim can be supported or rejected."),
      P("Finding 2 — Robustness. The training window ends in February and the operating threshold was set on that window. May spending includes travel and seasonal purchases that were rare in the training data, so the score distribution shifts right and the fixed threshold flags more legitimate transactions. Nothing in the card reports a temporal holdout or drift monitoring. Recommended validations: a monthly holdout from the current quarter, population-stability index on the top ten features, and a threshold review keyed to the observed callback rate."),
      P("Finding 3 — Documentation. The card omits subgroup metrics, the threshold-setting procedure, the feature list with data sources, and the retraining cadence. Each omission blocks a decision: without subgroup metrics the compliance officer cannot sign the fair-lending attestation; without the threshold procedure the fraud manager cannot adjust callbacks; without the feature list the data team cannot check for proxies; without the cadence the risk committee cannot schedule review."),
      P("Finding 4 — Prioritisation. Severity rule: member harm first, then regulatory exposure, then operational cost. Order: (1) publish per-branch and per-segment false-positive rates within two weeks, owner data science; (2) run the temporal holdout and adjust the threshold, owner fraud analytics; (3) complete the model card with features, threshold procedure and cadence, owner model risk; (4) add monthly drift monitoring, owner platform team."),
      P("What cannot be concluded: whether the two branches differ from the rest of the portfolio on any protected characteristic, because the card carries no such breakdown."),
    ],
  }],
});
const assignmentBuf = await Packer.toBuffer(assignmentDoc);
const answerBuf = await Packer.toBuffer(answerDoc);
const rosterCsv = "name,email\n" + ROSTER.map((r) => r.join(",")).join("\n") + "\n";
const SUBMISSION = `Finding 1 — Fairness. The card only gives aggregate precision and recall, so the branch complaints cannot be judged. Callbacks rose 3.5 times at the two branches versus 1.2 times elsewhere; per-branch false-positive rates are needed. Finding 2 — Robustness. Training ended in February and the threshold was fixed there; seasonal spending in May shifts scores upward. A temporal holdout and drift monitoring should be added. Finding 3 — Documentation. The card omits subgroup metrics, the threshold procedure and the feature list, which blocks the fair-lending attestation and threshold adjustments. Finding 4 — Prioritisation. Member harm first: publish subgroup rates, then the holdout, then complete the card, then monitoring.`;

// ---------------------------------------------------------------------------
console.log("\n1. Settings — paste key, verify, formative preset");
await check("save and verify the key", async () => {
  await go("/settings");
  await page.locator('input[placeholder="sk-ant-…"]').fill(KEY);
  await page.getByRole("button", { name: /^Save key$/ }).click();
  await page.waitForTimeout(300);
  const h = await page.locator(".va-header").innerText();
  assert(!h.includes("Demo mode"), `header still demo: ${h}`);
  const tv = Date.now();
  await page.getByRole("button", { name: /^Verify key$/ }).click();
  await page.getByText(/Verified with/).waitFor({ timeout: 45000 });
  timings.verify = ((Date.now() - tv) / 1000).toFixed(1) + "s";
  const t = await body();
  const m = t.match(/Verified with ([^·\n]+)/);
  await page.screenshot({ path: `${SHOTS}/live_settings_verified.png`, clip: { x: 234, y: 0, width: 1206, height: 520 } });
  return `${m ? m[1].trim() : "?"} in ${timings.verify}; header: ${h.replace(/\s+/g, " ").slice(0, 60)}`;
});

console.log("\n2. Import — upload the professor's own .docx files and roster");
let criteriaCount = 0;
await check("upload docx + docx + csv → extracted draft", async () => {
  await go("/import");
  const ti = Date.now();
  await page.locator('input[type="file"]').first().setInputFiles([
    { name: "HarborPoint_Assignment4.docx", mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", buffer: assignmentBuf },
    { name: "instructor_model_answer.docx", mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", buffer: answerBuf },
    { name: "roster.csv", mimeType: "text/csv", buffer: Buffer.from(rosterCsv) },
  ]);
  // progress states
  let sawReading = false, sawExtracting = false;
  for (let i = 0; i < 40; i++) {
    const t = await body();
    if (/Reading \d+ files/i.test(t)) sawReading = true;
    if (/Extracting the blueprint/i.test(t)) sawExtracting = true;
    if (t.includes("Here is what we found")) break;
    await page.waitForTimeout(500);
  }
  await page.getByText("Here is what we found").waitFor({ timeout: 150000 });
  timings.extract = ((Date.now() - ti) / 1000).toFixed(1) + "s";
  const t = await body();
  const rows = await page.locator("table").first().locator("tbody tr").count();
  const st = await wsState();
  const draft = st.pendingDraft;
  assert(draft, "pending draft in workspace");
  criteriaCount = draft.rubric.length;
  assert(criteriaCount === 4, `criteria ${criteriaCount}`);
  assert(draft.canonicalSolution && draft.canonicalSolution.length > 200, "canonical solution present");
  assert(draft.rubric.every((c) => c.anchors && c.anchors.length === 4), "anchors on every criterion");
  assert(st.roster.students.length === 6, `roster ${st.roster.students.length}`);
  const repaired = (t.match(/Repaired from your files: [^\n]+/) || [])[0] ?? "no repairs";
  await shot("import_draft");
  await page.getByRole("button", { name: /^Looks right, continue$/ }).click();
  await page.waitForURL("**/blueprint", { timeout: 10000 });
  return `extracted in ${timings.extract} · progress seen: reading=${sawReading} extracting=${sawExtracting} · ${criteriaCount} criteria · roster 6 · uploaded rows ${rows} · ${repaired}`;
});

console.log("\n3. Generate — formative preset, dimension-preserving, N = 4, live");
let runId = null;
await check("live run with visible progress", async () => {
  await nav("2 · Generate variants");
  await page.waitForURL("**/generate");
  await page.locator(".seg-opt", { hasText: /^\s*Formative\s*$/ }).first().click();
  await page.waitForTimeout(200);
  await page.locator("label", { hasText: /Students copying from each other/i }).first().click();
  const nInput = page.locator('.field:has(label:has-text("Versions to generate")) input');
  await nInput.fill("4");
  await page.waitForTimeout(200);
  const gen = page.getByRole("button", { name: /^Generate 4 versions$/ });
  await gen.waitFor({ timeout: 5000 });
  const tg = Date.now();
  await gen.click();
  const seen = { headlines: new Set(), kofn: new Set(), cost: null, elapsedTicked: false, strip: false };
  let lastElapsed = null;
  let sawStrip = false;
  for (let i = 0; i < 960; i++) { // up to 8 min
    if (page.url().endsWith("/report")) break;
    const t = await body();
    for (const h of ["Generating", "Judging", "Scoring", "Regenerating"]) if (new RegExp(h, "i").test(t)) seen.headlines.add(h);
    const k = t.match(/(\d+) of (\d+)/); if (k) seen.kofn.add(k[0]);
    const e = t.match(/(\d+:\d\d|\d+ ?s\b|\d+ ?min)/); if (e) { if (lastElapsed && lastElapsed !== e[0]) seen.elapsedTicked = true; lastElapsed = e[0]; }
    const c = t.match(/Actual (?:so far|cost)[^$]*\$(\d+\.\d\d)/i); if (c && Number(c[1]) > 0) seen.cost = c[1];
    if (!sawStrip && i === 40) {
      await nav("4 · Release & roster");
      const strip = await page.locator(".va-progress-strip").count();
      seen.strip = strip > 0;
      await page.screenshot({ path: `${SHOTS}/live_run_strip.png`, clip: { x: 234, y: 0, width: 1206, height: 260 } });
      await nav("2 · Generate variants");
      sawStrip = true;
    }
    if (i === 20) await shot("run_progress");
    await page.waitForTimeout(500);
  }
  if (!page.url().endsWith("/report")) await page.waitForURL("**/report", { timeout: 120000 });
  timings.run = ((Date.now() - tg) / 1000).toFixed(0) + "s";
  const st = await wsState();
  runId = st.activeRunId;
  const run = st.runs.find((r) => r.id === runId);
  assert(run && run.status === "complete", `run status ${run?.status}: ${run?.error ?? ""}`);
  assert(run.report, "report present");
  assert(seen.headlines.size >= 2, `phase headlines ${[...seen.headlines]}`);
  assert(seen.kofn.size >= 2, `k of n increments ${[...seen.kofn].slice(0, 5)}`);
  assert(seen.cost, "actual cost shown during run");
  assert(seen.strip, "run strip visible on another page mid-run");
  timings.cost = run.usage?.costUsd?.toFixed(2);
  return `${timings.run} · headlines ${[...seen.headlines].join("/")} · k-of-n ${seen.kofn.size} steps · elapsed ticked=${seen.elapsedTicked} · strip=${seen.strip} · usage $${timings.cost} (${run.usage?.calls} calls)`;
});

console.log("\n4. Report — real numbers, cost line, versions table, CSV");
let checks = null;
await check("report renders the live results", async () => {
  await page.waitForTimeout(400);
  const t = await body();
  for (const l of ["Versions look different", "Same skill measured", "One rubric grades them all", "Equally hard to read"]) assert(t.includes(l), `check ${l}`);
  assert(/cosine \d\.\d{3}/.test(t) && /equivalence \d\.\d{3}/.test(t) && /σ Flesch \d/.test(t), "real metric labels");
  assert(/Actual cost \$\d/.test(t), "actual cost line");
  const st = await wsState();
  const rep = st.runs.find((r) => r.id === runId).report;
  checks = Object.fromEntries(Object.values(rep.checks).map((c) => [c.property, `${c.gate} (${c.metricLabel})`]));
  await page.getByRole("button", { name: /^Show$/ }).first().click().catch(() => {});
  await page.waitForTimeout(300);
  const t2 = await body();
  assert(/rationale|why/i.test(t2), "versions table with rationales");
  const [dl] = await Promise.all([page.waitForEvent("download", { timeout: 8000 }), page.getByRole("button", { name: /Export CSV/ }).click()]);
  await shot("report");
  return `J ${rep.joint.toFixed(3)} · ${Object.entries(checks).map(([k, v]) => `${k} ${v}`).join(" · ")} · releasable=${rep.releasable} · csv ${dl.suggestedFilename()}`;
});

console.log("\n5. Release → student link → submission → live pre-score → evidence → verify");
let released = false;
await check("release", async () => {
  const clean = page.getByRole("button", { name: /^Release \d+ versions$/ });
  if (await clean.count()) { await clean.click(); }
  else {
    await page.getByRole("button", { name: /^Release all \d+ anyway$/ }).click();
    await page.locator("textarea").last().fill("Live QA: formative run, releasing to exercise the rest of the flow");
    await page.getByRole("button", { name: /Release with this reason/ }).click();
  }
  await page.getByText(/^Released /).first().waitFor({ timeout: 8000 });
  released = true;
  return (await clean.count()) ? "released clean" : "released over threshold with a reason";
});
let variantId = null, surnameUsed = null;
await check("student task link opens in a fresh context without the solution", async () => {
  await go("/roster");
  const section = page.locator(".blueprint", { hasText: "Student links" }).first();
  const first = section.locator("button").filter({ hasText: /·/ }).first();
  const label = await first.innerText();
  await first.click();
  const link = await page.locator(".va-copyfield input, input[readonly]").last().inputValue();
  assert(link.includes("/task/") && link.includes("#pkg="), `task link ${link.slice(0, 60)}`);
  variantId = link.split("/task/")[1].split("#")[0];
  const st = await wsState();
  const run = st.runs.find((r) => r.id === runId);
  const v = run.variants.find((x) => x.id === variantId);
  surnameUsed = st.roster.students.find((s) => s.id === v.studentId).name.split(",")[0];
  const c2 = await browser.newContext({ viewport: { width: 1200, height: 900 } });
  const p2 = await c2.newPage();
  const errs = [];
  p2.on("pageerror", (e) => errs.push(e.message));
  await p2.goto(link, { waitUntil: "networkidle" });
  const t = lc(await p2.locator("body").innerText());
  assert(t.includes("your task"), "task section");
  assert(!t.includes(lc(v.adaptedSolution.slice(0, 40))), "no adapted solution");
  assert(!t.includes("reading ease"), "no metrics");
  assert(errs.length === 0, errs.join(" | "));
  await p2.screenshot({ path: `${SHOTS}/live_task_link.png`, fullPage: true });
  await c2.close();
  return `${label.replace(/\s+/g, " ")} → ${variantId}`;
});
await check("import one .txt submission matched by surname", async () => {
  await go("/roster");
  await page.locator('[data-testid="submissions-input"]').setInputFiles([{ name: `${surnameUsed}_review.txt`, mimeType: "text/plain", buffer: Buffer.from(SUBMISSION) }]);
  await page.waitForSelector("text=Import matched files", { timeout: 10000 });
  await page.getByRole("button", { name: /Import matched files/ }).click();
  await page.waitForSelector("text=/1 submissions? imported/", { timeout: 10000 });
  const st = await wsState();
  const sub = st.submissions.find((s) => s.variantId === variantId);
  assert(sub && sub.text, "submission stored on the variant");
  return `${surnameUsed}_review.txt → ${variantId}`;
});
await check("live pre-score → apply → save", async () => {
  await go(`/grade/${variantId}`);
  const tp = Date.now();
  await page.getByRole("button", { name: /^Suggest scores$/ }).click();
  await page.getByText(/Reading the submission against the rubric/).waitFor({ timeout: 5000 }).catch(() => {});
  await page.waitForSelector("text=/Suggested by/", { timeout: 120000 });
  timings.prescore = ((Date.now() - tp) / 1000).toFixed(1) + "s";
  const pills = await page.locator("text=/suggested [0-3]/").count();
  assert(pills === criteriaCount, `suggested pills ${pills}`);
  await page.getByRole("button", { name: /Apply suggestions/ }).click();
  const saveBtn = page.getByRole("button", { name: /Save score/ });
  assert(!(await saveBtn.isDisabled()), "save enabled after apply");
  await shot("grade_prescore");
  await saveBtn.click();
  await page.waitForTimeout(300);
  const st = await wsState();
  const sub = st.submissions.find((s) => s.variantId === variantId);
  assert(sub.grade && sub.preScore && sub.preScore.model !== "demo-provider", `grade ${!!sub.grade} prescore model ${sub.preScore?.model}`);
  return `${timings.prescore} · model ${sub.preScore.model} · grade ${sub.grade.total}/${sub.grade.maxTotal}`;
});
let recordId = null;
await check("evidence record: issue → sign → verify", async () => {
  await go(`/evidence/${variantId}`);
  await page.getByRole("button", { name: /^Issue record$/ }).click();
  await page.waitForSelector("text=/VR-\\d{4}-\\d{4}/", { timeout: 10000 });
  const sign = page.getByRole("button", { name: /^Sign record$/ });
  if (await sign.count()) { await sign.click(); await page.waitForTimeout(1500); }
  const st = await wsState();
  const rec = st.evidenceRecords.find((r) => r.variantId === variantId);
  recordId = rec.id;
  assert(rec.bridge?.signature, "signed");
  await shot("evidence");
  await go(`/verify/${recordId}`);
  await page.getByText("Record verified").waitFor({ timeout: 8000 });
  await shot("verify");
  return `${recordId} signed with ${rec.bridge.signedWithKid}`;
});

console.log("\n6. Forget key → demo");
await check("forget key returns to demo mode", async () => {
  await go("/settings");
  await page.getByRole("button", { name: /^Forget key$/ }).first().click();
  await page.locator(".dialog").getByRole("button", { name: /Forget key/ }).click();
  await page.waitForTimeout(300);
  assert((await page.locator(".va-header").innerText()).includes("Demo mode"), "back to demo");
  const has = await page.evaluate(() => `${localStorage.getItem("varia.settings") ?? ""}${sessionStorage.getItem("varia.session-key") ?? ""}`.includes("sk-ant-"));
  assert(!has, "key still in storage");
});

console.log("\n7. Console errors");
const BENIGN = [/Failed to load resource.*(401|400)/, /favicon/];
const realErrors = consoleErrors.filter((e) => !BENIGN.some((r) => r.test(e)) && !e.includes(KEY));
await check("no unexpected console/page errors", async () => { assert(realErrors.length === 0, realErrors.join(" | ")); return `${consoleErrors.length - realErrors.length} benign ignored`; });

await browser.close();
console.log(`\n${results.filter((r) => r.ok).length} passed, ${failures} failed · total ${elapsed()} · timings ${JSON.stringify(timings)} · checks ${JSON.stringify(checks)}`);
process.exit(failures ? 1 : 0);
