/**
 * VARIA shared contract. Every module — metrics, LLM services, store, pages —
 * codes against these types. Changes here are announced to all agents.
 *
 * Architecture: the whole app runs in the browser. The user's pasted Anthropic
 * key lives in browser storage only; Claude is called directly from the client;
 * metrics are computed locally; the Workspace is persisted to localStorage.
 */

// ---------------------------------------------------------------------------
// Modes, enums
// ---------------------------------------------------------------------------

/** `demo` = no key, seeded fixtures. `live` = pasted key, real Claude calls. */
export type Mode = "demo" | "live";

export type Gate = "pass" | "fail" | "advisory";

export type Property = "p1" | "p2" | "p3" | "p4";

export type Strategy =
  | "zero-shot"
  | "few-shot"
  | "structured-cot"
  | "dimension-preserving";

/** The radio on the Generate page. Maps to a Strategy (see thresholds.ts). */
export type ThreatProfile = "high-stakes" | "copy-at-scale" | "manual";

/** Exact Anthropic model ID strings. No date suffixes. */
export type ModelId = string;

/** Derived from the model catalog in `./models` (same `{ id, label, note }` shape). */
export { GENERATOR_MODELS, JUDGE_MODELS } from "./models";

// ---------------------------------------------------------------------------
// Course, roster
// ---------------------------------------------------------------------------

export interface Course {
  id: string;
  code: string; // "DAT 4100"
  term: string; // "Fall 2026"
  title: string;
  instructor: { name: string; institution: string; role: string };
}

export interface Student {
  id: string;
  /** "Alvarez, R." */
  name: string;
  email?: string;
}

export interface Roster {
  courseId: string;
  students: Student[];
  source?: string; // file name
}

// ---------------------------------------------------------------------------
// Blueprint = (construct, rubric, canonical solution) + surface dimensions
// ---------------------------------------------------------------------------

export type AnchorsConfidence = "high" | "draft" | "missing";

export interface Criterion {
  id: string;
  name: string;
  points: number;
  /** 0..1, all criteria sum to 1 */
  weight: number;
  /** Always 4 levels scored 0..3 */
  levels: 4;
  /** Level descriptions for 0,1,2,3. null = not found. */
  anchors: [string, string, string, string] | null;
  anchorsConfidence: AnchorsConfidence;
  /** Skills this criterion evidences (keys into Workspace.skills) */
  skillKeys?: string[];
}

export interface SurfaceDimension {
  /** "domain" | "stakeholder" | "scenario" | "jargon" | "readingLevel" | "stepCount" | custom */
  key: string;
  label: string;
  /** Candidate values the generator may assign. Empty for locked dims. */
  values: string[];
  /** Locked dims are never varied (readingLevel, stepCount). */
  locked: boolean;
  /** Whether the instructor enabled it for the next run. Ignored if locked. */
  enabled: boolean;
  note?: string; // "4 found", "12 drafted", "held constant"
}

export type SourceKind = "task" | "rubric" | "task+rubric" | "solution" | "roster" | "unknown";

export interface SourceFile {
  name: string;
  kind: SourceKind;
  recognisedAs: string; // "Task prompt + rubric"
  sizeBytes: number;
  status: "read" | "failed";
  /** Raw extracted text (not for roster). */
  text?: string;
}

export interface Blueprint {
  id: string;
  /** "B1" style code, optional, used in the library list */
  code?: string;
  name: string;
  courseId: string;
  /** What stays constant across every student's version. */
  construct: string;
  /** Construct-map dimensions the judge scores on (2–5 short phrases). */
  constructDimensions: string[];
  rubric: Criterion[];
  canonicalSolution: string;
  canonicalSolutionSource: "found" | "drafted" | "written";
  surfaceDimensions: SurfaceDimension[];
  /** Original task prompt text as the instructor wrote it. */
  taskPrompt: string;
  source: {
    files: SourceFile[];
    extractedAt: string | null;
    extractionConfidence: "high" | "medium" | "low" | null;
    readSeconds?: number;
  };
  /** Cached few-shot anchors, generated once per blueprint. */
  fewShotAnchors?: { positive: string[]; negative: string[] } | null;
  createdAt: string;
  updatedAt: string;
  /** For the library list: "used Spring 2026 · J 0.88" */
  lastUsed?: { term: string; joint: number } | null;
  /** Employer challenges this blueprint draws scenarios from */
  challengeIds?: string[];
}

