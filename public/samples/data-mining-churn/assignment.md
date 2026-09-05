# Assignment 4 — Subscription Churn Root-Cause Brief for Palmetto & Pine Market (12 points)

## Context

This assignment is built from the brief Palmetto & Pine Market sent us; the employer brief is attached and is the primary document.

Palmetto & Pine Market is a four-store specialty grocer with a weekly online-order subscription, Pantry Plan, launched in 2024. It has 6,140 active subscribers. Monthly churn rose from 4.1 percent in February to 7.6 percent in August. A 15 percent win-back coupon and a courier change in Broward did not reduce it. The Director of E-commerce reports two patterns the retention team cannot explain: subscribers who joined in the second half of 2025 churn faster than earlier cohorts, and the two Broward stores churn faster than the two Miami-Dade stores.

You have the subscriber-level table described in the employer brief: join date, home store, delivery window, plan tier (Essentials or Full Pantry), average weekly basket value, substitutions per order, courier on-time rate, support tickets in the last 60 days, and churn date if any, for 18 months. Summary statistics are provided in the data appendix: the July 2025 to December 2025 join cohort has a six-month retention of 61 percent against 78 percent for the January to June cohort; substitutions per order average 1.9 in Broward and 0.8 in Miami-Dade; on-time rate is 91 percent in Broward after the courier change and 94 percent in Miami-Dade; the Essentials tier is 71 percent of the late-2025 cohort and 44 percent of the early cohort.

## What you must produce

Produce a data-mining brief for the Director of E-commerce that selects and justifies an analytical method, identifies the root cause of the churn increase with quantified evidence from the appendix, recommends an action for each affected segment, and designs a test that would confirm the cause before the company spends on a fix. The brief must have exactly four sections in that order: Method, Root cause, Segment recommendations, Confirmation test.

Write for a director who reads numbers well but does not run code.

## Constraints

- Length: 900 to 1,300 words.
- The Method section must compare at least two candidate approaches (for example cohort and survival analysis, a classification model, association rules) and state why the chosen one fits the question of why customers leave rather than who will leave.
- Every causal claim must cite a figure from the data appendix. Where the appendix cannot separate two explanations, say so and let the confirmation test resolve it.
- The confirmation test must state the unit of assignment, the metric, the minimum detectable effect, and the duration.
- Submit as a single document.

## Rubric

### Method selection with justification (3 points)
- 0: No method is chosen, or the choice is asserted without reasons.
- 1: A method is chosen with reasons, but the alternatives are not considered.
- 2: At least two methods are compared and the choice is tied to the question being asked.
- 3: Methods are compared, the choice is tied to the question, and the brief states what the chosen method cannot tell the director.

### Root cause with quantified evidence (3 points)
- 0: No root cause, or a cause with no numbers.
- 1: A cause is named with a figure but competing explanations are ignored.
- 2: A cause is named, supported by figures from the appendix, and at least one competing explanation is ruled out with evidence.
- 3: The cause is supported, competitors are ruled out, and the brief separates what the data proves from what it only suggests.

### Segment-level recommendations (3 points)
- 0: No recommendations, or one recommendation for everyone.
- 1: Recommendations differ by segment but are not tied to the cause.
- 2: Each affected segment gets a recommendation tied to the cause with an expected effect.
- 3: Recommendations are tied to the cause, sized by expected effect, and ordered by revenue at risk.

### Confirmation test design (3 points)
- 0: No confirmation test is proposed.
- 1: A test is proposed without the unit of assignment or the metric.
- 2: The test states unit, metric, minimum detectable effect and duration.
- 3: The test is fully specified and the brief explains what result would falsify the root-cause claim.
