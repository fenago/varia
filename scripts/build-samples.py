#!/usr/bin/env python3
"""Emit public/samples/<id>/* and src/shared/samples.ts from one source of truth.
Run: python3 scripts/build-samples.py
"""
import json, os, re, textwrap

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PUB = os.path.join(ROOT, "public", "samples")

def roster(names):
    lines = ["name,email"]
    for full in names:
        last, first = [p.strip() for p in full.split(",")]
        email = f"{first[0].lower()}{re.sub(r'[^a-z]', '', last.lower())}@students.mdc.example"
        lines.append(f'"{last}, {first}",{email}')
    return "\n".join(lines) + "\n"

SKILL_LIB = {
    "fairness-analysis": {"label": "Fairness analysis", "source": "taxonomy", "externalRef": "O*NET 15-2051.01 · Fairness assessment of models"},
    "robustness-evaluation": {"label": "Robustness evaluation", "source": "taxonomy", "externalRef": "O*NET 15-2051.01 · Model validation"},
    "documentation-review": {"label": "Technical documentation review", "source": "taxonomy", "externalRef": "O*NET 15-1299.08 · Technical documentation"},
    "risk-prioritisation": {"label": "Risk prioritisation", "source": "taxonomy", "externalRef": "O*NET 13-2054.00 · Risk assessment"},
    "model-auditing": {"label": "Model auditing", "source": "employer", "externalRef": "Bayfront MRM-C3 · Model risk audit"},
    "stakeholder-communication": {"label": "Stakeholder communication", "source": "employer", "externalRef": "Northline L2 · Executive communication"},
    "ethical-risk-analysis": {"label": "Ethical risk analysis", "source": "instructor"},
    "evidence-based-reasoning": {"label": "Evidence-based reasoning", "source": "instructor"},
    "incident-communication": {"label": "Incident communication", "source": "employer", "externalRef": "Coral Health CQ-7 · Clinical incident write-up"},
    "churn-analysis": {"label": "Churn analysis", "source": "employer", "externalRef": "Palmetto & Pine RET-2 · Retention analytics"},
    "root-cause-analysis": {"label": "Root-cause analysis", "source": "taxonomy", "externalRef": "O*NET 15-2041.00 · Statistical root-cause analysis"},
    "statistical-method-selection": {"label": "Statistical method selection", "source": "taxonomy", "externalRef": "O*NET 15-2041.00 · Method selection"},
    "data-pipeline-diagnosis": {"label": "Data pipeline diagnosis", "source": "employer", "externalRef": "Employer competency · Pipeline quality review"},
    "conversational-ai-evaluation": {"label": "Conversational AI evaluation", "source": "employer", "externalRef": "Employer competency · Guest-facing AI quality"},
    "evaluation-design": {"label": "Evaluation design", "source": "instructor"},
    "policy-compliance-analysis": {"label": "Policy compliance analysis", "source": "instructor"},
    "attribution-modelling": {"label": "Attribution modelling", "source": "taxonomy", "externalRef": "O*NET 13-1161.00 · Marketing analytics"},
    "funnel-analysis": {"label": "Funnel analysis", "source": "employer", "externalRef": "Marisol Hotels DM-3 · Conversion funnel review"},
    "budget-reallocation": {"label": "Budget reallocation", "source": "instructor"},
    "roi-estimation": {"label": "ROI and payback estimation", "source": "taxonomy", "externalRef": "O*NET 13-2051.00 · Financial analysis"},
    "responsible-ai-governance": {"label": "Responsible-AI governance", "source": "employer", "externalRef": "Keystone Residential OPS-9 · Vendor AI review"},
    "implementation-planning": {"label": "Implementation planning", "source": "instructor"},
    "intent-classification": {"label": "Intent classification", "source": "taxonomy", "externalRef": "O*NET 15-2051.01 · Text classification"},
    "multilingual-evaluation": {"label": "Multilingual evaluation", "source": "employer", "externalRef": "Coral Health Plan MS-2 · Member-services language access"},
    "error-analysis": {"label": "Error analysis", "source": "instructor"},
    "cohort-analysis": {"label": "Cohort and survival analysis", "source": "taxonomy", "externalRef": "O*NET 15-2041.00 · Longitudinal analysis"},
    "experiment-design": {"label": "Experiment design", "source": "instructor"},
}

def skills(keys):
    out = []
    for k in keys:
        s = {"key": k, "label": SKILL_LIB[k]["label"], "source": SKILL_LIB[k]["source"]}
        if "externalRef" in SKILL_LIB[k]:
            s["externalRef"] = SKILL_LIB[k]["externalRef"]
        out.append(s)
    return out

SAMPLES = []

STANDIN = "Employer names are stand-ins until a partner signs on; the problem is real to the industry."

