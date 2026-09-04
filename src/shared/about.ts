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
