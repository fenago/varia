/**
 * Extraction guard: validates a live blueprint extraction and repairs gaps
 * from the source text (rubric section, model answer) so a thin or partial
 * model output never reaches the Blueprint page half-empty.
 */
import type { BlueprintDraft, Criterion, Quantity, QuantityRange, SampleAssessment, SourceFile, SurfaceDimension } from "@shared/types";
import { findSource, localExtract, parseRubric } from "@lib/ingest/localExtract";
import { formulaIdentifiers, parseQuantities } from "@lib/quantities";

export interface GuardResult {
  draft: BlueprintDraft;
  /** Human-readable list of what was repaired; empty when the extraction was complete. */
  repairs: string[];
  /** Problems that could not be repaired from the text */
  unresolved: string[];
}

const STANDARD_DIMS: { key: string; label: string; locked: boolean; note: string }[] = [
  { key: "domain", label: "Industry domain", locked: false, note: "drafted" },
  { key: "stakeholder", label: "Stakeholder role", locked: false, note: "drafted" },
  { key: "scenario", label: "Organisation and scenario", locked: false, note: "drafted" },
  { key: "jargon", label: "Jargon register", locked: false, note: "3 bands" },
  { key: "readingLevel", label: "Reading level", locked: true, note: "held constant" },
  { key: "stepCount", label: "Number of findings required", locked: true, note: "held constant" },
];

function newCritId(i: number): string {
  const rand = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID().slice(0, 8) : Math.random().toString(36).slice(2, 10);
  return `crit-${rand}-${i + 1}`;
}

function hasAnchors(c: Criterion): boolean {
  return Array.isArray(c.anchors) && c.anchors.length === 4 && c.anchors.every((a) => typeof a === "string" && a.trim().length > 0);
}

function normaliseWeights(rubric: Criterion[]): Criterion[] {
  const total = rubric.reduce((a, c) => a + (Number.isFinite(c.weight) && c.weight > 0 ? c.weight : 0), 0);
  if (total > 0.98 && total < 1.02) return rubric;
  const pts = rubric.reduce((a, c) => a + (c.points > 0 ? c.points : 0), 0);
  if (pts > 0) return rubric.map((c) => ({ ...c, weight: Math.round((c.points / pts) * 1000) / 1000 }));
  return rubric.map((c) => ({ ...c, weight: Math.round((1 / rubric.length) * 1000) / 1000 }));
}

/**
 * Validate a draft and repair what the source text can supply.
 * `files` are the parsed sources (with text). `sample` enables the full
 * local extractor as a repair source; without it only the rubric section and
 * the model-answer file are used.
 */