/** What the extraction call returns before the instructor confirms it. */
export type BlueprintDraft = Omit<Blueprint, "id" | "courseId" | "createdAt" | "updatedAt">;

// ---------------------------------------------------------------------------
// Runs, variants, report
// ---------------------------------------------------------------------------

export type SurfaceAssignment = Record<string, string>;

export interface JudgeSample {
  /** 1..5 per construct dimension, keyed by dimension text */
  dimensionScores: Record<string, number>;
  rationale: string;
}

export interface VariantMetrics {
  fleschEase: number;
  /** type-token ratio 0..1 */
  lexicalComplexity: number;
  /** numbered/bulleted step count of the adapted solution */
  stepCount: number;
  /** Flesch of the adapted solution (feeds P3 proxy) */
  solutionFleschEase: number;
  /** 0..1 normalised median judge score. null until judged. */
  equivalence: number | null;
  judgeSamples: JudgeSample[];
}

export type VariantStatus = "draft" | "released" | "regenerated" | "rejected";

export interface Variant {
  /** "v-04" */
  id: string;
  runId: string;
  studentId: string | null;
  text: string;
  /** Canonical solution rewritten into this variant's scenario. Required. */
  adaptedSolution: string;
  surfaceAssignment: SurfaceAssignment;
  metrics: VariantMetrics;
  flags: { p4Outlier: boolean; p2Low: boolean };
  status: VariantStatus;
  /** Increments on regeneration */
  generation: number;
  /** Strategy scaffold kept for debugging (structured CoT plan etc.) */
  scaffold?: unknown;
  /** Actual usage for this variant's generation + judging */
  usage?: UsageTotals;
  error?: string;
}

export interface Check {
  property: Property;
  /** "Versions look different" */
  label: string;
  /** "cosine 0.095" — the hover-only number */
  metricLabel: string;
  /** Full tooltip: "P1 — mean pairwise embedding cosine…, τdiv ≤ 0.15" */
  detail: string;
  value: number | null;
  threshold: number | null;
  /** 0..1 fill for the bar */
  barFill: number;
  /** 0..1 position of the threshold tick, null for advisory */
  barTick: number | null;
  gate: Gate;
  /** Plain-language consequence shown under the bar when not pass */
  note: string | null;
}

export interface IntegrityReport {
  runId: string;
  computedAt: string;
  thresholdsVersion: number;
  /** Wave 6c: metric definition used to compute this report */
  metricsVersion?: number;
  /** Wave 6c (v3): lines shared by most versions that were removed before P1 metrics */
  boilerplateLinesRemoved?: number;
  cosineMean: number;
  ngramOverlapMean: number;
  /** mean over variants of normalised median judge score */
  equivalenceMean: number;
  /** σ Flesch of adapted solutions (P3 proxy) */
  rubricProxySigma: number;
  fleschSigma: number;
  fleschMean: number;
  /** Equal-weight joint score J */
  joint: number;
  /** F = 1 − J */
  failure: number;
  checks: Record<Property, Check>;
  /** The most similar pair of versions by 4-gram overlap */
  mostSimilarPair?: { a: string; b: string; overlap: number } | null;
  /** Variant IDs named by a failing check */
  outliers: string[];
  /** P1, P2, P4 all pass */
  releasable: boolean;
}

export type RunStatus =
  | "queued"
  | "generating"
  | "judging"
  | "scoring"
  | "complete"
  | "partial"
  | "failed"
  | "cancelled";

export interface RunProgress {
  phase: RunStatus;
  done: number;
  total: number;
  message: string;
  /** Wave 6b: honest, visible progress. All optional so older persisted runs load. */
  startedAt?: string;
  phaseStartedAt?: string;
  /** What is being worked on right now, e.g. "v-07 · judging sample 3 of 5" */
  current?: string;
  /** The last item that finished, e.g. "v-06 generated (1,140 words)" */
  lastDone?: string;
  /** Rolling estimate of seconds remaining, from observed per-item time */
  etaSeconds?: number | null;
  /** Non-fatal problems so far (retries, one failed variant) */
  warnings?: string[];
}