# ---------------------------------------------------------------------------
# 1. CAP 4767 Data Mining — grocer subscription churn
# ---------------------------------------------------------------------------
SAMPLES.append({
    "id": "data-mining-churn",
    "industry": "Retail",
    "organisation": "Palmetto & Pine Market",
    "title": "Find the root cause of our online-order subscription churn",
    "summary": "A South Florida specialty grocer's online-order subscription is losing customers in a pattern the retention team cannot explain. Choose the method, find the cause, and design the test that confirms it.",
    "course": {"code": "CAP 4767", "title": "Data Mining", "program": "Bachelor of Science in Data Analytics"},
    "skillKeys": ["statistical-method-selection", "cohort-analysis", "churn-analysis", "root-cause-analysis", "experiment-design", "evidence-based-reasoning"],
    "partner": {"organisation": "Palmetto & Pine Market", "sector": "Retail", "contactName": "Daniela Ferrer", "contactRole": "Director of E-commerce", "contactEmail": "d.ferrer@palmettopine.example"},
    "challenge": {
        "title": "Find the root cause of our online-order subscription churn",
        "domain": "Retail",
        "stakeholderRole": "Director of e-commerce",
        "deliverable": "A data-mining brief: the method and why, the root cause with quantified evidence, a segment-level recommendation, and the test that would confirm it.",
        "contributedBy": "Daniela Ferrer",
    },
    "brief": """# Employer brief · Palmetto & Pine Market

**From:** Daniela Ferrer, Director of E-commerce
**For:** CAP 4767 Data Mining, Miami Dade College

We are a four-store specialty grocer in Miami-Dade and Broward. In 2024 we launched Pantry Plan, a weekly online-order subscription: customers pick a delivery window, we assemble the order, and a courier delivers it. We have 6,140 active subscribers and the plan is 22 percent of our revenue.

Since March, monthly churn has climbed from 4.1 percent to 7.6 percent. The retention team has tried a 15 percent win-back coupon and a courier change in Broward. Neither moved the number. What bothers me is that churn is not spread evenly. Customers who joined in the second half of 2025 churn faster than earlier cohorts, and the Broward stores look worse than Miami-Dade, but the team cannot tell me whether that is the courier, the product mix, the delivery window, or something about who we acquired last year.

I can give you the subscriber table (join date, store, delivery window, plan tier, weekly basket value, substitutions per order, on-time rate, support tickets, churn date), 18 months of it. I do not want a churn model that scores customers. I want to know why they leave, in a form I can act on by segment, and I want a test that will prove it before I spend money on a fix.

The skills this exercises are what I look for when I hire an analyst: picking the right method for the question, finding a cause rather than a correlation, and knowing how to prove it.

Employer names are stand-ins until a partner signs on; the problem is real to the industry.
""",
    "assignment": """# Assignment 4 — Subscription Churn Root-Cause Brief for Palmetto & Pine Market (12 points)

## Context

This assignment is built from the brief Palmetto & Pine Market sent us; the employer brief is attached and is the primary document.

Palmetto & Pine Market is a four-store specialty grocer with a weekly online-order subscription, Pantry Plan, launched in 2024. It has 6,140 active subscribers. Monthly churn rose from 4.1 percent in February to 7.6 percent in August. A 15 percent win-back coupon and a courier change in Broward did not reduce it. The Director of E-commerce reports two patterns the retention team cannot explain: subscribers who joined in the second half of 2025 churn faster than earlier cohorts, and the two Broward stores churn faster than the two Miami-Dade stores.

You have the subscriber-level table described in the employer brief: join date, home store, delivery window, plan tier (Essentials or Full Pantry), average weekly basket value, substitutions per order, courier on-time rate, support tickets in the last 60 days, and churn date if any, for 18 months. Summary statistics are provided in the data appendix: the July 2025 to December 2025 join cohort has a six-month retention of 61 percent against 78 percent for the January to June cohort; substitutions per order average 1.9 in Broward and 0.8 in Miami-Dade; on-time rate is 91 percent in Broward after the courier change and 94 percent in Miami-Dade; the Essentials tier is 71 percent of the late-2025 cohort and 44 percent of the early cohort.

## What you must produce

Produce a data-mining brief for the Director of E-commerce that selects and justifies an analytical method, identifies the root cause of the churn increase with quantified evidence from the appendix, recommends an action for each affected segment, and designs a test that would confirm the cause before the company spends on a fix. The brief must have exactly four sections in that order: Method, Root cause, Segment recommendations, Confirmation test.

Write for a director who reads numbers well but does not run code.

## Constraints

- Length: 900 to 1,300 words.
- The Method section must compare at least two candidate approaches (for example cohort and survival analysis, a classification model, association rules) and state why the chosen one fits the question of why customers leave rather than who will leave.
- Every causal claim must cite a figure from the data appendix. Where the appendix cannot separate two explanations, say so and let the confirmation test resolve it.
- The confirmation test must state the unit of assignment, the metric, the minimum detectable effect, and the duration.
- Submit as a single document.

## Rubric

### Method selection with justification (3 points)
- 0: No method is chosen, or the choice is asserted without reasons.
- 1: A method is chosen with reasons, but the alternatives are not considered.
- 2: At least two methods are compared and the choice is tied to the question being asked.
- 3: Methods are compared, the choice is tied to the question, and the brief states what the chosen method cannot tell the director.

### Root cause with quantified evidence (3 points)
- 0: No root cause, or a cause with no numbers.
- 1: A cause is named with a figure but competing explanations are ignored.
- 2: A cause is named, supported by figures from the appendix, and at least one competing explanation is ruled out with evidence.
- 3: The cause is supported, competitors are ruled out, and the brief separates what the data proves from what it only suggests.

### Segment-level recommendations (3 points)
- 0: No recommendations, or one recommendation for everyone.
- 1: Recommendations differ by segment but are not tied to the cause.
- 2: Each affected segment gets a recommendation tied to the cause with an expected effect.
- 3: Recommendations are tied to the cause, sized by expected effect, and ordered by revenue at risk.

### Confirmation test design (3 points)
- 0: No confirmation test is proposed.
- 1: A test is proposed without the unit of assignment or the metric.
- 2: The test states unit, metric, minimum detectable effect and duration.
- 3: The test is fully specified and the brief explains what result would falsify the root-cause claim.
""",
    "answer": """# Pantry Plan Churn: Root-Cause Brief

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
""",
    "roster": ["Acosta, Valentina", "Bautista, Marco", "Cisneros, Yesenia", "Dorsainvil, Jean", "Espinal, Rafael", "Fontaine, Nadège", "Guerrero, Lissette", "Hoang, Thu", "Iglesias, Joaquín", "Jean-Baptiste, Widlene", "Kowalczyk, Piotr", "Lozano, Ana Sofía", "Mbeki, Thandiwe", "Novak, Katarina", "Ortiz, Damián", "Pham, Linh", "Quiñones, Ileana", "Ramkissoon, Devi", "Saintil, Marckenson", "Tavares, Bruno", "Urbina, Carolina", "Villanueva, Esteban", "Wallace, Jordan", "Xavier, Renata", "Yanez, Ricardo", "Zayas, Milagros", "Almonte, Jenniffer", "Brito, Anderson"],
})

