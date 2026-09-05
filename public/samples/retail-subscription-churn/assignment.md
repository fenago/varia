# Assignment 2 — Subscription Churn Root Cause for Palmetto Fresh (12 points)

## Context

Palmetto Fresh, a regional grocer, runs a meal-kit subscription with four weekly plans delivered from its own stores across 14 delivery zones. Monthly churn rose from 6.1 percent in December to 11.3 percent in May. A 15 percent retention discount in March and a recipe refresh in April did not change the trend. In February the company moved delivery in Zones 9 and 12 to a third-party courier whose reported on-time rate is 96 percent, comparable to the in-house fleet.

You have a subscriber-level dataset description: plan, start month, delivery zone, weekly order and skip history, substitution counts per box, delivery exceptions (late, damaged, missing item), support tickets with category, and churn month if churned. You also have monthly churn by zone, by plan, and by tenure band, and the courier's monthly on-time and exception reports for Zones 9 and 12.

You are working for the Director of Subscription Growth, who has to decide what to do next month.

## What you must produce

Produce a churn analysis that selects and justifies an analytical method, isolates the most likely cause of the churn increase, quantifies its size, and recommends one intervention with a way to test whether it worked. Your analysis must contain exactly four sections: the question and the method you chose over the alternatives, what the data shows about who is leaving and when, the root cause with the evidence chain, and a recommendation with a test design. State clearly if the courier hypothesis is not supported.

Write for a business reader who will fund the intervention.

## Constraints

- Length: 800 to 1,200 words.
- Name at least two methods you considered and say why you chose the one you did for this question.
- Quantify: how many subscribers per month the cause accounts for, and what churn would be without it.
- The test design must name the comparison group, the metric, the duration and the decision rule.
- Submit as a single document.

## Rubric

### Method selection and justification (3 points)
- 0: No method named, or a method applied without reference to the question.
- 1: A method is named; alternatives are not discussed.
- 2: A method is chosen over named alternatives with reasons tied to the question and data.
- 3: The choice is justified, its assumptions and limits for this dataset are stated, and the analysis explains how the alternatives would have misled.

### Root cause isolated with evidence chain (3 points)
- 0: No cause proposed, or a cause asserted without evidence.
- 1: A cause is proposed with partial evidence; confounds are not addressed.
- 2: A cause is isolated with an evidence chain that addresses the obvious confound.
- 3: A cause is isolated, confounds are addressed, and competing explanations (including the courier) are explicitly tested and resolved.

### Quantification (3 points)
- 0: No quantification.
- 1: Descriptive numbers only, not tied to the cause.
- 2: The cause's share of the churn increase is estimated with a stated basis.
- 3: The estimate is given with its uncertainty and a counterfactual churn rate.

### Recommendation and test design (3 points)
- 0: No recommendation, or one that does not follow from the cause.
- 1: A recommendation follows from the cause but has no test.
- 2: The recommendation has a test with comparison group, metric and duration.
- 3: The test also states a decision rule and what would be done if it fails.