export function guardDraft(draft: BlueprintDraft, files: SourceFile[], sample?: SampleAssessment): GuardResult {
  const repairs: string[] = [];
  const unresolved: string[] = [];
  let d: BlueprintDraft = JSON.parse(JSON.stringify(draft)) as BlueprintDraft;

  const assignment = findSource(files, ["task+rubric", "rubric", "task"]);
  const solution = findSource(files, "solution");
  const md = assignment?.text ?? "";
  const hasRubricText = /^\s*#{1,3}\s*rubric\b/im.test(md) || /\brubric\b/i.test(md);

  let local: BlueprintDraft | null = null;
  const getLocal = () => {
    if (local) return local;
    if (!sample || !md) return null;
    try {
      local = localExtract(files, sample);
    } catch {
      local = null;
    }
    return local;
  };

  // Rubric: ≥ 3 criteria with anchors -------------------------------------
  const rubricOk = Array.isArray(d.rubric) && d.rubric.length >= 3 && d.rubric.every(hasAnchors);
  if (!rubricOk) {
    const parsed = hasRubricText ? parseRubric(md) : { criteria: [] as { name: string; points: number; anchors: Criterion["anchors"] }[] };
    if (parsed.criteria.length >= 3) {
      const byName = new Map(parsed.criteria.map((c) => [c.name.toLowerCase(), c]));
      const merged: Criterion[] = (d.rubric?.length ? d.rubric : parsed.criteria.map(() => null)).map((c, i) => {
        const src = c ? byName.get(c.name.toLowerCase()) ?? parsed.criteria[i] : parsed.criteria[i];
        const base: Criterion = c ?? {
          id: newCritId(i),
          name: src?.name ?? `Criterion ${i + 1}`,
          points: src?.points ?? 3,
          weight: 0,
          levels: 4,
          anchors: null,
          anchorsConfidence: "missing",
        };
        if (!hasAnchors(base) && src?.anchors) return { ...base, anchors: src.anchors, anchorsConfidence: "high", points: base.points || src.points };
        return base;
      });
      // If the model returned fewer criteria than the rubric section, add the missing ones.
      for (let i = merged.length; i < parsed.criteria.length; i++) {
        const src = parsed.criteria[i];
        merged.push({ id: newCritId(i), name: src.name, points: src.points, weight: 0, levels: 4, anchors: src.anchors, anchorsConfidence: src.anchors ? "high" : "missing" });
      }
      d.rubric = merged;
      repairs.push(`rubric criteria and level descriptions taken from the assignment's rubric section (${merged.length} criteria)`);
    } else if (!d.rubric?.length) {
      unresolved.push("no rubric criteria could be found in the extraction or the text");
    } else {
      const missing = d.rubric.filter((c) => !hasAnchors(c)).length;
      if (missing) unresolved.push(`${missing} criteria have no level descriptions`);
    }
  }
  const before = d.rubric.map((c) => c.weight).join(",");
  d.rubric = normaliseWeights(d.rubric.map((c) => ({ ...c, levels: 4 as const, id: c.id || newCritId(0) })));
  if (d.rubric.map((c) => c.weight).join(",") !== before) repairs.push("rubric weights renormalised to sum to 1");

  // Construct -----------------------------------------------------------------
  if (!d.construct || d.construct.trim().length < 20) {
    const l = getLocal();
    if (l?.construct) {
      d.construct = l.construct;
      repairs.push("construct taken from the assignment's deliverable statement");
    } else if (sample?.challenge.deliverable) {
      d.construct = sample.challenge.deliverable;
      repairs.push("construct taken from the employer brief");
    } else unresolved.push("construct statement is missing");
  }

  // Construct dimensions 2–5 ----------------------------------------------------
  const dims = (d.constructDimensions ?? []).filter((x) => typeof x === "string" && x.trim());
  if (dims.length < 2 || dims.length > 5) {
    d.constructDimensions = d.rubric.slice(0, 5).map((c) => c.name);
    repairs.push("construct dimensions set to the rubric criteria");
  }

  // Canonical solution ≥ 200 chars ----------------------------------------------
  if (!d.canonicalSolution || d.canonicalSolution.trim().length < 200) {
    if (solution?.text && solution.text.trim().length >= 200) {
      d.canonicalSolution = solution.text.trim();
      d.canonicalSolutionSource = "found";
      repairs.push("canonical solution taken from the model-answer file");
    } else unresolved.push("canonical solution is missing or too short");
  }

  // Six standard surface dimensions ---------------------------------------------
  const have = new Map((d.surfaceDimensions ?? []).map((x) => [x.key, x]));
  const l = getLocal();
  const out: SurfaceDimension[] = [];
  let added = 0;
  for (const std of STANDARD_DIMS) {
    const cur = have.get(std.key);
    if (cur) {
      out.push({ ...cur, locked: std.locked, enabled: std.locked ? false : cur.enabled ?? true, values: std.locked ? [] : cur.values ?? [] });
      continue;
    }
    const fromLocal = l?.surfaceDimensions.find((x) => x.key === std.key);
    out.push(
      fromLocal ?? {
        key: std.key,
        label: std.label,
        values: std.key === "jargon" ? ["plain", "professional", "technical"] : [],
        locked: std.locked,
        enabled: !std.locked,
        note: std.note,
      },
    );
    added++;
  }
  // Keep any extra custom dimensions the model proposed.
  for (const [k, v] of have) if (!STANDARD_DIMS.some((s) => s.key === k)) out.push(v);
  d.surfaceDimensions = out;
  if (added) repairs.push(`${added} standard surface dimension${added === 1 ? "" : "s"} added`);
  const empty = out.filter((x) => !x.locked && x.values.length === 0).map((x) => x.label);
  if (empty.length) unresolved.push(`surface dimensions with no values: ${empty.join(", ")}`);

  // Task prompt --------------------------------------------------------------------
  if (!d.taskPrompt || d.taskPrompt.trim().length < 50) {
    if (md) {
      d.taskPrompt = md.split(/^##\s+Rubric\s*$/m)[0].trim();
      repairs.push("task prompt taken from the assignment text");
    }
  }

  // Controlled quantities: the model's list, completed from the deterministic parser ------
  {
    const merged = mergeQuantities(d.quantities, d.taskPrompt ?? "");
    d.quantities = merged.quantities;
    if (merged.repair) repairs.push(merged.repair);
    if (d.varyQuantities === undefined) d.varyQuantities = merged.quantities.some((q) => q.policy === "vary");
  }

  if (!d.source) d.source = { files: files.map(({ text: _t, ...rest }) => rest), extractedAt: new Date().toISOString(), extractionConfidence: "medium" };
  if (repairs.length && d.source.extractionConfidence === "high") d.source.extractionConfidence = "medium";
  if (d.fewShotAnchors === undefined) d.fewShotAnchors = null;
  if (d.lastUsed === undefined) d.lastUsed = null;

  return { draft: d, repairs, unresolved };
}

const MAX_QUANTITIES = 30;

/** The parser's default span for a value the model named without a range: ±25%, kind-aware bounds. */
export function fallbackRange(q: Pick<Quantity, "value" | "kind" | "unit">): QuantityRange {
  const v = q.value;
  const decimalsOfValue = (String(v).split(".")[1] ?? "").length;
  let min = Math.min(v * 0.75, v * 1.25);
  let max = Math.max(v * 0.75, v * 1.25);
  let decimals = decimalsOfValue;
  let step: number | undefined;
  if (q.kind === "rate" || q.kind === "score" || q.kind === "threshold") {
    if (q.unit === "%" || v > 1) {
      min = Math.max(0, min);
      max = Math.min(100, max);
      step = decimals > 0 ? 10 ** -decimals : 1;
    } else {
      min = Math.max(0, min);
      max = Math.min(1, max);
      decimals = Math.max(decimals, 2);
      step = 10 ** -decimals;
    }
  } else if (q.kind === "count") {
    min = Math.max(0, Math.floor(min));
    max = Math.max(min + 1, Math.ceil(max));
    step = 1;
    decimals = 0;
  } else if (q.kind === "money") {
    step = Math.abs(v) >= 10_000 ? 100 : Math.abs(v) >= 100 ? 10 : 1;
    min = Math.max(0, Math.floor(min / step) * step);
    max = Math.ceil(max / step) * step;
    decimals = 0;
  } else {
    step = decimals > 0 ? 10 ** -decimals : 1;
  }
  if (max <= min) max = min + (step ?? 1);
  const r = (n: number) => Math.round(n * 10 ** decimals) / 10 ** decimals;
  return { min: r(min), max: r(max), step, decimals };
}

const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/^(\d)/, "q$1") || "value";

