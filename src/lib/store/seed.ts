/**
 * Demo workspace reproducing the mockup's numbers exactly: 34 students, one
 * completed run on the Model card audit blueprint (J 0.87, σ Flesch 8.9,
 * outliers v-12 / v-19 / v-27), a roster with 27 submitted / 11 graded / 1
 * appeal, the institution console (63 sets in use, 54 cleared, 7 over
 * threshold, 2 awaiting sign-off) and the audit trail.
 */

import type {
  Appeal,
  AuditEvent,
  Blueprint,
  BlueprintDraft,
  Course,
  Criterion,
  EmployerPartner,
  EmployerValidation,
  EvidenceRecord,
  Grade,
  InstitutionSet,
  IntegrityReport,
  JudgeSample,
  LevelScore,
  Property,
  Roster,
  Run,
  Student,
  Submission,
  SurfaceDimension,
  ThresholdSet,
  Variant,
  VariantMetrics,
  Workspace,
} from "@shared/types";
import { DEFAULT_THRESHOLDS, JOINT_WEIGHTS, PROPERTY_LABELS, SIGMA_CEILING } from "@shared/thresholds";
import { variantId } from "./ids";
import { evidenceCanonical, hashEvidence } from "./employer";
import {
  SEED_SCENARIOS,
  SEED_SUBMISSION_V07,
  seedAdaptedSolution,
  seedSubmissionText,
  seedSurfaceAssignment,
  seedVariantText,
  type SeedScenario,
} from "./seedVariants";

export const DEMO_COURSE_ID = "dat4100";
export const DEMO_BLUEPRINT_ID = "bp-b1-model-card-audit";
export const DEMO_RUN_ID = "run-demo-b1";
export const DEMO_DUE_LABEL = "due Fri 11 Sep, 23:59";
export const DEMO_INSTRUCTOR = "Dr. E. Lee";
export const DEMO_INSTRUCTOR_SHORT = "E. Lee";

/** Who set which threshold, as the console shows it. */
export const THRESHOLD_ATTRIBUTION: Record<Property, string> = {
  p1: "Provost, Aug 2026",
  p2: "Provost, Aug 2026",
  p3: "Assessment office",
  p4: "Assessment office",
};

export const CONSTRUCT_DIMENSIONS = [
  "Fairness gap identification",
  "Robustness reasoning under subgroup shift",
  "Documentation critique",
  "Evidence-grounded prioritisation",
];

// ---------------------------------------------------------------------------
// Course and roster
// ---------------------------------------------------------------------------

export function buildDemoCourse(): Course {
  return {
    id: DEMO_COURSE_ID,
    code: "DAT 4100",
    term: "Fall 2026",
    title: "Applied AI and Data Analytics",
    instructor: { name: DEMO_INSTRUCTOR, institution: "Miami Dade College", role: "Instructor" },
  };
}

/** The eight students named in the mockup, mapped to their versions. */
export const NAMED_STUDENTS: [string, string][] = [
  ["Alvarez, R.", "v-04"],
  ["Bhatt, N.", "v-07"],
  ["Chen, W.", "v-11"],
  ["Duarte, S.", "v-12"],
  ["Ferreira, M.", "v-15"],
  ["Gordon, T.", "v-19"],
  ["Hassan, L.", "v-22"],
  ["Ivanov, D.", "v-27"],
];

/** Twenty-six more, all sorting after "Ivanov" so the mockup's first eight rows hold. */
const OTHER_NAMES = [
  "Jackson, A.", "Johnson, K.", "Kim, S.", "Kowalski, P.", "Lindqvist, E.", "Lopez, J.",
  "Martinez, C.", "Mensah, K.", "Nakamura, Y.", "Nguyen, T.", "Okonkwo, C.", "Osei, A.",
  "Park, J.", "Patel, R.", "Quinn, M.", "Ramos, L.", "Rodriguez, D.", "Silva, B.",
  "Singh, P.", "Torres, V.", "Uddin, F.", "Vasquez, E.", "Williams, J.", "Xu, L.",
  "Yamamoto, H.", "Zhang, W.",
].sort((a, b) => a.localeCompare(b));

function studentIdFor(name: string): string {
  return "s-" + name.toLowerCase().replace(/[^a-z]+/g, "-").replace(/(^-|-$)/g, "");
}

/** variantId → student, for all 34. */
export function demoVariantStudentMap(): Map<string, Student> {
  const map = new Map<string, Student>();
  for (const [name, vid] of NAMED_STUDENTS) map.set(vid, { id: studentIdFor(name), name });
  let k = 0;
  for (let i = 0; i < 34; i++) {
    const vid = variantId(i);
    if (map.has(vid)) continue;
    const name = OTHER_NAMES[k++];
    map.set(vid, { id: studentIdFor(name), name });
  }
  return map;
}

