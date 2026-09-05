/**
 * Home page content: the value of VARIA, demonstrated rather than listed.
 * The path panels are filled from live workspace data by the page; the text
 * here is the framing and the fallbacks.
 */

export const NORTH_STAR = {
  kicker: "The North Star",
  cohort:
    "Learners demonstrate their capabilities, not just what they can produce, through how they think, adapt, and iterate via project-based work that is employer-valued and validated, resulting in a portable body of evidence that all parties can trust.",
  cohortSource: "Axim Collaborative cohort statement, September 2026",
  varia:
    "Every student does real work on an employer's problem, and leaves with proof an employer can verify.",
  sub:
    "VARIA is how a college can say that and mean it. One employer problem becomes a different version for every student. One rubric grades them all. Four measured checks prove the versions were fair. The result is a signed work sample the student controls and an employer can check in seconds.",
};

export const PATH_STEPS: {
  key: "challenge" | "version" | "integrity" | "result" | "endorsement" | "outcome";
  who: string;
  title: string;
  fallback: string;
  link: string;
  linkLabel: string;
}[] = [
  {
    key: "challenge",
    who: "An employer in our community",
    title: "brings a real problem",
    fallback: "Not yet: no employer challenge is loaded in this workspace.",
    link: "/employer",
    linkLabel: "The challenge",
  },
  {
    key: "version",
    who: "A student",
    title: "gets a version that is theirs",
    fallback: "Not yet: no recorded version is loaded.",
    link: "/grade/v-04",
    linkLabel: "The task",
  },
  {
    key: "integrity",
    who: "The instructor",
    title: "releases a set that measured fair",
    fallback: "Not yet: no recorded run is loaded.",
    link: "/report",
    linkLabel: "The integrity report",
  },
  {
    key: "result",
    who: "One rubric",
    title: "grades the work",
    fallback: "Not yet: no submission has been graded on this version.",
    link: "/evidence/v-04",
    linkLabel: "The work sample",
  },
  {
    key: "endorsement",
    who: "The employer",
    title: "verifies and endorses it",
    fallback: "Not yet: no employer has verified or endorsed this work sample.",
    link: "/talent",
    linkLabel: "The talent view",
  },
  {
    key: "outcome",
    who: "The student",
    title: "gets the interview, then the offer",
    fallback: "Not yet: no interview or offer has been logged against this record.",
    link: "/portfolio",
    linkLabel: "The portfolio",
  },
];

export const BOTTOM_LINE = {
  students: {
    kicker: "For students: employment",
    headline: "Leave with proof, not a promise.",
    body:
      "A verified work sample on an employer's own problem, endorsed by that employer, in your portfolio before you graduate. You choose who sees it. They verify it; they do not take your word for it.",
    action: { label: "See a student portfolio", to: "/portfolio" },
  },
  employers: {
    kicker: "For employers in our community",
    headline: "Hire from work, not transcripts.",
    body:
      "Contribute one problem the way you would brief a new hire. A whole cohort does their own version of it. You see the candidates who chose to share, read the work, verify the record in seconds, and tell us who you interviewed and hired.",
    action: { label: "Open the talent view", to: "/talent" },
  },
};

/** Before → after, in the cohort's own framing. */
export const SHIFTS: {
  audience: "students" | "instructors" | "institutions" | "employers";
  label: string;
  shifts: { from: string; to: string }[];
  to: string;
}[] = [
  {
    audience: "students",
    label: "Students",
    shifts: [
      { from: "Grade chasing", to: "Agency: a task nobody else has" },
      { from: "Recall", to: "Real work for a real stakeholder" },
      { from: "A static score", to: "A trajectory across courses" },
      { from: "Proxies", to: "Portable, verified evidence" },
    ],
    to: "/for/students",
  },
  {
    audience: "instructors",
    label: "Instructors",
    shifts: [
      { from: "Proctoring", to: "Variation that makes copying useless" },
      { from: "A prompt per student", to: "One assignment, one rubric" },
      { from: "Suspicion", to: "Identical answers as findings" },
      { from: "Arguments about fairness", to: "Appeals decided on numbers" },
    ],
    to: "/for/instructors",
  },
  {
    audience: "institutions",
    label: "Institutions",
    shifts: [
      { from: "Surveillance", to: "Measured integrity, on the record" },
      { from: "Spreadsheets at reporting time", to: "A console that computes it" },
      { from: "Student data on vendors' servers", to: "Nothing leaves the browser" },
      { from: "One-off assessments", to: "Blueprints any department can adopt" },
    ],
    to: "/for/institutions",
  },
  {
    audience: "employers",
    label: "Employers",
    shifts: [
      { from: "Transcripts", to: "Work samples on your problems" },
      { from: "Trust us", to: "Verify it yourself" },
      { from: "Feedback nobody uses", to: "Validate once, inherited everywhere" },
      { from: "Cold applicants", to: "Candidates who already did your work" },
    ],
    to: "/for/employers",
  },
];

export const TRUST = {
  kicker: "Why an employer can trust it",
  body:
    "The versions are not paraphrases. A published benchmark measured whether frontier models can write versions that look different on the surface and measure the same skill underneath, and found that they can, with the right prompting, and that smaller models cannot. Every set released here passes the same four checks the benchmark defines.",
  link: { label: "Read the paper", to: "/about" },
};