# ---------------------------------------------------------------------------
# 2. MAR 2704 Marketing Web Analytics — hotel paid-social attribution
# ---------------------------------------------------------------------------
SAMPLES.append({
    "id": "marketing-web-analytics-attribution",
    "industry": "Hospitality",
    "organisation": "Marisol Boutique Hotels",
    "title": "Why did paid social double our sessions but not our direct bookings?",
    "summary": "A Miami boutique hotel group doubled paid-social spend for a fall promotion; sessions rose 84 percent, direct bookings barely moved. Diagnose the funnel, compare attribution models, and reallocate the budget.",
    "course": {"code": "MAR 2704", "title": "Marketing Web Analytics", "program": "Digital Marketing Strategy College Credit Certificate"},
    "skillKeys": ["funnel-analysis", "attribution-modelling", "budget-reallocation", "evidence-based-reasoning", "stakeholder-communication", "experiment-design"],
    "partner": {"organisation": "Marisol Boutique Hotels", "sector": "Hospitality", "contactName": "Gabriela Torres", "contactRole": "Marketing Manager", "contactEmail": "g.torres@marisolhotels.example"},
    "challenge": {
        "title": "Why did paid social double our sessions but not our direct bookings?",
        "domain": "Hospitality",
        "stakeholderRole": "Marketing manager",
        "deliverable": "A web-analytics diagnosis of the fall promotion, an attribution comparison, a budget reallocation, and the dashboard the marketing manager will watch weekly.",
        "contributedBy": "Gabriela Torres",
    },
    "brief": """# Employer brief · Marisol Boutique Hotels

**From:** Gabriela Torres, Marketing Manager
**For:** MAR 2704 Marketing Web Analytics, Miami Dade College

We run three boutique hotels in Miami Beach, Coconut Grove and Coral Gables, 212 rooms in total. Direct bookings on our own site are worth about 18 percent more to us than bookings through online travel agencies, so every fall we run a promotion to pull bookings direct.

This year I doubled paid-social spend for the fall promotion, from $24,000 to $48,000 across Instagram and Facebook, with a "stay three nights, fourth free" offer. Sessions from paid social went up 84 percent. Direct bookings went up 6 percent. My owner wants to know what happened to the money.

Here is what the analytics show. Paid-social sessions land 92 percent on a promotion landing page. Bounce rate on that page went from 41 to 67 percent, and 71 percent of the new sessions are mobile. Of the sessions that reached the booking engine, the conversion rate held at 2.9 percent, about the same as last year. Last-click attribution gives paid social 210 direct bookings; the data-driven model in GA4 gives it 141 and moves the difference to organic search and email. Our email list grew by 1,400 during the promotion.

I want a diagnosis I can defend to the owner, a recommendation on where the next $48,000 goes, and a dashboard I can watch every Monday.

Employer names are stand-ins until a partner signs on; the problem is real to the industry.
""",
    "assignment": """# Assignment 5 — Fall Promotion Diagnosis for Marisol Boutique Hotels (12 points)

## Context

This assignment is built from the brief Marisol Boutique Hotels sent us; the employer brief is attached and is the primary document.

Marisol Boutique Hotels operates three properties in Miami Beach, Coconut Grove and Coral Gables with 212 rooms. Direct bookings are worth about 18 percent more than bookings through online travel agencies. For the fall promotion the marketing manager doubled paid-social spend from $24,000 to $48,000 on a "stay three nights, fourth free" offer. Paid-social sessions rose 84 percent; direct bookings rose 6 percent. The owner wants to know what happened to the money.

You have the GA4-style figures in the data appendix: paid-social sessions rose from 31,200 to 57,400; 92 percent of them land on the promotion landing page, whose bounce rate rose from 41 to 67 percent; 71 percent of paid-social sessions are mobile against 54 percent site-wide; landing-page load time on mobile is 5.8 seconds against 2.1 on desktop; booking-engine conversion held at 2.9 percent; funnel step counts are landing page 52,800, room search 17,900, rate selection 9,600, guest details 6,100, confirmation 5,000 site-wide during the promotion; last-click attribution credits paid social with 210 direct bookings, data-driven attribution credits it with 141 and moves 46 to organic search and 23 to email; the email list grew by 1,400 and email converts direct bookings at 4.7 percent; average direct booking value is $612.

## What you must produce

Produce a promotion diagnosis for the marketing manager with four sections in this order: Funnel diagnosis, Attribution comparison, Budget reallocation, Weekly dashboard. The diagnosis must locate where the additional sessions were lost, the comparison must explain what last-click and data-driven attribution each say about paid social and which one the manager should use for the owner conversation, the reallocation must propose how to spend the next $48,000 with an expected return, and the dashboard must name no more than eight metrics with the question each answers.

## Constraints

- Length: 900 to 1,300 words.
- Every diagnostic claim must cite a figure from the appendix. Do not compute figures the appendix does not support; where you estimate, label the estimate and show the arithmetic.
- The attribution section must state the assumption each model makes and why the two disagree here.
- The reallocation must include one test that would tell the manager within four weeks whether the change worked.
- Submit as a single document.

## Rubric

### Funnel diagnosis with evidence (3 points)
- 0: No funnel diagnosis, or a diagnosis without figures.
- 1: The loss is located in the funnel but not explained.
- 2: The loss is located and explained using the appendix figures, including the mobile and landing-page evidence.
- 3: The loss is located, explained with figures, and the brief quantifies how many bookings the identified problem cost.

### Attribution comparison (3 points)
- 0: One model reported as truth, or the models are not compared.
- 1: Both models are reported without explaining why they disagree.
- 2: Both are reported, each model's assumption is stated, and the disagreement is explained.
- 3: The comparison also recommends which model to use for the owner conversation and why, with the assisted-conversion evidence.

### Budget reallocation with expected return (3 points)
- 0: No reallocation, or a reallocation with no reasoning.
- 1: A reallocation is proposed without an expected return.
- 2: The reallocation shows expected return using appendix figures and labelled estimates.
- 3: The reallocation shows return, ranks options, and includes a four-week test that would confirm or reverse it.

### Weekly dashboard design (3 points)
- 0: No dashboard.
- 1: A list of metrics with no purpose stated.
- 2: At most eight metrics, each paired with the question it answers.
- 3: Metrics are purposeful, ordered from leading to lagging, and the brief states the threshold at which each should trigger action.
""",
    "answer": """# Fall Promotion Diagnosis — Marisol Boutique Hotels

**Prepared for:** Gabriela Torres, Marketing Manager

## 1. Funnel diagnosis

The additional sessions were lost at the landing page, and mostly on phones.

Paid-social sessions rose from 31,200 to 57,400, an increase of 26,200. Ninety-two percent of them land on the promotion page, so roughly 24,100 additional sessions arrived there. The page's bounce rate rose from 41 to 67 percent. At last year's bounce rate, about 14,200 of those new sessions would have continued; at this year's, about 8,000 did. The difference, about 6,200 sessions, never saw a room.

The reason is mobile. Seventy-one percent of paid-social sessions are mobile against 54 percent site-wide, and the landing page loads in 5.8 seconds on mobile against 2.1 on desktop. The campaign bought a mobile audience and sent it to a page that mobile users abandon. Below the landing page the funnel is healthy: booking-engine conversion held at 2.9 percent, the same as last year, and the step-to-step ratios (room search to rate selection 54 percent, rate selection to guest details 64 percent, guest details to confirmation 82 percent) are in line with the site's norm.

What the problem cost: had the 6,200 lost sessions continued at the site's landing-to-confirmation rate during the promotion (5,000 confirmations from 52,800 landing sessions, 9.5 percent), they would have produced about 590 additional bookings. Labelled estimate: that assumes lost mobile sessions convert like the average continuing session, which is generous; a mobile-specific rate would put the figure between 350 and 590. At $612 per direct booking, the landing page cost between $214,000 and $361,000 in bookings that the spend had already paid to attract.

## 2. Attribution comparison

Last-click gives all credit to the channel of the final session before booking. Data-driven attribution distributes credit across touchpoints according to how much each changed the probability of booking, estimated from the site's own conversion paths.

Last-click credits paid social with 210 direct bookings. Data-driven credits it with 141 and moves 46 to organic search and 23 to email. They disagree because paid social is doing top-of-funnel work: a guest sees the offer on Instagram, leaves, searches the hotel name a few days later or opens the promotion email, and books. Last-click sees only the search or the email; data-driven sees the Instagram session that started the path. The email list grew by 1,400 during the promotion, which is the assisted-conversion evidence in plain view: paid social built the audience that email converted at 4.7 percent.

For the owner conversation, use data-driven, and say why: last-click overstates paid social's direct bookings and hides its role in feeding organic and email. The honest number is 141 direct bookings plus a share of 69 assisted ones, roughly $86,000 in direct booking value against $48,000 in spend, before the landing-page loss is fixed.

## 3. Budget reallocation

Ranked by expected return on the next $48,000.

1. **Fix the mobile landing page before spending anything.** Target a load time under 2.5 seconds and a bounce rate back near 41 percent. Cost: development time, not media. Expected return: recovering even half of the 350 to 590 lost bookings is worth $107,000 to $180,000 at $612 each.
2. **Paid social at $30,000, mobile-first creative, same offer.** With the page fixed, the 2.9 percent booking-engine rate and a 41 percent bounce rate imply roughly 210 to 240 bookings from the same session volume scaled to the lower spend. Labelled estimate.
3. **Email at $6,000.** The list grew by 1,400 and email converts at 4.7 percent. A three-touch promotion sequence to the full list is the cheapest booking in the mix.
4. **Branded search at $12,000.** Data-driven moved 46 bookings to organic search; protecting the branded query during the promotion keeps that path from being captured by the online travel agencies' ads.

**Four-week test.** Split paid-social traffic 50/50 between the current landing page and the rebuilt mobile page for two weeks, then two weeks of full rollout. Metric: landing-page bounce rate and landing-to-confirmation rate by device. Decision rule: if mobile bounce on the new page is not below 50 percent by day 14, stop the media spend and return to the page.

## 4. Weekly dashboard

Ordered from leading to lagging, each with the question it answers and the action threshold.

1. **Mobile landing-page load time.** Is the page fast enough for the audience we buy? Act above 3.0 seconds.
2. **Landing-page bounce rate by device.** Are sessions continuing? Act above 50 percent on mobile.
3. **Paid-social sessions and cost per session.** Is the spend buying the traffic we planned? Act if cost per session rises 25 percent week over week.
4. **Landing-to-room-search rate.** Is the offer interesting once seen? Act below 30 percent.
5. **Booking-engine conversion rate.** Is the engine healthy? Act below 2.5 percent.
6. **Direct bookings, data-driven by channel.** Which channels are actually producing? Act if paid social's share falls below 20 percent.
7. **Email list growth and email booking rate.** Is paid social feeding the list, and is the list converting? Act if growth falls below 200 per week.
8. **Direct booking value per media dollar.** Is the whole thing paying? Act below $1.50 of booking value per dollar.
""",
    "roster": ["Alfonso, Daniela", "Benítez, Kevin", "Charles, Fabienne", "Dávila, Mateo", "Estrada, Melissa", "Ferreira, Lucas", "Gómez, Nayeli", "Hernández, Adrián", "Innocent, Ricardo", "Jiménez, Paola", "Khan, Ayesha", "Louis, Stéphanie", "Marrero, Xavier", "Nguyen, Kim", "Ocampo, Sebastián", "Peralta, Giselle", "Rosario, Emmanuel", "Santos, Bianca", "Toussaint, Marlène", "Ulloa, Cristian", "Valdés, Karla", "Wright, Malik", "Yepes, Andrea", "Zamora, Luis", "Arriaga, Dominique", "Castellanos, Ivan"],
})