/** Wave 6c: per-run advanced options (paper ablations and app policies). */
export interface AdvancedRunOptions {
  /** Few-shot: include the two negative anchors (paper θFS vs θ−FS) */
  negativeAnchors: boolean;
  /** Structured CoT: include the explicit construct-map step (θSC vs θ−SC) */
  constructMap: boolean;
  /** Dimension-preserving: Flesch band around the original task, ± points */
  readabilityBand: number;
  /** Outlier rule: variants more than k·σ harder than the mean are named */
  outlierSigma: number;
  /** Outlier rule: always name at least this many hardest variants when P4 fails */
  outlierMinNamed: number;
  concurrencyGenerate: number;
  concurrencyJudge: number;
}

export const DEFAULT_ADVANCED: AdvancedRunOptions = {
  negativeAnchors: true,
  constructMap: true,
  readabilityBand: 5,
  outlierSigma: 1.0,
  outlierMinNamed: 3,
  concurrencyGenerate: 3,
  concurrencyJudge: 4,
};

export interface Run {
  id: string;
  blueprintId: string;
  blueprintName: string;
  courseId: string;
  strategy: Strategy;
  threatProfile: ThreatProfile;
  generatorModel: ModelId;
  judgeModel: ModelId;
  judgeSamples: number; // 5
  n: number;
  enabledDimensions: string[];
  mode: Mode;
  status: RunStatus;
  progress: RunProgress;
  startedAt: string;
  finishedAt: string | null;
  variants: Variant[];
  report: IntegrityReport | null;
  release: Release | null;
  costEstimateUsd: number;
  estMinutes: number;
  /** Actual usage accumulated from API responses (wave 1) */
  usage?: UsageTotals;
  /** Wave 6c: the advanced options this run used (defaults when absent) */
  advanced?: AdvancedRunOptions;
  error?: string;
}

export interface Release {
  runId: string;
  releasedAt: string;
  by: string;
  overThreshold: boolean;
  reason?: string;
  failingChecks: Property[];
  /** Variants regenerated before release, if any */
  regenerated: string[];
}

// ---------------------------------------------------------------------------
// Submissions, grading, appeals
// ---------------------------------------------------------------------------

export type LevelScore = 0 | 1 | 2 | 3;

export interface Grade {
  scores: Record<string, LevelScore>; // criterionId -> level
  total: number;
  maxTotal: number;
  gradedAt: string;
  by: string;
  /** Wave 5: "suggested" = an AI suggestion the demo carries; "instructor" = a person saved it */
  basis?: "instructor" | "suggested";
}

export type SubmissionStatus = "not-started" | "submitted" | "graded" | "appeal";

export interface Submission {
  id: string;
  runId: string;
  variantId: string;
  studentId: string;
  text: string | null;
  submittedAt: string | null;
  grade: Grade | null;
  /** Wave 5: where the text came from. "ai-sample" = written by a model at a stated quality tier for the recorded demo, never passed off as a student's. */
  origin?: "student" | "ai-sample";
  /** For ai-sample: the tier the model was asked to write at */
  sampleTier?: "strong" | "adequate" | "weak";
  /** File the submission was imported from, if any */
  sourceFile?: string;
  /** AI suggestion (wave 4). Never the grade; the instructor saves the grade. */
  preScore?: PreScoreOutput & { at: string; model: ModelId };
}

export interface Appeal {
  id: string;
  runId: string;
  variantId: string;
  studentId: string;
  openedAt: string;
  note: string;
  status: "open" | "resolved";
  resolution?: string;
}

// ---------------------------------------------------------------------------
// Institution: thresholds, audit, console rows
// ---------------------------------------------------------------------------

export interface ThresholdSet {
  version: number;
  setAt: string;
  setBy: string;
  /** P1: mean pairwise cosine must be ≤ */
  p1Cosine: number;
  /** P1: mean pairwise 4-gram overlap must be ≤ (catches near-duplicates that TF-IDF v4 discounts). Default 0.35. */
  p1Ngram?: number;
  /** P1: the MOST similar pair's 4-gram overlap must be ≤ (paper §3.1 formal P1 is a max over pairs). Default 0.5. */
  p1MaxPair?: number;
  /** P2: construct equivalence must be ≥ */
  p2Equivalence: number;
  /** P3 is advisory in this prototype */
  p3: "advisory";
  /** P4: σ Flesch must be ≤ */
  p4FleschSigma: number;
  /** Wave 6c policy: may an instructor release a set over threshold with a recorded reason? */
  allowOverThresholdRelease?: boolean;
  /** Wave 6c: which metric definition these thresholds were set against (1 = no stop-word removal, 2 = stop words removed) */
  metricsVersion?: number;
}

