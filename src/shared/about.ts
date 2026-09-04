/**
 * Content for the About page. Kept as data so wording is reviewed in one place.
 */

export const PAPER = {
  title:
    "VARIA: Benchmarking Frontier LLMs on Construct-Equivalent Assessment Variant Generation",
  author: "Dr. Ernesto Lee",
  affiliation: "Miami Dade College",
  email: "elee@mdc.edu",
  venue: "EdArXiv preprint",
  year: 2026,
  url: "https://osf.io/preprints/edarxiv/u6xef_v1",
  localFile: "varia_paper_v1.pdf",
  abstractPlain:
    "If we are going to let AI write personalized versions of tests for every student, those versions have to be more than surface paraphrase — they have to look genuinely different on the outside while still measuring the same underlying skill on the inside. This paper asks whether today's frontier AI models can actually do that, and offers a way to measure it.",
  keyFindings: [
    "Frontier prompting strategies cluster tightly on the composite integrity score (J between 0.81 and 0.88), while small open models and GPT-2 collapse to 0.50–0.55.",
    "No single strategy wins all four properties. Structured chain-of-thought and zero-shot maximise construct equivalence; dimension-preserving and few-shot maximise surface diversity, at a cost in readability parity.",
    "The recommended production protocol depends on the threat the assessment is protecting against: construct fidelity for high-stakes credentialling, surface separation for large-enrolment formative work.",
  ],
};

export const APP_SUMMARY =
  "VARIA is the working product behind the paper. An instructor uploads the assignment they already give; the system extracts a blueprint (the competency, the rubric and the model answer), generates a different-looking version for every student, and refuses to release the set until it passes the paper's four integrity checks. Oversight roles see the same numbers aggregated across an institution.";

export const GRANT = {
  name: "AI Assessment Grant",
  initiative:
    "Building a Foundation for Dynamic, Career-Connected Assessments in the Age of AI",
  summary:
    "VARIA is developed at Miami Dade College under the AI Assessment Grant, an 18-month national initiative that began in March 2026 titled \"Building a Foundation for Dynamic, Career-Connected Assessments in the Age of AI.\" The initiative brings together a consortium led by Western Governors University (WGU) with Harvard, MIT, Axim Collaborative and several broad-access colleges; Miami Dade College participates as a partner institution. It addresses a growing problem in higher education: traditional assessments tend to measure recall rather than authentic skill application, and advances in AI have made conventional testing less effective. The project develops and pilots AI-enhanced, career-connected assessments that evaluate how well students apply knowledge in realistic workplace contexts. Faculty teams at participating institutions co-design and test assessment models in courses that already have strong employer connections, working directly with workforce partners so that assessments reflect real-world competencies. WGU and its partners embed successful approaches into open, interoperable tools and share the frameworks, templates, demonstrations and design principles for other institutions to adopt. Expected outcomes include stronger student engagement, persistence and completion; better workforce readiness and job-placement outcomes; and greater employer confidence that academic credentials reflect job-relevant skills. Miami Dade College's proposal was approved for funding and entered the cohort implementation phase with Dr. Ernesto Lee as lead faculty member, supported by the Office of Innovation and Technology Partnerships and CIOL.",
  facts: [
    { label: "Initiative", value: "Building a Foundation for Dynamic, Career-Connected Assessments in the Age of AI" },
    { label: "Duration", value: "18 months, from March 2026" },
    { label: "Consortium", value: "Western Governors University (lead), Harvard, MIT, Axim Collaborative, and broad-access colleges" },
    { label: "Miami Dade College role", value: "Partner institution; proposal approved for funding and in cohort implementation" },
    { label: "Lead faculty", value: "Dr. Ernesto Lee" },
    { label: "Institutional support", value: "Office of Innovation and Technology Partnerships; CIOL" },
    { label: "What partners contribute", value: "Faculty innovators, courses with employer connections, workforce partners, and assessment prototypes" },
  ],
};

export const CITATION =
  "Lee, E. (2026). VARIA: Benchmarking Frontier LLMs on Construct-Equivalent Assessment Variant Generation. EdArXiv. https://osf.io/preprints/edarxiv/u6xef_v1";

/** How VARIA fits the Axim cohort's framing. Shown on the About page. */
export const FIT = {
  heading: "How VARIA fits",
  lede:
    "VARIA is not just one more authentic assessment. It is the trust layer the cohort's own framing requires and nobody else in the cohort is likely to bring.",
  points: [
    {
      title: "Application over recall.",
      body: "Every VARIA blueprint is a performance task with an analytic rubric. There is no recall item type in the system.",
    },
    {
      title: "How over what.",
      body: "Rubric criteria score process (evidence, prioritisation, reasoning under shift), and each student's adapted model answer lets faculty grade the reasoning path, not a fixed key.",
    },
    {
      title: "Employer-valued.",
      body: "The surface dimensions (domain, stakeholder, scenario) are exactly where employer partners plug in. An employer contributes real scenarios and stakeholder roles, and every student gets a workplace-shaped task.",
    },
    {
      title: "Evidence all parties can trust.",
      body: "The four integrity checks and the compliance console are the mechanism. If assessments become personalised and AI-generated, every partner will be asked \"how do you know two students got an equivalent task?\" VARIA is the only answer in the room with a benchmark behind it.",
    },
    {
      title: "Portable signal.",
      body: "A released variant set plus its integrity report is a defensible artifact: the task, the rubric, the score, and the equivalence evidence travel together.",
    },
  ],
};

/** Credit to the people and organisations behind the grant. */
export const ACKNOWLEDGEMENTS = {
  heading: "With thanks",
  body:
    "VARIA is developed with the support of the AI Assessment Grant and the partners who make the cohort possible.",
  credits: [
    {
      name: "Axim Collaborative",
      role: "Convenes and supports the \"Dynamic Assessments in the Age of AI\" cohort: the partner journey, learning sessions, outcomes framework, and the shared blueprint.",
    },
    {
      name: "Western Governors University (WGU)",
      role: "Leads the consortium and anchors the outcomes framework; embeds successful approaches into open, interoperable tools.",
    },
    {
      name: "Harvard, MIT, and the broad-access college partners",
      role: "Consortium members co-designing and piloting career-connected assessments alongside their employer partners.",
    },
    {
      name: "Miami Dade College",
      role: "Partner institution. Institutional support from the Office of Innovation and Technology Partnerships and CIOL.",
    },
    {
      name: "Employer partners",
      role: "Supply the real scenarios, stakeholder roles, and competencies that every student's version is built from, and validate that the rubric reflects what they hire for.",
    },
  ],
};

/** Honest gaps to name before someone else does. Shown on the About page. */
export const GAPS = {
  heading: "Honest gaps to name before someone else does",
  items: [
    "No employer-facing role or validation workflow yet. Employer validation happens outside the tool today.",
    "No learner-facing delivery. Students receive tasks through Canvas, not VARIA. Canvas integration is a disabled button.",
    "Rubric stability (P3) is a proxy. The full protocol is pre-registered, not built.",
    "Outcomes instrumentation (engagement, time on task, persistence) is not collected by the app.",
    "Live generation at class scale has been tested in demo mode only.",
  ],
};