# ---------------------------------------------------------------------------
# 3. GEB 1432 Applied AI in Business — property-management vendor case
# ---------------------------------------------------------------------------
SAMPLES.append({
    "id": "ai-in-business-vendor-case",
    "industry": "Real estate",
    "organisation": "Keystone Residential Management",
    "title": "Should we sign the AI vendor for invoices and tenant inquiries?",
    "summary": "A regional property manager received a proposal to automate invoice processing and tenant-inquiry triage. Write the COO's go/no-go memo: fit, ROI and payback, responsible-AI risks, and the rollout plan.",
    "course": {"code": "GEB 1432", "title": "Applied Artificial Intelligence (AI) in Business", "program": "School of Business · Applied AI pathway"},
    "skillKeys": ["roi-estimation", "responsible-ai-governance", "implementation-planning", "risk-prioritisation", "stakeholder-communication", "evidence-based-reasoning"],
    "partner": {"organisation": "Keystone Residential Management", "sector": "Real estate", "contactName": "Andre Pierre-Louis", "contactRole": "Chief Operating Officer", "contactEmail": "a.pierrelouis@keystoneres.example"},
    "challenge": {
        "title": "Should we sign the AI vendor for invoices and tenant inquiries?",
        "domain": "Real estate",
        "stakeholderRole": "Chief operating officer",
        "deliverable": "A recommendation memo to the COO: use-case fit, ROI and payback from the proposal figures, responsible-AI and data-handling risks with controls, an implementation plan with success metrics, and a go/no-go.",
        "contributedBy": "Andre Pierre-Louis",
    },
    "brief": """# Employer brief · Keystone Residential Management

**From:** Andre Pierre-Louis, Chief Operating Officer
**For:** GEB 1432 Applied Artificial Intelligence (AI) in Business, Miami Dade College

We manage 4,300 residential units across 38 associations and rental communities in Miami-Dade and Broward. Two back-office jobs eat our time. Accounts payable processes about 2,900 vendor invoices a month by hand: 3.5 full-time staff, roughly 11 minutes per invoice, and a 4 percent error rate that generates rework and late fees. Tenant and owner inquiries come in at about 9,400 a month by email and portal; a team of six spends most of its day reading them, tagging them and routing them to maintenance, accounting or the community manager, and our first-response time averages 19 hours.

A vendor has proposed a platform that reads invoices, matches them to purchase orders and posts them for approval, and that classifies inquiries by topic and urgency and drafts a first reply for a person to approve. Their proposal: $6,500 a month subscription, $48,000 implementation, a promised 70 percent reduction in invoice handling time and a 60 percent reduction in inquiry triage time, contract term three years.

I need someone to tell me whether this is a good fit for how we actually work, what it is worth in dollars, what could go wrong with tenant data and with a machine drafting replies about late rent or maintenance emergencies, and how we would roll it out so we find out early if the vendor's numbers are wrong. A one-page memo with the reasoning behind it. Go or no-go.

Employer names are stand-ins until a partner signs on; the problem is real to the industry.
""",
    "assignment": """# Assignment 3 — AI Vendor Go/No-Go Memo for Keystone Residential Management (12 points)

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
""",
    "answer": """# Memo — AI Vendor Proposal: Invoice Processing and Inquiry Triage

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
""",
    "roster": ["Alvarado, Nicolás", "Baptiste, Roseline", "Cardona, Jessica", "Duarte, Felipe", "Elías, Samira", "Figueroa, Gabriel", "Garrido, Isabella", "Henriquez, Omar", "Ibarra, Natalia", "Joseph, Kervens", "Kaplan, Noa", "Lemus, Diego", "Montoya, Camilo", "Narváez, Daniela", "Oduya, Chidi", "Pacheco, Ariana", "Rivas, Jonathan", "Sánchez, Yamila", "Trujillo, Andrés", "Umaña, Beatriz", "Vergara, Tomás", "Williams, Aaliyah", "Ybarra, Marisol", "Zapata, Julián", "Aguilar, Fernanda", "Bermúdez, Hugo", "Colón, Priscilla"],
})

