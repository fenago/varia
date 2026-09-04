/**
 * Thirty-four demo variants of the "Model card audit — deployed classifier"
 * blueprint. Each has a distinct organisation, domain, stakeholder and
 * complaint trigger; the task text and the adapted canonical solution are
 * built from the scenario so every version reads as its own world.
 */

import type { SurfaceAssignment } from "@shared/types";

export type Domain = "healthcare" | "lending" | "hiring" | "logistics";
export type Jargon = "plain" | "professional" | "technical";

export interface SeedScenario {
  /** 0-based index → v-01 … v-34 */
  index: number;
  domain: Domain;
  org: string;
  classifier: string;
  /** "risk officer" — short role for the roster column */
  role: string;
  /** "the risk officer" — as used in prose */
  stakeholder: string;
  trigger: string;
  deployed: string;
  jargon: Jargon;
  /** Model-card facts the audit leans on */
  aggregate: string;
  subgroupGap: string;
  validationGap: string;
  docGap: string;
  priority: string;
  /** Verbatim opening from the mockup, when there is one */
  opening?: string;
}

const S: SeedScenario[] = [
  { index: 0, domain: "healthcare", org: "Bayview Community Health", classifier: "a readmission-risk classifier", role: "quality director", stakeholder: "the quality director", trigger: "a complaint from the discharge planning team about who is being flagged", deployed: "in January", jargon: "professional", aggregate: "an AUROC of 0.84 on the full population", subgroupGap: "any breakdown by insurance type or primary language", validationGap: "a validation set drawn from the same two quarters as training", docGap: "the threshold used to trigger a discharge-planner visit", priority: "the language subgroup gap, because the complaint names it directly" },
  { index: 1, domain: "lending", org: "Harbor Credit Union", classifier: "a small-business loan pre-screening model", role: "chief lending officer", stakeholder: "the chief lending officer", trigger: "a member complaint alleging that businesses in two ZIP codes are routinely screened out", deployed: "last spring", jargon: "plain", aggregate: "an overall approval precision of 0.88", subgroupGap: "approval rates by ZIP code or business age", validationGap: "a holdout from a single pre-rate-rise quarter", docGap: "who can override a screen-out and how often that happens", priority: "the geographic disparity, which is both a fairness and a regulatory exposure" },
  { index: 2, domain: "hiring", org: "Cobalt Retail Group", classifier: "a store-associate application ranker", role: "talent acquisition lead", stakeholder: "the talent acquisition lead", trigger: "an internal note that shortlists from one region skew younger than the applicant pool", deployed: "in February", jargon: "professional", aggregate: "a shortlist hit rate of 0.31", subgroupGap: "shortlist rates by age band or region", validationGap: "validation on one hiring season only", docGap: "the features derived from application timestamps", priority: "the age skew, since it may indicate proxy discrimination through availability fields" },
  { index: 3, domain: "lending", org: "a regional bank", classifier: "a loan-default classifier", role: "risk officer", stakeholder: "the risk officer", trigger: "a complaint from the underwriting team", deployed: "in March", jargon: "professional", aggregate: "aggregate accuracy of 0.91", subgroupGap: "per-subgroup false-positive rates", validationGap: "an evaluation set drawn from the same window as training", docGap: "any statement of out-of-scope uses", priority: "the missing subgroup false-positive rates, which leave the no-disparate-impact claim unsupported", opening: "A regional bank deployed a loan-default classifier in March. You are auditing for the risk officer, who has the partial card and a complaint from the underwriting team" },
  { index: 4, domain: "logistics", org: "Meridian Freight", classifier: "a late-delivery prediction model", role: "network planner", stakeholder: "the network planner", trigger: "an escalation from rural depots that their routes are flagged late far more often", deployed: "over the summer", jargon: "technical", aggregate: "a macro-F1 of 0.77", subgroupGap: "any breakdown by depot type or route density", validationGap: "a validation window that excludes the winter season", docGap: "the definition of a 'late' label", priority: "the rural flagging pattern, because it drives resourcing decisions" },
  { index: 5, domain: "healthcare", org: "Northgate Dental Partners", classifier: "an appointment no-show predictor", role: "practice manager", stakeholder: "the practice manager", trigger: "front-desk staff reporting that overbooking hits one clinic disproportionately", deployed: "in April", jargon: "plain", aggregate: "an accuracy of 0.79", subgroupGap: "no-show prediction rates by clinic or patient age", validationGap: "one clinic's data used for both training and testing", docGap: "how predictions translate into overbooking decisions", priority: "the clinic imbalance, which directly affects patient access" },
  { index: 6, domain: "hiring", org: "Northline Talent Systems", classifier: "a résumé-screening classifier", role: "HR director", stakeholder: "the HR director", trigger: "a complaint from one office about shortlist composition", deployed: "in March", jargon: "professional", aggregate: "an aggregate shortlist rate of 0.34", subgroupGap: "a breakdown by office or applicant group", validationGap: "validation on applications from a single hiring cycle", docGap: "out-of-scope uses such as internal promotions", priority: "the office-level shortlist gap, because the complaint cannot be assessed or dismissed from the card alone", opening: "Northline Talent Systems deployed a résumé-screening classifier across four offices. You are auditing for the HR director, who has the partial card and a complaint about shortlist composition" },
  { index: 7, domain: "logistics", org: "Portside Container Services", classifier: "a customs-inspection risk scorer", role: "compliance manager", stakeholder: "the compliance manager", trigger: "a broker's complaint that shipments from two origin ports are held for inspection at three times the average rate", deployed: "in May", jargon: "technical", aggregate: "a precision of 0.62 at the operating threshold", subgroupGap: "hold rates by origin port or shipper size", validationGap: "a test set that predates a tariff change", docGap: "the retraining cadence and who approves it", priority: "the origin-port disparity, given trade-compliance obligations" },
  { index: 8, domain: "lending", org: "Sunbelt Auto Finance", classifier: "an auto-loan approval model", role: "fair-lending officer", stakeholder: "the fair-lending officer", trigger: "a dealer's report that applicants at one dealership cluster are declined unusually often", deployed: "in January", jargon: "professional", aggregate: "an approval AUROC of 0.86", subgroupGap: "approval rates by dealership or applicant age", validationGap: "no validation on post-deployment applications", docGap: "the adverse-action reason codes the model emits", priority: "the dealership cluster, since it may proxy for a protected class" },
  { index: 9, domain: "healthcare", org: "Riverside Pharmacy Network", classifier: "a prescription-refill adherence classifier", role: "clinical pharmacist", stakeholder: "the clinical pharmacist", trigger: "a nursing escalation about patients on one insurance plan receiving fewer outreach calls", deployed: "in February", jargon: "plain", aggregate: "a sensitivity of 0.81", subgroupGap: "outreach rates by insurer or age", validationGap: "a validation cohort from one region", docGap: "what happens to patients scored below the outreach cut-off", priority: "the insurer gap, because outreach affects medication adherence directly" },
  { index: 10, domain: "healthcare", org: "a hospital network", classifier: "a sepsis-risk classifier", role: "clinical lead", stakeholder: "the clinical lead", trigger: "a nursing escalation", deployed: "in two units", jargon: "technical", aggregate: "a sensitivity of 0.88 at the chosen alert threshold", subgroupGap: "alert rates by unit or patient age band", validationGap: "retrospective validation on the same two units", docGap: "the alert threshold and who may change it", priority: "the unit-level alert disparity flagged in the escalation", opening: "A hospital network deployed a sepsis-risk classifier in two units. You are auditing for the clinical lead, who has the partial card and a nursing escalation" },
  { index: 11, domain: "logistics", org: "Crestline Distribution", classifier: "a warehouse-shift staffing forecaster", role: "ops manager", stakeholder: "the operations manager", trigger: "a union representative's complaint that night-shift teams are consistently under-staffed by the forecast", deployed: "in June", jargon: "technical", aggregate: "a mean absolute percentage error of 9% across all shifts", subgroupGap: "error broken out by shift or by facility", validationGap: "a backtest on the quietest quarter of the year", docGap: "how the forecast becomes a staffing decision and who signs it off", priority: "the night-shift under-forecast, given its safety implications" },
  { index: 12, domain: "hiring", org: "Summit Financial Advisors", classifier: "an internship candidate scorer", role: "early-careers manager", stakeholder: "the early-careers manager", trigger: "a university partner questioning why graduates from two campuses are rarely advanced", deployed: "in March", jargon: "plain", aggregate: "an advancement precision of 0.71", subgroupGap: "advancement rates by campus or degree type", validationGap: "validation on last year's intake only", docGap: "which application fields the scorer reads", priority: "the campus disparity, which risks a partner relationship and a fairness finding" },
  { index: 13, domain: "lending", org: "Pinecrest Mortgage", classifier: "a mortgage pre-qualification model", role: "compliance analyst", stakeholder: "the compliance analyst", trigger: "a regulator's information request about pre-qualification rates by census tract", deployed: "in April", jargon: "professional", aggregate: "a pre-qualification accuracy of 0.90", subgroupGap: "rates by census tract or household size", validationGap: "a validation set limited to one metropolitan area", docGap: "the data sources beyond the credit bureau file", priority: "the tract-level gap, because the regulator has asked for it" },
  { index: 14, domain: "lending", org: "Coastal Savings Bank", classifier: "a credit-line increase recommender", role: "compliance", stakeholder: "the compliance officer", trigger: "customer complaints that long-standing account holders in one branch region are never offered increases", deployed: "in February", jargon: "professional", aggregate: "an overall offer precision of 0.87", subgroupGap: "offer rates by branch region or account tenure", validationGap: "validation on a single pre-deployment snapshot", docGap: "the business rules layered on top of the score", priority: "the branch-region disparity, which the complaints make concrete" },
  { index: 15, domain: "hiring", org: "Atlas Engineering Services", classifier: "a technical-screening interview scheduler", role: "recruiting operations lead", stakeholder: "the recruiting operations lead", trigger: "hiring managers noticing that candidates with career gaps rarely reach a screen", deployed: "in January", jargon: "technical", aggregate: "a screen-to-offer precision of 0.42", subgroupGap: "screen rates by employment-gap length or veteran status", validationGap: "no validation beyond the vendor's benchmark", docGap: "whether employment-gap length is a feature", priority: "the career-gap effect, since it may disadvantage caregivers and veterans" },
  { index: 16, domain: "logistics", org: "Ironbridge Rail Freight", classifier: "a wagon-maintenance risk scorer", role: "asset manager", stakeholder: "the asset manager", trigger: "a depot's escalation that older wagon classes are almost never scheduled for inspection", deployed: "in May", jargon: "technical", aggregate: "a recall of 0.74 on known failures", subgroupGap: "recall by wagon class or age", validationGap: "a test window that predates the current fleet mix", docGap: "the failure definition used to label training data", priority: "the older-class blind spot, which is a safety exposure" },
  { index: 17, domain: "healthcare", org: "Lakeside Behavioral Health", classifier: "a therapy-drop-out risk model", role: "clinical operations lead", stakeholder: "the clinical operations lead", trigger: "clinicians reporting that adolescent clients are flagged far less often than adults", deployed: "in March", jargon: "professional", aggregate: "an AUROC of 0.80 overall", subgroupGap: "any breakdown by age group or referral source", validationGap: "validation on adult clients only", docGap: "how flags are surfaced to clinicians and what they are expected to do", priority: "the adolescent gap, because the model was never validated on that group" },
  { index: 18, domain: "healthcare", org: "Vantage Medical Supply", classifier: "a supplier-risk classifier used in purchasing", role: "procurement", stakeholder: "the head of procurement", trigger: "a supplier's formal complaint that minority-owned vendors are disproportionately flagged for enhanced review", deployed: "in April", jargon: "technical", aggregate: "a flagging precision of 0.58", subgroupGap: "flag rates by vendor ownership category or size", validationGap: "a validation set assembled from one product line", docGap: "the consequences of an enhanced-review flag", priority: "the ownership-category disparity, which the complaint puts on record" },
  { index: 19, domain: "lending", org: "Frontier Microfinance", classifier: "a repayment-risk scorer for micro-loans", role: "portfolio manager", stakeholder: "the portfolio manager", trigger: "field officers reporting that women-led enterprises receive systematically lower limits", deployed: "in February", jargon: "plain", aggregate: "a repayment AUROC of 0.82", subgroupGap: "limit recommendations by borrower gender or region", validationGap: "validation on one district", docGap: "how a score maps to a credit limit", priority: "the gender gap in limits, which cuts against the lender's mission" },
  { index: 20, domain: "hiring", org: "Beacon Public Schools", classifier: "a substitute-teacher assignment ranker", role: "HR business partner", stakeholder: "the HR business partner", trigger: "a principal's complaint that experienced substitutes are rarely offered high-need schools", deployed: "in January", jargon: "plain", aggregate: "a fill rate of 0.93", subgroupGap: "assignment rates by substitute experience or school need band", validationGap: "validation on one semester", docGap: "the objective the ranker optimises", priority: "the experience mismatch, because it affects the students who need the most support" },
  { index: 21, domain: "hiring", org: "Kestrel Logistics Staffing", classifier: "a driver-applicant screening model", role: "legal counsel", stakeholder: "in-house legal counsel", trigger: "a demand letter alleging that applicants with older commercial licences are screened out", deployed: "in April", jargon: "professional", aggregate: "a screening accuracy of 0.85", subgroupGap: "screen-out rates by licence age or applicant age", validationGap: "validation limited to one state's applicants", docGap: "the legal basis for each feature used", priority: "the licence-age effect, given the litigation risk" },
  { index: 22, domain: "logistics", org: "Greenway Parcel", classifier: "a delivery-route risk model", role: "fleet safety manager", stakeholder: "the fleet safety manager", trigger: "drivers on urban evening routes reporting that risk flags rarely match incidents", deployed: "in June", jargon: "technical", aggregate: "an incident-prediction recall of 0.69", subgroupGap: "recall by route type or time of day", validationGap: "validation on daytime routes only", docGap: "what a driver is expected to do with a flag", priority: "the evening-route miss rate, because it is a safety gap" },
  { index: 23, domain: "healthcare", org: "Meadowbrook Senior Care", classifier: "a fall-risk classifier", role: "director of nursing", stakeholder: "the director of nursing", trigger: "night staff reporting that residents on one wing are almost never flagged", deployed: "in May", jargon: "plain", aggregate: "a sensitivity of 0.83", subgroupGap: "flag rates by wing or mobility category", validationGap: "validation on day-shift observations only", docGap: "the intervention a flag is meant to trigger", priority: "the wing-level blind spot, which is a direct harm risk" },
  { index: 24, domain: "lending", org: "Metro Transit Credit", classifier: "a payroll-advance eligibility model", role: "product owner", stakeholder: "the product owner", trigger: "member feedback that part-time employees are routinely declined", deployed: "in March", jargon: "plain", aggregate: "an eligibility accuracy of 0.89", subgroupGap: "decline rates by employment type or tenure", validationGap: "validation on full-time members only", docGap: "the minimum-hours rule and whether the model learned it", priority: "the part-time decline pattern, because it may be an unintended rule" },
  { index: 25, domain: "hiring", org: "Orion Software", classifier: "a code-assessment scorer for engineering candidates", role: "engineering hiring lead", stakeholder: "the engineering hiring lead", trigger: "interviewers noticing that self-taught candidates score well below bootcamp and degree candidates", deployed: "in February", jargon: "technical", aggregate: "an on-site pass precision of 0.66", subgroupGap: "score distributions by education path", validationGap: "validation against one cohort of past hires", docGap: "how partial credit is assigned", priority: "the education-path gap, which may reflect the training labels rather than skill" },
  { index: 26, domain: "logistics", org: "Silverline Cold Chain", classifier: "a temperature-excursion risk model", role: "safety lead", stakeholder: "the safety lead", trigger: "an escalation that long-haul lanes through mountain corridors are systematically under-flagged", deployed: "in July", jargon: "technical", aggregate: "an excursion-prediction precision of 0.72", subgroupGap: "recall by lane type or trailer age", validationGap: "a validation window limited to spring lanes", docGap: "the excursion definition and its regulatory basis", priority: "the mountain-corridor blind spot, which threatens product safety" },
  { index: 27, domain: "healthcare", org: "Oakridge Imaging Centers", classifier: "a scan-prioritisation model", role: "radiology operations manager", stakeholder: "the radiology operations manager", trigger: "referring physicians complaining that scans from community clinics are queued behind hospital referrals", deployed: "in April", jargon: "professional", aggregate: "a priority precision of 0.78", subgroupGap: "queue position by referral source", validationGap: "validation on hospital referrals only", docGap: "how priority tiers map to turnaround targets", priority: "the community-clinic delay, which affects time to diagnosis" },
  { index: 28, domain: "lending", org: "Prairie State Bank", classifier: "an agricultural loan risk model", role: "agricultural lending manager", stakeholder: "the agricultural lending manager", trigger: "a farm bureau letter noting that small acreages are declined disproportionately", deployed: "in January", jargon: "professional", aggregate: "a default-prediction AUROC of 0.83", subgroupGap: "decline rates by farm size or crop type", validationGap: "validation on one growing season", docGap: "the weather and commodity inputs and how often they refresh", priority: "the small-acreage disparity, which the letter documents" },
  { index: 29, domain: "hiring", org: "Cascade Hospitality", classifier: "a seasonal-hire screening model", role: "regional HR manager", stakeholder: "the regional HR manager", trigger: "property managers reporting that returning seasonal staff are screened out at a higher rate than new applicants", deployed: "in March", jargon: "plain", aggregate: "a screening precision of 0.74", subgroupGap: "screen-out rates by returning status or property", validationGap: "validation on new applicants only", docGap: "whether prior-season performance is an input", priority: "the returning-staff effect, which contradicts the business goal" },
  { index: 30, domain: "logistics", org: "Keystone Courier", classifier: "a package-damage risk classifier", role: "claims manager", stakeholder: "the claims manager", trigger: "a customer complaint that fragile items from one sortation hub are flagged far less often than others", deployed: "in May", jargon: "professional", aggregate: "a damage-prediction recall of 0.70", subgroupGap: "recall by hub or package type", validationGap: "a test set from two of nine hubs", docGap: "how a flag changes handling", priority: "the hub-level miss rate, because it drives claim costs" },
  { index: 31, domain: "healthcare", org: "Unity Health Plan", classifier: "a care-management enrolment model", role: "medical director", stakeholder: "the medical director", trigger: "an advocacy group's letter that members with limited English proficiency are under-enrolled", deployed: "in February", jargon: "professional", aggregate: "an enrolment precision of 0.76", subgroupGap: "enrolment rates by language or dual-eligibility status", validationGap: "validation on English-speaking members", docGap: "the utilisation features that may encode access barriers", priority: "the language gap, since the letter raises a civil-rights concern" },
  { index: 32, domain: "lending", org: "Redwood Student Lending", classifier: "a student-loan refinancing eligibility model", role: "head of underwriting", stakeholder: "the head of underwriting", trigger: "applicant complaints that graduates of two-year programmes are almost always declined", deployed: "in April", jargon: "plain", aggregate: "an eligibility AUROC of 0.85", subgroupGap: "decline rates by programme type or school", validationGap: "validation on four-year graduates only", docGap: "whether school name is a feature", priority: "the programme-type disparity, because school name may act as a proxy" },
  { index: 33, domain: "logistics", org: "Aurora Air Cargo", classifier: "a dangerous-goods misdeclaration detector", role: "regulatory affairs lead", stakeholder: "the regulatory affairs lead", trigger: "freight forwarders complaining that small shippers are flagged for inspection at several times the rate of large accounts", deployed: "in June", jargon: "technical", aggregate: "a detection precision of 0.55 at the operating point", subgroupGap: "flag rates by shipper size or origin", validationGap: "a validation set that predates a rule change", docGap: "the escalation path after a flag", priority: "the small-shipper disparity, which is both a fairness and a trade-compliance issue" },
];

