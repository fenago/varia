// Responsive QA: no horizontal scroll, nothing wider than the viewport (except inside
// .va-table-scroll or a scrolling table), the menu drawer works on phones, no console errors.
//   npx vite build && (npx vite preview --port 4173 &) && node scripts/qa-responsive.mjs
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
const BASE = process.env.QA_BASE ?? "http://localhost:4173";
const SHOTS = "qa/screenshots"; mkdirSync(SHOTS, { recursive: true });
const ROUTES = ["/", "/for", "/journey", "/for/employers", "/start", "/import", "/blueprint", "/generate", "/report", "/roster", "/grade", "/console", "/employer", "/talent", "/portfolio", "/settings", "/about", "/research", "/glossary"];
const SIZES = [[360, 740], [390, 844], [768, 1024], [1440, 900]];
const browser = await chromium.launch();
const results = []; let consoleErrors = [];
function record(name, ok, detail) { results.push({ name, ok, detail }); console.log(`${ok ? "✓" : "✗"} ${name}${detail ? ` — ${detail}` : ""}`); }
for (const [w, h] of SIZES) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1, hasTouch: w < 900 });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => consoleErrors.push(`${w}px ${e.message}`));
  page.on("console", (m) => { if (m.type() === "error") consoleErrors.push(`${w}px ${m.text()}`); });
  for (const r of ROUTES) {
    await page.goto(BASE + r, { waitUntil: "networkidle" }); await page.waitForTimeout(150);
    const m = await page.evaluate(() => {
      const de = document.documentElement; const vw = window.innerWidth;
      const wide = [];
      for (const el of document.querySelectorAll("body *")) {
        const rect = el.getBoundingClientRect();
        if (rect.width === 0) continue;
        if (rect.right > vw + 1 || rect.left < -1) {
          if (el.closest(".va-table-scroll") || el.closest("table.table") || el.closest(".va-rail") || el.closest(".dialog")) continue;
          const cs = getComputedStyle(el); if (cs.position === "fixed" && cs.transform !== "none") continue;
          wide.push(`${el.tagName.toLowerCase()}${el.className && typeof el.className === "string" ? "." + el.className.split(" ")[0] : ""} ${Math.round(rect.left)}–${Math.round(rect.right)}`);
          if (wide.length > 4) break;
        }
      }
      return { scrollW: de.scrollWidth, vw, wide };
    });
    const ok = m.scrollW <= m.vw + 1 && m.wide.length === 0;
    record(`${w}px ${r}`, ok, ok ? "" : `scrollWidth ${m.scrollW} vs ${m.vw}; ${m.wide.join(" | ")}`);
    if (w === 360 || w === 1440) await page.screenshot({ path: `${SHOTS}/mobile_${w}_${r === "/" ? "home" : r.slice(1).replace(/\//g, "_")}.png`, fullPage: true });
  }
  if (w < 900) {
    await page.goto(BASE + "/", { waitUntil: "networkidle" });
    const menu = page.getByRole("button", { name: /open navigation/i });
    record(`${w}px menu button visible`, await menu.isVisible());
    await menu.click(); await page.waitForTimeout(250);
    const railVisible = await page.locator("#va-rail").evaluate((el) => getComputedStyle(el).transform === "none" || getComputedStyle(el).transform === "matrix(1, 0, 0, 1, 0, 0)");
    record(`${w}px drawer opens`, railVisible);
    await page.getByRole("link", { name: /Glossary/ }).first().click();
    await page.waitForURL("**/glossary"); await page.waitForTimeout(300);
    const closed = await page.locator("#va-rail").evaluate((el) => !el.classList.contains("is-open"));
    record(`${w}px drawer navigates and closes`, closed);
    await page.screenshot({ path: `${SHOTS}/mobile_${w}_drawer.png` });
  } else {
    await page.goto(BASE + "/", { waitUntil: "networkidle" });
    record(`${w}px rail visible, no menu button`, (await page.locator(".va-rail").isVisible()) && !(await page.getByRole("button", { name: /open navigation/i }).isVisible()));
  }
  await ctx.close();
}
const benign = /favicon|Download the React DevTools/i;
consoleErrors = consoleErrors.filter((e) => !benign.test(e));
record("no console errors", consoleErrors.length === 0, consoleErrors.slice(0, 3).join(" | "));
await browser.close();
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
