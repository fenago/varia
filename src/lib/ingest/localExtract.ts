/**
 * Deterministic, offline blueprint extraction for the bundled sample
 * assessments. Used only when no Claude key is present and the sample has no
 * recorded live extraction. Parses the assignment sheet's structure directly:
 * "# Title (N points)", "## What you must produce", and a "## Rubric" section
 * with "### Criterion (n points)" headings and "- k: level text" lines.
 */
import type { BlueprintDraft, Criterion, SampleAssessment, SourceFile, SurfaceDimension } from "@shared/types";

function section(md: string, heading: string): string {
  const re = new RegExp(`^##\\s+${heading}\\s*$([\\s\\S]*?)(?=^##\\s|(?![\\s\\S]))`, "mi");
  const m = re.exec(md);
  return m ? m[1].trim() : "";
}

function firstSentence(text: string): string {
  const t = text.replace(/\s+/g, " ").trim();
  const m = /^(.*?[.!?])(\s|$)/.exec(t);
  return (m ? m[1] : t).trim();
}

function sentences(text: string, n: number): string[] {
  const t = text.replace(/\s+/g, " ").trim();
  const out: string[] = [];
  const re = /[^.!?]+[.!?]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(t)) && out.length < n) out.push(m[0].trim());
  return out;
}

function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

export interface ParsedRubric {
  criteria: { name: string; points: number; anchors: [string, string, string, string] | null }[];
}

