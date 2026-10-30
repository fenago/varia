/**
 * Grant outcomes framework: every metric the pilot reports on, in the four
 * lenses from the WGU convening (students, faculty, institution, employers).
 *
 * This is the report template. No numbers exist yet: each outcome carries a
 * `result` slot that stays null until the data comes in. To report a number,
 * replace `result: null` with e.g.
 *   result: { value: "+23% time-on-task", asOf: "2027-05-15", note: "n=142, 3 course sections" }
 * and the Outcomes page renders it in place of the Pending pill.
 */

export type OutcomeType = "required" | "optional" | "practice";

export interface OutcomeResult {
  /** The headline number or finding, as it should read on the report. */
  value: string;
  /** ISO date the figure was computed (shown as "as of ..."). */
  asOf: string;
  /** Sample size, source, or caveat worth printing under the number. */
  note?: string;
}

export interface Outcome {
  id: string;
  outcome: string;
  /** The convening's impact lens: Ownership, Demonstrate, Carries proof, Grows visibly. */
  impact: string;
  /** Metric and target, verbatim from the framework. */
  metric: string;
  type: OutcomeType;
  result: OutcomeResult | null;
}

export interface OutcomeLens {
  key: "students" | "faculty" | "institution" | "employers";
  title: string;
  /** The "4 required | 5 optional" tag from the framework page. */
  tally: string;
  /** The framework page's one-line framing of this lens. */
  framing: string;
  outcomes: Outcome[];
}

/** SOW context shown at the top of the report. Dates from Statement of Work #1. */
export const GRANT_CONTEXT = {
  agreement: "WGU Grant Participation Agreement — Statement of Work #1",
  participant: "Miami Dade College",
  term: "SOW effective July 2026 · pilot term through March 31, 2028",
  obligation:
    "Collect and submit artifacts tied to the pilot: assessment designs, student feedback, outcomes data.",
};

