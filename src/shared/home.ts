/**
 * Home page content: an executive summary for a college administrator.
 * Live numbers and the student-path panels are filled from workspace data
 * by the page; the text here is the framing and the fallbacks.
 */

export const EXEC = {
  kicker: "Executive summary · Miami Dade College · AI Assessment Grant",
  headline: "Assessment integrity without surveillance, and a path from coursework to a job offer.",
  summary:
    "VARIA takes the assignment a professor already gives, builds a different version of it for every student from a real employer's problem, and proves the versions were fair before they are released. Students leave each course with a signed work sample they control. Employers validate the rubric once, read the work, and tell us who they hired. The college gets the integrity of proctoring with none of the monitoring, and outcome numbers it can report.",
  northStar:
    "Every student does real work on an employer's problem, and leaves with proof an employer can verify.",
  cohort:
    "Learners demonstrate their capabilities, not just what they can produce, through how they think, adapt, and iterate via project-based work that is employer-valued and validated, resulting in a portable body of evidence that all parties can trust.",
  cohortSource: "Axim Collaborative cohort statement, September 2026",
};

/** At-a-glance tiles. Values are filled live; these are labels and fallbacks. */
export const GLANCE: { key: "sets" | "cleared" | "validated" | "completed" | "hires"; label: string; sub: string; fallback: string }[] = [
  { key: "sets", label: "Variant sets in use", sub: "across courses and departments", fallback: "63" },
  { key: "cleared", label: "Cleared all four checks", sub: "of released sets", fallback: "86%" },
  { key: "validated", label: "Blueprints validated by employers", sub: "goal 75%", fallback: "67%" },
  { key: "completed", label: "Students who did employer work", sub: "on a real problem brief", fallback: "11" },
];

export const SITUATION = {
  heading: "Why now",
  items: [
    {
      title: "AI made recall-based assessment unreliable almost overnight.",
      body: "Any fixed prompt can be answered by a phone in the room. Detection tools are wrong often enough to be unusable in a grade dispute.",
    },
    {
      title: "Proctoring escalates intrusion and cost without solving it.",
      body: "Lockdown browsers and webcams monitor behaviour, generate complaints, and still cannot tell whose work it was. They also produce nothing an employer can use.",
    },
    {
      title: "Employers do not trust transcripts to signal job-relevant skill.",
      body: "A grade in a course says little about whether a graduate can audit a model, write for an executive, or weigh a risk. Employers want to see the work.",
    },
  ],
};

export const APPROACH = {
  heading: "What VARIA does",
  lede: "Three moves, all measured.",
  moves: [
    {
      n: "1",
      verb: "Vary",
      title: "One employer problem becomes a version per student.",
      body: "An employer partner writes the brief the way they would for a new hire. The instructor uploads the assignment and rubric they already use. Each student receives a version with a different organisation, stakeholder and scenario, and the same skill underneath.",
      why: "Copying is useless without anyone being watched.",
    },
    {
      n: "2",
      verb: "Verify",
      title: "Four checks gate every release.",
      body: "Do the versions look different? Do they measure the same skill? Does one rubric still fit? Are they equally hard to read? Each check is a number against a threshold the assessment office sets. A set that fails does not go out.",
      why: "Fairness is on the record before a student ever sees the task.",
    },
    {
      n: "3",
      verb: "Validate",
      title: "Employers sign the rubric once, then hire from the work.",
      body: "A partner validates the rubric and scenario bank in twenty minutes; every version inherits it. Graded work becomes a signed sample the student can share. Employers read it, endorse it, and log interviews and hires where they happen.",
      why: "The credential carries proof an employer can check, not a promise.",
    },
  ],
};

export const COLLEGE_GETS = {
  heading: "What the college gets",
  items: [
    { title: "Integrity without surveillance", body: "No lockdown browsers, no webcams, no behaviour data. Variation replaces monitoring.", to: "/report", link: "A released set" },
    { title: "Nothing to host, nothing to breach", body: "A static site. Rosters, submissions and AI keys stay in the faculty member's browser. Records leave only when a student shares them.", to: "/settings", link: "How the key works" },
    { title: "Thresholds and an audit trail the assessment office owns", body: "Every release is logged. Releasing over a threshold needs a reason. Changing a threshold never silently re-clears old work.", to: "/console", link: "Compliance console" },
    { title: "Numbers for accreditation and the grant", body: "Sets cleared, employer validation rate, adoption, satisfaction, endorsements and hires are computed by the system, not compiled at reporting time.", to: "/employer", link: "Employer outcomes" },
    { title: "Assets any department can adopt", body: "A blueprint is a file: competency, rubric, model answer, scenario bank, employer validation. Another course or college imports it and runs.", to: "/blueprint", link: "A blueprint" },
    { title: "Employer relationships that produce hires", body: "Partners contribute one problem and get a cohort of candidates who already did their work. Interviews and offers are logged against the record.", to: "/talent", link: "Talent view" },
  ],
};