/** Parse the "## Rubric" section of an assignment sheet. */
export function parseRubric(md: string): ParsedRubric {
  const body = section(md, "Rubric");
  const criteria: ParsedRubric["criteria"] = [];
  const blocks = body.split(/^###\s+/m).slice(1);
  for (const block of blocks) {
    const [head, ...rest] = block.split("\n");
    const hm = /^(.*?)\s*\((\d+)\s*points?\)\s*$/i.exec(head.trim());
    if (!hm) continue;
    const name = hm[1].trim();
    const points = Number(hm[2]);
    const levels: string[] = ["", "", "", ""];
    let found = 0;
    for (const line of rest) {
      const lm = /^\s*[-*]\s*([0-3])\s*[:—-]\s*(.+)$/.exec(line);
      if (lm) {
        levels[Number(lm[1])] = lm[2].trim();
        found++;
      }
    }
    criteria.push({ name, points, anchors: found === 4 ? (levels as [string, string, string, string]) : null });
  }
  return { criteria };
}

export function findSource(files: SourceFile[], kind: SourceFile["kind"] | SourceFile["kind"][]): SourceFile | undefined {
  const kinds = Array.isArray(kind) ? kind : [kind];
  return files.find((f) => kinds.includes(f.kind) && f.text);
}

/**
 * Build a BlueprintDraft from parsed sample files without any model call.
 * Requires the assignment (task+rubric or task) and the model answer (solution).
 */
export function localExtract(files: SourceFile[], sample: SampleAssessment): BlueprintDraft {
  const assignment = findSource(files, ["task+rubric", "rubric", "task"]);
  const solution = findSource(files, "solution");
  const md = assignment?.text ?? "";
  if (!md) throw new Error("Local extraction needs the assignment sheet text.");

  const titleLine = (md.match(/^#\s+(.+)$/m)?.[1] ?? sample.title).trim();
  const name = titleLine.replace(/\s*\(\d+\s*points?\)\s*$/i, "").replace(/^Assignment\s+\d+\s*[—-]\s*/i, "");
  const produce = section(md, "What you must produce");
  const context = section(md, "Context");
  const construct = firstSentence(produce) || sample.challenge.deliverable;

  const rubric = parseRubric(md);
  const totalPoints = rubric.criteria.reduce((a, c) => a + c.points, 0) || 1;
  const criteria: Criterion[] = rubric.criteria.map((c, i) => ({
    id: `crit-${sample.id}-${i + 1}`,
    name: c.name,
    points: c.points,
    weight: Math.round((c.points / totalPoints) * 1000) / 1000,
    levels: 4,
    anchors: c.anchors,
    anchorsConfidence: c.anchors ? "high" : "missing",
    skillKeys: sample.skills.filter((_, k) => k % Math.max(1, rubric.criteria.length) === i % Math.max(1, sample.skills.length)).map((s) => s.key),
  }));
  // Distribute skills evenly across criteria (each criterion gets at least one when possible).
  if (criteria.length && sample.skills.length) {
    criteria.forEach((c, i) => {
      const own = sample.skills.filter((_, k) => k % criteria.length === i).map((s) => s.key);
      c.skillKeys = own.length ? own : [sample.skills[i % sample.skills.length].key];
    });
  }

  const scenario = sentences(context, 3);
  const surfaceDimensions: SurfaceDimension[] = [
    { key: "domain", label: "Industry domain", values: uniq([sample.industry.toLowerCase(), ...NEIGHBOUR_DOMAINS[sample.industry.toLowerCase()] ?? []]), locked: false, enabled: true, note: "from the employer brief" },
    { key: "stakeholder", label: "Stakeholder role", values: uniq([sample.challenge.stakeholderRole.toLowerCase(), ...NEIGHBOUR_ROLES[sample.industry.toLowerCase()] ?? []]), locked: false, enabled: true, note: "from the employer brief" },
    { key: "scenario", label: "Organisation and scenario", values: scenario.length ? scenario : [sample.summary], locked: false, enabled: true, note: `${scenario.length || 1} drafted from the assignment` },
    { key: "jargon", label: "Jargon register", values: ["plain", "professional", "technical"], locked: false, enabled: true, note: "3 bands" },
    { key: "readingLevel", label: "Reading level", values: [], locked: true, enabled: false, note: "held constant" },
    { key: "stepCount", label: "Number of findings required", values: [], locked: true, enabled: false, note: "held constant" },
  ];

  const taskPrompt = md.split(/^##\s+Rubric\s*$/m)[0].trim();

  return {
    code: sample.course.code,
    name,
    construct,
    constructDimensions: criteria.map((c) => c.name),
    rubric: criteria,
    canonicalSolution: solution?.text ?? "",
    canonicalSolutionSource: solution?.text ? "found" : "drafted",
    surfaceDimensions,
    taskPrompt,
    source: {
      files: files.map(({ text: _t, ...rest }) => rest),
      extractedAt: new Date().toISOString(),
      extractionConfidence: "medium",
    },
    fewShotAnchors: null,
    lastUsed: null,
  };
}

function uniq(xs: string[]): string[] {
  return [...new Set(xs.filter(Boolean))];
}

const NEIGHBOUR_DOMAINS: Record<string, string[]> = {
  lending: ["insurance", "credit unions", "fintech", "mortgage servicing"],
  healthcare: ["hospital networks", "outpatient clinics", "home health", "health insurers"],
  retail: ["grocery", "meal-kit subscriptions", "e-commerce", "specialty retail"],
  logistics: ["last-mile delivery", "freight", "warehousing", "courier networks"],
  hospitality: ["hotels", "resorts", "vacation rentals", "airlines"],
  "real estate": ["property management", "homeowner associations", "commercial leasing", "vacation rentals"],
};

const NEIGHBOUR_ROLES: Record<string, string[]> = {
  lending: ["chief risk officer", "compliance officer", "head of underwriting", "model risk committee chair"],
  healthcare: ["chief nursing officer", "chief medical officer", "clinical informatics lead", "quality director"],
  retail: ["growth director", "head of retention", "chief operating officer", "store operations lead"],
  logistics: ["vp network operations", "route manager", "vendor relations lead", "head of data engineering"],
  hospitality: ["vp guest experience", "revenue manager", "contact centre director", "general manager", "marketing manager"],
  "real estate": ["chief operating officer", "controller", "community manager", "director of resident services"],
};