export type AuditKind =
  | "system"
  | "release"
  | "threshold"
  | "policy"
  | "appeal"
  | "grade"
  | "run"
  | "settings"
  | "employer"
  | "evidence"
  | "outcome"
  | "credential";

export interface AuditEvent {
  id: string;
  at: string;
  actor: string;
  kind: AuditKind;
  text: string;
  runId?: string;
}

export type InstitutionSetStatus =
  | "cleared"
  | "over-threshold"
  | "awaiting-sign-off"
  | "blocked";

/** A row on the compliance console. Local runs are projected into these too. */
export interface InstitutionSet {
  id: string;
  course: string; // "DAT 4100"
  assessment: string; // "Model card audit"
  instructor: string; // "E. Lee"
  department: string;
  n: number;
  strategy: Strategy;
  joint: number;
  failingChecks: Property[];
  status: InstitutionSetStatus;
  releasedAt: string;
  reviewedAt: string | null;
  /** Set when the row is one of this workspace's own runs */
  runId?: string;
}

// ---------------------------------------------------------------------------
// Settings (API key lives here, browser storage only)
// ---------------------------------------------------------------------------

export interface Settings {
  /** Pasted by the user. Never bundled, never sent anywhere but api.anthropic.com. */
  apiKey: string | null;
  /** Anthropic workspace id ("wrkspc_…"). Required only when the key is organisation-level. */
  workspaceId?: string | null;
  /** true = localStorage, false = sessionStorage (cleared when the tab closes) */
  rememberKey: boolean;
  generatorModel: ModelId;
  judgeModel: ModelId;
  judgeSamples: number;
  /** Last successful key check */
  keyVerifiedAt: string | null;
}

// ---------------------------------------------------------------------------
// Workspace = everything persisted (localStorage). No database.
// ---------------------------------------------------------------------------

export interface Workspace {
  version: 1;
  course: Course;
  roster: Roster;
  blueprints: Blueprint[];
  runs: Run[];
  submissions: Submission[];
  appeals: Appeal[];
  /** Newest last; the active set is the last element */
  thresholds: ThresholdSet[];
  audit: AuditEvent[];
  /** Seeded institution rows for the console (other courses) */
  institutionSets: InstitutionSet[];
  activeBlueprintId: string | null;
  activeRunId: string | null;
  /** Draft produced by Import, not yet saved as a blueprint */
  pendingDraft: BlueprintDraft | null;
  seededAt: string;
  /** Employer-outcomes bridge (added in workspace schema v1.1; older persisted states get defaults) */
  employerPartners: EmployerPartner[];
  employerValidations: EmployerValidation[];
  evidenceRecords: EvidenceRecord[];
  /** Bridge (optional so older persisted states load; the store fills defaults) */
  verificationEvents?: VerificationEvent[];
  signingKey?: SigningKey | null;
  /** Employability bridge (optional for the same reason) */
  skills?: SkillTag[];
  challenges?: EmployerChallenge[];
  endorsements?: Endorsement[];
  outcomes?: OutcomeEvent[];
  portfolioShares?: PortfolioShare[];
  /** Wave 7: issued Open Badges 3.0 credentials (achievement + employer endorsements) */
  credentials?: IssuedCredential[];
}

// ---------------------------------------------------------------------------
// LLM provider contract (implemented by src/lib/llm, consumed by src/lib/store)
// ---------------------------------------------------------------------------

export interface GenerateVariantInput {
  blueprint: Blueprint;
  strategy: Strategy;
  /** Which variant this is (0-based) and how many in the set */
  index: number;
  n: number;
  /** Pre-chosen assignment for dimension-preserving; hint for the others */
  surfaceAssignment: SurfaceAssignment;
  /** Texts of variants already generated in this run (for diversity nudging) */
  priorVariantTexts: string[];
  generatorModel: ModelId;
  signal?: AbortSignal;
  /** Called once per API request this call makes (wave 1: real usage) */
  onUsage?: (u: UsageTotals) => void;
  /** Wave 6c: ablation switches and the readability band for this run */
  advanced?: AdvancedRunOptions;
}

