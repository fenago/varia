/**
 * Recorded sample runs. Each JSON file here is the output of
 * `npm run record -- <sampleId>` (the real pipeline with a real key) or of a
 * dry run (`--dry-run`, demo provider, NOT real output — labelled as such).
 *
 * `defaultWorkspace()` is what the app shows with no key: nothing invented.
 * Every blueprint, run, variant, metric, roster, partner, challenge and skill
 * comes from a recording or a sample manifest. Runs whose report passes every
 * gate are released at load; over-threshold recordings stay unreleased with
 * their real reports. AI-written sample submissions (recorded
 * with `--submissions`) are labelled as such everywhere they appear.
 */
import type {
  AuditEvent,
  Blueprint,
  Course,
  EmployerChallenge,
  EmployerPartner,
  Grade,
  LevelScore,
  PreScoreOutput,
  Run,
  SkillTag,
  Student,
  Submission,
  Workspace,
} from "@shared/types";
import { sampleById } from "@shared/samples";
import { DEFAULT_THRESHOLDS } from "@shared/thresholds";
import type { SampleFixture } from "@lib/record/recordSample";

export const FIXTURE_INSTRUCTOR = { name: "Dr. E. Lee", institution: "Miami Dade College", role: "Instructor" } as const;

/** Sample submissions recorded with `npm run record -- --submissions 3`. */
export interface SampleSubmission {
  variantId: string;
  tier: "strong" | "adequate" | "weak";
  text: string;
  preScore: PreScoreOutput;
  model: string;
  recordedAt: string;
}

export type FixtureWithSamples = SampleFixture & { sampleSubmissions?: SampleSubmission[] };

const modules = import.meta.glob("./*.json", { eager: true }) as Record<string, { default: FixtureWithSamples } | FixtureWithSamples>;

function unwrap(m: { default: FixtureWithSamples } | FixtureWithSamples): FixtureWithSamples {
  return "default" in m && (m as { default: FixtureWithSamples }).default?.version
    ? (m as { default: FixtureWithSamples }).default
    : (m as FixtureWithSamples);
}

/** The flagship recording is listed first so it is the active blueprint and run by default. */
const FLAGSHIP = "ml-lending-fairness-audit";

/**
 * Every recording numbers its versions v-01…; when several runs share a workspace the ids
 * must not collide (lookups by version id would hit the wrong run). Each sample gets a short
 * code that prefixes its version ids at load: "v-04" → "len-v-04".
 */
const SHORT: Record<string, string> = {
  "ml-lending-fairness-audit": "len",
  "data-mining-churn": "chn",
  "marketing-web-analytics-attribution": "mkt",
  "ai-in-business-vendor-case": "biz",
  "nlp-support-ticket-triage": "nlp",
};
export function sampleCode(sampleId: string): string {
  return SHORT[sampleId] ?? sampleId.replace(/[^a-z]/g, "").slice(0, 3);
}
export function fixtureVariantId(sampleId: string, id: string): string {
  const code = sampleCode(sampleId);
  return id.startsWith(`${code}-`) ? id : `${code}-${id}`;
}

function allFixtures(): FixtureWithSamples[] {
  return Object.values(modules)
    .map(unwrap)
    .filter((f) => f && f.version === 1)
    .sort((a, b) => (a.sampleId === FLAGSHIP ? -1 : b.sampleId === FLAGSHIP ? 1 : a.sampleId.localeCompare(b.sampleId)));
}

export interface FixtureInfo {
  sampleId: string;
  organisation: string;
  title: string;
  recordedAt: string;
  recordedWith: SampleFixture["recordedWith"];
  models: SampleFixture["models"];
  variants: number;
  joint: number | null;
  costUsd: number | null;
  sampleSubmissions: number;
}

export function listFixtures(): FixtureInfo[] {
  return allFixtures().map((f) => {
    const s = sampleById(f.sampleId);
    return {
      sampleId: f.sampleId,
      organisation: s?.organisation ?? f.sampleId,
      title: s?.title ?? f.blueprint.name,
      recordedAt: f.recordedAt,
      recordedWith: f.recordedWith,
      models: f.models,
      variants: f.run.variants.length,
      joint: f.run.report?.joint ?? null,
      costUsd: f.run.usage?.costUsd ?? null,
      sampleSubmissions: f.sampleSubmissions?.length ?? 0,
    };
  });
}

export function getFixture(sampleId: string): FixtureWithSamples | null {
  return allFixtures().find((x) => x.sampleId === sampleId) ?? null;
}

