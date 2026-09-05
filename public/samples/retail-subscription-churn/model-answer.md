# Churn Root Cause — Palmetto Fresh meal-kit subscription

**For:** Jerome Baptiste, Director of Subscription Growth

## 1. The question and the method

The question is not "who is likely to churn" but "what changed in January that is now removing five extra percentage points of subscribers a month." That is a change-point and attribution question, not a prediction question.

I considered three methods. A logistic churn model would rank subscribers by risk but would fold the cause into dozens of coefficients and tell us nothing about timing. A survival analysis with time-varying covariates (Cox model) lets us ask whether a subscriber's hazard of leaving rises after a specific experience, and by how much, while controlling for plan, tenure and zone. A difference-in-differences comparison of zones that changed against zones that did not directly tests the courier hypothesis. I used survival analysis as the main tool because the candidate causes are events in a subscriber's history, and difference-in-differences as the specific test of the courier. The Cox model assumes proportional hazards; I checked that assumption by tenure band and it holds for tenures over eight weeks, which covers 84 percent of churners.

## 2. Who is leaving and when

Churn by plan is flat. Churn by tenure has moved: in December, 61 percent of churn came from subscribers under 12 weeks old; by May, 58 percent came from subscribers over 26 weeks old. Long-tenured customers are leaving, which is unusual and points to an experience change rather than onboarding.

Churn by zone rose everywhere, from 6 to between 9 and 12 percent, with Zones 9 and 12 at 11.8 and 12.1 percent. That is only slightly above the network average, which is the first sign the courier is not the main story.

The event that separates churners from stayers is substitutions. Subscribers who received two or more substituted items in a single box in the prior four weeks churned at 3.4 times the rate of those who received none, controlling for plan, tenure and zone (hazard ratio 3.4, 95 percent interval 2.7 to 4.3). Box-level substitution rates rose from 0.3 items per box in December to 1.4 in April, across all zones.

## 3. Root cause and evidence chain

Substitution rates rose in January. Support tickets in the "wrong or missing ingredient" category tripled over the same months. The store-fulfilment data shows the cause: in January the company consolidated meal-kit picking from 14 stores to 4 regional stores to cut cost, and the four stores draw from a narrower supplier list. When a recipe ingredient is out of stock at a regional store, the picker substitutes. Long-tenured subscribers, who chose the service for specific recipes, are the ones who notice and leave.

**The courier hypothesis tested.** Difference-in-differences on Zones 9 and 12 versus the other 12 zones, February onward, shows an excess churn of 0.6 percentage points, with an interval that includes zero. The courier's exception rate is 2.1 percent against the in-house 1.8 percent. The courier is at most a minor contributor and not the cause.

**The discount and recipe refresh.** Neither addressed substitutions, which is why neither moved the number.

## 4. Quantification

Substitution exposure accounts for an estimated 3.8 of the 5.2 percentage-point rise in monthly churn, roughly 73 percent, with a range of 2.9 to 4.6 points. Without the substitution increase, May churn would be about 7.5 percent rather than 11.3. At the current base of 21,400 subscribers, that is roughly 810 subscribers per month lost to substitutions.

## 5. Recommendation and test

**Intervention.** Restore recipe-critical ingredients to the four regional stores' guaranteed stock list, and where a substitution is unavoidable, notify the subscriber before delivery with a one-tap option to skip the box at no charge.

**Test.** Comparison: Zones 1 to 7 receive the intervention from the first week of next month; Zones 8 to 14 continue as is for eight weeks, then receive it. Metric: monthly churn and box-level substitution rate. Duration: eight weeks. Decision rule: if churn in intervention zones falls at least 2 percentage points more than in comparison zones, roll out network-wide. If it does not, the substitution link is weaker than estimated and the next candidate is the consolidated picking itself, which would mean testing a return to store-level picking in two zones.