export interface GenerateVariantOutput {
  text: string;
  adaptedSolution: string;
  surfaceAssignment: SurfaceAssignment;
  scaffold?: unknown;
  /** Sum of every request behind this output. Also reported via `onUsage`; consume one, not both. */
  usage?: UsageTotals;
}

export interface JudgeInput {
  blueprint: Blueprint;
  variantText: string;
  judgeModel: ModelId;
  samples: number;
  signal?: AbortSignal;
  /** Called once per judge sample request (wave 1: real usage) */
  onUsage?: (u: UsageTotals) => void;
}

export interface ExtractInput {
  files: SourceFile[];
  /** Concatenated text of all non-roster files, or pasted text */
  rawText: string;
  course: Course;
  signal?: AbortSignal;
  /** Called once per API request extraction makes (wave 1: real usage) */
  onUsage?: (u: UsageTotals) => void;
}

export interface LlmProvider {
  mode: Mode;
  /** Cheap round-trip to confirm the key works. Throws on failure. */
  verifyKey(): Promise<{ ok: true; model: ModelId }>;
  extractBlueprint(input: ExtractInput): Promise<BlueprintDraft>;
  draftAnchors(criterion: Criterion, blueprint: Pick<Blueprint, "construct" | "taskPrompt">): Promise<[string, string, string, string]>;
  draftCanonicalSolution(blueprint: Pick<Blueprint, "construct" | "taskPrompt" | "rubric">): Promise<string>;
  generateFewShotAnchors(blueprint: Blueprint): Promise<{ positive: string[]; negative: string[] }>;
  generateVariant(input: GenerateVariantInput): Promise<GenerateVariantOutput>;
  judgeVariant(input: JudgeInput): Promise<JudgeSample[]>;
  /** Wave 4: suggest rubric levels for a submission. A suggestion only; the instructor decides. */
  preScoreSubmission?(input: PreScoreInput): Promise<PreScoreOutput>;
}

export interface PreScoreInput {
  blueprint: Blueprint;
  variant: Pick<Variant, "id" | "text" | "adaptedSolution">;
  submissionText: string;
  judgeModel: ModelId;
  signal?: AbortSignal;
  onUsage?: (u: UsageTotals) => void;
}

export interface PreScoreOutput {
  /** criterionId -> suggested level 0..3 */
  scores: Record<string, LevelScore>;
  /** criterionId -> one or two sentences citing the submission */
  rationale: Record<string, string>;
  /** Overall note for the instructor */
  summary: string;
}

// ---------------------------------------------------------------------------
// Employer validation, evidence records (the employer-outcomes bridge)
// ---------------------------------------------------------------------------

export interface EmployerPartner {
  id: string;
  organisation: string; // "Northline Talent Systems"
  sector: string; // "Hiring" | "Lending" | "Healthcare" | "Logistics" | …
  contactName?: string;
  contactRole?: string;
  contactEmail?: string;
  /** Has this partner accepted evidence records for hiring or promotion? */
  adoptedEvidenceRecords: boolean;
  adoptedAt: string | null;
  addedAt: string;
}

export type ValidationStatus = "validated" | "changes-requested" | "declined";

export interface ScenarioEdit {
  dimensionKey: string;
  added: string[];
  removed: string[];
}

/** Five-question employer satisfaction survey, 1–5 each. */
export interface EmployerSatisfaction {
  /** The task reflects real work in our organisation */
  realism: number;
  /** The rubric reflects what we hire or promote for */
  rubricFit: number;
  /** The sample versions are fair to compare across candidates */
  fairness: number;
  /** I would trust an evidence record from this assessment */
  trust: number;
  /** I would use this in hiring or promotion decisions */
  adoptionIntent: number;
  comment: string;
  submittedAt: string;
}