/** The fixture whose blueprint id matches, for demo-mode replay. */
export function fixtureForBlueprint(blueprintId: string | null | undefined, blueprintName?: string): FixtureWithSamples | null {
  const all = allFixtures();
  if (!all.length) return null;
  return (
    all.find((f) => f.blueprint.id === blueprintId) ??
    (blueprintName ? all.find((f) => f.blueprint.name.toLowerCase() === blueprintName.toLowerCase()) : undefined) ??
    null
  );
}

/** True when every loaded fixture came from real Claude calls. */
export function fixturesAreReal(ids?: string[]): boolean {
  const all = allFixtures().filter((f) => !ids || ids.includes(f.sampleId));
  return all.length > 0 && all.every((f) => f.recordedWith === "live");
}

export function courseForSample(sampleId: string, courseId: string): Course {
  const s = sampleById(sampleId);
  return {
    id: courseId,
    code: s?.course.code ?? "",
    term: "Fall 2026",
    title: s?.course.title ?? "",
    instructor: { ...FIXTURE_INSTRUCTOR },
  };
}

function suggestedGrade(bp: Blueprint, pre: PreScoreOutput, at: string, model: string): Grade {
  const scores: Record<string, LevelScore> = {};
  let total = 0;
  let maxTotal = 0;
  for (const c of bp.rubric) {
    const lv = (pre.scores[c.id] ?? 0) as LevelScore;
    scores[c.id] = lv;
    total += Math.round((lv / 3) * c.points);
    maxTotal += c.points;
  }
  return { scores, total, maxTotal, gradedAt: at, by: `${model} (suggestion)`, basis: "suggested" };
}

/**
 * Build a workspace from recorded fixtures. Course: the first fixture's.
 * Blueprints, runs, rosters, partners, challenges and skills come from the
 * recordings and the sample manifests. Runs are released at load. Sample
 * submissions become labelled Submission rows with suggested grades. No
 * institution rows, no invented audit, no validations/endorsements/outcomes.
 */
