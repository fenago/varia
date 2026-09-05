# Assignment 3 — AI Vendor Go/No-Go Memo for Keystone Residential Management (12 points)

## Context

This assignment is built from the brief Keystone Residential Management sent us; the employer brief is attached and is the primary document.

Keystone Residential Management manages 4,300 residential units across 38 associations and rental communities in Miami-Dade and Broward. Accounts payable handles about 2,900 vendor invoices a month with 3.5 full-time staff at roughly 11 minutes per invoice and a 4 percent error rate. Tenant and owner inquiries arrive at about 9,400 a month; a team of six reads, tags and routes them, and first-response time averages 19 hours. A vendor has proposed an AI platform to read and match invoices and to classify inquiries and draft first replies for human approval. Terms: $6,500 a month, $48,000 implementation, three years, with promised reductions of 70 percent in invoice handling time and 60 percent in inquiry triage time. The COO wants a go/no-go memo.

The data appendix gives: fully loaded cost of $58,000 per accounts-payable staff year and $52,000 per inquiry-team staff year; the six-person inquiry team spends 55 percent of its time on triage; rework and late fees from invoice errors cost about $3,100 a month; 14 percent of inquiries are maintenance emergencies or legal notices; the vendor's reference customers report 55 to 65 percent invoice time savings in the first year, not 70; the vendor stores data in the United States and offers a data-processing agreement; the platform's inquiry classifier was trained on English and Spanish, and 9 percent of Keystone's inquiries are in Haitian Creole.

## What you must produce

Produce a recommendation memo to the COO with five sections in this order: Fit, Return and payback, Risks and controls, Rollout plan with success metrics, Recommendation. The memo must reach an explicit go, no-go, or conditional go with the conditions named. Length is a constraint below; the memo should be readable by an operating executive in ten minutes.

## Constraints

- Length: 800 to 1,200 words.
- The return calculation must use the appendix figures, show the arithmetic, and use the reference customers' savings range rather than the vendor's promise. State the payback period under both the vendor's number and the reference range.
- The risk section must address tenant personally identifiable information, machine-drafted replies on emergencies and legal matters, the language gap, and what happens when the model is wrong. Each risk needs a control and an owner.
- The rollout plan must name a pilot scope, a duration, and the metric and threshold that would stop the rollout.
- Submit as a single document.

## Rubric

### Use-case fit analysis (3 points)
- 0: No assessment of fit, or fit asserted without reference to how the company works.
- 1: Fit is discussed for one of the two use cases.
- 2: Fit is assessed for both use cases against the company's volumes, staffing and error profile.
- 3: Fit is assessed for both, with the weaker use case identified and the reason it is weaker tied to the appendix.

### Return and payback calculation (3 points)
- 0: No calculation, or numbers without arithmetic.
- 1: A calculation using the vendor's promised savings only.
- 2: A calculation using the reference-customer range with arithmetic shown, including implementation cost.
- 3: Both scenarios shown, payback stated for each, and the memo states which single assumption the result is most sensitive to.

### Responsible-AI and data risks with controls (3 points)
- 0: Risks are not addressed.
- 1: Risks are listed without controls.
- 2: Each required risk has a control.
- 3: Each risk has a control and an owner, and the memo distinguishes risks that block signing from risks managed after signing.

### Rollout plan and recommendation (3 points)
- 0: No plan or no recommendation.
- 1: A recommendation without a pilot, or a pilot without a stopping rule.
- 2: A pilot with scope, duration and a stopping metric, and an explicit recommendation.
- 3: The pilot's stopping metric is tied to the return calculation, and the recommendation names its conditions.
