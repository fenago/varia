// Guided demo walkthrough QA: start from Home with no key, press through every stop,
// assert each stop's target is highlighted and nothing is spent. Run against a preview:
//   QA_BASE=http://localhost:4173 node scripts/qa-walkthrough.mjs
import { chromium } from "playwright";
const BASE = process.env.QA_BASE || "http://localhost:4173";
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
page.on("console", (m) => { if (m.type() === "error") errors.push("console: " + m.text()); });
const results = [];
const check = async (name, fn) => { try { await fn(); results.push({ name, ok: true }); console.log("  ✓ " + name); } catch (e) { results.push({ name, ok: false, err: String(e) }); console.log("  ✗ " + name + " — " + String(e).slice(0, 300)); } };
const assert = (c, m) => { if (!c) throw new Error(m); };
const panel = () => page.locator("[data-walk-panel]");
const stopNo = async () => Number(((await panel().innerText()).match(/stop (\d+) of (\d+)/i) || [])[1] || 0);
const total = async () => Number(((await panel().innerText()).match(/stop (\d+) of (\d+)/i) || [])[2] || 0);

await page.goto(BASE + "/", { waitUntil: "networkidle" });
await page.evaluate(() => { try { localStorage.clear(); sessionStorage.clear(); } catch {} });
await page.goto(BASE + "/", { waitUntil: "networkidle" });
const T0 = new Date().toISOString();
const spendOf = async () => { const ws = await page.evaluate(() => JSON.parse(localStorage.getItem("varia.workspace.v1") || "{}")); const st = ws.state || ws; return (st.runs || []).filter((r) => r.startedAt >= T0).reduce((s, r) => s + ((r.usage && r.usage.costUsd) || 0), 0); };
const spentBefore = 0;

await check("Home has the walkthrough button", async () => {
  await page.getByRole("button", { name: /Walk me through a demo/ }).first().click();
  await panel().waitFor({ timeout: 5000 });
  assert((await stopNo()) === 1, "starts at stop 1");
});

const N = await total();
let guard = 0;
while ((await stopNo()) < N && guard++ < 40) {
  const before = await stopNo();
  const text = await panel().innerText();
  await check(`stop ${before}: target highlighted · ${text.split("\n")[2] || ""}`.slice(0, 90), async () => {
    const hi = page.locator(".va-walk-target");
    await hi.first().waitFor({ timeout: 15000 });
    assert((await hi.count()) >= 1, "no highlighted target");
  });
  const doIt = page.getByRole("button", { name: /^(Do it for me|Working…)$/ });
  const next = page.getByRole("button", { name: /^(Next|Finish)$/ });
  if (await doIt.count()) {
    await doIt.first().click();
    await page.waitForFunction((b) => { const p = document.querySelector("[data-walk-panel]"); const m = p && p.innerText.match(/stop (\d+) of/i); return m && Number(m[1]) > b; }, before, { timeout: 120000 }).catch(() => {});
  } else {
    await next.first().click();
  }
  await page.waitForTimeout(400);
  assert((await stopNo()) > before, `did not advance from stop ${before}`);
}

await check("reached the last stop and finished", async () => {
  assert((await stopNo()) === N, `at ${await stopNo()} of ${N}`);
  await page.getByRole("button", { name: /^Finish$/ }).click();
  await page.waitForTimeout(300);
  assert((await panel().count()) === 0, "panel still open");
});
await check("nothing was spent (no live usage on any run)", async () => {
  const spent = (await spendOf()) - spentBefore;
  assert(Math.abs(spent) < 1e-9, `spent $${spent} during the walkthrough`);
});
await check("no console or page errors", async () => { assert(errors.length === 0, errors.join(" | ").slice(0, 600)); });
await browser.close();
const fails = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - fails} passed, ${fails} failed`);
process.exit(fails ? 1 : 0);