export function buildDemoRoster(): Roster {
  const map = demoVariantStudentMap();
  const students = [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
  return { courseId: DEMO_COURSE_ID, students, source: "roster.csv" };
}

// ---------------------------------------------------------------------------
// Blueprints
// ---------------------------------------------------------------------------

const TASK_PROMPT_B1 = `Assignment 3 — Model Card Audit (12 points)

You are auditing a deployed classifier on behalf of a stakeholder. Using the partial model card provided, produce a structured audit that identifies fairness gaps, robustness gaps, and documentation gaps. Justify every finding against evidence in the card and prioritise your recommendations.

Rubric — Fairness gaps with evidence (3) · Robustness under subgroup shift (3) · Documentation completeness (3) · Prioritisation quality (3)`;

const CANONICAL_B1 = `Finding 1 — Fairness. The card reports aggregate accuracy of 0.91 but omits per-subgroup breakdowns. Absent subgroup false-positive and false-negative rates, the deployment claim of "no disparate impact" is unsupported: an aggregate figure can conceal a classifier that is accurate for the majority group and systematically wrong for a minority one. The evidence for this finding is what the card does not contain. It lists the evaluation set size and the headline metric, but no stratification by any protected or operationally relevant attribute, and no calibration analysis by group. The underwriting complaint therefore cannot be assessed or dismissed from the card alone.

Finding 2 — Robustness. The evaluation set is drawn from the same window as the training data, so the reported figures cannot speak to temporal shift. Loan applicant populations move with interest rates, employment conditions and product changes; a classifier validated only in-sample will look better than it performs. The card also reports no stress test under subgroup shift, no analysis of feature drift, and no statement of the monitoring in place after deployment. Robustness is asserted by the absence of counter-evidence rather than demonstrated.

Finding 3 — Documentation. Intended use is stated, but out-of-scope uses are not. The card names the decision the model supports and the team that owns it, yet it does not say what the model must not be used for, who can override a score, how often overrides occur, or what threshold turns a score into a decision. The training data description is a single sentence with no date range and no exclusion criteria. Without these elements the card cannot support an external review or an internal appeal.

Finding 4 — Prioritisation. The subgroup fairness gap comes first: it is the finding the complaint names, it is the one with a regulatory exposure, and it is the cheapest to close because the data needed already exists in the evaluation set. Second, commission an out-of-time validation on the most recent quarter of applications, stratified by the same subgroups, so that robustness is measured rather than assumed. Third, complete the card with an explicit out-of-scope statement, the decision threshold, and the override policy before the next model review. Each recommendation names an owner and a date; the audit is not complete until the card is.`;

function crit(id: string, name: string, weight: number, anchors: Criterion["anchors"], conf: Criterion["anchorsConfidence"]): Criterion {
  return { id, name, points: 3, weight, levels: 4, anchors, anchorsConfidence: conf };
}

const ANCHORS_FAIRNESS: [string, string, string, string] = [
  "No fairness gap identified, or claims made without reference to the card.",
  "A fairness gap is named but the evidence cited from the card is vague or incorrect.",
  "Fairness gaps are named and tied to specific omissions or figures in the card.",
  "Fairness gaps are named, tied to specific evidence, and the consequence for the stakeholder's decision is stated.",
];
const ANCHORS_ROBUSTNESS: [string, string, string, string] = [
  "No robustness analysis, or robustness treated as equivalent to headline accuracy.",
  "Robustness concerns raised in general terms without reference to the validation design in the card.",
  "Validation design weaknesses (in-sample, single period, single subgroup) are identified from the card.",
  "Validation weaknesses are identified and the specific shift that would expose them is described.",
];
const ANCHORS_DOCUMENTATION: [string, string, string, string] = [
  "Documentation not assessed.",
  "Missing sections are listed without explaining why they matter.",
  "Missing sections are listed with their consequence for use, override or review.",
  "Missing sections are listed with consequences, and a concrete completion plan is proposed.",
];
const ANCHORS_PRIORITISATION_DRAFT: [string, string, string, string] = [
  "Recommendations absent or unordered.",
  "Recommendations ordered without stated reasons.",
  "Recommendations ordered with reasons tied to risk or cost.",
  "Recommendations ordered with reasons, owners and a sequence that closes the highest-risk gap first.",
];

export function buildDemoSurfaceDimensions(): SurfaceDimension[] {
  return [
    { key: "domain", label: "Industry domain", values: ["healthcare", "lending", "hiring", "logistics"], locked: false, enabled: true, note: "4 found" },
    { key: "stakeholder", label: "Stakeholder role", values: ["risk officer", "HR director", "clinical lead", "ops manager", "compliance officer", "legal counsel"], locked: false, enabled: true, note: "6 found" },
    { key: "scenario", label: "Organisation and scenario", values: SEED_SCENARIOS.slice(0, 12).map((s) => `${s.org} · ${s.classifier}`), locked: false, enabled: true, note: "12 drafted" },
    { key: "trigger", label: "Complaint trigger", values: ["customer complaint", "internal escalation", "regulator request", "union representation", "partner letter"], locked: false, enabled: true, note: "5 drafted" },
    { key: "jargon", label: "Jargon register", values: ["plain", "professional", "technical"], locked: false, enabled: true, note: "3 bands" },
    { key: "readingLevel", label: "Reading level", values: [], locked: true, enabled: false, note: "held constant" },
    { key: "stepCount", label: "Number of findings required", values: [], locked: true, enabled: false, note: "held constant" },
  ];
}

export function buildDemoBlueprintB1(): Blueprint {
  const now = "2026-09-01T09:12:00-04:00";
  return {
    id: DEMO_BLUEPRINT_ID,
    code: "B1",
    name: "Model card audit — deployed classifier",
    courseId: DEMO_COURSE_ID,
    construct:
      "Given a deployed classifier scenario and a partial model card, produce a structured audit that identifies fairness gaps, robustness gaps, and documentation gaps, and justifies each finding against evidence in the card.",
    constructDimensions: CONSTRUCT_DIMENSIONS,
    rubric: [
      crit("c-fairness", "Identifies fairness gaps with evidence", 0.3, ANCHORS_FAIRNESS, "high"),
      crit("c-robustness", "Robustness analysis under subgroup shift", 0.25, ANCHORS_ROBUSTNESS, "high"),
      crit("c-documentation", "Documentation completeness judgement", 0.25, ANCHORS_DOCUMENTATION, "high"),
      crit("c-prioritisation", "Prioritisation and recommendation quality", 0.2, ANCHORS_PRIORITISATION_DRAFT, "draft"),
    ],
    canonicalSolution: CANONICAL_B1,
    canonicalSolutionSource: "found",
    surfaceDimensions: buildDemoSurfaceDimensions(),
    taskPrompt: TASK_PROMPT_B1,
    source: {
      files: [
        { name: "DAT4100_Assignment3.docx", kind: "task+rubric", recognisedAs: "Task prompt + rubric", sizeBytes: 34 * 1024, status: "read" },
        { name: "instructor_model_answer.docx", kind: "solution", recognisedAs: "Canonical solution", sizeBytes: 21 * 1024, status: "read" },
        { name: "roster.csv", kind: "roster", recognisedAs: "34 enrolled students", sizeBytes: 2 * 1024, status: "read" },
      ],
      extractedAt: now,
      extractionConfidence: "high",
      readSeconds: 11,
    },
    fewShotAnchors: null,
    createdAt: now,
    updatedAt: now,
    lastUsed: null,
  };
}

/** The Import page's draft: same blueprint, but the fourth criterion has no anchors yet. */
export function buildDemoDraft(): BlueprintDraft {
  const bp = buildDemoBlueprintB1();
  const { id: _id, courseId: _c, createdAt: _a, updatedAt: _u, ...rest } = bp;
  return {
    ...rest,
    rubric: rest.rubric.map((c) =>
      c.id === "c-prioritisation" ? { ...c, anchors: null, anchorsConfidence: "missing" } : c,
    ),
  };
}

function buildDemoBlueprintB2(): Blueprint {
  const now = "2026-01-14T10:00:00-05:00";
  return {
    id: "bp-b2-stakeholder-memo",
    code: "B2",
    name: "Stakeholder memo",
    courseId: DEMO_COURSE_ID,
    construct:
      "Given a technical finding about a deployed model, write a one-page memo for a non-technical executive that preserves the decision-relevant content and states a recommendation.",
    constructDimensions: ["Translation of technical finding", "Preservation of decision-relevant content", "Recommendation clarity", "Audience fit"],
    rubric: [
      crit("c2-translation", "Translates the finding without distortion", 0.3, ["Finding misstated.", "Finding stated with technical terms unexplained.", "Finding stated plainly and accurately.", "Finding stated plainly, accurately, with its uncertainty."], "high"),
      crit("c2-content", "Preserves decision-relevant content", 0.3, ["Key numbers missing.", "Some numbers present, consequences unclear.", "Numbers and consequences present.", "Numbers, consequences and trade-offs present."], "high"),
      crit("c2-recommendation", "States a clear recommendation", 0.2, ["No recommendation.", "Recommendation vague.", "Recommendation specific.", "Recommendation specific with owner and timing."], "high"),
      crit("c2-audience", "Fits the executive audience", 0.2, ["Reads as a technical report.", "Partly adapted.", "Executive-ready length and tone.", "Executive-ready, with a one-line summary up front."], "high"),
    ],
    canonicalSolution:
      "To: Chief Operating Officer. Subject: Confusion-matrix imbalance in the returns classifier. Summary: the model catches 91% of fraudulent returns overall, but among first-time customers it misses one in three. Why it matters: first-time customers are 40% of returns volume this quarter, so the aggregate figure overstates protection where exposure is growing. Recommendation: hold the current threshold for repeat customers, lower it for first-time customers for one quarter, and re-measure by segment. Owner: risk analytics; decision needed by the 15th.",
    canonicalSolutionSource: "found",
    surfaceDimensions: buildDemoSurfaceDimensions().map((d) => (d.key === "scenario" ? { ...d, values: ["retail returns", "insurance claims", "telecom churn", "hospital readmission"], note: "4 drafted" } : d)),
    taskPrompt:
      "Assignment 5 — Stakeholder memo (12 points). A technical finding about a deployed model is provided (a confusion-matrix imbalance under subgroup shift). Write a one-page memo to a named non-technical executive that preserves the decision-relevant content and recommends an action.",
    source: { files: [{ name: "DAT4100_Assignment5.docx", kind: "task+rubric", recognisedAs: "Task prompt + rubric", sizeBytes: 28 * 1024, status: "read" }], extractedAt: now, extractionConfidence: "high", readSeconds: 8 },
    fewShotAnchors: null,
    createdAt: now,
    updatedAt: now,
    lastUsed: { term: "Spring 2026", joint: 0.88 },
  };
}

function buildDemoBlueprintB3(): Blueprint {
  const now = "2026-02-20T10:00:00-05:00";
  return {
    id: "bp-b3-ethical-risk",
    code: "B3",
    name: "Ethical risk decomposition",
    courseId: DEMO_COURSE_ID,
    construct:
      "Given a deployment vignette, decompose the ethical risk along stakeholder, harm-type and severity axes and justify the severity ratings.",
    constructDimensions: ["Stakeholder enumeration", "Harm-type classification", "Severity justification", "Mitigation mapping"],
    rubric: [
      crit("c3-stakeholders", "Enumerates affected stakeholders", 0.25, ["Stakeholders missing.", "Obvious stakeholders only.", "Direct and indirect stakeholders.", "Direct, indirect and institutional stakeholders with their exposure."], "high"),
      crit("c3-harms", "Classifies harm types", 0.25, ["No classification.", "Harms listed without type.", "Harms typed (allocative, representational, procedural).", "Harms typed and linked to stakeholders."], "high"),
      crit("c3-severity", "Justifies severity ratings", 0.25, ["No ratings.", "Ratings without reasons.", "Ratings with reasons.", "Ratings with reasons, likelihood and reversibility."], "high"),
      crit("c3-mitigation", "Maps mitigations to risks", 0.25, ["No mitigations.", "Generic mitigations.", "Mitigations matched to risks.", "Mitigations matched, sequenced and owned."], "high"),
    ],
    canonicalSolution:
      "Stakeholders: applicants (direct), case workers (direct), the agency (institutional), the public (indirect). Harm types: allocative harm to applicants wrongly denied; procedural harm from an unexplained score; representational harm if the model encodes neighbourhood stereotypes. Severity: allocative harm high, low reversibility, moderate likelihood given the validation gaps; procedural harm high likelihood, moderate severity, reversible with an appeal path. Mitigations: subgroup audit before further rollout; human review for all denials; plain-language score explanation; quarterly re-validation.",
    canonicalSolutionSource: "found",
    surfaceDimensions: buildDemoSurfaceDimensions().map((d) => (d.key === "scenario" ? { ...d, values: ["benefits eligibility", "tenant screening", "school placement", "parole risk"], note: "4 drafted" } : d)),
    taskPrompt:
      "Assignment 6 — Ethical risk analysis (12 points). Read the deployment vignette. Decompose the ethical risk along stakeholder, harm-type and severity axes, justify each severity rating, and map a mitigation to each risk.",
    source: { files: [{ name: "DAT4100_Assignment6.docx", kind: "task+rubric", recognisedAs: "Task prompt + rubric", sizeBytes: 26 * 1024, status: "read" }], extractedAt: now, extractionConfidence: "high", readSeconds: 9 },
    fewShotAnchors: null,
    createdAt: now,
    updatedAt: now,
    lastUsed: { term: "Spring 2026", joint: 0.84 },
  };
}

// ---------------------------------------------------------------------------
// Variant metrics tuned to the mockup
// ---------------------------------------------------------------------------

const FIXED_EASE: Record<number, number> = {
  3: 52.1, 6: 49.8, 10: 51.4, 11: 38.6, 14: 53.0, 18: 36.9, 21: 50.2, 26: 37.4,
};
export const DEMO_OUTLIERS = ["v-12", "v-19", "v-27"];

/**
 * Thirty-four reading-ease values: the eight from the mockup are fixed; the
 * other twenty-six are a skewed pattern (six easy-reading versions, twenty in
 * the mid-forties) scaled so the population σ is exactly 8.9 and the mean 50.
 */
export function demoReadingEase(): number[] {
  const TARGET_MEAN = 52.8;
  const TARGET_SIGMA = 8.9;
  const fixedIdx = Object.keys(FIXED_EASE).map(Number);
  const otherIdx: number[] = [];
  for (let i = 0; i < 34; i++) if (!(i in FIXED_EASE)) otherIdx.push(i);
  const m = otherIdx.length; // 26
  // pattern: six highs, twenty lows, small deterministic jitter
  const pattern = otherIdx.map((_, k) => {
    const high = k % 4 === 2 && k < 24 ? 1 : 0;
    const jitter = (((k * 7) % 5) - 2) * 0.05; // −0.10 … +0.10
    return high + jitter;
  });
  const pbar = pattern.reduce((a, b) => a + b, 0) / m;
  const d = pattern.map((p) => p - pbar);
  const Sd = d.reduce((a, x) => a + x * x, 0);
  const sumFixed = fixedIdx.reduce((a, i) => a + FIXED_EASE[i], 0);
  const sumFixedSq = fixedIdx.reduce((a, i) => a + FIXED_EASE[i] ** 2, 0);
  const c = (34 * TARGET_MEAN - sumFixed) / m;
  const a2 = (34 * (TARGET_SIGMA ** 2 + TARGET_MEAN ** 2) - sumFixedSq - m * c * c) / Sd;
  const a = Math.sqrt(Math.max(a2, 0));
  const out = new Array<number>(34);
  for (const i of fixedIdx) out[i] = FIXED_EASE[i];
  otherIdx.forEach((i, k) => {
    out[i] = Math.round((c + a * d[k]) * 10) / 10;
  });
  return out;
}

/** Which variants carry a "4" on which construct dimension, so the mean equivalence lands at 0.960. */
const FOUR_PLAN: Record<number, number[]> = (() => {
  const plan: Record<number, number[]> = {};
  // outliers: two dims each
  plan[11] = [1, 3];
  plan[18] = [0, 3];
  plan[26] = [1, 2];
  // sixteen others: one dim each
  const singles = [0, 1, 2, 4, 5, 7, 8, 9, 12, 13, 15, 16, 17, 19, 20, 22];
  singles.forEach((i, k) => {
    plan[i] = [k % 4];
  });
  return plan;
})();

export function demoJudgeSamples(index: number, dims: string[] = CONSTRUCT_DIMENSIONS): JudgeSample[] {
  const fours = new Set(FOUR_PLAN[index] ?? []);
  const five = [
    [5, 5, 4, 5, 5],
    [5, 4, 5, 5, 5],
    [4, 5, 5, 5, 5],
    [5, 5, 5, 4, 5],
  ];
  const four = [
    [4, 4, 5, 4, 3],
    [4, 5, 4, 3, 4],
    [3, 4, 4, 5, 4],
    [4, 4, 4, 5, 3],
  ];
  const rationales = [
    "The variant still requires an audit grounded in the card's omissions; the construct is intact.",
    "Fairness, robustness and documentation are each demanded explicitly and tied to card evidence.",
    "The scenario changes the domain but not the skill: evidence-grounded gap analysis.",
    "Prioritisation is required and addressed to a named stakeholder, as in the blueprint.",
    "Reading register shifts slightly, but every construct dimension remains load-bearing.",
  ];
  return [0, 1, 2, 3, 4].map((s) => {
    const scores: Record<string, number> = {};
    dims.forEach((dim, di) => {
      const arr = fours.has(di) ? four[(di + index) % 4] : five[(di + index) % 4];
      scores[dim] = arr[s];
    });
    return { dimensionScores: scores, rationale: rationales[(s + index) % rationales.length] };
  });
}

/** Hand-rolled median aggregation so seeding does not depend on the metrics module. */
function aggregateLocal(samples: JudgeSample[]): number {
  const dims = Object.keys(samples[0]?.dimensionScores ?? {});
  if (!dims.length) return 0;
  const meds = dims.map((d) => {
    const xs = samples.map((s) => s.dimensionScores[d]).sort((a, b) => a - b);
    const mid = Math.floor(xs.length / 2);
    return xs.length % 2 ? xs[mid] : (xs[mid - 1] + xs[mid]) / 2;
  });
  const m = meds.reduce((a, b) => a + b, 0) / meds.length;
  return Math.max(0, Math.min(1, (m - 1) / 4));
}

export function demoMetricsFor(index: number, ease: number[] = demoReadingEase()): VariantMetrics {
  const samples = demoJudgeSamples(index);
  const jitter = (((index * 3) % 5) - 2) * 0.6;
  return {
    fleschEase: ease[index],
    lexicalComplexity: Math.round((0.56 + ((index * 13) % 9) * 0.01) * 100) / 100,
    stepCount: 4,
    solutionFleschEase: Math.round((ease[index] + jitter) * 10) / 10,
    equivalence: aggregateLocal(samples),
    judgeSamples: samples,
  };
}

/** Demo metrics for a scenario index, used by the demo provider on fresh runs. */
export function demoMetricsForScenario(index: number): VariantMetrics {
  return demoMetricsFor(index % 34);
}

export function buildDemoVariants(runId: string = DEMO_RUN_ID): Variant[] {
  const ease = demoReadingEase();
  const students = demoVariantStudentMap();
  return SEED_SCENARIOS.map((s: SeedScenario) => {
    const id = variantId(s.index);
    return {
      id,
      runId,
      studentId: students.get(id)?.id ?? null,
      text: seedVariantText(s),
      adaptedSolution: seedAdaptedSolution(s),
      surfaceAssignment: seedSurfaceAssignment(s),
      metrics: demoMetricsFor(s.index, ease),
      flags: { p4Outlier: DEMO_OUTLIERS.includes(id), p2Low: false },
      status: "released",
      generation: 1,
    };
  });
}

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

function sigmaTilde(sigma: number, ceiling: number): number {
  return Math.max(0, Math.min(1, sigma / ceiling));
}

function jointOf(cosine: number, eq: number, sigR: number, sigF: number): number {
  return (
    JOINT_WEIGHTS.p1 * (1 - cosine) +
    JOINT_WEIGHTS.p2 * eq +
    JOINT_WEIGHTS.p3 * (1 - sigmaTilde(sigR, SIGMA_CEILING.rubricProxy)) +
    JOINT_WEIGHTS.p4 * (1 - sigmaTilde(sigF, SIGMA_CEILING.flesch))
  );
}

const DEMO_COSINE = 0.095;
const DEMO_NGRAM = 0.088;

/**
 * Demo-mode calibration: the seeded texts are templated, so their raw TF-IDF
 * cosine is not representative of a frontier run. Replace the surface metrics
 * with the pilot's structured-CoT numbers, keep everything else as computed.
 */
export function calibrateDemoReport(report: IntegrityReport, thresholds: ThresholdSet): IntegrityReport {
  const cosine = DEMO_COSINE;
  const ngram = DEMO_NGRAM;
  const eq = report.equivalenceMean;
  const joint = jointOf(cosine, eq, report.rubricProxySigma, report.fleschSigma);
  const p1Pass = cosine <= thresholds.p1Cosine;
  const p2Pass = eq >= thresholds.p2Equivalence;
  const checks = {
    ...report.checks,
    p1: {
      ...report.checks.p1,
      value: cosine,
      metricLabel: `cosine ${cosine.toFixed(3)}`,
      barFill: Math.max(0, Math.min(1, 1 - cosine / 0.6)),
      gate: p1Pass ? ("pass" as const) : ("fail" as const),
      note: p1Pass ? null : PROPERTY_LABELS.p1.whatYouDo,
    },
    p2: {
      ...report.checks.p2,
      value: eq,
      metricLabel: `equivalence ${eq.toFixed(3)}`,
      barFill: Math.max(0, Math.min(1, eq)),
      gate: p2Pass ? ("pass" as const) : ("fail" as const),
    },
  };
  const outliers = report.outliers.filter((id) => report.checks.p4.gate === "fail" || checks.p2.gate === "fail");
  return {
    ...report,
    cosineMean: cosine,
    ngramOverlapMean: ngram,
    joint: Math.round(joint * 1000) / 1000,
    failure: Math.round((1 - joint) * 1000) / 1000,
    checks,
    outliers,
    releasable: checks.p1.gate === "pass" && checks.p2.gate === "pass" && report.checks.p4.gate === "pass",
  };
}

function handBuiltReport(run: Run, thresholds: ThresholdSet): IntegrityReport {
  const eases = run.variants.map((v) => v.metrics.fleschEase);
  const mean = eases.reduce((a, b) => a + b, 0) / eases.length;
  const sigma = Math.sqrt(eases.reduce((a, x) => a + (x - mean) ** 2, 0) / eases.length);
  const sol = run.variants.map((v) => v.metrics.solutionFleschEase);
  const smean = sol.reduce((a, b) => a + b, 0) / sol.length;
  const ssig = Math.sqrt(sol.reduce((a, x) => a + (x - smean) ** 2, 0) / sol.length);
  const eq = run.variants.reduce((a, v) => a + (v.metrics.equivalence ?? 0), 0) / run.variants.length;
  const joint = jointOf(DEMO_COSINE, eq, ssig, sigma);
  const mk = (p: Property, metricLabel: string, value: number | null, threshold: number | null, barFill: number, barTick: number | null, gate: IntegrityReport["checks"]["p1"]["gate"], note: string | null) => ({
    property: p,
    label: PROPERTY_LABELS[p].label,
    metricLabel,
    detail: PROPERTY_LABELS[p].tooltip,
    value,
    threshold,
    barFill,
    barTick,
    gate,
    note,
  });
  const p4Fail = sigma > thresholds.p4FleschSigma;
  return {
    runId: run.id,
    computedAt: run.finishedAt ?? run.startedAt,
    thresholdsVersion: thresholds.version,
    cosineMean: DEMO_COSINE,
    ngramOverlapMean: DEMO_NGRAM,
    equivalenceMean: eq,
    rubricProxySigma: ssig,
    fleschSigma: sigma,
    fleschMean: mean,
    joint,
    failure: 1 - joint,
    checks: {
      p1: mk("p1", `cosine ${DEMO_COSINE.toFixed(3)}`, DEMO_COSINE, thresholds.p1Cosine, 1 - DEMO_COSINE / 0.6, 1 - thresholds.p1Cosine / 0.6, "pass", null),
      p2: mk("p2", `equivalence ${eq.toFixed(3)}`, eq, thresholds.p2Equivalence, eq, thresholds.p2Equivalence, eq >= thresholds.p2Equivalence ? "pass" : "fail", null),
      p3: mk("p3", "provisional proxy", ssig, null, Math.max(0, 1 - ssig / 45), null, "advisory", "Measured by proxy. Spot-check three versions against the rubric before release."),
      p4: mk("p4", `σ Flesch ${sigma.toFixed(1)}`, sigma, thresholds.p4FleschSigma, Math.max(0, 1 - sigma / 25), 1 - thresholds.p4FleschSigma / 25, p4Fail ? "fail" : "pass", p4Fail ? PROPERTY_LABELS.p4.whatYouDo : null),
    },
    outliers: p4Fail ? DEMO_OUTLIERS : [],
    releasable: !p4Fail && eq >= thresholds.p2Equivalence,
  };
}

/** Build the seeded run's report: real metrics where possible, mockup numbers on top. */
export function buildDemoReport(run: Run, thresholds: ThresholdSet, computeReport?: (run: Run, t: ThresholdSet) => IntegrityReport): IntegrityReport {
  let base: IntegrityReport;
  try {
    base = computeReport ? computeReport(run, thresholds) : handBuiltReport(run, thresholds);
  } catch {
    base = handBuiltReport(run, thresholds);
  }
  const cal = calibrateDemoReport(base, thresholds);
  const p4 = {
    ...cal.checks.p4,
    value: 8.9,
    metricLabel: "σ Flesch 8.9",
    barFill: Math.max(0, Math.min(1, 1 - 8.9 / 25)),
    gate: "fail" as const,
    note: "Three versions read three grade levels above the rest. Regenerate those three, or loosen the jargon register.",
  };
  const joint = jointOf(DEMO_COSINE, 0.96, cal.rubricProxySigma, 8.9);
  return {
    ...cal,
    fleschSigma: 8.9,
    equivalenceMean: 0.96,
    joint: Math.round(joint * 100) / 100,
    failure: Math.round((1 - joint) * 100) / 100,
    checks: {
      ...cal.checks,
      p2: { ...cal.checks.p2, value: 0.96, metricLabel: "equivalence 0.960", barFill: 0.96, gate: "pass" },
      p4,
    },
    outliers: [...DEMO_OUTLIERS],
    releasable: false,
  };
}

// ---------------------------------------------------------------------------
// Run, submissions, appeals
// ---------------------------------------------------------------------------

export function buildDemoRun(computeReport?: (run: Run, t: ThresholdSet) => IntegrityReport): Run {
  const variants = buildDemoVariants(DEMO_RUN_ID);
  const run: Run = {
    id: DEMO_RUN_ID,
    blueprintId: DEMO_BLUEPRINT_ID,
    blueprintName: "Model card audit",
    courseId: DEMO_COURSE_ID,
    strategy: "structured-cot",
    threatProfile: "high-stakes",
    generatorModel: "claude-opus-4-7",
    judgeModel: "claude-sonnet-4-6",
    judgeSamples: 5,
    n: 34,
    enabledDimensions: ["domain", "stakeholder", "scenario", "trigger", "jargon"],
    mode: "demo",
    status: "complete",
    progress: { phase: "complete", done: 34, total: 34, message: "34 versions generated, judged and scored" },
    startedAt: "2026-09-03T13:50:12-04:00",
    finishedAt: "2026-09-03T13:54:31-04:00",
    variants,
    report: null,
    release: {
      runId: DEMO_RUN_ID,
      releasedAt: "2026-09-04T07:58:00-04:00",
      by: DEMO_INSTRUCTOR,
      overThreshold: true,
      reason: "Formative; three outliers flagged for regeneration",
      failingChecks: ["p4"],
      regenerated: [],
    },
    costEstimateUsd: 0.6,
    estMinutes: 4,
  };
  run.report = buildDemoReport(run, DEFAULT_THRESHOLDS, computeReport);
  return run;
}

const GRADED: Record<string, [LevelScore, LevelScore, LevelScore, LevelScore]> = {
  "v-04": [3, 2, 3, 2], // Alvarez 10 / 12
  "v-15": [3, 3, 3, 2], // Ferreira 11 / 12
  "v-01": [2, 2, 3, 2],
  "v-02": [3, 3, 2, 3],
  "v-05": [2, 3, 2, 2],
  "v-08": [3, 2, 2, 3],
  "v-13": [3, 3, 3, 3],
  "v-16": [2, 2, 2, 1],
  "v-20": [3, 2, 3, 3],
  "v-24": [2, 3, 3, 2],
  "v-30": [3, 3, 2, 2],
};
const NOT_STARTED = ["v-27", "v-03", "v-09", "v-17", "v-23", "v-31", "v-34"];

function gradeFrom(levels: LevelScore[], rubric: Criterion[], at: string): Grade {
  const scores: Record<string, LevelScore> = {};
  rubric.forEach((c, i) => {
    scores[c.id] = levels[i] ?? 0;
  });
  const total = rubric.reduce((a, c, i) => a + Math.round(((levels[i] ?? 0) / 3) * c.points), 0);
  const maxTotal = rubric.reduce((a, c) => a + c.points, 0);
  return { scores, total, maxTotal, gradedAt: at, by: DEMO_INSTRUCTOR };
}

export function buildDemoSubmissions(run: Run, rubric: Criterion[]): Submission[] {
  return run.variants.map((v, i) => {
    const notStarted = NOT_STARTED.includes(v.id);
    const graded = GRADED[v.id];
    const scenario = SEED_SCENARIOS[i];
    const submittedAt = notStarted ? null : `2026-09-0${(i % 3) + 5}T${String(9 + (i % 11)).padStart(2, "0")}:${String((i * 7) % 60).padStart(2, "0")}:00-04:00`;
    return {
      id: `sub-${v.id}`,
      runId: run.id,
      variantId: v.id,
      studentId: v.studentId ?? "",
      text: notStarted ? null : v.id === "v-07" ? SEED_SUBMISSION_V07 : seedSubmissionText(scenario),
      submittedAt,
      grade: graded ? gradeFrom(graded, rubric, "2026-09-08T16:00:00-04:00") : null,
    };
  });
}

export function buildDemoAppeals(run: Run): Appeal[] {
  const v19 = run.variants.find((v) => v.id === "v-19");
  return [
    {
      id: "appeal-v-19",
      runId: run.id,
      variantId: "v-19",
      studentId: v19?.studentId ?? "",
      openedAt: "2026-09-04T08:20:00-04:00",
      note: "My version's reading level is materially harder than my classmates'.",
      status: "open",
    },
  ];
}

// ---------------------------------------------------------------------------
// Institution: thresholds, console rows, audit
// ---------------------------------------------------------------------------

export function buildDemoThresholds(): ThresholdSet[] {
  return [
    { version: 1, setAt: "2026-08-04T10:00:00-04:00", setBy: "Provost", p1Cosine: 0.15, p2Equivalence: 0.9, p3: "advisory", p4FleschSigma: 10.0 },
    { ...DEFAULT_THRESHOLDS },
  ];
}

interface CourseSeed {
  code: string;
  dept: string;
  instructor: string;
  assessments: string[];
}

const EXTRA_COURSES: CourseSeed[] = [
  { code: "DAT 3200", dept: "Data Analytics & AI", instructor: "S. Novak", assessments: ["Feature drift memo", "Dashboard critique", "Query audit", "Pipeline review"] },
  { code: "DAT 4200", dept: "Data Analytics & AI", instructor: "E. Lee", assessments: ["Model monitoring plan", "Bias bounty write-up", "Retraining proposal", "Fairness memo"] },
  { code: "DAT 1100", dept: "Data Analytics & AI", instructor: "R. Chaudhry", assessments: ["Data dictionary", "Chart critique", "Survey design", "Cleaning log"] },
  { code: "CIS 2110", dept: "Computer Science", instructor: "M. Okafor", assessments: ["Access-control review", "Log analysis", "Patch plan", "Vulnerability brief"] },
  { code: "CIS 4410", dept: "Computer Science", instructor: "L. Brennan", assessments: ["Architecture decision record", "Code review memo", "Incident retrospective", "Migration plan"] },
  { code: "CIS 3050", dept: "Computer Science", instructor: "L. Brennan", assessments: ["API design critique", "Dependency audit", "Test plan", "Release checklist"] },
  { code: "NUR 3310", dept: "Nursing", instructor: "J. Whitfield", assessments: ["Medication error analysis", "Handover critique", "Care pathway review", "Triage case"] },
  { code: "NUR 4120", dept: "Nursing", instructor: "A. Mendes", assessments: ["Discharge plan audit", "Quality improvement proposal", "Family communication memo", "Protocol critique"] },
  { code: "NUR 1200", dept: "Nursing", instructor: "A. Mendes", assessments: ["Vital signs interpretation", "Patient education plan", "Documentation audit"] },
  { code: "BUS 3300", dept: "Business", instructor: "P. Ramirez", assessments: ["Vendor risk brief", "Pricing memo", "Stakeholder map", "Contract review"] },
  { code: "BUS 2100", dept: "Business", instructor: "D. Ferrante", assessments: ["Market entry memo", "Budget variance analysis", "Policy brief", "Competitor analysis"] },
  { code: "BUS 4800", dept: "Business", instructor: "D. Ferrante", assessments: ["Governance case", "Compliance gap analysis", "Board memo", "Ethics audit"] },
  { code: "DAT 3900", dept: "Data Analytics & AI", instructor: "R. Chaudhry", assessments: ["Experiment design", "A/B test critique", "Metric definition", "Sampling plan"] },
  { code: "CIS 1500", dept: "Computer Science", instructor: "M. Okafor", assessments: ["Threat brief", "Password policy review", "Phishing analysis", "Backup plan critique", "Privacy impact note"] },
];

const STRATEGIES = ["structured-cot", "zero-shot", "few-shot", "dimension-preserving"] as const;

export function buildDemoInstitutionSets(): InstitutionSet[] {
  const mock: InstitutionSet[] = [
    { id: "set-dat4100-audit", course: "DAT 4100", assessment: "Model card audit", instructor: "E. Lee", department: "Data Analytics & AI", n: 34, strategy: "structured-cot", joint: 0.87, failingChecks: ["p4"], status: "over-threshold", releasedAt: "2026-09-04T07:58:00-04:00", reviewedAt: null, runId: DEMO_RUN_ID },
    { id: "set-dat4100-memo", course: "DAT 4100", assessment: "Stakeholder memo", instructor: "E. Lee", department: "Data Analytics & AI", n: 34, strategy: "zero-shot", joint: 0.88, failingChecks: [], status: "cleared", releasedAt: "2026-08-30T10:12:00-04:00", reviewedAt: "2026-08-30T10:12:00-04:00" },
    { id: "set-cis3320-threat", course: "CIS 3320", assessment: "Threat model brief", instructor: "M. Okafor", department: "Computer Science", n: 62, strategy: "dimension-preserving", joint: 0.82, failingChecks: ["p4"], status: "over-threshold", releasedAt: "2026-09-02T09:41:00-04:00", reviewedAt: null },
    { id: "set-cis3320-incident", course: "CIS 3320", assessment: "Incident write-up", instructor: "M. Okafor", department: "Computer Science", n: 62, strategy: "few-shot", joint: 0.81, failingChecks: ["p2"], status: "awaiting-sign-off", releasedAt: "2026-08-15T14:30:00-04:00", reviewedAt: null },
    { id: "set-nur2210-careplan", course: "NUR 2210", assessment: "Care-plan critique", instructor: "J. Whitfield", department: "Nursing", n: 88, strategy: "structured-cot", joint: 0.86, failingChecks: [], status: "cleared", releasedAt: "2026-08-27T11:00:00-04:00", reviewedAt: "2026-08-27T11:00:00-04:00" },
    { id: "set-bus4405-ethics", course: "BUS 4405", assessment: "Ethics risk analysis", instructor: "P. Ramirez", department: "Business", n: 45, strategy: "zero-shot", joint: 0.86, failingChecks: [], status: "cleared", releasedAt: "2026-08-29T15:20:00-04:00", reviewedAt: "2026-08-29T15:20:00-04:00" },
    { id: "set-enc1102-source", course: "ENC 1102", assessment: "Source evaluation", instructor: "A. Duarte", department: "English", n: 120, strategy: "few-shot", joint: 0.79, failingChecks: ["p2", "p1"], status: "blocked", releasedAt: "2026-09-03T14:02:00-04:00", reviewedAt: null },
    { id: "set-dat2100-cleaning", course: "DAT 2100", assessment: "Data cleaning audit", instructor: "S. Novak", department: "Data Analytics & AI", n: 51, strategy: "dimension-preserving", joint: 0.83, failingChecks: [], status: "awaiting-sign-off", releasedAt: "2026-08-18T09:05:00-04:00", reviewedAt: null },
  ];
  // 56 more in-use rows: 51 cleared + 5 over threshold, across 14 more courses.
  const extra: InstitutionSet[] = [];
  let overLeft = 5;
  let k = 0;
  for (const c of EXTRA_COURSES) {
    for (const a of c.assessments) {
      const over = overLeft > 0 && k % 9 === 4;
      if (over) overLeft -= 1;
      const strategy = STRATEGIES[k % 4];
      const joint = over ? 0.8 + (k % 3) * 0.01 : 0.84 + (k % 5) * 0.01;
      const day = 4 + (k % 24);
      const releasedAt = `2026-08-${String(day).padStart(2, "0")}T${String(8 + (k % 9)).padStart(2, "0")}:${String((k * 11) % 60).padStart(2, "0")}:00-04:00`;
      extra.push({
        id: `set-${c.code.toLowerCase().replace(/\s+/g, "")}-${k}`,
        course: c.code,
        assessment: a,
        instructor: c.instructor,
        department: c.dept,
        n: 24 + ((k * 7) % 70),
        strategy,
        joint: Math.round(joint * 100) / 100,
        failingChecks: over ? (k % 2 ? ["p4"] : ["p1"]) : [],
        status: over ? "over-threshold" : "cleared",
        releasedAt,
        reviewedAt: over ? null : releasedAt,
      });
      k += 1;
    }
  }
  // Newest first overall.
  return [...mock, ...extra].sort((a, b) => b.releasedAt.localeCompare(a.releasedAt));
}

export function buildDemoAudit(): AuditEvent[] {
  return [
    { id: "aud-ev-1", at: "2026-09-08T16:40:00-04:00", actor: DEMO_INSTRUCTOR, kind: "grade", text: "Evidence record VR-2026-0001 issued for Alvarez, R.", runId: DEMO_RUN_ID },
    { id: "aud-1", at: "2026-09-04T08:20:00-04:00", actor: "T. Gordon", kind: "appeal", text: "Student appeal opened on DAT 4100 v-19", runId: DEMO_RUN_ID },
    { id: "aud-2", at: "2026-09-03T14:02:00-04:00", actor: "system", kind: "system", text: "ENC 1102 set blocked automatically — two checks failed" },
    { id: "aud-3", at: "2026-09-02T09:41:00-04:00", actor: "M. Okafor", kind: "release", text: "CIS 3320 released over difficulty threshold. Reason: \"formative, low stakes, copy-resistance prioritised\"" },
    { id: "aud-4", at: "2026-08-28T16:15:00-04:00", actor: "Assessment office", kind: "threshold", text: "Difficulty parity threshold tightened 10.0 → 8.0" },
    { id: "aud-5", at: "2026-08-21T11:03:00-04:00", actor: "Assessment office", kind: "policy", text: "Llama 3.2 3B removed from selectable generators" },
    { id: "aud-val-1", at: "2026-08-19T15:30:00-04:00", actor: "M. Restrepo (Bayfront Regional Bank)", kind: "policy", text: "Bayfront Regional Bank validated Stakeholder memo" },
  ];
}

// ---------------------------------------------------------------------------
// Employer partners, validations, evidence records
// ---------------------------------------------------------------------------

export const DEMO_PARTNER_IDS = {
  bayfront: "partner-bayfront-regional-bank",
  coral: "partner-coral-health-network",
  northline: "partner-northline-talent-systems",
} as const;

export function buildDemoEmployerPartners(): EmployerPartner[] {
  return [
    {
      id: DEMO_PARTNER_IDS.bayfront,
      organisation: "Bayfront Regional Bank",
      sector: "Lending",
      contactName: "M. Restrepo",
      contactRole: "Chief Risk Officer",
      contactEmail: "m.restrepo@bayfrontregional.example",
      adoptedEvidenceRecords: true,
      adoptedAt: "2026-09-02T10:15:00-04:00",
      addedAt: "2026-07-22T09:00:00-04:00",
    },
    {
      id: DEMO_PARTNER_IDS.coral,
      organisation: "Coral Health Network",
      sector: "Healthcare",
      contactName: "Dr. A. Okonkwo",
      contactRole: "Clinical Informatics Lead",
      contactEmail: "a.okonkwo@coralhealth.example",
      adoptedEvidenceRecords: false,
      adoptedAt: null,
      addedAt: "2026-07-22T09:05:00-04:00",
    },
    {
      id: DEMO_PARTNER_IDS.northline,
      organisation: "Northline Talent Systems",
      sector: "Hiring",
      contactName: "J. Whitaker",
      contactRole: "HR Director",
      contactEmail: "j.whitaker@northlinetalent.example",
      adoptedEvidenceRecords: false,
      adoptedAt: null,
      addedAt: "2026-08-05T14:20:00-04:00",
    },
  ];
}

export function buildDemoEmployerValidations(): EmployerValidation[] {
  return [
    {
      id: "val-b2-bayfront",
      blueprintId: "bp-b2-stakeholder-memo",
      blueprintName: "Stakeholder memo",
      partnerId: DEMO_PARTNER_IDS.bayfront,
      organisation: "Bayfront Regional Bank",
      reviewerName: "M. Restrepo",
      reviewerRole: "Chief Risk Officer",
      reviewedAt: "2026-08-19T15:30:00-04:00",
      status: "validated",
      attested: true,
      criteriaComments: {
        "c2-recommendation": "This is the criterion we hire on. An analyst who cannot name an owner and a date has not finished the memo.",
      },
      constructComment: "Matches the brief our model-risk team gives new analysts in their first quarter.",
      scenarioEdits: [{ dimensionKey: "scenario", added: ["small-business lending"], removed: [] }],
      sampleVariantIds: [],
      satisfaction: {
        realism: 5,
        rubricFit: 4,
        fairness: 5,
        trust: 4,
        adoptionIntent: 4,
        comment: "We would accept this memo as a work sample from a candidate.",
        submittedAt: "2026-08-19T15:42:00-04:00",
      },
      source: "workspace",
    },
    {
      id: "val-b3-coral",
      blueprintId: "bp-b3-ethical-risk",
      blueprintName: "Ethical risk decomposition",
      partnerId: DEMO_PARTNER_IDS.coral,
      organisation: "Coral Health Network",
      reviewerName: "Dr. A. Okonkwo",
      reviewerRole: "Clinical Informatics Lead",
      reviewedAt: "2026-08-26T11:10:00-04:00",
      status: "validated",
      attested: true,
      criteriaComments: {
        "c3-mitigation": "Sequencing and ownership of mitigations is exactly what our governance committee asks for.",
      },
      constructComment: "The vignette format mirrors our pre-deployment ethics review.",
      scenarioEdits: [],
      sampleVariantIds: [],
      satisfaction: {
        realism: 4,
        rubricFit: 5,
        fairness: 4,
        trust: 5,
        adoptionIntent: 3,
        comment: "Useful for screening informatics fellows; adoption for hiring needs our HR partner's sign-off.",
        submittedAt: "2026-08-26T11:25:00-04:00",
      },
      source: "workspace",
    },
  ];
}

export function buildDemoEvidenceRecords(
  run: Run,
  submissions: Submission[],
  blueprint: Blueprint,
  course: Course,
  roster: Roster,
  validations: EmployerValidation[],
): EvidenceRecord[] {
  const issuedBy = `${DEMO_INSTRUCTOR} · Miami Dade College`;
  const validationIds = validations.filter((v) => v.blueprintId === blueprint.id && v.status === "validated").map((v) => v.id);
  const make = (variantIdStr: string, id: string, issuedAt: string): EvidenceRecord | null => {
    const variant = run.variants.find((v) => v.id === variantIdStr);
    const submission = submissions.find((s) => s.variantId === variantIdStr);
    const student = roster.students.find((s) => s.id === variant?.studentId);
    if (!variant || !submission?.grade || !student) return null;
    const canonical = evidenceCanonical({ student, course, blueprint, variant, grade: submission.grade, report: run.report, validationIds, issuedAt });
    return { id, runId: run.id, variantId: variantIdStr, studentId: student.id, blueprintId: blueprint.id, issuedAt, issuedBy, hash: hashEvidence(canonical), validationIds };
  };
  return [make("v-04", "VR-2026-0001", "2026-09-08T16:40:00-04:00"), make("v-15", "VR-2026-0002", "2026-09-08T16:41:00-04:00")].filter(
    (r): r is EvidenceRecord => !!r,
  );
}

/** Employer-bridge data alone, for migrating persisted workspaces that pre-date it. */
export function buildDemoEmployerData(ws: Pick<Workspace, "runs" | "submissions" | "blueprints" | "course" | "roster">): Pick<Workspace, "employerPartners" | "employerValidations" | "evidenceRecords"> {
  const validations = buildDemoEmployerValidations();
  const run = ws.runs.find((r) => r.id === DEMO_RUN_ID) ?? ws.runs[0];
  const b1 = ws.blueprints.find((b) => b.id === DEMO_BLUEPRINT_ID);
  return {
    employerPartners: buildDemoEmployerPartners(),
    employerValidations: validations,
    evidenceRecords: run && b1 ? buildDemoEvidenceRecords(run, ws.submissions, b1, ws.course, ws.roster, validations) : [],
  };
}

// ---------------------------------------------------------------------------
// Workspace
// ---------------------------------------------------------------------------

export function buildDemoWorkspace(computeReport?: (run: Run, t: ThresholdSet) => IntegrityReport): Workspace {
  const b1 = buildDemoBlueprintB1();
  const run = buildDemoRun(computeReport);
  const course = buildDemoCourse();
  const roster = buildDemoRoster();
  const submissions = buildDemoSubmissions(run, b1.rubric);
  const employerPartners = buildDemoEmployerPartners();
  const employerValidations = buildDemoEmployerValidations();
  // The Bayfront review added a scenario value to B2; reflect it on the blueprint as recordValidation would.
  const b2 = buildDemoBlueprintB2();
  const b2Validated: Blueprint = {
    ...b2,
    surfaceDimensions: b2.surfaceDimensions.map((d) =>
      d.key === "scenario" ? { ...d, values: [...d.values, "small-business lending"], note: "5 values · 1 added by employer" } : d,
    ),
  };
  return {
    version: 1,
    course,
    roster,
    blueprints: [b2Validated, buildDemoBlueprintB3(), b1],
    runs: [run],
    submissions,
    appeals: buildDemoAppeals(run),
    thresholds: buildDemoThresholds(),
    audit: buildDemoAudit(),
    institutionSets: buildDemoInstitutionSets(),
    activeBlueprintId: b1.id,
    activeRunId: run.id,
    pendingDraft: null,
    seededAt: new Date().toISOString(),
    employerPartners,
    employerValidations,
    evidenceRecords: buildDemoEvidenceRecords(run, submissions, b1, course, roster, employerValidations),
  };
}

// ---------------------------------------------------------------------------
// Structural bridge demo events: one consent share and one employer verification
// on VR-2026-0001 so the observed-adoption number is non-zero in demo mode.
// ---------------------------------------------------------------------------

export function buildDemoBridgeEvents<T extends Pick<Workspace, "evidenceRecords" | "verificationEvents" | "employerPartners">>(ws: T): T {
  const rec = ws.evidenceRecords.find((r) => r.id === "VR-2026-0001");
  if (!rec || !rec.bridge) return ws;
  const bayfront = ws.employerPartners.find((p) => p.id === DEMO_PARTNER_IDS.bayfront);
  const org = bayfront?.organisation ?? "Bayfront Regional Bank";
  const consent = {
    id: "con-demo-0001",
    at: "2026-09-02T15:10:00-04:00",
    action: "shared" as const,
    learnerId: rec.bridge.learnerId,
    toOrganisation: org,
    toEmail: bayfront?.contactEmail ?? null,
    note: "Applying for the summer analyst programme.",
  };
  const verification = {
    id: "ver-demo-0001",
    at: "2026-09-03T09:24:00-04:00",
    recordId: rec.id,
    byOrganisation: org,
    result: "valid" as const,
    method: "hash",
  };
  const alreadyConsent = rec.bridge.consent.some((c) => c.id === consent.id);
  const alreadyVer = (ws.verificationEvents ?? []).some((v) => v.id === verification.id);
  return {
    ...ws,
    evidenceRecords: ws.evidenceRecords.map((r) =>
      r.id === rec.id && r.bridge && !alreadyConsent ? { ...r, bridge: { ...r.bridge, consent: [...r.bridge.consent, consent] } } : r,
    ),
    verificationEvents: alreadyVer ? (ws.verificationEvents ?? []) : [...(ws.verificationEvents ?? []), verification],
  };
}