export const SEED_SCENARIOS: SeedScenario[] = S;

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

const DOMAIN_LABEL: Record<Domain, string> = {
  healthcare: "Healthcare",
  lending: "Lending",
  hiring: "Hiring",
  logistics: "Logistics",
};

export function domainLabel(d: string): string {
  return DOMAIN_LABEL[d as Domain] ?? cap(d);
}

export function seedSurfaceAssignment(s: SeedScenario): SurfaceAssignment {
  return {
    domain: s.domain,
    stakeholder: s.role,
    scenario: `${s.org} · ${s.classifier}`,
    jargon: s.jargon,
  };
}

/** The student-facing task for a scenario. */
export function seedVariantText(s: SeedScenario): string {
  const open = s.opening
    ? `${s.opening}.`
    : [
        `${s.org} deployed ${s.classifier} ${s.deployed}. You are auditing on behalf of ${s.stakeholder}, who has the partial model card below and ${s.trigger}.`,
        `${cap(s.stakeholder)} at ${s.org} has asked for an independent audit of ${s.classifier} that went live ${s.deployed}. What they can give you is a partial model card and ${s.trigger}.`,
        `You have been retained by ${s.org} to audit ${s.classifier} deployed ${s.deployed}. Your client is ${s.stakeholder}; the materials are a partial model card and ${s.trigger}.`,
        `${cap(s.trigger)} has reached ${s.stakeholder} at ${s.org}. ${cap(s.classifier)} in question was deployed ${s.deployed}, and the only documentation available is the partial model card below.`,
      ][s.index % 4];

  const card = `The card reports ${s.aggregate}, but does not include ${s.subgroupGap}. Validation is described as ${s.validationGap}. The card is silent on ${s.docGap}.`;

  const ask = [
    `Produce a structured audit identifying fairness, robustness and documentation gaps, justify each against evidence in the card, and prioritise your recommendations for ${s.stakeholder}.`,
    `Write a structured audit that names the fairness gaps, the robustness gaps and the documentation gaps, grounds every finding in what the card does or does not say, and ranks your recommendations in the order ${s.stakeholder} should act on them.`,
    `Your deliverable is a structured audit: fairness gaps, robustness gaps and documentation gaps, each justified from the card itself, followed by prioritised recommendations addressed to ${s.stakeholder}.`,
  ][s.index % 3];

  return `${open}\n\n${card}\n\n${ask}`;
}