# ---------------------------------------------------------------------------
# 4. CAI 3303C Natural Language Processing — health-plan ticket triage
# ---------------------------------------------------------------------------
SAMPLES.append({
    "id": "nlp-support-ticket-triage",
    "industry": "Healthcare",
    "organisation": "Coral Health Plan",
    "title": "Design the triage system for 40,000 member messages a month",
    "summary": "A South Florida health plan wants member messages in English, Spanish and Haitian Creole triaged by intent and urgency. Design the labelling scheme, compare model options, and plan the evaluation with a per-language fairness check.",
    "course": {"code": "CAI 3303C", "title": "Natural Language Processing", "program": "Bachelor of Science in Applied Artificial Intelligence"},
    "skillKeys": ["intent-classification", "multilingual-evaluation", "evaluation-design", "error-analysis", "fairness-analysis", "risk-prioritisation"],
    "partner": {"organisation": "Coral Health Plan", "sector": "Healthcare", "contactName": "Marie-Josée Alexis", "contactRole": "Director of Member Services", "contactEmail": "mj.alexis@coralhealthplan.example"},
    "challenge": {
        "title": "Design the triage system for 40,000 member messages a month",
        "domain": "Healthcare",
        "stakeholderRole": "Director of member services",
        "deliverable": "An NLP system design and evaluation plan: labelling scheme, model options compared, metrics with a per-language fairness check, error analysis on the sample messages, and the escalation rule for urgent cases.",
        "contributedBy": "Marie-Josée Alexis",
    },
    "brief": """# Employer brief · Coral Health Plan

**From:** Marie-Josée Alexis, Director of Member Services
**For:** CAI 3303C Natural Language Processing, Miami Dade College

We are a Medicaid and Marketplace health plan with about 310,000 members in Miami-Dade, Broward and Palm Beach. Our member-services centre receives about 40,000 written messages a month through the member portal and email. By our own sampling, 58 percent are in English, 33 percent in Spanish and 9 percent in Haitian Creole, with a fair amount of mixing inside single messages.

Today a team of 22 agents reads every message and decides what it is (claim question, prior authorisation, find a provider, ID card, billing, pharmacy, complaint, appeal, and so on) and how urgent it is. About 6 percent of messages describe something we must act on within 24 hours: a denied medication a member needs now, a pregnancy-related access problem, an appeal deadline, a safety concern. Our median time to first human response is 31 hours, and we have missed urgent cases that were buried in long messages or written in Creole.

We want a system that reads each message, assigns an intent and an urgency level, and routes urgent cases to a human within the hour. I have 18 months of messages with the agents' tags, though the tags are inconsistent, and I can share 200 de-identified sample messages across the three languages. I need a design, a plan to evaluate it that is fair to our Creole-speaking members, and the rule that decides when a case is urgent. If the honest answer is that some part of this should stay with humans, tell me.

Employer names are stand-ins until a partner signs on; the problem is real to the industry.
""",
    "assignment": """# Assignment 4 — Member Message Triage Design for Coral Health Plan (12 points)

## Context

This assignment is built from the brief Coral Health Plan sent us; the employer brief is attached and is the primary document.

Coral Health Plan serves about 310,000 Medicaid and Marketplace members in South Florida. Its member-services centre receives about 40,000 written messages a month, 58 percent in English, 33 percent in Spanish and 9 percent in Haitian Creole, with code-switching within messages. Twenty-two agents read and tag every message by intent (claims, prior authorisation, provider search, ID card, billing, pharmacy, complaint, appeal, other) and urgency. About 6 percent of messages require action within 24 hours. Median time to first human response is 31 hours, and urgent cases have been missed, particularly in long messages and in Creole. The director wants a triage system that assigns intent and urgency and routes urgent cases to a human within the hour.

The data appendix provides: 18 months of tagged messages, about 700,000, with agent agreement on intent of 81 percent and on urgency of 68 percent when double-tagged; 200 de-identified sample messages, 116 English, 66 Spanish and 18 Creole, with gold labels; prevalence of urgent messages 6.1 percent overall, 5.8 percent in English, 6.0 percent in Spanish and 9.4 percent in Creole; benchmark figures for three candidate approaches on a held-out set, a fine-tuned multilingual encoder classifier (macro F1 0.84 intent, urgent recall 0.79 English, 0.77 Spanish, 0.52 Creole), a zero-shot large language model with a written rubric (macro F1 0.80, urgent recall 0.88, 0.85, 0.71), and a hybrid that uses the encoder for intent and the language model for urgency with a confidence threshold routing to humans (macro F1 0.84, urgent recall 0.90, 0.88, 0.80, with 14 percent of messages routed to human review); cost per 1,000 messages of $0.40, $6.10 and $2.30 respectively.

## What you must produce

Produce a system design and evaluation plan for the Director of Member Services with five sections in this order: Labelling scheme, Model options, Evaluation and fairness, Error analysis, Escalation rule. The labelling scheme must define the intent set and the urgency levels with decision rules an agent could apply consistently. The model options section must compare the three approaches on quality, cost and risk and choose one. The evaluation section must specify metrics, the held-out design, and a per-language fairness check with a threshold. The error analysis must examine the sample messages and name the failure patterns. The escalation rule must state, operationally, when a message goes to a human within the hour.

## Constraints

- Length: 1,000 to 1,400 words.
- Use the appendix figures for every quantitative claim. Where the appendix is silent, say what you would need to measure.
- The fairness check must treat Creole urgent recall as a gate, not a footnote, and state what happens if the gate fails.
- The escalation rule must be expressed so that a person could apply it by hand to a message.
- Submit as a single document.

## Rubric

### Labelling scheme with decision rules (3 points)
- 0: No scheme, or a list of labels with no rules.
- 1: Labels are defined but urgency rules are vague.
- 2: Intent and urgency are defined with decision rules an agent could apply consistently.
- 3: The scheme also addresses the 68 percent urgency agreement, proposing how to raise it before training.

### Model options compared and chosen (3 points)
- 0: One option presented, or no comparison.
- 1: Options are listed with figures but no choice, or a choice without reasons.
- 2: Options are compared on quality, cost and risk using the appendix, and one is chosen with reasons.
- 3: The choice is justified and the design states what would make the team switch to another option.

### Evaluation with per-language fairness gate (3 points)
- 0: No evaluation plan.
- 1: Metrics are named without a held-out design or a language breakdown.
- 2: Metrics, held-out design and per-language reporting are specified, with a fairness threshold.
- 3: The fairness threshold is a gate with a stated consequence, and the plan says how the Creole sample will be grown to make the gate measurable.

### Error analysis and escalation rule (3 points)
- 0: No error analysis or no rule.
- 1: Errors are described in general, and the rule is vague.
- 2: Failure patterns are named from the sample messages, and the rule is operational.
- 3: Patterns are tied to the escalation rule, which handles low confidence, unsupported language and long messages explicitly.
""",
    "answer": """# Member Message Triage — System Design and Evaluation Plan

**Prepared for:** Marie-Josée Alexis, Director of Member Services, Coral Health Plan

## 1. Labelling scheme

**Intent (single label, nine classes):** claims, prior authorisation, provider search, ID card, billing, pharmacy, complaint, appeal, other. Rule: label the action the member is asking the plan to take, not the topic they mention; a member who complains about a denied prescription and asks how to appeal is "appeal." When two actions are requested, label the one with the nearer deadline.

**Urgency (three levels):**
- **Urgent (act within 24 hours):** any of: a medication the member states they cannot obtain now; pregnancy or newborn access; an appeal or grievance deadline within 7 days; a safety concern; loss of coverage that blocks care today. Presence of any one trigger is sufficient.
- **Priority (act within 3 business days):** prior authorisation for scheduled care, billing disputes with a due date, provider access problems without immediate care need.
- **Routine:** everything else.

**Raising urgency agreement from 68 percent.** The disagreement is in the boundary between urgent and priority. Before training, re-label a 2,000-message sample with the trigger list above, measure agreement, and adjudicate disagreements into written examples per trigger. Train only on labels produced under the new rules; the 18 months of historical urgency tags are useful for intent but should not be trusted for urgency.

## 2. Model options

| Option | Intent macro F1 | Urgent recall EN / ES / HT | Cost per 1,000 | Risk |
|---|---|---|---|---|
| Fine-tuned encoder | 0.84 | 0.79 / 0.77 / 0.52 | $0.40 | Misses half of urgent Creole cases |
| Zero-shot LLM with rubric | 0.80 | 0.88 / 0.85 / 0.71 | $6.10 | Cost at 40,000 a month is $244 per month per 1,000, about $2,900 monthly; less controllable |
| Hybrid (encoder intent, LLM urgency, confidence routing) | 0.84 | 0.90 / 0.88 / 0.80 | $2.30 | 14 percent of messages go to human review |

**Choice: the hybrid.** It matches the encoder on intent, has the best urgent recall in every language, and routes 14 percent of messages (about 5,600 a month) to humans, which is the mechanism that protects Creole speakers while the model improves. Cost is about $920 a month. The encoder alone is disqualified by Creole urgent recall of 0.52: it would miss nearly one in two urgent Creole messages, which is worse than the current process.

**What would make us switch.** If Creole urgent recall for the LLM component falls below 0.75 on the growing Creole evaluation set, move all Creole messages to human triage until a Creole-specific model is available. If the human-review share exceeds 20 percent for two months, the confidence threshold is too conservative and should be retuned against the fairness gate.

## 3. Evaluation and fairness

**Held-out design.** A stratified test set of 3,000 messages re-labelled under the new scheme: 1,500 English, 1,000 Spanish, 500 Creole, oversampling Creole and urgent cases so each language has at least 60 urgent examples. Refresh quarterly with new messages so the set tracks drift.

**Metrics.** Intent: macro F1 and per-class F1. Urgency: recall on urgent (the cost of a miss is a member without medication), precision on urgent (the cost of a false alarm is agent time), and time-to-human for urgent cases end to end.

**Fairness gate.** Urgent recall per language must be at least 0.85 in each of English, Spanish and Creole, and the gap between the best and worst language must be at most 0.08. If Creole fails the gate at any evaluation, Creole messages route to human triage in full until it passes. The current Creole sample of 18 messages cannot measure this; the plan grows it to 500 by having the two Creole-speaking agents label 60 messages a week for eight weeks before launch.

## 4. Error analysis

On the 200 sample messages, four failure patterns appear.

1. **Buried urgency.** Eleven messages exceed 400 words and mention the urgent trigger in the final third. The encoder truncates at 512 tokens and misses two of them; the LLM catches both. Design response: pass the full message, and run the urgency model on the last paragraph separately when a message exceeds 300 words.
2. **Code-switching.** Nine Spanish messages switch to English for medical terms; four Creole messages switch to French or English. Intent is unaffected; urgency confidence drops. Design response: detect mixed language and lower the routing threshold for those messages.
3. **Polite framing.** Six urgent messages are phrased as routine questions ("I was wondering when my prescription might be approved") with the trigger implicit. The rubric-driven LLM catches four; the encoder none. Design response: add "member cannot obtain medication now" examples in polite register to the labelling examples.
4. **Appeal deadlines stated as dates.** Five messages give a deadline as a date rather than "in five days." Neither model computes the interval reliably. Design response: extract dates with a rule and compute days-to-deadline in code before classification.

## 5. Escalation rule

A message goes to a human within the hour when any of the following is true:
1. The urgency model labels it urgent with confidence at or above 0.60.
2. The urgency model's confidence for any level is below 0.60.
3. The detected language is not English or Spanish, or the message is mixed-language and confidence is below 0.75.
4. The message exceeds 300 words and the last-paragraph pass disagrees with the whole-message pass.
5. A rule-extracted deadline is within 7 days.

A person applies this by hand as: does the message contain any of the five urgent triggers; is it in Creole or mixed; is it long with the request at the end; is there a date within a week. If yes to any, route within the hour. Everything else queues by intent with the priority level attached.
""",
    "roster": ["Antoine, Daphnée", "Blanco, Rodrigo", "Cabrera, Melanie", "Desir, Jonas", "Escobar, Valeria", "Franco, Mauricio", "Galán, Sofía", "Hidalgo, Emilio", "Ismael, Farah", "Jules, Wesley", "Kouri, Nadia", "Lafontant, Régine", "Medina, Alejandra", "Núñez, Brandon", "Ochoa, Ximena", "Pérez-Vega, Lorenzo", "Quintana, Adriana", "Rojas, Ismael", "Sylvain, Kettly", "Torres, Miguel", "Uribe, Constanza", "Vidal, Leonardo", "Whitfield, Amara", "Zelaya, Marta", "Arce, Nicole", "Bonilla, Ernesto", "Céspedes, Laura", "Dieudonné, Patrick", "Estévez, Camila", "Fuentes, Óscar"],
})

