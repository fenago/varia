/**
 * Recorded sample runs. Each JSON file here is the output of
 * `npm run record -- <sampleId>` (the real pipeline with a real key) or of a
 * dry run (`--dry-run`, demo provider, NOT real output — labelled as such).
 * `fixtureWorkspace()` turns them into a Workspace with nothing invented.
 */
import type { AuditEvent, Blueprint, EmployerChallenge, EmployerPartner, Run, SkillTag, Student, Workspace } from "@shared/types";
import { sampleById } from "@shared/samples";
import { DEFAULT_THRESHOLDS } from "@shared/thresholds";
import type { SampleFixture } from "@lib/record/recordSample";

const modules = import.meta.glob("./*.json", { eager: true }) as Record<string, { default: SampleFixture } | SampleFixture>;

function unwrap(m: { default: SampleFixture } | SampleFixture): SampleFixture {
  return "default" in m && (m as { default: SampleFixture }).default?.version ? (m as { default: SampleFixture }).default : (m as SampleFixture);
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
}

export function listFixtures(): FixtureInfo[] {
  return Object.values(modules)
    .map(unwrap)
    .filter((f) => f && f.version === 1)
    .map((f) => {
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
      };
    })
    .sort((a, b) => a.sampleId.localeCompare(b.sampleId));
}

export function getFixture(sampleId: string): SampleFixture | null {
  const f = Object.values(modules).map(unwrap).find((x) => x.sampleId === sampleId);
  return f ?? null;
}

/** True when every loaded fixture came from real Claude calls. */
export function fixturesAreReal(ids?: string[]): boolean {
  const all = Object.values(modules).map(unwrap).filter((f) => !ids || ids.includes(f.sampleId));
  return all.length > 0 && all.every((f) => f.recordedWith === "live");
}

/**
 * Build a workspace from recorded fixtures. Course: the first fixture's course.
 * Blueprints, runs, rosters, partners, challenges and skills come from the
 * recordings and the sample manifests. No institution rows, no invented audit.
 */
export function fixtureWorkspace(ids?: string[], seededAt = new Date().toISOString()): Workspace {
  const fixtures = Object.values(modules)
    .map(unwrap)
    .filter((f) => f.version === 1 && (!ids || ids.includes(f.sampleId)))
    .sort((a, b) => a.sampleId.localeCompare(b.sampleId));
  if (!fixtures.length) throw new Error("No recorded sample runs are available.");

  const first = fixtures[0];
  const firstSample = sampleById(first.sampleId);
  const course = {
    id: first.blueprint.courseId,
    code: firstSample?.course.code ?? "CAP 4767",
    term: "Fall 2026",
    title: firstSample?.course.title ?? "Data Mining",
    instructor: { name: "Dr. E. Lee", institution: "Miami Dade College", role: "Instructor" },
  };

  const students = new Map<string, Student>();
  const partners: EmployerPartner[] = [];
  const challenges: EmployerChallenge[] = [];
  const skills = new Map<string, SkillTag>();
  const blueprints: Blueprint[] = [];
  const runs: Run[] = [];
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
    const bp: Blueprint = { ...f.blueprint, courseId: course.id, challengeIds: challenge ? [challenge.id] : [] };
    blueprints.push(bp);
    const run: Run = { ...f.run, courseId: course.id, blueprintId: bp.id };
    runs.push(run);
    audit.push({
      id: `audit-${f.sampleId}`,
      at: f.recordedAt,
      actor: f.recordedWith === "live" ? "system" : "dry run",
      kind: "run",
      text: `${f.recordedWith === "live" ? "Recorded" : "Dry-run recorded (not real output)"}: ${run.n} versions of "${bp.name}" (${run.strategy}, ${f.models.generator} / ${f.models.judge})${run.report ? `, J ${run.report.joint.toFixed(2)}` : ""}`,
      runId: run.id,
    });
  }

  audit.sort((a, b) => (a.at < b.at ? 1 : -1));

  return {
    version: 1,
    course,
    roster: { courseId: course.id, students: [...students.values()], source: "recorded sample rosters" },
    blueprints,
    runs,
    submissions: [],
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
