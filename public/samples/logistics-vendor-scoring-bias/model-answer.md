# Vendor-Scoring Pipeline Diagnosis — Gulfstream Last Mile

**For:** Dana Whitlock, VP Network Operations

## 1. The symptom is real

Across the 40-vendor sample, model scores and route-manager ratings agreed within one decile for 34 vendors in September, before the rebuild, and for 19 vendors in March. The disagreement is not random. Of the 11 vendors the model now places in the bottom decile, 7 are rated reliable by their managers; 5 of those 7 have tenure over four years. Of the 6 vendors managers rate as problems, 4 now score in the top half. The pipeline rebuild is the only change in the period.

## 2. Where the bias enters

**Entry point A: timestamp imputation favours vendors with missing data.** The rebuilt pipeline fills missing delivery timestamps with the route's median leg time. The data dictionary shows that the `delivered_at` field is missing when a handheld fails to sync, which happens on 11 percent of stops for generation-1 devices and 2 percent for generation-2. A vendor who is late but whose device did not sync receives the median, which is on time by construction. Vendors with older devices, who tend to be newer contractors on the cheaper hardware plan, are therefore scored as more punctual than they are. Vendors with reliable devices are scored on their true, sometimes late, timestamps.

**Entry point B: the new scan-event source double-counts exceptions.** After the rebuild, exceptions arrive from both the dispatch system and the handheld scan events. The specification does not deduplicate them. A single damaged-parcel exception logged by dispatch and scanned by the driver counts twice. Long-tenured vendors, who follow the scan protocol most consistently, generate more scan events and therefore more duplicated exceptions. Their exception rate is inflated in proportion to their compliance.

**Entry point C: streaming cut-off truncates late-day routes.** The streaming feed closes the scoring day at 23:00. Routes that run late, which are concentrated in two coastal zones with evening delivery windows, have their last stops attributed to the next day, where they appear as missing scans and lower scan compliance. This is smaller than A and B but systematic by zone.

Relative contribution, from re-scoring the sample with each change reverted: A moves scores by a mean of 9 points, B by 6, C by 2.

## 3. Effect on scores by vendor group

- **Tenure over four years, generation-2 devices (n = 14):** mean score fell 11 points after the rebuild; managers rate 12 of them reliable. Mechanism: B inflates their exceptions, and A gives them no imputation benefit.
- **Tenure under one year, generation-1 devices (n = 9):** mean score rose 8 points; managers rate 5 of them as problems. Mechanism: A imputes their missing timestamps as on-time.
- **Coastal evening routes (n = 6):** mean score fell 4 points regardless of tenure. Mechanism: C.

Vendors who may have been wrongly reviewed: the 7 flagged-but-reliable vendors in the sample, and by extrapolation an estimated 18 to 24 across the network since October.

## 4. Fix, validation, and what to do now

**Fix.** (A) Stop imputing timestamps; treat a missing timestamp as a missing scan, which is what it is, and report device sync failures separately. (B) Deduplicate exceptions on parcel ID and exception type within a 24-hour window before scoring. (C) Attribute stops to the route's dispatch date, not the scan date.

**Validation before reuse.** Re-score the last six months with all three fixes. "Fixed" means: agreement with manager ratings within one decile for at least 32 of the 40 sampled vendors (the pre-rebuild level was 34), no significant score difference between device generations after controlling for tenure, and no zone effect for evening routes. Run the check on a fresh 40-vendor sample as well, drawn by a route manager who has not seen the first.

**Recommendation.** Suspend score-based reviews now. The cost of a wrong review to a six-year vendor is a lost relationship and possibly a lost route; the cost of two months without automated reviews is that managers rely on judgement, which is what they are doing anyway. Sequence: fix and re-score within two weeks, validate in week three, reinstate reviews in week four with a manager override for one cycle. Communicate to vendors reviewed since October that reviews are paused pending a scoring correction, and reverse any route removals that rested on the score alone.