/** The canonical solution adapted into the scenario. */
export function seedAdaptedSolution(s: SeedScenario): string {
  return [
    `Finding 1 — Fairness. The card reports ${s.aggregate} but omits ${s.subgroupGap}. Without that breakdown, ${s.trigger} can be neither substantiated nor dismissed, and any claim that ${s.classifier} treats groups equally is unsupported by the card.`,
    `Finding 2 — Robustness. Evaluation rests on ${s.validationGap}, so the reported figures cannot speak to performance under subgroup or temporal shift. For ${s.org} this matters because the population the model now scores differs from the one it was validated on.`,
    `Finding 3 — Documentation. The card does not state ${s.docGap}. Intended use is asserted but not bounded, which leaves ${s.stakeholder} unable to tell whether current practice is inside the model's design envelope.`,
    `Finding 4 — Prioritisation. Address ${s.priority}. Second, commission a shifted validation that covers the missing subgroup and time period. Third, complete the card with ${s.docGap} and an explicit out-of-scope statement before the next review cycle.`,
  ].join("\n\n");
}

/** Easier-reading rewrites returned when an outlier is regenerated in demo mode. */
export const SEED_ALTERNATES: Record<string, { text: string; adaptedSolution: string }> = {
  "v-12": {
    text:
      "Crestline Distribution uses a model to forecast how many people each warehouse shift needs. It went live in June. You are auditing it for the operations manager. A union representative has complained that night shifts are always short-staffed.\n\nThe model card gives one overall error figure of 9 percent. It does not show error by shift or by site. The model was only tested on the quietest quarter of the year. The card does not say how a forecast becomes a staffing decision or who approves it.\n\nWrite a structured audit. Name the fairness gaps, the robustness gaps and the documentation gaps. Back each one with what the card says or leaves out. End with recommendations in priority order for the operations manager.",
    adaptedSolution:
      "Finding 1 — Fairness. One overall error figure hides how the forecast performs on night shifts. The complaint cannot be checked from the card.\n\nFinding 2 — Robustness. Testing on the quietest quarter says nothing about peak season or night-time demand.\n\nFinding 3 — Documentation. The card does not say how a forecast turns into a staffing decision or who signs it off.\n\nFinding 4 — Prioritisation. First, measure error by shift and site. Second, re-test on a peak quarter. Third, write down the decision rule and the approver.",
  },
  "v-19": {
    text:
      "Vantage Medical Supply uses a model to flag suppliers for extra review before purchasing. It went live in April. You are auditing it for the head of procurement. A supplier has filed a formal complaint that minority-owned vendors are flagged far more often than others.\n\nThe model card reports that 58 percent of flags turn out to be real risks. It does not show flag rates by vendor ownership or size. The model was tested using data from one product line. The card does not explain what happens to a vendor after a flag.\n\nWrite a structured audit that names the fairness, robustness and documentation gaps, supports each with evidence from the card, and gives the head of procurement a ranked list of actions.",
    adaptedSolution:
      "Finding 1 — Fairness. Flag rates by vendor ownership are missing, so the complaint cannot be assessed from the card.\n\nFinding 2 — Robustness. A single product line is not evidence that the model works across the whole supplier base.\n\nFinding 3 — Documentation. The card never says what an enhanced-review flag leads to.\n\nFinding 4 — Prioritisation. Report flag rates by ownership category first. Then validate across product lines. Then document the review process and its consequences.",
  },
  "v-27": {
    text:
      "Silverline Cold Chain uses a model to predict when a refrigerated shipment is likely to break its temperature range. It went live in July. You are auditing it for the safety lead, who has a partial model card and a report that long routes through mountain areas are rarely flagged.\n\nThe card says 72 percent of flags are correct. It does not break results down by route type or trailer age. The model was tested only on spring routes. The card does not define what counts as a temperature break or where that definition comes from.\n\nProduce a structured audit covering fairness, robustness and documentation gaps, justify each from the card, and prioritise your recommendations for the safety lead.",
    adaptedSolution:
      "Finding 1 — Fairness. Results are not split by route type, so the mountain-route report cannot be checked.\n\nFinding 2 — Robustness. Spring-only testing ignores summer heat and winter cold.\n\nFinding 3 — Documentation. The card never defines a temperature break or cites the rule it comes from.\n\nFinding 4 — Prioritisation. Start with recall by route type. Then validate across seasons. Then add the definition and its regulatory source to the card.",
  },
};