export const OUTCOME_LENSES: OutcomeLens[] = [
  {
    key: "students",
    title: "Student outcomes",
    tally: "4 required · 5 optional",
    framing:
      "The learner's experience and demonstrated capability. WGU outcomes anchor it and the convening input informs the experiential outcomes.",
    outcomes: [
      {
        id: "stu-engagement",
        outcome: "Increased learner engagement",
        impact: "Ownership",
        metric: "Engagement scores (interaction, time-on-task). Goal +20%.",
        type: "required",
        result: null,
      },
      {
        id: "stu-satisfaction",
        outcome: "Satisfied with the assessment experience",
        impact: "Ownership",
        metric: "Learner satisfaction survey",
        type: "required",
        result: null,
      },
      {
        id: "stu-mastery",
        outcome: "Demonstrates skill mastery via dynamic assessments",
        impact: "Demonstrate",
        metric: "% of learners at mastery. Goal +20%.",
        type: "required",
        result: null,
      },
      {
        id: "stu-credentials",
        outcome: "Earns validated, job-relevant credentials",
        impact: "Carries proof",
        metric: "# of credentials earned.",
        type: "required",
        result: null,
      },
      {
        id: "stu-authentic",
        outcome: "Assessment feels authentic, not a high-stakes recall gate",
        impact: "Ownership",
        metric: "“Not a test” rate",
        type: "optional",
        result: null,
      },
      {
        id: "stu-efficacy",
        outcome: "Increased self-efficacy and agency",
        impact: "Ownership",
        metric: "Self-efficacy scale",
        type: "optional",
        result: null,
      },
    ],
  },
  {
    key: "faculty",
    title: "Faculty outcomes",
    tally: "1 required · 6 practice/validate",
    framing:
      "The process validation lens. One required capacity outcome from WGU and the rest practice milestones to validate.",
    outcomes: [
      {
        id: "fac-trained",
        outcome: "Faculty trained in AI-enabled assessment design",
        impact: "—",
        metric: "Number of faculty trained. Goal 100+.",
        type: "required",
        result: null,
      },
      {
        id: "fac-process",
        outcome: "Faculty teach and assess the how, not the what",
        impact: "Ownership",
        metric: "Share of assessment scored on process; validated across institutions",
        type: "practice",
        result: null,
      },
      {
        id: "fac-rubric",
        outcome: "Faculty assess a student's defense of reasoning with a shared rubric",
        impact: "Demonstrate",
        metric: "Shared rubric validated across 3+ institutions by Q2 2027",
        type: "practice",
        result: null,
      },
      {
        id: "fac-tasks",
        outcome: "Faculty design authentic, AI-integrated tasks",
        impact: "Demonstrate",
        metric: "Task-design pattern documented and validated",
        type: "practice",
        result: null,
      },
      {
        id: "fac-judgment",
        outcome: "Faculty teach and judge when AI helps and when it does not",
        impact: "Demonstrate",
        metric: "AI-judgment practice documented and validated",
        type: "practice",
        result: null,
      },
    ],
  },
  {
    key: "institution",
    title: "Institutional outcomes",
    tally: "3 required · 5 optional",
    framing:
      "Persistence, capacity, and the conditions to scale. WGU anchors it; the convening adds reputation and faculty time.",
    outcomes: [
      {
        id: "inst-persistence",
        outcome: "Improved learner persistence and completion",
        impact: "Grows, visibly",
        metric: "Retention and completion rates. Goal +10%.",
        type: "required",
        result: null,
      },
      {
        id: "inst-correlation",
        outcome: "Engagement in dynamic assessments correlates with persistence",
        impact: "Grows, visibly",
        metric: "Correlation measure.",
        type: "required",
        result: null,
      },
      {
        id: "inst-adoption",
        outcome: "Adopts and adapts shared assessment assets",
        impact: "Carries proof",
        metric: "15+ institutions using shared assets; framework adoption.",
        type: "required",
        result: null,
      },
      {
        id: "inst-growth",
        outcome: "Student growth measured against a baseline",
        impact: "Grows, visibly",
        metric: "Growth-vs-baseline delta (needs baseline)",
        type: "optional",
        result: null,
      },
      {
        id: "inst-reputation",
        outcome: "Institutional reputation grows with students and employers",
        impact: "Carries proof",
        metric: "Reputation and recruitment signal",
        type: "optional",
        result: null,
      },
      {
        id: "inst-faculty-time",
        outcome: "Faculty time is freed for higher-value work",
        impact: "Ownership",
        metric: "Faculty time reallocated from low-value grading",
        type: "optional",
        result: null,
      },
    ],
  },
  {
    key: "employers",
    title: "Employer outcomes",
    tally: "3 required · 5 optional",
    framing:
      "Validation and workforce value. The most WGU-anchored lens, and the most long-horizon since much of it will be building for much of the grant term.",
    outcomes: [
      {
        id: "emp-validated",
        outcome: "Assessments are validated by employer partners",
        impact: "Carries proof",
        metric: "% validated by employers. Goal 75%.",
        type: "required",
        result: null,
      },
      {
        id: "emp-indicators",
        outcome: "Employers adopt portable skill indicators for hiring or promotion",
        impact: "Carries proof",
        metric: "Employer adoption and satisfaction. Goal 50% of partners.",
        type: "required",
        result: null,
      },
      {
        id: "emp-satisfaction",
        outcome: "Employers are satisfied with assessment outcomes",
        impact: "Carries proof",
        metric: "Employer satisfaction survey",
        type: "required",
        result: null,
      },
      {
        id: "emp-ramp",
        outcome: "Graduates ramp and add value faster",
        impact: "Carries proof",
        metric: "Time to productivity; onboarding hours",
        type: "optional",
        result: null,
      },
      {
        id: "emp-employment",
        outcome: "Improved employment outcomes: hiring, promotion, salary",
        impact: "Carries proof",
        metric: "Placement; salary/earnings; promotion",
        type: "optional",
        result: null,
      },
      {
        id: "emp-retention",
        outcome: "Retention and internal mobility",
        impact: "Carries proof",
        metric: "Retention/attrition; internal mobility",
        type: "optional",
        result: null,
      },
    ],
  },
];

/** How many outcomes have a reported number, out of how many, per lens and overall. */
export function outcomesProgress() {
  const perLens = OUTCOME_LENSES.map((lens) => {
    const reported = lens.outcomes.filter((o) => o.result !== null).length;
    return { key: lens.key, title: lens.title, reported, total: lens.outcomes.length };
  });
  const reported = perLens.reduce((n, l) => n + l.reported, 0);
  const total = perLens.reduce((n, l) => n + l.total, 0);
  return { perLens, reported, total };
}
