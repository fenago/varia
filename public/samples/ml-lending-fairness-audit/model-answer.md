# Classifier Audit — Bayfront Regional Bank loan-default model

**Prepared for:** Marisol Quintero, Chief Risk Officer
**Basis:** Vendor partial model card (accuracy 0.91, AUC 0.88, threshold 0.35, training Jan 2023 to Dec 2024, 41 features, "no disparate impact detected") and the bank's production appendix.

## Finding 1 — Fairness: the appendix shows the pattern of a miscalibrated model, and the card cannot rule it out

**Evidence.** Decline rates are 18 percent in Metro, 27 percent in Coastal and 29 percent in Southwest. Among approved applicants, observed 12-month default is 3.1 percent in Metro, 2.6 in Coastal and 2.4 in Southwest. The card reports no subgroup false-positive rate, false-negative rate or calibration.

**Gap.** The two regions with the highest decline rates have the lowest default among those approved. That is the signature of a model whose predicted default probabilities run high for Coastal and Southwest applicants: at a fixed threshold of 0.35, it declines more of them, and the ones it lets through are safer than average. In error-rate terms, the false-positive rate (creditworthy applicants declined) is likely higher in those regions. Aggregate accuracy of 0.91 cannot show this, because a model can be accurate overall while its errors concentrate in a subgroup.

**What would settle it.** Per-region calibration curves on the holdout and on production, and per-region false-positive and false-negative rates at the 0.35 threshold. If Coastal and Southwest applicants with a predicted probability of 0.35 default at 2 to 3 percent rather than 35 percent, the threshold is declining creditworthy people.

**Risk.** The card's "no disparate impact" claim rests on no reported subgroup evidence. A fair-lending examination would treat it as unevidenced, and the bank is likely declining creditworthy applicants in two regions.

## Finding 2 — Robustness: the applicant mix has shifted past the training window in exactly the features the model leans on

**Evidence.** Training data ends December 2024. Southwest opened two branches in the first quarter of 2025. In Coastal, the share of applicants with credit files under three years old rose 14 points after the window closed. Credit-file age is among the 41 features, and zip-code-derived market indicators are too. The card does not say how the holdout was sampled.

**Gap.** If the holdout is a random split of the training window, the reported 0.91 and 0.88 describe the model on the 2023 to 2024 population, not on the 2025 applicants it is now scoring. New branches bring new zip codes the market indicators may not represent, and a surge of thin-file applicants pushes the model into a region of feature space it saw less of. Both are ways predicted default drifts upward without any change in real risk.

**Validation that would detect it.** Score a time-sliced holdout of March to August 2025 applications by region and by credit-file-age band; compare decline rate, false-positive rate and calibration to the training-period holdout. A gap concentrated in the new-branch zip codes and in the under-three-year band would confirm the drift and locate it.

**Risk.** Continued decline of creditworthy thin-file applicants in the growing regions, which is both a revenue loss and a fair-lending exposure, because thin-file status correlates with age and immigration history.

## Finding 3 — Documentation: six omissions block the committee's decisions

**Evidence.** Absent from the card: (a) subgroup error rates; (b) calibration; (c) holdout sampling method; (d) intended and out-of-scope uses; (e) provenance of the zip-code indicators; (f) a monitoring plan and retraining trigger.

**Why each matters, ranked by how much its absence undermines the deployment claim.** (a) and (b) block any fairness conclusion, which is the committee's first question. (c) blocks trust in the 0.91 and 0.88. (f) blocks the committee from knowing whether the August complaint should have been caught automatically. (e) matters because zip-code indicators can proxy for protected characteristics. (d) matters because the model is also being consulted for line increases, a use the card never scopes.

**Risk.** The committee cannot approve, suspend or condition the model on the record in front of it.

## Finding 4 — Prioritisation: what to fix first

The ordering rule is severity of harm to applicants, multiplied by how quickly the fix can be evidenced.

1. **Produce per-region calibration curves and error rates on the holdout and on March to August production.** Owner: vendor, bank model risk reviewing. Evidence of success: a table by region and credit-file-age band. Addresses Findings 1 and 2 and is prerequisite to everything else.
2. **Pending that table, apply a per-region review of declines between 0.35 and 0.50 predicted probability in Coastal and Southwest.** Owner: head of underwriting. Evidence: overturn rate on manual review; a high overturn rate confirms Finding 1.
3. **Run the time-sliced validation by region and file-age band.** Owner: bank model risk. Evidence: shift report with tolerance bands. Addresses Finding 2.
4. **Suspend use for line increases until scope is documented.** Owner: lending operations. Evidence: written scope in the card. Addresses Finding 3(d).
5. **Require a revised card with holdout method, indicator provenance and a monitoring plan with a quarterly subgroup trigger.** Owner: vendor management. Evidence: revised card and first quarterly report. Addresses Finding 3(c), (e), (f).

## What this audit cannot conclude

Without subgroup error rates and calibration, this audit cannot say whether the regional decline gap is a model defect or a real difference in applicant risk. It can say that the production pattern is what a miscalibrated model produces, that the applicant mix has shifted in the features most likely to cause it, and that the card provides no basis for the claim that it is not.