export const PATH_STEPS: {
  key: "challenge" | "version" | "integrity" | "result" | "endorsement" | "outcome";
  who: string;
  title: string;
  fallback: string;
  link: string;
  linkLabel: string;
}[] = [
  { key: "challenge", who: "An employer in our community", title: "brings a real problem", fallback: "A regional bank deployed a loan-default classifier in March and has a complaint from the underwriting team. It wants a structured audit with prioritised recommendations.", link: "/employer", linkLabel: "The challenge" },
  { key: "version", who: "A student", title: "gets a version that is theirs", fallback: "A regional bank deployed a loan-default classifier in March. You are auditing for the risk officer, who has the partial card and a complaint from the underwriting team…", link: "/grade/v-04", linkLabel: "The task" },
  { key: "integrity", who: "The instructor", title: "releases a set that measured fair", fallback: "34 versions. Versions look different: pass. Same skill measured: pass. Equally hard to read: checked.", link: "/report", linkLabel: "The integrity report" },
  { key: "result", who: "One rubric", title: "grades the work", fallback: "10 / 12. Fairness analysis, robustness evaluation, documentation review, risk prioritisation.", link: "/evidence/v-04", linkLabel: "The work sample" },
  { key: "endorsement", who: "The employer", title: "verifies and endorses it", fallback: "Bayfront Regional Bank: meets our bar, 4 of 5. Signature verified.", link: "/talent", linkLabel: "The talent view" },
  { key: "outcome", who: "The student", title: "gets the interview, then the offer", fallback: "Interviewed 3 September. Offered 4 September. Logged by the employer where it happened.", link: "/portfolio", linkLabel: "The portfolio" },
];

export const BOTTOM_LINE = {
  students: {
    kicker: "For students: employment",
    headline: "Leave with proof, not a promise.",
    body: "A verified work sample on an employer's own problem, endorsed by that employer, in your portfolio before you graduate. You choose who sees it. They verify it; they do not take your word for it.",
    action: { label: "See a student portfolio", to: "/portfolio" },
  },
  employers: {
    kicker: "For employers in our community",
    headline: "Hire from work, not transcripts.",
    body: "Contribute one problem the way you would brief a new hire. A whole cohort does their own version of it. You see the candidates who chose to share, read the work, verify the record in seconds, and tell us who you interviewed and hired.",
    action: { label: "Open the talent view", to: "/talent" },
  },
};

/** Before → after, in the cohort's own framing. */
export const SHIFTS: { audience: "students" | "instructors" | "institutions" | "employers"; label: string; shifts: { from: string; to: string }[]; to: string }[] = [
  { audience: "students", label: "Students", to: "/for/students", shifts: [
    { from: "Grade chasing", to: "Agency: a task nobody else has" },
    { from: "Recall", to: "Real work for a real stakeholder" },
    { from: "A static score", to: "A trajectory across courses" },
    { from: "Proxies", to: "Portable, verified evidence" },
  ] },
  { audience: "instructors", label: "Instructors", to: "/for/instructors", shifts: [
    { from: "Proctoring", to: "Variation that makes copying useless" },
    { from: "Thirty-four prompts", to: "One assignment, one rubric" },
    { from: "Suspicion", to: "Identical answers as findings" },
    { from: "Arguments about fairness", to: "Appeals decided on numbers" },
  ] },
  { audience: "institutions", label: "Institutions", to: "/for/institutions", shifts: [
    { from: "Surveillance", to: "Measured integrity, on the record" },
    { from: "Spreadsheets at reporting time", to: "A console that computes it" },
    { from: "Student data on vendors' servers", to: "Nothing leaves the browser" },
    { from: "One-off assessments", to: "Blueprints any department can adopt" },
  ] },
  { audience: "employers", label: "Employers", to: "/for/employers", shifts: [
    { from: "Transcripts", to: "Work samples on your problems" },
    { from: "Trust us", to: "Verify it yourself" },
    { from: "Feedback nobody uses", to: "Validate once, inherited everywhere" },
    { from: "Cold applicants", to: "Candidates who already did your work" },
  ] },
];

export const EVIDENCE = {
  heading: "The evidence behind it",
  body:
    "The versions are not paraphrases. A published benchmark measured whether frontier AI models can write versions that look different on the surface and measure the same skill underneath. Across 600 generated variants, frontier models with the right prompting scored between 0.81 and 0.88 on the composite integrity score; small open models scored 0.50 to 0.55. Every set released here passes the same four checks that benchmark defines.",
  stats: [
    { value: "600", label: "variants in the pilot" },
    { value: "0.81–0.88", label: "frontier integrity band" },
    { value: "0.50–0.55", label: "non-frontier models" },
    { value: "4", label: "checks on every release" },
  ],
  link: { label: "Read the paper", to: "/about" },
};

export const LIMITS = {
  heading: "What it is not, and what is still ahead",
  items: [
    "Not proctoring. Nothing monitors the student; the task design does the work.",
    "Not a database. Records live in the browser until a student shares them. A durable, institution-held record store is the next structural step.",
    "The rubric-stability check is a proxy today; the full protocol is pre-registered in the paper.",
    "Employer signing uses a demonstration key; a production deployment signs with a college-held key and verifies at a public endpoint.",
  ],
};

export const NEXT_STEPS = {
  heading: "What an administrator can do this term",
  steps: [
    { title: "Pilot one course.", body: "An instructor loads an existing assignment and releases a set in about fifteen minutes. No IT project.", to: "/start", link: "How to run it" },
    { title: "Set the thresholds.", body: "The assessment office records the diversity, equivalence and difficulty limits once. Every course inherits them.", to: "/console", link: "Compliance console" },
    { title: "Invite two employer partners.", body: "Each contributes one problem brief and validates one rubric. Their candidates start appearing in the talent view the same term.", to: "/employer", link: "Employer validation" },
  ],
  grant:
    "Developed at Miami Dade College under the AI Assessment Grant, an 18-month national initiative led by Western Governors University with Harvard, MIT, Axim Collaborative and broad-access colleges. Dr. Ernesto Lee, lead faculty.",
};
