# Assignment 6 — Classifier Audit for Bayfront Regional Bank (12 points)

## Context

This assignment is built from the brief Bayfront Regional Bank sent us; the employer brief is attached and is the primary document.

Bayfront Regional Bank deployed a loan-default classifier in March across its three lending regions: Metro, Coastal and Southwest. In August the underwriting team in Coastal and Southwest escalated a complaint: applicants in those regions are being declined at a rate that underwriters cannot reconcile with the credit files in front of them. The Chief Risk Officer has asked for an independent audit before the model risk committee meets.

You have the vendor's partial model card. It reports an aggregate accuracy of 0.91 and AUC of 0.88 on a holdout set, a headline claim of "no disparate impact detected," a training window of January 2023 to December 2024, a decision threshold of 0.35 on predicted default probability, and a feature list of 41 variables including debt-to-income, credit-file age, employment tenure and zip-code-derived market indicators. It does not report per-region or per-income-band metrics, calibration, the holdout sampling method, or out-of-scope uses. The data appendix adds what the bank's own analysts pulled from production logs: decline rates of 18 percent in Metro, 27 percent in Coastal and 29 percent in Southwest; observed 12-month default rates among approved applicants of 3.1, 2.6 and 2.4 percent respectively; the Southwest region opened two branches in the first quarter of 2025; and a 14-point rise in the share of applicants with credit files under three years old in Coastal since the training window closed.

## What you must produce

Produce a structured audit for the Chief Risk Officer that identifies performance and fairness gaps, robustness gaps and documentation gaps, justifies each finding against the model card and the appendix, and prioritises recommendations. Your audit must contain exactly four findings, each with a heading, the evidence, the gap it reveals, and the risk if left unaddressed, followed by a prioritised recommendation list of no more than five items.

Write for the risk officer: a technically literate reader who will not run code but must defend your conclusions to a committee.

## Constraints

- Length: 900 to 1,300 words.
- Cite the model card or the appendix for every claim. Do not invent figures; where a figure is missing, say what its absence prevents you from concluding.
- Fairness findings must reason in terms of subgroup false-positive and false-negative rates and calibration, not accuracy alone.
- Recommendations must be ordered by the severity of the risk they address, and you must state the ordering rule you used.
- Submit as a single document.

## Rubric

### Identifies fairness gaps with evidence (3 points)
- 0: No fairness gap identified, or gaps asserted with no reference to the card or appendix.
- 1: A fairness gap is named but the link to the evidence is vague, or it reasons from accuracy alone.
- 2: Fairness gaps are named in terms of subgroup error rates or calibration and tied to specific evidence.
- 3: Fairness gaps are named, tied to evidence, and the audit states what measurement would support or refute the "no disparate impact" claim.

### Robustness analysis under subgroup shift (3 points)
- 0: Robustness is not discussed.
- 1: Robustness is mentioned in general terms without connecting it to the training window, the threshold or the regional mix.
- 2: The audit identifies at least one concrete way the model could degrade under the documented shift and ties it to the evidence.
- 3: The audit identifies concrete degradation paths and proposes a specific validation that would detect each.

### Documentation completeness judgement (3 points)
- 0: The card is taken at face value.
- 1: Missing items are listed without explaining why each matters.
- 2: Missing items are listed and each is connected to a decision the committee cannot make without it.
- 3: Missing items are listed, connected to decisions, and ranked by how much their absence undermines the deployment claim.

### Prioritisation and recommendation quality (3 points)
- 0: Recommendations are absent or restate the findings.
- 1: Recommendations are present but unordered or not actionable.
- 2: Recommendations are actionable and ordered, with the ordering rule stated.
- 3: Recommendations are actionable, ordered by stated rule, and each names the owner and the evidence that would show it worked.