# ---------------------------------------------------------------------------
# 5. CAP 4631C Machine Learning for Data Analytics I — lending fairness audit
# ---------------------------------------------------------------------------
SAMPLES.append({
    "id": "ml-lending-fairness-audit",
    "industry": "Lending",
    "organisation": "Bayfront Regional Bank",
    "title": "Audit our loan-default classifier",
    "summary": "A regional bank's default model is declining applicants in two lending regions at a rate underwriting cannot explain. Audit it from the partial model card: performance and fairness gaps, robustness under shift, documentation gaps, and what to fix first.",
    "course": {"code": "CAP 4631C", "title": "Machine Learning for Data Analytics I", "program": "Bachelor of Science in Data Analytics"},
    "skillKeys": ["fairness-analysis", "robustness-evaluation", "documentation-review", "risk-prioritisation", "model-auditing", "evidence-based-reasoning"],
    "partner": {"organisation": "Bayfront Regional Bank", "sector": "Lending", "contactName": "Marisol Quintero", "contactRole": "Chief Risk Officer", "contactEmail": "m.quintero@bayfront.example"},
    "challenge": {
        "title": "Audit our loan-default classifier",
        "domain": "Lending",
        "stakeholderRole": "Risk officer",
        "deliverable": "A structured audit from the partial model card: performance and fairness gaps with evidence, robustness under shift, documentation gaps, and prioritised recommendations the model risk committee can act on.",
        "contributedBy": "Marisol Quintero",
    },
    "brief": """# Employer brief · Bayfront Regional Bank

**From:** Marisol Quintero, Chief Risk Officer
**For:** CAP 4631C Machine Learning for Data Analytics I, Miami Dade College

We put a loan-default classifier into production in March across our three lending regions. In August the underwriting team in the Southwest and Coastal regions raised a complaint: applicants there are being declined at a rate that does not match what underwriters see in the files. The model vendor gave us a partial model card. It reports an aggregate accuracy of 0.91 and an AUC of 0.88, says "no disparate impact detected," and lists 41 features, but it does not break anything down by region, income band, or the age of the credit file, and it does not report calibration.

What we want back is not a rebuild. We want an audit a model risk committee can read in one sitting: what the card proves, what it leaves out, where the model is likely to be fragile when the applicant mix changes, and which three things we should fix first and why. If the card cannot support the "no disparate impact" claim, say so plainly and tell us what evidence would.

The skills this exercises are the ones we hire for in our model risk group: fairness analysis, robustness evaluation, technical documentation review, and risk prioritisation. Whoever does this well would be someone we want to meet.

Employer names are stand-ins until a partner signs on; the problem is real to the industry.
""",
    "assignment": """# Assignment 6 — Classifier Audit for Bayfront Regional Bank (12 points)

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
""",
    "answer": """# Classifier Audit — Bayfront Regional Bank loan-default model

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
""",
    "roster": ["Okonkwo, Adaeze", "Nakamura, Kenji", "Silva, Beatriz", "Petrov, Mikhail", "Haddad, Layla", "O'Sullivan, Ciara", "Mensah, Kwame", "Lindqvist, Erik", "Reyes, Camila", "Zhou, Wei", "Abdullah, Yusuf", "Fischer, Lena", "Moreau, Élodie", "Castillo, Diego", "Osei, Abena", "Kowalski, Marek", "Rahman, Farida", "Delgado, Mateo", "Novák, Tereza", "Adeyemi, Tunde", "Vargas, Lucía", "Sato, Yuki", "Nascimento, Gabriel", "Ibrahim, Zainab", "Kaur, Simran", "Berg, Sofie", "Torres, Isabela", "Nkemelu, Chidi"],
})

