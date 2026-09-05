# Assignment 3 — Model Card Audit for Bayfront Regional Bank (12 points)

## Context

Bayfront Regional Bank deployed a loan-default classifier in March across its three lending regions: Metro, Coastal and Southwest. In August the underwriting team in Coastal and Southwest escalated a complaint: applicants in those regions are being declined at a rate that underwriters cannot reconcile with the credit files in front of them. The bank's Chief Risk Officer has asked us for an independent audit.

You have the vendor's partial model card. It reports an aggregate accuracy of 0.91 on a holdout set, a headline claim of "no disparate impact detected," a training window of January 2023 to December 2024, and a feature list of 41 variables including debt-to-income, credit-file age, employment tenure and zip-code-derived market indicators. It does not report per-region or per-income-band metrics, does not describe the holdout sampling, and does not list out-of-scope uses.

You are auditing on behalf of the risk officer, who will bring your findings to the model risk committee.

## What you must produce

Produce a structured audit of the deployed classifier that identifies fairness gaps, robustness gaps and documentation gaps, justifies each finding against evidence in the model card, and prioritises your recommendations. Your audit must contain exactly four findings, each with a heading, the evidence from the card, the gap it reveals, and the risk if left unaddressed, followed by a prioritised recommendation list of no more than five items.

Write for the risk officer: a technically literate reader who will not run code but must defend your conclusions to a committee.

## Constraints

- Length: 900 to 1,300 words.
- Cite the model card for every claim about what it does or does not report. Do not invent figures the card does not contain; where a figure is missing, say what its absence prevents you from concluding.
- Recommendations must be ordered by the severity of the risk they address, and you must state the ordering rule you used.
- Submit as a single document.

## Rubric

### Identifies fairness gaps with evidence (3 points)
- 0: No fairness gap identified, or gaps asserted with no reference to the card.
- 1: A fairness gap is named but the link to what the card does or does not report is vague.
- 2: Fairness gaps are named and tied to specific missing or present disclosures in the card.
- 3: Fairness gaps are named, tied to specific disclosures, and the audit states what evidence would be needed to support or refute the card's "no disparate impact" claim.

### Robustness analysis under subgroup shift (3 points)
- 0: Robustness is not discussed.
- 1: Robustness is mentioned in general terms without connecting it to the training window, holdout sampling or regional mix.
- 2: The audit identifies at least one concrete way the model could degrade when the applicant mix shifts and ties it to the card.
- 3: The audit identifies concrete degradation paths tied to the card and proposes a specific validation that would detect each.

### Documentation completeness judgement (3 points)
- 0: The card is taken at face value.
- 1: Missing items are listed without explaining why each matters.
- 2: Missing items are listed and each is connected to a decision the committee cannot make without it.
- 3: Missing items are listed, connected to decisions, and ranked by how much their absence undermines the deployment claim.

### Prioritisation and recommendation quality (3 points)
- 0: Recommendations are absent or are a restatement of the findings.
- 1: Recommendations are present but unordered or not actionable.
- 2: Recommendations are actionable and ordered, with the ordering rule stated.
- 3: Recommendations are actionable, ordered by stated rule, and each names the owner and the evidence that would show it worked.
