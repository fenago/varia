# Model Card Audit — Bayfront Regional Bank loan-default classifier

**Prepared for:** Marisol Quintero, Chief Risk Officer
**Basis:** Vendor partial model card (aggregate accuracy 0.91; training window Jan 2023 to Dec 2024; 41 features; "no disparate impact detected")

## Finding 1 — Fairness: the disparate-impact claim is unsupported by the card

**Evidence in the card.** The card states "no disparate impact detected" and reports a single aggregate accuracy of 0.91. It reports no per-region, per-income-band or per-credit-file-age breakdown, and no false-positive or false-negative rates for any subgroup.

**Gap.** Disparate impact is a subgroup property. An aggregate accuracy figure cannot support or refute it. With Coastal and Southwest underwriters reporting decline rates they cannot reconcile, the minimum evidence is the decline rate and the false-positive rate (applicants predicted to default who would not have) by region and by income band, on the same holdout the 0.91 was computed on.

**Risk if unaddressed.** A fair-lending examination would treat the card's claim as unevidenced. If the regional gap is real, the bank is declining creditworthy applicants in two regions and cannot show it knew.

## Finding 2 — Robustness: the training window predates the current applicant mix

**Evidence in the card.** Training data spans January 2023 to December 2024. The card does not say how the holdout was sampled, and includes zip-code-derived market indicators among its 41 features.

**Gap.** The Southwest region opened two branches in the first quarter of 2025, after the training window closed. If the holdout was a random split of the same window, the reported 0.91 says nothing about applicants from those branches. Zip-code-derived features will map new-branch zips to whatever market indicators existed in the training period, which for newly served areas may be sparse or stale. The complaint pattern, concentrated in the two regions with the most post-window change, is consistent with temporal and geographic shift.

**Validation that would detect it.** Score a time-sliced holdout (applications from March to August 2025) by region, and compare decline and false-positive rates to the training-period holdout. A gap above the bank's tolerance in either region confirms shift.

## Finding 3 — Documentation: five omissions block committee decisions

**Evidence in the card.** Absent: (a) holdout sampling method; (b) subgroup metrics; (c) intended and out-of-scope uses; (d) the feature list's provenance for the zip-code indicators; (e) a monitoring plan.

**Why each matters, ranked.** (b) blocks any fairness conclusion, which is the committee's first question. (a) blocks trust in the 0.91 itself. (e) blocks the committee from knowing whether the August complaint should have been caught earlier. (c) blocks a ruling on whether using the model for line increases, which one region has begun doing, is within scope. (d) blocks assessment of whether zip-derived indicators act as a proxy for protected characteristics.

## Finding 4 — Prioritisation: what to fix first

The ordering rule is severity of harm to applicants multiplied by how quickly the fix can be evidenced.

1. **Produce subgroup metrics by region and income band on the existing holdout.** Owner: vendor, with bank model risk reviewing. Evidence of success: a table of decline rate, FPR and FNR by subgroup, within two weeks. Addresses Finding 1.
2. **Run the time-sliced regional validation.** Owner: bank model risk. Evidence: shift report with tolerance bands. Addresses Finding 2.
3. **Suspend line-increase use until scope is documented.** Owner: lending operations. Evidence: written scope statement in the card. Addresses Finding 3(c).
4. **Require the vendor to document holdout sampling and zip-indicator provenance.** Owner: vendor management. Evidence: revised card. Addresses Finding 3(a), (d).
5. **Stand up quarterly subgroup monitoring with an escalation threshold.** Owner: model risk. Evidence: first quarterly report. Addresses Finding 3(e).

## What this audit cannot conclude

Without subgroup metrics, this audit cannot say whether the regional decline gap is a model defect or a real difference in applicant risk. It can say the card provides no basis for the claim that it is not, and that the two regions where complaints arose are the two with the most change since the training window closed. That is sufficient to justify items 1 and 2 immediately.