# ---------------------------------------------------------------------------
# Emit
# ---------------------------------------------------------------------------
def manifest(s):
    files = [
        {"name": "assignment.md", "kind": "task+rubric", "path": "assignment.md"},
        {"name": "model-answer.md", "kind": "solution", "path": "model-answer.md"},
        {"name": "employer-brief.md", "kind": "task", "path": "employer-brief.md"},
        {"name": "roster.csv", "kind": "roster", "path": "roster.csv"},
    ]
    return {
        "id": s["id"],
        "industry": s["industry"],
        "organisation": s["organisation"],
        "title": s["title"],
        "summary": s["summary"],
        "course": s["course"],
        "files": files,
        "challenge": {
            "organisation": s["organisation"],
            "title": s["challenge"]["title"],
            "brief": s["brief"].split("\n\n", 2)[2].strip() if s["brief"].count("\n\n") >= 2 else s["brief"].strip(),
            "domain": s["challenge"]["domain"],
            "stakeholderRole": s["challenge"]["stakeholderRole"],
            "deliverable": s["challenge"]["deliverable"],
            "skillKeys": s["skillKeys"],
            "contributedBy": s["challenge"]["contributedBy"],
        },
        "partner": s["partner"],
        "skills": skills(s["skillKeys"]),
        "preExtracted": None,
    }