/** Demo submission text (from the mockup's Grade page) for v-07. */
export const SEED_SUBMISSION_V07 = `Fairness. The card gives an aggregate shortlist rate of 0.34 with no breakdown by office or applicant group, so the complaint from the western office cannot be assessed or dismissed from the card alone. I flag this as the highest-priority gap because the complaint is specific and the card offers nothing to test it against.

Robustness. The model was validated on applications from a single hiring cycle. Résumé conventions shift year to year, and the card does not report any temporal holdout, so the reported precision is an upper bound on what the HR director should expect this cycle.

Documentation. Intended use is stated but out-of-scope uses are not. Nothing in the card prevents the same model being pointed at internal promotions, where the training distribution would not apply.

Recommendations. First, publish shortlist rates by office and applicant group. Second, hold out the most recent cycle and re-validate. Third, add an out-of-scope statement to the card before any expansion of use.`;

/** Generic submission text builder for other seeded submissions. */
export function seedSubmissionText(s: SeedScenario): string {
  return [
    `Fairness. ${cap(s.aggregate)} is reported without ${s.subgroupGap}, so ${s.trigger} cannot be evaluated from the card. This is the most important gap.`,
    `Robustness. Validation is limited to ${s.validationGap}, which does not cover the conditions ${s.org} now operates under.`,
    `Documentation. The card omits ${s.docGap}, and intended use is not bounded by an out-of-scope statement.`,
    `Recommendations. Address ${s.priority} first, then re-validate under shift, then complete the card.`,
  ].join("\n\n");
}
