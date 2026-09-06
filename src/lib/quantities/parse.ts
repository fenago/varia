import type { Quantity, QuantityKind, QuantityPolicy, QuantityRange } from "@shared/types";
import { decimalsOf } from "./format";

const STOP = new Set([
  "of", "the", "a", "an", "in", "on", "at", "to", "and", "or", "with", "is", "are", "was", "were", "be", "by", "for",
  "from", "as", "it", "its", "that", "this", "these", "those", "reports", "report", "reported", "gives", "gave", "lists",
  "list", "says", "said", "about", "over", "under", "than", "per", "respectively", "adds", "own", "their", "our", "your",
  "his", "her", "which", "who", "what", "has", "have", "had", "roughly", "approximately", "around", "some", "among",
  "up", "down", "out", "into", "onto", "across", "between", "there", "here", "then", "now", "very", "just", "observed",
  "currently", "current", "total", "overall",
]);

const NUMBER_RE = /(?<![\w.])(\$?)(\d{1,3}(?:,\d{3})+|\d+)(\.\d+)?(\s?(?:%|percent(?:age points)?|per cent))?/g;
const PERIOD_QUALIFIER = /^[-\s]?(month|day|week|year|hour|minute|second|quarter)s?\b/i;
const LENGTH_NOUN = /^\s*(?:to\s+[\d,]+\s+)?(words?|pages?|characters?|sentences?|paragraphs?)\b/i;
const POINTS_RE = /^\s*points?\b/i;
const MONTHS = "january|february|march|april|may|june|july|august|september|october|november|december";
/** Text between two numbers that makes them one series: "percent in Metro, " / " and " / ", " */
const SERIES_GAP =
  /^\s*(?:%|percent|per cent)?\s*(?:(?:in|for|at|across)\s+(?:the\s+)?[A-Z][\w-]*(?:\s[A-Z][\w-]*)?)?\s*(?:,\s*(?:and|or)?|and|or)\s*$/;

function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").replace(/_+/g, "_");
}

function contentWords(s: string): string[] {
  return s
    .replace(/[^A-Za-z0-9\-' ]/g, " ")
    .split(/\s+/)
    .map((w) => w.replace(/^['-]+|['-]+$/g, ""))
    .filter((w) => w && !STOP.has(w.toLowerCase()) && !/^\d/.test(w));
}

function before(text: string, idx: number, limit = 160): string {
  const start = Math.max(0, idx - limit);
  const chunk = text.slice(start, idx);
  const sentenceStart = Math.max(chunk.lastIndexOf(". "), chunk.lastIndexOf("\n"), chunk.lastIndexOf("; "));
  return sentenceStart >= 0 ? chunk.slice(sentenceStart + 1) : chunk;
}

function after(text: string, idx: number, limit = 80): string {
  const chunk = text.slice(idx, idx + limit);
  const end = chunk.search(/[.\n]/);
  return end >= 0 ? chunk.slice(0, end) : chunk;
}

function sentenceAround(text: string, idx: number): string {
  const s = Math.max(text.lastIndexOf(". ", idx), text.lastIndexOf("\n", idx));
  const eCand = [text.indexOf(". ", idx), text.indexOf("\n", idx)].filter((n) => n >= 0);
  const e = eCand.length ? Math.min(...eCand) : text.length;
  return text.slice(s + 1, e);
}

interface Hit {
  index: number;
  raw: string;
  value: number;
  unit: string;
  decimals: number;
  pre: string;
  post: string;
  group?: { base: string[]; members: Hit[]; position: number };
}

function collect(text: string): Hit[] {
  const hits: Hit[] = [];
  const lines = text.split("\n");
  let offset = 0;
  for (const line of lines) {
    const trimmed = line.trim();
    const skipLine =
      /^#+\s/.test(trimmed) || // headings ("# Assignment 6 — … (12 points)")
      /^[-*]\s*\d+\s*:/.test(trimmed) || // rubric levels "- 0: …"
      /^\d+[.)]\s/.test(trimmed) || // numbered list markers
      /^[-*]\s*length\b/i.test(trimmed) || // "- Length: 900 to 1,300 words."
      /^\*\*(from|for|to|date|due)\b/i.test(trimmed); // letterhead lines
    if (!skipLine) {
      NUMBER_RE.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = NUMBER_RE.exec(line))) {
        const [, dollar, intPart, frac, unitRaw] = m;
        const idx = offset + m.index;
        const post = after(text, idx + m[0].length);
        const pre = before(text, idx);
        if (POINTS_RE.test(post)) continue; // "(3 points)"
        if (PERIOD_QUALIFIER.test(post)) continue; // "12-month", "3-year"
        if (LENGTH_NOUN.test(post)) continue; // "900 to 1,300 words"
        if (/\(\s*$/.test(pre) && /^\s*\)/.test(post)) continue; // "(2020)" citations
        if (/\b(et al|pp?|vol|no|figure|table|section|step|assignment|question|criterion|week|module|unit|chapter)\.?\s*$/i.test(pre)) continue;
        const unit = dollar ? "$" : unitRaw ? "%" : "";
        const value = Number(`${intPart.replace(/,/g, "")}${frac ?? ""}`);
        hits.push({ index: idx, raw: m[0], value, unit, decimals: decimalsOf(`${intPart}${frac ?? ""}`), pre, post });
      }
    }
    offset += line.length + 1;
  }
  groupSeries(text, hits);
  return hits;
}

