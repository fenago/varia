# Assignment 3 — Vendor-Scoring Pipeline Diagnosis for Gulfstream Last Mile (12 points)

## Context

Gulfstream Last Mile scores about 340 contracted delivery vendors monthly on a reliability index from 0 to 100. Vendors in the bottom decile receive a performance review and may lose routes. The scoring model, a fixed weighted formula over on-time rate, scan compliance, exception rate and route-abandonment count, has not changed since 2023. The feeding pipeline was rebuilt last October: a nightly batch became a streaming feed, a new scan-event source from handheld devices was added, and missing delivery timestamps are now imputed with the route's median leg time. Since the rebuild, route managers report that long-standing reliable vendors are being flagged and some unreliable ones are being cleared.

You have the pipeline specification before and after the rebuild, a data dictionary for the scan and timestamp feeds, monthly score distributions by vendor tenure band and by device generation (the handheld fleet is a mix of two generations), and a sample of 40 vendors with route-manager reliability ratings alongside model scores for the last six months.

You are working for the VP of Network Operations, who must decide whether to suspend score-based reviews.

## What you must produce

Produce a pipeline diagnosis that locates where the bias enters, characterises which vendors it hurts and helps and by how much, and recommends a fix with a validation plan. Your diagnosis must contain exactly four sections: the symptom and how you confirmed it is real, the entry points of bias with the mechanism for each, the effect on scores by vendor group, and the fix with a validation plan and a recommendation on whether to suspend reviews now.

Write for an operations leader who will act on it and will have to explain it to vendors.

## Constraints

- Length: 800 to 1,200 words.
- Every mechanism must be tied to a specific change in the pipeline specification or a field in the data dictionary.
- Quantify the score effect for at least two vendor groups.
- The validation plan must be executable before scores are used again, and must state what "fixed" looks like as a number.
- Submit as a single document.

## Rubric

### Symptom confirmed and bias entry points located (3 points)
- 0: The symptom is taken as given, or no entry point is located.
- 1: The symptom is confirmed against the manager ratings; an entry point is suggested without mechanism.
- 2: At least one entry point is located with a mechanism tied to the pipeline change.
- 3: All material entry points are located with mechanisms, and their relative contribution is compared.

### Fairness analysis across vendor groups (3 points)
- 0: No group analysis.
- 1: Groups are described but score effects are not compared.
- 2: Score effects are compared across at least two groups with numbers.
- 3: Effects are compared, the direction for each group is explained by the mechanism, and the analysis says which vendors may have been wrongly reviewed.

### Fix and validation plan (3 points)
- 0: No fix, or a fix without validation.
- 1: A fix is proposed; validation is vague.
- 2: The fix addresses the mechanism and the validation names a metric and target.
- 3: The fix addresses each mechanism, validation is executable before reuse, and the target is justified.

### Operational recommendation and prioritisation (3 points)
- 0: No recommendation on suspending reviews.
- 1: A recommendation is given without weighing cost to vendors and to operations.
- 2: The recommendation weighs both and is sequenced.
- 3: The recommendation weighs both, is sequenced, and includes how to communicate with affected vendors.
