#!/usr/bin/env node
/**
 * Raise the type scale for readability. Rewrites inline `fontSize: N` numbers in TSX
 * and the size-bearing rules in app.css by a fixed mapping. Idempotent-ish: a file
 * that has already been scaled is skipped when it carries the marker comment.
 *
 *   node scripts/type-scale.mjs <file …>          rewrite the given files
 *   node scripts/type-scale.mjs --css              rewrite src/ui/styles/app.css
 *   node scripts/type-scale.mjs --dry <file …>     print what would change
 */
import { readFileSync, writeFileSync } from "node:fs";

const MAP = new Map([
  [10.5, 12], [11, 12.5], [11.5, 13], [12, 14], [12.5, 14], [13, 15], [13.5, 15.5], [14, 16],
  [14.5, 16], [15, 17], [16, 18], [17, 19], [18, 20], [19, 21], [20, 22], [22, 24],
]);
const MARKER = "/* type-scale: applied */";
const args = process.argv.slice(2);
const dry = args.includes("--dry");
const css = args.includes("--css");
const files = args.filter((a) => !a.startsWith("--"));

function mapNum(n) {
  return MAP.has(n) ? MAP.get(n) : n;
}

function rewriteTsx(src) {
  // fontSize: 13.5  |  fontSize: "13.5px" (rare)
  return src
    .replace(/fontSize:\s*(\d+(?:\.\d+)?)(?=\s*[,}])/g, (m, n) => `fontSize: ${mapNum(Number(n))}`)
    .replace(/fontSize:\s*"(\d+(?:\.\d+)?)px"/g, (m, n) => `fontSize: "${mapNum(Number(n))}px"`);
}

function rewriteCss(src) {
  // Only the size-bearing rules we own in app.css; tokens.css is never touched.
  const sel = /(\.va-(?:muted-11|muted-115|muted-12|muted-125|heading-15|heading-16|heading-19|heading-22|kicker|kicker-11|nav|railhd|pill|stamp|stat-number|step-number|check-label|progress-headline|table-scroll|worksample-meta|glossary-term|info-pop|stepintro-kicker|verdict-body|audience-quote)[^{]*\{[^}]*?)font-size:\s*(\d+(?:\.\d+)?)px/g;
  let out = src.replace(sel, (m, head, n) => `${head}font-size: ${mapNum(Number(n))}px`);
  // generic small sizes inside app.css that are not in tokens: bump 10.5–13 → mapped, once
  out = out.replace(/font-size:\s*(10\.5|11|11\.5|12|12\.5|13|13\.5)px/g, (m, n) => `font-size: ${mapNum(Number(n))}px`);
  return out;
}

if (css) files.push("src/ui/styles/app.css");
let changed = 0;
for (const f of files) {
  const src = readFileSync(f, "utf8");
  if (src.includes(MARKER)) { console.log(`skip (already scaled) ${f}`); continue; }
  const out = f.endsWith(".css") ? rewriteCss(src) : rewriteTsx(src);
  if (out === src) { console.log(`no change ${f}`); continue; }
  changed++;
  if (dry) { console.log(`would change ${f}`); continue; }
  const marked = f.endsWith(".css") ? `${MARKER}\n${out}` : out.replace(/^(import[^\n]*\n)/, `$1${MARKER}\n`);
  writeFileSync(f, marked);
  console.log(`scaled ${f}`);
}
console.log(`${changed} file(s) ${dry ? "would change" : "changed"}`);