/** Link "18 percent in Metro, 27 percent in Coastal and 29 percent in Southwest" / "3.1, 2.6 and 2.4 percent" into series. */
function groupSeries(text: string, hits: Hit[]): void {
  let i = 0;
  while (i < hits.length) {
    const members = [hits[i]];
    let j = i;
    while (j + 1 < hits.length) {
      const a = hits[j];
      const b = hits[j + 1];
      const gap = text.slice(a.index + a.raw.length, b.index);
      if (gap.length > 40 || !SERIES_GAP.test(gap) || isYearLike(a) || isYearLike(b)) break;
      members.push(b);
      j++;
    }
    if (members.length >= 2) {
      const unit = members.find((h) => h.unit)?.unit ?? "";
      const decimals = Math.max(...members.map((h) => h.decimals));
      const base = basePhrase(members[0].pre);
      members.forEach((h, k) => {
        if (unit && !h.unit) h.unit = unit;
        if (unit === "%" && h.decimals < decimals) h.decimals = decimals;
        h.group = { base, members, position: k };
      });
    }
    i = j + 1;
  }
}

function isYearLike(h: Hit): boolean {
  return !h.unit && h.decimals === 0 && h.value >= 1990 && h.value <= 2100 && !h.raw.includes(",");
}

/** "observed 12-month default rates among approved applicants of" → ["default", "rates"] */
function basePhrase(pre: string): string[] {
  const m = /([A-Za-z][A-Za-z0-9\-' ]{2,80}?)\s+of\s*$/i.exec(pre);
  if (!m) return [];
  const head = m[1].split(/\s+(?:among|in|for|with|across|between|on|at|from|by)\s+/i)[0];
  return contentWords(head).slice(-3);
}

function inferKind(h: Hit): QuantityKind {
  const pre = h.pre.toLowerCase();
  const post = h.post.toLowerCase();
  const near = `${pre.slice(-60)} ${post.slice(0, 40)}`;
  const postNoun = /^\s*([a-z][a-z\-]+)/.exec(post)?.[1] ?? "";
  const postIsNoun = !!postNoun && !/^(and|or|to|in|on|at|for|of|per|percent|percentage|respectively|among|with|from|by|the|a|an|is|are|was|were)$/.test(postNoun);
  if (h.unit === "$" || /\b(revenue|cost|price|budget|salary|spend|fee|loan amount)\b/.test(pre.slice(-40))) return "money";
  if (/\b(threshold|cut-?off|cutoff)\b/.test(pre.slice(-60))) return "threshold";
  if (isYearLike(h) && (!postIsNoun || new RegExp(`\\b(${MONTHS}|quarter|q[1-4]|since|until|through|in|of|from|to|by)\\s*$`, "i").test(h.pre))) return "date";
  if (!h.unit && h.decimals === 0 && postIsNoun && !/^(rate|rates|share|proportion)$/.test(postNoun)) return "count";
  if (h.unit === "%") return /\b(rise|drop|increase|decrease|change|gap|difference|shift)\b/.test(post.slice(0, 40)) ? "measure" : "rate";
  if (/^-point\b/.test(h.post)) return "measure";
  if (/\b(auc|accuracy|f1|precision|recall|score|roc|r2|r-squared)\b/.test(near)) return "score";
  if (/\b(rate|rates|share|proportion|percentage|ratio)\b/.test(near)) return "rate";
  if (h.decimals > 0 && h.value > 0 && h.value < 1) return "rate";
  if (/-point\b/.test(h.post) || /\b(rise|drop|increase|decrease|change|gap|difference|shift)\b/.test(post.slice(0, 40))) return "measure";
  return h.decimals === 0 ? "count" : "measure";
}

function nounPhrase(h: Hit, kind: QuantityKind, sentence: string): { key: string; label: string } {
  const pre = h.pre;
  const post = h.post;
  const locMatch = /^\s*(?:%|percent|per cent)?\s*(?:in|for|at|across)\s+(?:the\s+)?([A-Z][A-Za-z\-]+(?:\s[A-Z][A-Za-z\-]+)?)/.exec(post);
  const postNoun = /^\s*([a-z][a-z\-]+(?:\s[a-z][a-z\-]+)?)/i.exec(post);

  if (kind === "date") {
    return { key: `year_${Math.trunc(h.value)}`, label: `Year ${Math.trunc(h.value)}` };
  }

  let baseWords: string[] = [];
  let loc = locMatch ? locMatch[1] : "";
  if (h.group) {
    baseWords = h.group.base;
    if (!loc) {
      // "respectively" series: borrow the ordered list of proper names from the sentence (Metro, Coastal, Southwest)
      const names = [...sentence.matchAll(/\b(?:in|for|at|across)\s+([A-Z][A-Za-z\-]+)\b/g)].map((m) => m[1]);
      const uniq = [...new Set(names)];
      if (uniq.length === h.group.members.length) loc = uniq[h.group.position];
    }
  }
  if (!baseWords.length && kind === "count" && postNoun) baseWords = contentWords(postNoun[1]).slice(0, 1);
  if (!baseWords.length) baseWords = basePhrase(pre);
  if (!baseWords.length && /-point\b/i.test(post)) {
    const m = /-point\s+([a-z]+(?:\s+(?:in|of)\s+(?:the\s+)?[a-z]+(?:\s[a-z]+)?)?)/i.exec(post);
    if (m) baseWords = contentWords(m[1]).slice(0, 3);
  }
  if (!baseWords.length) baseWords = contentWords(pre).slice(-2);
  if (!baseWords.length && postNoun) baseWords = contentWords(postNoun[1]).slice(0, 2);
  if (!baseWords.length) baseWords = [kind];

  const key = slug([...baseWords, loc].filter(Boolean).join(" ")) || kind;
  const labelBase = [...baseWords, loc ? `in ${loc}` : ""].filter(Boolean).join(" ");
  const label = labelBase.charAt(0).toUpperCase() + labelBase.slice(1);
  return { key, label };
}

function round(n: number, d: number): number {
  return Math.round(n * 10 ** d) / 10 ** d;
}

function defaultRange(h: Hit, kind: QuantityKind): QuantityRange {
  const v = h.value;
  let min = v * 0.75;
  let max = v * 1.25;
  let step: number;
  let decimals = h.decimals;
  if (kind === "rate" || kind === "score" || kind === "threshold" || (kind === "measure" && h.unit === "%")) {
    if (h.unit === "%" || v > 1) {
      min = Math.max(0, min);
      max = Math.min(100, max);
      step = decimals > 0 ? 10 ** -decimals : 1;
    } else {
      min = Math.max(0, min);
      max = Math.min(1, max);
      decimals = Math.max(decimals, 2);
      step = 10 ** -decimals;
    }
  } else if (kind === "count") {
    min = Math.max(0, Math.floor(min));
    max = Math.max(min + 1, Math.ceil(max));
    step = 1;
    decimals = 0;
  } else if (kind === "money") {
    step = v >= 10_000 ? 100 : 10;
    min = Math.max(0, Math.floor(min / step) * step);
    max = Math.ceil(max / step) * step;
    decimals = 0;
  } else {
    step = decimals > 0 ? 10 ** -decimals : 1;
  }
  if (v === 0) {
    min = 0;
    max = kind === "count" ? 5 : 1;
  }
  return { min: round(min, decimals), max: round(max, decimals), step, decimals };
}

/**
 * Deterministic fallback extractor (no LLM): every number with its context,
 * an inferred kind, a slug key from the nearest noun phrase, and a default policy.
 * Dates and thresholds are kept; everything else varies within ±25% of the source value.
 */
export function parseQuantities(text: string, opts?: { maxItems?: number }): Quantity[] {
  const max = opts?.maxItems ?? 40;
  const hits = collect(text);
  const out: Quantity[] = [];
  const seenKeys = new Map<string, number>();
  const seenValueAtKey = new Set<string>();
  for (const h of hits) {
    if (out.length >= max) break;
    const kind = inferKind(h);
    const { key: baseKey, label } = nounPhrase(h, kind, sentenceAround(text, h.index));
    const sig = `${baseKey}|${h.value}`;
    if (seenValueAtKey.has(sig)) continue;
    seenValueAtKey.add(sig);
    const n = (seenKeys.get(baseKey) ?? 0) + 1;
    seenKeys.set(baseKey, n);
    const key = n === 1 ? baseKey : `${baseKey}_${n}`;
    const policy: QuantityPolicy = kind === "date" || kind === "threshold" ? "keep" : "vary";
    const start = Math.max(0, h.index - 60);
    const end = Math.min(text.length, h.index + h.raw.length + 60);
    const context = text.slice(start, end).replace(/\s+/g, " ").trim();
    const q: Quantity = {
      id: `q-${out.length + 1}`,
      key,
      label: n === 1 ? label : `${label} (${n})`,
      value: h.value,
      unit: h.unit || undefined,
      kind,
      policy,
      context,
    };
    if (policy === "vary") q.range = defaultRange(h, kind);
    out.push(q);
  }
  return out;
}
