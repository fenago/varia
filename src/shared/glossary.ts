/**
 * Plain-language glossary. Every term an instructor meets in the app, explained
 * in two sentences a dean would understand, with the paper's term or number
 * behind it. Consumed by <Info>, <Term>, <StepIntro> and the Glossary page.
 */

export interface GlossaryEntry {
  /** Display name */
  term: string;
  /** Two sentences, plain words, no symbols */
  plain: string;
  /** Optional detail for readers who want it */
  more?: string;
  /** The paper's term, formula or number, if any */
  paper?: string;
  /** Group on the Glossary page */
  group: GlossaryGroup;
}

export type GlossaryGroup =
  | "The assessment"
  | "Making versions"
  | "The four checks"
  | "Releasing and grading"
  | "Employers and credentials";

export const GLOSSARY_GROUPS: GlossaryGroup[] = [
  "The assessment",
  "Making versions",
  "The four checks",
  "Releasing and grading",
  "Employers and credentials",
];

const A: GlossaryGroup = "The assessment";
const M: GlossaryGroup = "Making versions";
const C: GlossaryGroup = "The four checks";
const R: GlossaryGroup = "Releasing and grading";
const E: GlossaryGroup = "Employers and credentials";

export const GLOSSARY: Record<string, GlossaryEntry> = {
  // ---------------------------------------------------------------- The assessment
  assessment: {
    term: "Assessment",
    plain: "The assignment, project or exam you give students. In VARIA it starts as the file you already have and becomes a set of different-looking versions of the same task.",
    group: A,
  },
  blueprint: {
    term: "Blueprint",
    plain: "The three things every version is built from: the skill being measured, the rubric you grade with, and your model answer. Once the blueprint is right, the versions inherit it.",
    paper: "The paper calls this B = (construct, rubric, canonical solution).",
    group: A,
  },
  construct: {
    term: "Skill being measured",
    plain: "One sentence naming what the task is really testing, for example \"audit a deployed classifier for fairness and documentation gaps.\" It is the one thing that must stay identical across every student's version.",
    paper: "Construct, C.",
    group: A,
  },
  competency: {
    term: "Competency",
    plain: "Another word for the skill being measured. Employers and the grant use \"competency\"; the paper uses \"construct\"; the app says \"skill.\"",
    group: A,
  },
  rubric: {
    term: "Rubric",
    plain: "The grading guide: a few criteria, each scored on levels from 0 to 3. VARIA never changes your rubric; it is the thing held constant while the scenarios change.",
    paper: "Analytic rubric R with k criteria on four levels.",
    group: A,
  },
  criterion: {
    term: "Criterion",
    plain: "One row of the rubric, such as \"Identifies fairness gaps with evidence,\" worth a set number of points. Each criterion is scored on the same 0 to 3 scale for every version.",
    group: A,
  },
  anchors: {
    term: "Level descriptions",
    plain: "Short descriptions of what a 0, 1, 2 and 3 look like for one criterion. They keep grading consistent, and the check that every version still measures the same skill is more reliable when they exist.",
    paper: "Rubric anchors.",
    group: A,
  },
  "model-answer": {
    term: "Model answer",
    plain: "Your own expert answer to the original task. Every student version gets a copy rewritten into that student's scenario, so you always grade against the right reference.",
    paper: "Canonical solution, s*.",
    group: A,
  },
  "canonical-solution": {
    term: "Canonical solution",
    plain: "The paper's name for your model answer. It is required because the check on whether one rubric still fits every version works by adapting your answer into each scenario.",
    group: A,
  },
  roster: {
    term: "Roster",
    plain: "The list of students in the section, usually a spreadsheet with a name column. One version is made per student on the roster.",
    group: A,
  },

  // ---------------------------------------------------------------- Making versions
  version: {
    term: "Version",
    plain: "One student's copy of the task: same skill, same rubric, same difficulty, different organisation, stakeholder and scenario on the surface. No two students receive the same version.",
    paper: "Variant, v_i.",
    group: M,
  },
  variant: {
    term: "Variant",
    plain: "The paper's word for a version. The app says \"version\" everywhere an instructor reads it.",
    group: M,
  },
  quantities: {
    term: "Numbers in the assignment",
    plain: "The figures a student has to work with: an accuracy of 0.91, a default rate of 18%, a budget of $12,000. VARIA finds them and asks you which ones may change from student to student and which must stay as written.",
    more: "Each number is either kept, varied within a range you set, or derived from the others by a formula so that it always stays consistent with them.",
    paper: "Controlled variables: numeric parameters of the task, sampled by code rather than written by the model.",
    group: M,
  },
  "vary-numbers": {
    term: "Numbers change per student",
    plain: "When this is on, every version gets its own figures, chosen by code inside the ranges you approved, so students cannot share worked answers. When it is off, every version keeps the original figures.",
    more: "The figures are chosen before the AI writes anything, then checked afterwards to make sure each one appears in the version and its model answer.",
    paper: "Per-run switch over the blueprint's quantity policies.",
    group: M,
  },
  "derived-number": {
    term: "Derived number",
    plain: "A figure that is worked out from the others rather than chosen on its own, such as the gap between two approval rates. Deriving it keeps every version's numbers consistent with each other.",
    more: "You write a small formula over the other numbers' names, for example north_rate - south_rate, and VARIA computes it for every version.",
    paper: "Derived quantity: an arithmetic expression over the sampled quantities.",
    group: M,
  },
  "surface-dimension": {
    term: "What changes between versions",
    plain: "The details that are allowed to differ from student to student: the industry, who the deliverable is for, the situation, and how technical the language is. Reading level and the number of steps are locked so the versions stay equally hard.",
    paper: "Surface dimensions of φ: domain, jargon register, reading level, stakeholder role.",
    group: M,
  },
  domain: {
    term: "Industry",
    plain: "The world a version is set in, such as lending, healthcare or hospitality. Changing it is the easiest way to make two versions look different without changing what they test.",
    group: M,
  },
  stakeholder: {
    term: "Stakeholder",
    plain: "The person in the scenario the student is working for, such as a risk officer or a clinical lead. It shapes the tone and priorities of the deliverable.",
    group: M,
  },
  scenario: {
    term: "Scenario",
    plain: "The specific situation in a version: the organisation, what happened, and what the stakeholder needs. Employer partners can contribute real ones.",
    group: M,
  },
  "jargon-register": {
    term: "Technical vocabulary",
    plain: "How specialised the language is, from plain to expert. It is varied only a little, because heavy jargon also makes a version harder to read.",
    paper: "Jargon register.",
    group: M,
  },
  "reading-level": {
    term: "Reading level",
    plain: "How hard the text is to read, measured by a standard readability score. It is locked across versions so that no student gets a materially harder task.",
    paper: "Flesch reading-ease, part of φ.",
    group: M,
  },
  strategy: {
    term: "Generation strategy",
    plain: "The way the AI is asked to write the versions. The paper tested four; none is best at everything, so the app picks one from what you are protecting against.",
    paper: "θ ∈ {zero-shot, few-shot, structured CoT, dimension-preserving}.",
    group: M,
  },
  "zero-shot": {
    term: "Zero-shot",
    plain: "The AI gets the blueprint and the four rules, with no examples. In the pilot it kept versions measuring the same skill best of all.",
    paper: "θ_ZS: construct equivalence 0.968.",
    group: M,
  },
  "few-shot": {
    term: "Few-shot with examples",
    plain: "The AI sees two good example versions and two bad ones before writing. It produces the most surface variety, at a small cost in keeping the skill identical.",
    paper: "θ_FS: cosine 0.051, equivalence 0.838.",
    group: M,
  },
  "structured-cot": {
    term: "Structured chain-of-thought",
    plain: "The AI first writes down what must stay fixed, what may change and what difficulty to hold, then writes the version and checks its own work. Best for high-stakes work.",
    paper: "θ_SC: equivalence 0.960, reading-difficulty spread 5.5.",
    group: M,
  },
  "dimension-preserving": {
    term: "Dimension-preserving",
    plain: "Each version is assigned its own industry, stakeholder and scenario up front, and the AI is told to hold reading level constant. Most surface variety, some drift in difficulty.",
    paper: "θ_DP: cosine 0.053, reading-difficulty spread 11.3.",
    group: M,
  },
  "threat-profile": {
    term: "What you are protecting against",
    plain: "The one question that picks the strategy: is the risk one student passing off another's work, or answers circulating at scale? High-stakes work favours the same skill and equal difficulty; large classes favour maximum variety.",
    group: M,
  },
  generator: {
    term: "Generator",
    plain: "The AI model that writes the versions and reads your files. Larger models are more faithful to the skill; smaller ones are cheaper.",
    group: M,
  },
  judge: {
    term: "Judge",
    plain: "A second AI model that reads each version and scores whether it still measures the same skill. It is kept the same for a whole run so scores are comparable.",
    paper: "LLM judge, held fixed across conditions.",
    group: M,
  },
  "judge-samples": {
    term: "Judge samples",
    plain: "How many times the judge scores each version. The middle score is kept, which smooths out a single odd reading. The pilot used five.",
    paper: "Five self-consistency samples, median aggregation.",
    group: M,
  },
  "self-consistency": {
    term: "Self-consistency",
    plain: "Asking the judge several times and keeping the middle answer. It is the standard way to make an AI score more stable.",
    group: M,
  },
  preset: {
    term: "Preset",
    plain: "A ready-made choice of generator, judge and judge samples. Pick High-stakes or Formative and the settings follow; change anything by hand and it becomes Custom.",
    group: M,
  },
  "high-stakes": {
    term: "High-stakes preset",
    plain: "The strongest generator with five judge samples, for exams and credentials. About a quarter of a dollar per student.",
    group: M,
  },
  formative: {
    term: "Formative preset",
    plain: "A faster generator with three judge samples, for practice work and large sections. About a third of the high-stakes cost.",
    group: M,
  },
  "actual-cost": {
    term: "Actual cost",
    plain: "What the run really cost, added up from every AI call as it happened. The estimate shown before the run is a guess; this number is not.",
    group: M,
  },
  "recorded-run": {
    term: "Recorded run",
    plain: "A run made earlier with a real key, saved so the app has real results to show without one. Nothing in a recorded run was typed in by hand.",
    group: M,
  },

  // ---------------------------------------------------------------- The four checks
  "four-checks": {
    term: "The four checks",
    plain: "Before any set is released it must pass four tests: the versions look different, they measure the same skill, one rubric still grades them all, and they are equally hard to read. Each is a number against a limit the college sets.",
    paper: "Properties P1 to P4.",
    group: C,
  },
  p1: {
    term: "Versions look different",
    plain: "Two students should not be able to swap answers. The check compares every pair of versions and fails if they share too many words or phrases.",
    paper: "P1, surface diversity: cosine and 4-gram overlap.",
    group: C,
  },
  p2: {
    term: "Same skill measured",
    plain: "Every version must still test what your rubric grades. The judge reads each version and scores it against the skill; a low score means a version quietly drifted to a different task.",
    paper: "P2, construct equivalence, judged on a five-point scale.",
    group: C,
  },
  p3: {
    term: "One rubric grades them all",
    plain: "Your criteria should fit every scenario. This check is advisory for now, because the full test in the paper is planned but not built; spot-check three versions by hand.",
    paper: "P3, rubric stability, measured by a proxy in the pilot.",
    group: C,
  },
  "numbers-check": {
    term: "Figures check",
    plain: "After the versions are written, VARIA looks for every controlled figure in each version and its model answer. A version that lost or changed a figure is named so you can fix it before release.",
    more: "The check also compares how much numeric work each version asks for, so that no student gets a materially harder calculation.",
    paper: "Consistency: every sampled value present in variant and solution; numeric complexity parity.",
    group: C,
  },
  p4: {
    term: "Equally hard to read",
    plain: "No student should get a materially harder task. The check measures how much reading difficulty varies across the set and names the versions that are harder than the rest.",
    paper: "P4, difficulty parity: standard deviation of reading-ease.",
    group: C,
  },
  cosine: {
    term: "Word similarity",
    plain: "A score from 0 to 1 for how much two versions share the same vocabulary, after ignoring the words every version must use. Lower is more different; the limit is 0.15.",
    paper: "Mean pairwise TF-IDF cosine, τdiv.",
    group: C,
  },
  "four-gram": {
    term: "Shared phrases",
    plain: "The share of four-word phrases two versions have in common. It catches versions that were copied and lightly edited; the limit is 0.35 on average.",
    paper: "4-gram Jaccard overlap.",
    group: C,
  },
  "closest-pair": {
    term: "Closest pair",
    plain: "The two versions in the set that are most alike. If they share more than half their phrases, two students effectively got the same task and one of them is regenerated.",
    paper: "The paper's formal P1 is a maximum over pairs.",
    group: C,
  },
  equivalence: {
    term: "Same-skill score",
    plain: "The judge's score, from 0 to 1, for how well a version still measures the skill. The set must average at least 0.90.",
    paper: "Construct equivalence J(v, C), τeq.",
    group: C,
  },
  "rubric-stability": {
    term: "Rubric stability",
    plain: "Whether the same rubric gives consistent results across different scenarios. Measured by a stand-in today, so it advises rather than blocks.",
    paper: "P3 proxy: readability dispersion of the adapted canonical solutions.",
    group: C,
  },
  flesch: {
    term: "Reading ease",
    plain: "A standard readability score where higher means easier to read. College-level professional text usually scores between 30 and 60.",
    paper: "Flesch reading-ease.",
    group: C,
  },
  "sigma-flesch": {
    term: "Spread in reading difficulty",
    plain: "How much reading ease varies across the set. A spread under 8 points means the versions are about equally hard; over it, some students got a harder task.",
    paper: "σ Flesch, τdiff ≤ 8.0.",
    group: C,
  },
  "joint-score": {
    term: "Overall integrity score",
    plain: "One number from 0 to 1 that averages the four checks, useful for comparing runs. It never decides a release; each check must pass on its own.",
    paper: "Joint integrity score J, equal weights; frontier band 0.81 to 0.88.",
    group: C,
  },
  threshold: {
    term: "Limit",
    plain: "The line a check must clear, set once by the college and kept on record. Changing a limit never silently re-clears work that was already released.",
    paper: "Pre-registered thresholds τ.",
    group: C,
  },
  outlier: {
    term: "Flagged version",
    plain: "A version the checks named as the problem, usually because it is harder to read than the rest. Regenerating just those is the normal fix.",
    group: C,
  },

  // ---------------------------------------------------------------- Releasing and grading
  release: {
    term: "Release",
    plain: "Making the versions available to students. The app releases only when the checks pass, or when you record a reason for going ahead anyway.",
    group: R,
  },
  "over-threshold": {
    term: "Released over a limit",
    plain: "Going ahead with a set that failed a check, with a written reason that goes on the college's record. Some colleges block this entirely.",
    group: R,
  },
  regenerate: {
    term: "Regenerate",
    plain: "Ask the AI to rewrite only the flagged versions, then run the checks again. It costs a fraction of a full run.",
    group: R,
  },
  "student-link": {
    term: "Student link",
    plain: "A private link that opens one student's version, with the task and the rubric criteria but nothing else. Copy them from the roster or download all versions as Word files.",
    group: R,
  },
  submission: {
    term: "Submission",
    plain: "A student's completed work, imported as a file or pasted in. Files are matched to students by the name in the filename.",
    group: R,
  },
  "pre-score": {
    term: "Suggested scores",
    plain: "The judge reads a submission against the rubric and suggests a level for each criterion, with a sentence of reasoning. You decide; nothing is saved until you press Save.",
    group: R,
  },
  "ai-sample": {
    term: "AI-written sample",
    plain: "A submission written by a model at a stated quality level, so the app has something to show before real students submit. It is always labelled and never counted as student work.",
    group: R,
  },

  // ---------------------------------------------------------------- Employers and credentials
  "evidence-record": {
    term: "Evidence record",
    plain: "A signed record of one graded task: what the student was asked, what they produced, how it was scored, and proof the set was fair. It is the thing a student can share and an employer can check.",
    group: E,
  },
  "work-sample": {
    term: "Work sample",
    plain: "An evidence record that includes the student's actual submission, with the student's consent. Employers hire from work samples, not scores.",
    group: E,
  },
  "learner-id": {
    term: "Learner ID",
    plain: "A stable code that stands in for the student's name on anything an employer sees. The name appears only where the student chooses to show it.",
    group: E,
  },
  signature: {
    term: "Signature",
    plain: "A digital seal that proves the record has not been altered since the college issued it. The app currently signs with a demonstration key; a real deployment uses a college-held key.",
    group: E,
  },
  hash: {
    term: "Fingerprint",
    plain: "A code computed from the record's contents. Change one character and the fingerprint changes, which is how a verifier knows the record is intact.",
    paper: "SHA-256.",
    group: E,
  },
  verify: {
    term: "Verify",
    plain: "Open a record's link and let the page recompute its fingerprint and check its signature. It takes seconds and shows nothing the student did not choose to share.",
    group: E,
  },
  credential: {
    term: "Credential",
    plain: "A portable badge issued by the college once a record is graded, employer-validated and employer-endorsed. It can be added to a LinkedIn profile or a badge wallet.",
    group: E,
  },
  "open-badges": {
    term: "Open Badges 3.0",
    plain: "The open standard for digital credentials that badge wallets and LinkedIn understand. VARIA credentials are issued in this format.",
    paper: "1EdTech Open Badges 3.0, a W3C Verifiable Credential.",
    group: E,
  },
  endorsement: {
    term: "Endorsement",
    plain: "An employer's own judgement of a shared work sample against their bar. It is stronger than a grade because it comes from the person who would hire.",
    group: E,
  },
  "employer-validation": {
    term: "Employer validation",
    plain: "An employer partner reviews the rubric and the scenario bank once and signs off that they reflect real work. Every version made afterwards inherits that sign-off.",
    group: E,
  },
  challenge: {
    term: "Employer challenge",
    plain: "A real problem an employer writes up the way they would brief a new hire. VARIA turns one challenge into a different version for every student.",
    group: E,
  },
  portfolio: {
    term: "Portfolio",
    plain: "A student's collection of evidence records across courses. The student decides which employers see which records.",
    group: E,
  },
  "talent-view": {
    term: "Talent view",
    plain: "What an employer sees: students who did their kind of work and chose to share it, identified by learner ID. Each row carries the work sample and a verify link.",
    group: E,
  },
};

export function glossaryTerm(slug: string): GlossaryEntry | null {
  return GLOSSARY[slug] ?? null;
}

export function glossarySlugs(): string[] {
  return Object.keys(GLOSSARY);
}

export function glossaryByGroup(): { group: GlossaryGroup; entries: { slug: string; entry: GlossaryEntry }[] }[] {
  return GLOSSARY_GROUPS.map((group) => ({
    group,
    entries: Object.entries(GLOSSARY)
      .filter(([, e]) => e.group === group)
      .map(([slug, entry]) => ({ slug, entry })),
  }));
}