export interface EmployerValidation {
  id: string;
  blueprintId: string;
  blueprintName: string;
  partnerId: string | null;
  organisation: string;
  reviewerName: string;
  reviewerRole: string;
  /** Lightweight reviewer identity: a work email at the organisation's domain, so a validation has a real signer */
  reviewerEmail?: string;
  reviewedAt: string;
  status: ValidationStatus;
  /** "This rubric reflects what we hire for" — explicit attestation */
  attested: boolean;
  criteriaComments: Record<string, string>; // criterionId -> comment
  constructComment: string;
  scenarioEdits: ScenarioEdit[];
  /** IDs of the sample variants the reviewer saw */
  sampleVariantIds: string[];
  satisfaction: EmployerSatisfaction | null;
  /** How the record arrived: in this workspace, or imported from a result link/file */
  source: "workspace" | "imported";
}

/** What an employer reviewer receives. Self-contained: no workspace needed. */
export interface ReviewPackage {
  version: 1;
  issuedAt: string;
  issuedBy: string; // "Dr. E. Lee · Miami Dade College"
  course: Course;
  blueprint: Blueprint;
  sampleVariants: Pick<Variant, "id" | "text" | "surfaceAssignment" | "adaptedSolution">[];
  partner: Pick<EmployerPartner, "id" | "organisation" | "sector"> | null;
  /** Latest integrity report for context, if a run exists */
  report: IntegrityReport | null;
}

/** What comes back from the reviewer. Applied to the workspace by the instructor. */
export interface ReviewResult {
  version: 1;
  packageIssuedAt: string;
  validation: Omit<EmployerValidation, "id" | "source">;
}

export interface EvidenceRecord {
  /** "VR-2026-0004" */
  id: string;
  runId: string;
  variantId: string;
  studentId: string;
  blueprintId: string;
  issuedAt: string;
  issuedBy: string;
  /** SHA-256 over the canonical content, hex */
  hash: string;
  /** Validation IDs stamped on the record at issue time */
  validationIds: string[];
  /** Bridge fields (schema v2). Optional so v1 persisted records still load; the store upgrades them. */
  bridge?: EvidenceRecordBridge;
}

// ---------------------------------------------------------------------------
// Structural bridge: learner identity, consent, verification, Open Badges 3.0
// ---------------------------------------------------------------------------

/** Student-initiated sharing of an evidence record. FERPA: the learner shares, not the instructor. */
export interface ConsentEvent {
  id: string;
  at: string;
  action: "shared" | "revoked";
  learnerId: string;
  toOrganisation: string | null;
  toEmail: string | null;
  note: string | null;
}

/** An employer (or anyone) verified a record. Observed adoption, not a checkbox. */
export interface VerificationEvent {
  id: string;
  at: string;
  recordId: string;
  byOrganisation: string | null;
  result: "valid" | "invalid";
  /** "hash" | "hash+signature" */
  method: string;
}

/** Workspace-held demo signing key (ECDSA P-256, JWK). A real deployment uses an MDC-held key. */
export interface SigningKey {
  kid: string;
  alg: "ES256";
  publicJwk: JsonWebKey;
  privateJwk: JsonWebKey;
  createdAt: string;
  issuerName: string;
  demo: true;
}

/** Fields added to EvidenceRecord for the bridge (schema v2). */
export interface EvidenceRecordBridge {
  schemaVersion: 2 | 3;
  /** Stable learner identifier, not the name: "L-" + first 12 hex of sha256(studentId|courseId|seededAt) */
  learnerId: string;
  consent: ConsentEvent[];
  /** Open Badges 3.0 credential id (URL-shaped, resolves on the verify page) */
  credentialId: string;
  /** Detached JWS (ES256) over the canonical content, or null if unsigned */
  signature: string | null;
  signedWithKid: string | null;
  /** v3: the record is a work sample (defaults filled by the store) */
  workSample?: WorkSampleFields;
}

// ---------------------------------------------------------------------------
// Employability bridge: challenges, skills, work samples, portfolio, talent, outcomes
// ---------------------------------------------------------------------------

/** A skill an employer recognises. Rubric criteria map onto these. */
export interface SkillTag {
  key: string; // "fairness-analysis"
  label: string; // "Fairness analysis"
  source: "employer" | "taxonomy" | "instructor";
  /** e.g. "O*NET 15-2051.01" or a partner's competency code */
  externalRef?: string;
}