manifests = []
for s in SAMPLES:
    d = os.path.join(PUB, s["id"])
    os.makedirs(d, exist_ok=True)
    with open(os.path.join(d, "assignment.md"), "w") as f: f.write(s["assignment"].strip() + "\n")
    with open(os.path.join(d, "model-answer.md"), "w") as f: f.write(s["answer"].strip() + "\n")
    with open(os.path.join(d, "employer-brief.md"), "w") as f: f.write(s["brief"].strip() + "\n")
    with open(os.path.join(d, "roster.csv"), "w") as f: f.write(roster(s["roster"]))
    m = manifest(s)
    manifests.append(m)
    with open(os.path.join(d, "manifest.json"), "w") as f:
        json.dump(m, f, ensure_ascii=False, indent=2); f.write("\n")

ts = '''/**
 * Sample assessments: five employer-sourced assignments that load through the
 * real ingest and extraction path. GENERATED by scripts/build-samples.py from
 * one source of truth; the test in samples.test.ts asserts that each entry
 * deep-equals public/samples/<id>/manifest.json. Do not edit by hand.
 */
import type { SampleAssessment } from "./types";

export const SAMPLE_IDS = ''' + json.dumps([m["id"] for m in manifests]) + ''' as const;

export const SAMPLES: SampleAssessment[] = ''' + json.dumps(manifests, ensure_ascii=False, indent=2) + ''';

export function sampleById(id: string): SampleAssessment | null {
  return SAMPLES.find((s) => s.id === id) ?? null;
}
'''
with open(os.path.join(ROOT, "src", "shared", "samples.ts"), "w") as f:
    f.write(ts)

for s in SAMPLES:
    wa = len(s["assignment"].split()); wm = len(s["answer"].split()); wb = len(s["brief"].split())
    print(f'{s["id"]}: assignment {wa} words, answer {wm}, brief {wb}, roster {len(s["roster"])}')
