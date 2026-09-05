# Pantry Plan Churn: Root-Cause Brief

**Prepared for:** Daniela Ferrer, Director of E-commerce, Palmetto & Pine Market

## 1. Method

The question is why subscribers leave, by segment, not which subscriber will leave next. That rules out the obvious choice. A classification model (gradient boosting on churn within 30 days) would score customers well and would confirm that substitutions, on-time rate and tier are predictive, but it would not separate cause from correlation, and its output is a list of names rather than a decision. Association rules would surface co-occurrences (Broward, Essentials, high substitutions) without telling us which one to fix.

The method that fits is cohort and survival analysis: Kaplan-Meier retention curves by join cohort, store and tier, followed by a Cox proportional-hazards model with substitutions per order, on-time rate, tier, store and support tickets as covariates. It answers the director's question in her own terms (when in the subscriber's life do they leave, and what makes leaving faster), and the hazard ratios are the segment-level effect sizes she needs. What it cannot do is prove causation from observational data. The confirmation test in section 4 does that.

## 2. Root cause

The appendix supports one cause and rules out two.

**The cause is order quality, specifically substitutions, concentrated in the Essentials tier at the Broward stores.** Substitutions average 1.9 per order in Broward against 0.8 in Miami-Dade. In the survival model, each additional substitution per order raises the weekly hazard of churn by about 28 percent, and the Broward store effect disappears once substitutions are in the model: the stores are not different, their orders are. The late-2025 cohort is 71 percent Essentials against 44 percent for the early cohort, and Essentials orders are assembled from a narrower range so substitutions run higher. The cohort effect is therefore a mix effect: we acquired more Essentials subscribers, in Broward, at the moment Broward substitutions rose.

**The courier is not the cause.** On-time rate is 91 percent in Broward and 94 percent in Miami-Dade, a three-point gap. In the model that gap accounts for less than a tenth of the Broward excess hazard, and the courier change in Broward produced no change in the churn curve. The win-back coupon failed for the same reason: it discounted a service whose problem was the order, not the price.

**Acquisition quality is a partial explanation, not the root.** The late-2025 cohort's six-month retention is 61 percent against 78 percent, but within tier and substitution band the cohorts retain alike. The cohort looks worse because of what it bought and where.

What the data proves: subscribers who receive more substitutions leave sooner, and the pattern explains both anomalies. What it only suggests: that reducing substitutions would reduce churn. That is a causal claim about an intervention, and observational data cannot close it.

## 3. Segment recommendations

Ordered by revenue at risk.

1. **Broward Essentials subscribers (about 1,900 subscribers, roughly $2.1 million annual basket value).** Reduce substitutions by holding Essentials inventory for Pantry Plan assembly at the two Broward stores and enabling a pre-delivery substitution approval message. Expected effect from the hazard ratio: cutting substitutions from 1.9 to 1.0 per order lowers the monthly churn hazard for this segment by roughly a fifth.
2. **Miami-Dade Essentials subscribers.** Same inventory hold, lower urgency; substitutions are already near the floor.
3. **Full Pantry subscribers, both regions.** No product change. Stop sending them the win-back coupon; their churn is at the February baseline.
4. **Acquisition.** Keep acquiring Essentials subscribers, but not in Broward until the substitution fix is live. The cohort problem is a mix problem and will resolve itself once the order problem does.

## 4. Confirmation test

- **Unit of assignment:** Broward Essentials subscribers, randomised at the subscriber level, 50/50.
- **Treatment:** inventory hold plus pre-delivery substitution approval. Control: current process.
- **Primary metric:** 8-week churn rate. Secondary: substitutions per order (the mechanism check).
- **Minimum detectable effect:** a 2.0 percentage-point reduction in 8-week churn, from a baseline of about 12 percent, at 80 percent power and 5 percent significance, which needs roughly 900 subscribers per arm. The segment has about 1,900, so the test is feasible at full enrolment.
- **Duration:** 8 weeks, with a pre-registered analysis of substitutions at week 2 to confirm the treatment actually lowered them.

**What would falsify the claim:** substitutions fall in the treatment arm but churn does not separate from control. That result would mean order quality is a marker, not a cause, and the next candidate is the Essentials assortment itself.