/**
 * Merge the model's quantities with the deterministic parser's over the task
 * prompt. The model's entries lead (better labels, kinds and policies); the
 * parser supplies ranges for entries that lack one and adds any number the
 * model did not name. Derived entries whose formula refers to unknown keys
 * fall back to "vary". Keys stay unique; ids are reassigned in order.
 */
export function mergeQuantities(fromModel: Quantity[] | undefined, taskPrompt: string): { quantities: Quantity[]; repair: string | null } {
  const parsed = taskPrompt.trim() ? parseQuantities(taskPrompt) : [];
  const model = (fromModel ?? []).filter((q) => q && Number.isFinite(q.value));
  const out: Quantity[] = [];
  const keys = new Set<string>();
  const uniqueKey = (want: string) => {
    const base = slug(want);
    let k = base;
    for (let n = 2; keys.has(k); n++) k = `${base}_${n}`;
    keys.add(k);
    return k;
  };
  const sameValue = (a: number, b: number) => Math.abs(a - b) <= Math.max(1e-9, Math.abs(a) * 1e-9);
  const usedParsed = new Set<number>();
  const matchParsed = (q: Quantity) => {
    const i = parsed.findIndex((p, idx) => !usedParsed.has(idx) && sameValue(p.value, q.value) && (!q.unit || !p.unit || p.unit === q.unit));
    if (i < 0) return null;
    usedParsed.add(i);
    return parsed[i];
  };

  for (const q of model) {
    if (out.length >= MAX_QUANTITIES) break;
    const hit = matchParsed(q);
    const policy: Quantity["policy"] = q.policy === "derived" && q.formula?.trim() ? "derived" : q.policy === "keep" ? "keep" : "vary";
    const item: Quantity = {
      id: "",
      key: uniqueKey(q.key || q.label),
      label: (q.label || "").trim() || hit?.label || q.key,
      value: q.value,
      kind: q.kind ?? hit?.kind ?? "other",
      policy,
    };
    const unit = (q.unit ?? hit?.unit)?.trim();
    if (unit) item.unit = unit;
    if (policy === "derived") item.formula = q.formula!.trim();
    if (q.context?.trim()) item.context = q.context.trim();
    else if (hit?.context) item.context = hit.context;
    if (q.constraint?.trim()) item.constraint = q.constraint.trim();
    if (policy === "vary") item.range = q.range ?? hit?.range ?? fallbackRange(item);
    out.push(item);
  }

  let added = 0;
  parsed.forEach((p, idx) => {
    if (usedParsed.has(idx) || out.length >= MAX_QUANTITIES) return;
    if (out.some((q) => sameValue(q.value, p.value) && (!q.unit || !p.unit || q.unit === p.unit))) return;
    const item: Quantity = { ...p, id: "", key: uniqueKey(p.key) };
    if (item.policy === "vary" && !item.range) item.range = fallbackRange(item);
    out.push(item);
    added++;
  });

  // Derived formulas must resolve to other keys in the set; otherwise the number varies on its own.
  let demoted = 0;
  for (const q of out) {
    if (q.policy !== "derived") continue;
    const ids = q.formula ? formulaIdentifiers(q.formula) : [];
    const ok = ids.length > 0 && ids.every((id) => id !== q.key && out.some((o) => o.key === id));
    if (!ok) {
      q.policy = "vary";
      delete q.formula;
      q.range = q.range ?? fallbackRange(q);
      demoted++;
    }
  }

  out.forEach((q, i) => (q.id = `q-${i + 1}`));
  const notes: string[] = [];
  if (!model.length && out.length) notes.push(`${out.length} number${out.length === 1 ? "" : "s"} in the task found by the built-in parser`);
  else if (added) notes.push(`${added} number${added === 1 ? "" : "s"} the extraction did not name added from the task text`);
  if (demoted) notes.push(`${demoted} derived number${demoted === 1 ? "" : "s"} set to vary because the formula referred to unknown keys`);
  return { quantities: out, repair: notes.length ? notes.join("; ") : null };
}
