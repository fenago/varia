/**
 * Who VARIA is for, written from each audience's side of the screen.
 * One promise, what you get, what it costs you, one action.
 */

export type AudienceKey = "students" | "instructors" | "institutions" | "employers";

export interface AudienceContent {
  key: AudienceKey;
  /** "For students" */
  label: string;
  /** The one-line promise */
  promise: string;
  /** Two sentences of plain explanation */
  lede: string;
  /** What you get: title + one or two sentences, and where to see it live */
  gets: { title: string; body: string; see?: { label: string; to: string } }[];
  /** What it costs you */
  costs: string;
  /** The single action */
  action: { label: string; to: string };
  /** The screen that proves it */
  proof: { label: string; to: string };
  /** A sentence in the audience's own voice, for the card */
  quote: string;
}

export const AUDIENCES: AudienceContent[] = [
  {
    key: "students",
    label: "For students",
    promise: "Your work counts, and it travels.",
    lede:
      "You get a version of the assignment that nobody else has, built from a real employer's problem. When you finish, you hold a verified work sample that you control and an employer can check in seconds.",
    gets: [
      {
        title: "A task that is yours",
        body: "No two students receive the same version, so your work is judged on its own. There is nothing to copy and nothing to be accused of.",
        see: { label: "See a student's version", to: "/grade/v-04" },
      },
      {
        title: "A model answer written for your scenario",
        body: "The expert answer is rewritten into your situation, not a generic key. You learn from what a strong answer to your task looks like.",
        see: { label: "Open an adapted model answer", to: "/grade/v-04" },
      },
      {
        title: "Fair by measurement, not by promise",
        body: "Every version is checked for equal reading difficulty before release. If yours was harder, the numbers show it and the appeal is decided on them.",
        see: { label: "See the four checks", to: "/report" },
      },
      {
        title: "Real work for a real stakeholder",
        body: "The scenario comes from an employer partner. You are doing a slice of their job, for the person who would actually read it.",
        see: { label: "See the employer challenges", to: "/employer" },
      },
      {
        title: "A portfolio you own",
        body: "Each graded task becomes a work sample with your skills, your result, and a signature. You choose which employers see which samples. They verify it; they do not take your word for it.",
        see: { label: "Open a portfolio", to: "/portfolio" },
      },
    ],
    costs: "Nothing extra. You do the assignment you were going to do.",
    action: { label: "Open a student portfolio", to: "/portfolio" },
    proof: { label: "See a verified work sample", to: "/evidence/v-04" },
    quote: "I did the audit for a bank's risk officer, and the bank could see it.",
  },
  {
    key: "instructors",
    label: "For instructors",
    promise: "Keep your assignment. Lose the proctoring.",
    lede:
      "Upload the assignment sheet and rubric you already use. VARIA writes a different version for every student, checks that the versions measure the same skill at the same difficulty, and refuses to release the set if they drift.",
    gets: [
      {
        title: "Nothing to rewrite",
        body: "Word, PDF, or pasted text. The system pulls out the competency, the rubric criteria, and your model answer, and shows you what it found before anything is generated.",
        see: { label: "Try Import", to: "/import" },
      },
      {
        title: "One rubric grades every version",
        body: "The rubric is the thing held constant. Each student's version comes with its own adapted model answer so you compare against the right reference.",
        see: { label: "Grade a submission", to: "/grade/v-07" },
      },
      {
        title: "Identical submissions become findings",
        body: "Because no two students got the same task, matching answers are evidence rather than coincidence. No lockdown browser, no webcam.",
        see: { label: "See the roster", to: "/roster" },
      },
      {
        title: "Appeals with numbers",
        body: "A student who claims an unfair version gets a documented answer: their reading ease against the set mean, on the record.",
        see: { label: "See an appeal on the roster", to: "/roster" },
      },
      {
        title: "Employer scenarios without employer meetings",
        body: "Partners contribute a problem brief once. Every future term draws scenarios from it, already validated against your rubric.",
        see: { label: "See the scenario bank", to: "/blueprint" },
      },
    ],
    costs: "About fifteen minutes the first time: two to upload, five to confirm, four unattended while it generates, three to read the report.",
    action: { label: "Load an assessment", to: "/import" },
    proof: { label: "See a finished integrity report", to: "/report" },
    quote: "Thirty-four versions, one rubric, and I never wrote a second prompt.",
  },
  {
    key: "institutions",
    label: "For institutions",
    promise: "Integrity you can audit, without surveillance.",
    lede:
      "Variation replaces monitoring. Every released set carries four measured checks, every release over a threshold carries a recorded reason, and the numbers the assessment office, accreditors, and the grant ask for come out of the same console.",
    gets: [
      {
        title: "No proctoring, no lockdown browsers",
        body: "The task design makes sharing answers unproductive. There is nothing to monitor and nothing to store about student behaviour.",
        see: { label: "See a released set", to: "/report" },
      },
      {
        title: "Thresholds the assessment office owns",
        body: "Diversity, equivalence, and difficulty parity limits are set once, versioned, and applied to every course. Changing one never silently re-clears released work.",
        see: { label: "See the thresholds", to: "/console" },
      },
      {
        title: "An audit trail for every release",
        body: "Which sets cleared, which were released over threshold and why, which await sign-off. Reviewable by anyone with the console.",
        see: { label: "See the audit trail", to: "/console" },
      },
      {
        title: "Student data stays in the browser",
        body: "No server of ours holds rosters, submissions, or keys. Faculty use their own AI key. Evidence records leave only when a student shares them.",
        see: { label: "See how the key works", to: "/settings" },
      },
      {
        title: "Shared assets and reportable outcomes",
        body: "Blueprints are portable files any department or institution can adopt. Employer validation rates, adoption, satisfaction, and hires are computed, not compiled.",
        see: { label: "See employer outcomes", to: "/employer" },
      },
    ],
    costs: "A static website and a one-page threshold policy. No integration project.",
    action: { label: "Open the compliance console", to: "/console" },
    proof: { label: "See employer outcomes", to: "/employer" },
    quote: "Sixty-three sets in use, and we can say why every one of them was released.",
  },
  {
    key: "employers",
    label: "For employers",
    promise: "Hire from work samples, on your problems.",
    lede:
      "Give us one real problem from your organisation. Every student does their own version of it, graded on a rubric you validated. You then see candidates who have already done a piece of your work, verify the sample in seconds, and tell us who you interviewed and hired.",
    gets: [
      {
        title: "One challenge, a whole cohort",
        body: "Describe the problem the way you would brief a new hire. VARIA turns it into a different version per student while keeping what you care about constant.",
        see: { label: "See a challenge brief", to: "/employer" },
      },
      {
        title: "Validate once, inherit everywhere",
        body: "Review the rubric and the scenario bank in about twenty minutes. Every version, this term and next, carries your validation.",
        see: { label: "Open the review page", to: "/review" },
      },
      {
        title: "Candidates who did your work",
        body: "The talent view shows learners who completed your challenge type and chose to share, with skills, results, and the sample itself.",
        see: { label: "Open the talent view", to: "/talent" },
      },
      {
        title: "Verify in seconds, not by phone",
        body: "Each work sample is signed and has a verify link. The page recomputes the proof and never shows you more than the student chose to share.",
        see: { label: "Verify a record", to: "/verify/VR-2026-0001" },
      },
      {
        title: "Endorse, then tell us what happened",
        body: "Score a sample against your own bar. Log interview, offer, hire, and how fast the hire ramped. That is the evidence the credential is worth something.",
        see: { label: "Endorse in the talent view", to: "/talent" },
      },
    ],
    costs: "One brief and one twenty-minute review per assessment. Endorsing a sample takes ten minutes.",
    action: { label: "Open the talent view", to: "/talent" },
    proof: { label: "See a validated blueprint", to: "/employer" },
    quote: "The first thing we saw from the candidate was our own audit, done properly.",
  },
];

export const AUDIENCE_OVERVIEW = {
  kicker: "Who VARIA is for",
  title: "Four people, one artifact",
  lede:
    "A student does real work on an employer's problem. An instructor grades it with one rubric. An institution can prove the set was fair. An employer can verify the result and hire from it. Each of them gets something specific.",
  pipeline: [
    { step: "Challenge", who: "Employer", what: "contributes a real problem brief" },
    { step: "Version", who: "Instructor", what: "releases one equivalent version per student" },
    { step: "Work sample", who: "Student", what: "does the work, gets a verified record" },
    { step: "Portfolio", who: "Student", what: "chooses which employers see which samples" },
    { step: "Talent view", who: "Employer", what: "verifies, endorses, interviews" },
    { step: "Outcome", who: "Everyone", what: "hires and ramp time are logged where they happen" },
  ],
};