/** A real problem brief contributed by an employer partner. One brief → one version per student. */
export interface EmployerChallenge {
  id: string;
  partnerId: string;
  organisation: string;
  title: string; // "Audit our loan-default classifier"
  /** The real problem, in the employer's words */
  brief: string;
  domain: string; // "Lending"
  stakeholderRole: string; // "Risk officer"
  /** What the employer would want back */
  deliverable: string;
  /** Skills the employer says this exercises */
  skillKeys: string[];
  contributedAt: string;
  contributedBy: string;
  status: "active" | "retired";
  /** Blueprints that draw scenarios from this challenge */
  blueprintIds: string[];
}

/** An employer scored a shared work sample against their own bar. */
export interface Endorsement {
  id: string;
  at: string;
  recordId: string;
  partnerId: string | null;
  organisation: string;
  reviewerName: string;
  reviewerEmail?: string;
  /** 1–5 against the employer's own bar */
  score: number;
  meetsBar: boolean;
  comment: string;
}

export type OutcomeKind = "interviewed" | "offered" | "hired" | "ramped" | "promoted";

/** Something that happened to a learner because of a record. Logged where it happens. */
export interface OutcomeEvent {
  id: string;
  at: string;
  recordId: string;
  learnerId: string;
  kind: OutcomeKind;
  organisation: string;
  by: "student" | "employer";
  note?: string;
  /** For "ramped": hours to productive, as reported by the employer */
  onboardingHours?: number;
}

/** A learner sharing a set of records as one portfolio, to one organisation or publicly. */
export interface PortfolioShare {
  id: string;
  learnerId: string;
  recordIds: string[];
  toOrganisation: string | null; // null = anyone with the link
  createdAt: string;
  revokedAt: string | null;
}

/** Schema v3 additions to an evidence record: it is now a work sample. */
export interface WorkSampleFields {
  /** The student chose to include their submission text in the record */
  submissionIncluded: boolean;
  submissionText: string | null;
  skills: SkillTag[];
  challengeId: string | null;
  endorsementIds: string[];
}

// ---------------------------------------------------------------------------
// Real usage accounting (wave 1)
// ---------------------------------------------------------------------------

export interface UsageTotals {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  /** Computed from the model price table at the time of the call */
  costUsd: number;
  calls: number;
}

// ---------------------------------------------------------------------------
// Sample assessments (wave 2)
// ---------------------------------------------------------------------------

export interface SampleAssessment {
  id: string; // "data-mining-churn"
  industry: string; // "Lending"
  organisation: string; // "Bayfront Regional Bank"
  title: string; // "Audit our loan-default classifier"
  /** One sentence for the samples panel */
  summary: string;
  /** Metadata only: the real MDC course this assessment is used in */
  course: { code: string; title: string; program: string };
  /** Files served from /samples/<id>/… and parsed by the real ingest path */
  files: { name: string; kind: SourceKind; path: string }[];
  /** The employer challenge that this assessment is built from */
  challenge: Omit<EmployerChallenge, "id" | "partnerId" | "contributedAt" | "status" | "blueprintIds">;
  partner: Omit<EmployerPartner, "id" | "adoptedEvidenceRecords" | "adoptedAt" | "addedAt">;
  skills: SkillTag[];
  /** Real extraction output recorded with a live key; used when no key is present */
  preExtracted?: { blueprint: BlueprintDraft; model: ModelId; recordedAt: string } | null;
}

// ---------------------------------------------------------------------------
// Wave 7: issued credentials (Open Badges 3.0 / W3C VC 2.0)
// ---------------------------------------------------------------------------

/** JSON documents are kept loosely typed here; the shapes are built in src/lib/badges. */
export type JsonDoc = Record<string, unknown>;

export interface IssuedCredential {
  /** "CR-2026-0001" */
  id: string;
  recordId: string;
  learnerId: string;
  issuedAt: string;
  issuedBy: string; // "Miami Dade College"
  /** OB3 AchievementCredential, signed */
  achievementCredential: JsonDoc;
  /** One OB3 EndorsementCredential per qualifying employer endorsement, signed */
  endorsementCredentials: JsonDoc[];
  /** VerifiablePresentation-shaped wrapper holding all of the above */
  bundle: JsonDoc;
  /** Compact JWS over the achievement credential's canonical JSON (proof-less) */
  signature: string;
  signedWithKid: string;
  revokedAt: string | null;
  revocationReason?: string;
}