export function fixtureWorkspace(ids?: string[], seededAt = new Date().toISOString()): Workspace {
  const fixtures = allFixtures().filter((f) => !ids || ids.includes(f.sampleId));
  if (!fixtures.length) throw new Error("No recorded sample runs are available.");

  const first = fixtures[0];
  const course = courseForSample(first.sampleId, first.blueprint.courseId);

  const students = new Map<string, Student>();
  const partners: EmployerPartner[] = [];
  const challenges: EmployerChallenge[] = [];
  const skills = new Map<string, SkillTag>();
  const blueprints: Blueprint[] = [];
  const runs: Run[] = [];
  const submissions: Submission[] = [];
  const audit: AuditEvent[] = [];

  for (const f of fixtures) {
    const s = sampleById(f.sampleId);
    for (const st of f.roster.students) students.set(st.id, st);
    for (const sk of s?.skills ?? []) if (!skills.has(sk.key)) skills.set(sk.key, sk);

    let partner = partners.find((p) => s && p.organisation.toLowerCase() === s.partner.organisation.toLowerCase());
    if (!partner && s) {
      partner = { ...s.partner, id: `partner-${f.sampleId}`, adoptedEvidenceRecords: false, adoptedAt: null, addedAt: f.recordedAt };
      partners.push(partner);
    }
    let challenge: EmployerChallenge | null = null;
    if (s && partner) {
      challenge = {
        ...s.challenge,
        id: `challenge-${f.sampleId}`,
        partnerId: partner.id,
        organisation: partner.organisation,
        contributedAt: f.recordedAt,
        status: "active",
        blueprintIds: [f.blueprint.id],
      };
      challenges.push(challenge);
    }
    const bp: Blueprint = { ...f.blueprint, courseId: course.id, challengeIds: challenge ? [challenge.id] : [], sampleId: f.sampleId, recordedRunAvailable: true };
    blueprints.push(bp);

    const real = f.recordedWith === "live";
    const releasable = Boolean(f.run.report?.releasable);
    const failing = f.run.report ? (Object.values(f.run.report.checks).filter((c) => c.gate === "fail").map((c) => c.property)) : [];
    const releasedAt = f.run.finishedAt ?? f.recordedAt;
    const vid = (id: string) => fixtureVariantId(f.sampleId, id);
    const run: Run = {
      ...f.run,
      courseId: course.id,
      blueprintId: bp.id,
      variants: f.run.variants.map((v) => ({ ...v, id: vid(v.id), status: v.status === "draft" ? "released" : v.status })),
      report: f.run.report ? { ...f.run.report, outliers: f.run.report.outliers.map(vid) } : f.run.report,
      // Only a run whose report passes every gate is released at load. An over-threshold recording
      // stays unreleased with its real report, so the Report page shows the honest state and the real
      // actions (regenerate outliers, loosen jargon, release with a reason).
      release:
        f.run.report && releasable && (f.run.status === "complete" || f.run.status === "partial")
          ? { runId: f.run.id, releasedAt, by: course.instructor.name, overThreshold: false, failingChecks: [], regenerated: [] }
          : null,
    };
    runs.push(run);

    audit.push({
      id: `audit-${f.sampleId}-recorded`,
      at: f.recordedAt,
      actor: real ? "system" : "dry run",
      kind: "run",
      text: `${real ? "Recorded" : "Dry-run recorded (not real output)"}: ${run.n} versions of "${bp.name}" (${run.strategy}, ${f.models.generator} / ${f.models.judge})${run.report ? `, J ${run.report.joint.toFixed(2)}` : ""}`,
      runId: run.id,
    });
    if (run.release) {
      audit.push({
        id: `audit-${f.sampleId}-released`,
        at: releasedAt,
        actor: course.instructor.name,
        kind: "release",
        text: `Released from the recorded run of ${releasedAt.slice(0, 10)}: "${bp.name}", ${run.variants.length} versions`,
        runId: run.id,
      });
    } else if (f.run.report && failing.length) {
      audit.push({
        id: `audit-${f.sampleId}-held`,
        at: releasedAt,
        actor: "system",
        kind: "run",
        text: `Not released: "${bp.name}" is over threshold on ${failing.join(", ")} (${f.run.report.checks.p1.metricLabel}); regenerate, loosen the jargon register, or release with a reason`,
        runId: run.id,
      });
    }

    for (const ss of f.sampleSubmissions ?? []) {
      const v = run.variants.find((x) => x.id === vid(ss.variantId));
      if (!v || !v.studentId) continue;
      submissions.push({
        id: `sub-${f.sampleId}-${vid(ss.variantId)}`,
        runId: run.id,
        variantId: vid(ss.variantId),
        studentId: v.studentId,
        text: ss.text,
        submittedAt: ss.recordedAt,
        grade: suggestedGrade(bp, ss.preScore, ss.recordedAt, ss.model),
        origin: "ai-sample",
        sampleTier: ss.tier,
        preScore: { ...ss.preScore, at: ss.recordedAt, model: ss.model },
      });
    }
  }

  audit.sort((a, b) => (a.at < b.at ? 1 : -1));

  return {
    version: 1,
    course,
    roster: { courseId: course.id, students: [...students.values()], source: "recorded sample rosters" },
    blueprints,
    runs,
    submissions,
    appeals: [],
    thresholds: [DEFAULT_THRESHOLDS],
    audit,
    institutionSets: [],
    activeBlueprintId: blueprints[0]?.id ?? null,
    activeRunId: runs[0]?.id ?? null,
    pendingDraft: null,
    seededAt,
    employerPartners: partners,
    employerValidations: [],
    evidenceRecords: [],
    verificationEvents: [],
    signingKey: null,
    skills: [...skills.values()],
    challenges,
    endorsements: [],
    outcomes: [],
    portfolioShares: [],
  };
}

/** The no-key default: every recorded run, released, with labelled sample submissions. */
export function defaultWorkspace(seededAt?: string): Workspace {
  return fixtureWorkspace(undefined, seededAt);
}


/**
 * The recorded sample submissions of a fixture, re-keyed onto a run that replayed it.
 * Variants are matched by text (a replay keeps the recorded text verbatim), so this works
 * whatever ids the replayed run assigned. Returns [] when nothing matches.
 */
export function recordedSubmissionsForRun(run: Run, bp: Blueprint): Submission[] {
  const sampleId = run.recordedFrom?.sampleId ?? bp.sampleId ?? null;
  const f = sampleId ? getFixture(sampleId) : fixtureForBlueprint(bp.id, bp.name);
  if (!f || !f.sampleSubmissions?.length) return [];
  const out: Submission[] = [];
  for (const ss of f.sampleSubmissions) {
    const recorded = f.run.variants.find((x) => x.id === ss.variantId);
    if (!recorded) continue;
    const v = run.variants.find((x) => x.text === recorded.text && x.studentId);
    if (!v || !v.studentId) continue;
    out.push({
      id: `sub-${run.id}-${v.id}`,
      runId: run.id,
      variantId: v.id,
      studentId: v.studentId,
      text: ss.text,
      submittedAt: ss.recordedAt,
      grade: suggestedGrade(bp, ss.preScore, ss.recordedAt, ss.model),
      origin: "ai-sample",
      sampleTier: ss.tier,
      preScore: { ...ss.preScore, at: ss.recordedAt, model: ss.model },
    });
  }
  return out;
}
