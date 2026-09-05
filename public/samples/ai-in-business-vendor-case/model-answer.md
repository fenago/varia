# Memo — AI Vendor Proposal: Invoice Processing and Inquiry Triage

**To:** Andre Pierre-Louis, Chief Operating Officer
**Re:** Go/no-go on the proposed platform
**Recommendation:** Conditional go, invoices first; inquiries only after the pilot clears two conditions below.

## 1. Fit

**Invoice processing fits well.** The work is high-volume (2,900 a month), rule-bound (match to purchase order, post for approval), and the current error rate of 4 percent is already costing $3,100 a month in rework and late fees. Invoice reading is the vendor's mature product; the reference customers' 55 to 65 percent time savings are for this use case.

**Inquiry triage fits partially.** Classifying 9,400 inquiries by topic and urgency is well suited to the platform. Drafting replies is not, for two reasons in the appendix. Fourteen percent of inquiries are maintenance emergencies or legal notices, where a wrong or slow machine draft has real consequences. And 9 percent of inquiries are in Haitian Creole, which the classifier was not trained on, so roughly one in eleven messages will be misrouted or unread by the model. Triage is the weaker use case, and reply drafting should be out of scope for the pilot.

## 2. Return and payback

**Invoices.** 3.5 staff at $58,000 is $203,000 a year. The vendor promises a 70 percent time reduction: $142,100 a year. The reference range of 55 to 65 percent gives $111,650 to $131,950. Add error reduction: if errors fall by half, rework and late fees fall by about $18,600 a year.

**Inquiries.** Six staff at $52,000 is $312,000; 55 percent of that is triage, $171,600. The vendor promises a 60 percent reduction: $102,960. Applying the same discount as the invoice reference range (roughly 0.85 of the promise) gives about $87,500, and the Creole gap means 9 percent of volume gets no benefit, so about $79,600.

**Cost.** $6,500 a month is $78,000 a year, plus $48,000 implementation in year one.

**Vendor scenario, both use cases:** savings $142,100 + $18,600 + $102,960 = $263,660 a year against $78,000; net $185,660; payback on the $48,000 implementation in about three months.

**Reference scenario, both use cases:** $111,650 + $18,600 + $79,600 = $209,850; net $131,850; payback in about four and a half months.

**Invoices only, reference scenario:** $130,250 against $78,000; net $52,250; payback in about eleven months.

The result is most sensitive to the invoice time-savings percentage. Each five-point drop below 55 percent removes about $10,000 a year; at 30 percent savings, invoices alone do not cover the subscription.

## 3. Risks and controls

Blocking before signing:
- **Tenant personally identifiable information leaves our systems.** Control: the data-processing agreement must name US storage, prohibit training on our data, and include deletion on termination. Owner: COO with counsel.
- **Machine-drafted replies on emergencies and legal notices.** Control: reply drafting disabled for the emergency and legal categories in the contract, not just the settings. Owner: inquiry team lead.

Managed after signing:
- **Haitian Creole inquiries misclassified.** Control: any message the classifier scores below 70 percent confidence, or detects as a language outside English and Spanish, routes to a human queue; measure Creole misroute rate monthly. Owner: inquiry team lead.
- **Invoice matching errors.** Control: human approval stays on every invoice above $2,000 and on any match below 90 percent confidence; sample 50 auto-posted invoices a week. Owner: accounts-payable supervisor.
- **Model wrong in ways nobody sees.** Control: a monthly reconciliation of model decisions against outcomes (late fees, tenant complaints about routing). Owner: operations analyst.
- **Three-year lock-in.** Control: negotiate a twelve-month exit if pilot thresholds are missed. Owner: COO.

## 4. Rollout plan

**Pilot scope:** invoice processing for the twelve largest associations, about 1,100 invoices a month, plus inquiry classification (no drafting) for two rental communities.

**Duration:** ninety days after implementation.

**Success metrics:** invoice handling time per invoice (target under 5 minutes, from 11); invoice error rate (target under 2 percent); inquiry first-response time in the pilot communities (target under 8 hours, from 19); Creole misroute rate (target under 5 percent).

**Stopping rule:** if invoice time savings are below 40 percent at day 60, stop the rollout and invoke the exit clause. Forty percent is where the invoice case alone falls to about a two-year payback.

## 5. Recommendation

Conditional go. Sign for invoice processing with the two blocking controls in the contract and the twelve-month exit. Run inquiry classification in the pilot without drafting. Expand to inquiries company-wide only if the Creole misroute rate is under 5 percent and first-response time is under 8 hours at day 90. Do not enable reply drafting for emergencies or legal notices under any scenario.
