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
    "churn-analysis": {"label": "Churn analysis", "source": "employer", "externalRef": "Palmetto Fresh GA-2 · Retention analytics"},
    "root-cause-analysis": {"label": "Root-cause analysis", "source": "taxonomy", "externalRef": "O*NET 15-2041.00 · Statistical root-cause analysis"},
    "statistical-method-selection": {"label": "Statistical method selection", "source": "taxonomy", "externalRef": "O*NET 15-2041.00 · Method selection"},
    "data-pipeline-diagnosis": {"label": "Data pipeline diagnosis", "source": "employer", "externalRef": "Gulfstream DE-4 · Pipeline quality review"},
    "conversational-ai-evaluation": {"label": "Conversational AI evaluation", "source": "employer", "externalRef": "Sunward GX-1 · Guest-facing AI quality"},
    "evaluation-design": {"label": "Evaluation design", "source": "instructor"},
    "policy-compliance-analysis": {"label": "Policy compliance analysis", "source": "instructor"},
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

# ---------------------------------------------------------------------------
# 1. Lending
# ---------------------------------------------------------------------------
SAMPLES.append({
    "id": "lending-loan-default-audit",
    "industry": "Lending",
    "organisation": "Bayfront Regional Bank",
    "title": "Audit our loan-default classifier",
    "summary": "A regional bank's default model is declining applicants in two lending regions at a rate underwriting cannot explain. Audit it from the partial model card.",
    "course": {"code": "DAT 4100", "title": "Applied AI and Data Analytics"},
    "skillKeys": ["fairness-analysis", "robustness-evaluation", "documentation-review", "risk-prioritisation", "model-auditing", "evidence-based-reasoning"],
    "partner": {"organisation": "Bayfront Regional Bank", "sector": "Lending", "contactName": "Marisol Quintero", "contactRole": "Chief Risk Officer", "contactEmail": "m.quintero@bayfront.example"},
    "challenge": {
        "title": "Audit our loan-default classifier",
        "domain": "Lending",
        "stakeholderRole": "Risk officer",
        "deliverable": "A structured audit identifying fairness, robustness and documentation gaps, with prioritised recommendations the model risk committee can act on.",
        "contributedBy": "Marisol Quintero",
    },
    "brief": """# Employer brief · Bayfront Regional Bank

**From:** Marisol Quintero, Chief Risk Officer
**For:** DAT 4100, Miami Dade College

We put a loan-default classifier into production in March across our three lending regions. In August the underwriting team in the Southwest and Coastal regions raised a complaint: applicants there are being declined at a rate that does not match what underwriters see in the files. The model vendor gave us a partial model card. It reports an aggregate accuracy of 0.91 and says "no disparate impact detected," but it does not break anything down by region, income band, or the age of the credit file.

What we want back is not a rebuild. We want an audit a model risk committee can read in one sitting: what the card proves, what it leaves out, where the model is likely to be fragile when the applicant mix changes, and which three things we should fix first and why. If the card cannot support the "no disparate impact" claim, say so plainly and tell us what evidence would.

The skills this exercises are the ones we hire for in our model risk group: fairness analysis, robustness evaluation, technical documentation review, and risk prioritisation. Whoever does this well would be someone we want to meet.
""",
    "assignment": """# Assignment 3 — Model Card Audit for Bayfront Regional Bank (12 points)

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
""",
    "answer": """# Model Card Audit — Bayfront Regional Bank loan-default classifier

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
""",
    "roster": ["Okonkwo, Adaeze", "Nakamura, Kenji", "Silva, Beatriz", "Petrov, Mikhail", "Haddad, Layla", "O'Sullivan, Ciara", "Mensah, Kwame", "Lindqvist, Erik", "Reyes, Camila", "Zhou, Wei", "Abdullah, Yusuf", "Kowalski, Anna", "Osei, Abena", "Tanaka, Hiro", "Moreau, Élise", "Singh, Priya", "Delgado, Mateo", "Novak, Tomas", "Adeyemi, Folake", "Kim, Soo-jin", "Fitzgerald, Aoife", "Oyelaran, Tunde", "Vargas, Lucía", "Brennan, Declan", "Farah, Amina", "Costa, Rafael", "Weber, Lena", "Nguyen, Thanh"],
})

# ---------------------------------------------------------------------------
# 2. Healthcare
# ---------------------------------------------------------------------------
SAMPLES.append({
    "id": "healthcare-sepsis-model-incident",
    "industry": "Healthcare",
    "organisation": "Coral Health Network",
    "title": "Explain why our sepsis-risk model degraded",
    "summary": "A sepsis early-warning model started missing cases in two units after an EHR upgrade. Write the incident analysis and the one-page memo clinical leadership will read.",
    "course": {"code": "DAT 4100", "title": "Applied AI and Data Analytics"},
    "skillKeys": ["root-cause-analysis", "robustness-evaluation", "incident-communication", "stakeholder-communication", "risk-prioritisation", "evidence-based-reasoning"],
    "partner": {"organisation": "Coral Health Network", "sector": "Healthcare", "contactName": "Dr. Renata Okafor", "contactRole": "Chief Clinical Informatics Officer", "contactEmail": "r.okafor@coralhealth.example"},
    "challenge": {
        "title": "Explain why our sepsis-risk model degraded",
        "domain": "Healthcare",
        "stakeholderRole": "Clinical lead",
        "deliverable": "A root-cause incident analysis and a one-page memo for clinical leadership, with a monitoring recommendation.",
        "contributedBy": "Dr. Renata Okafor",
    },
    "brief": """# Employer brief · Coral Health Network

**From:** Dr. Renata Okafor, Chief Clinical Informatics Officer
**For:** DAT 4100, Miami Dade College

We run a sepsis early-warning model on two medical-surgical units and one step-down unit. It fires an alert when a patient's risk score crosses a threshold, and the nursing team escalates. In the first week of June, nurses on the two med-surg units told us the model had "gone quiet." Our own retrospective check confirmed it: sensitivity on those two units fell from about 0.78 in April to 0.52 in June, while the step-down unit stayed flat. The week before the drop, our EHR vendor pushed an upgrade that changed how lactate results and some vital-sign fields are recorded.

We think we know what happened, but we need someone outside the team to work it through from the data description and tell us, in an order a clinical leadership committee can act on, what broke, what it means for patients, and what monitoring would have caught it in a day instead of a month.

We want two things back: a root-cause incident analysis with the evidence laid out, and a one-page memo to the chief nursing officer and the chief medical officer that a non-technical reader can act on. The skills are the ones our informatics team lives on: root-cause analysis, robustness thinking about data pipelines, and writing an incident up so that a clinician trusts it.
""",
    "assignment": """# Assignment 4 — Sepsis Model Incident Analysis for Coral Health Network (12 points)

## Context

Coral Health Network runs a sepsis early-warning model on two medical-surgical units (Units 3A and 3B) and one step-down unit (Unit 5). The model scores each admitted patient every hour from vital signs, lab results and nursing assessments, and alerts the care team above a risk threshold. In the first week of June, nurses on 3A and 3B reported that alerts had become rare. A retrospective check found unit-level sensitivity fell from 0.78 in April to 0.52 in June on 3A and 3B, while Unit 5 held at 0.76. The EHR vendor pushed an upgrade on 27 May that changed the units and field mapping for lactate results and moved two vital-sign fields into a new flowsheet.

You have the incident summary, the model's input specification (18 features, including lactate in mmol/L, respiratory rate, temperature, mean arterial pressure and white-cell count), the upgrade release notes, and unit-level monthly sensitivity and alert-volume tables.

## What you must produce

Produce a root-cause incident analysis that explains the sensitivity drop and its patient impact, and a one-page memo to the chief nursing officer and chief medical officer that a non-technical reader can act on. The analysis must contain exactly four sections: timeline and evidence, root cause with the mechanism explained, patient impact and what remains uncertain, and a monitoring design that would have detected the failure within a day. The memo must fit on one page and end with three decisions leadership is being asked to make.

Write the analysis for the informatics team and the memo for clinical leadership. They are different readers.

## Constraints

- Analysis: 800 to 1,200 words. Memo: 300 to 400 words, separate heading, plain language.
- Every causal claim must point to a specific item in the release notes, the input specification or the monthly tables. Where the evidence only supports a hypothesis, label it as such and say what would confirm it.
- The monitoring design must state the metric, the comparison, the threshold and who is paged.
- Submit as a single document with the memo last.

## Rubric

### Root cause identified with mechanism (3 points)
- 0: No root cause proposed, or a cause asserted without mechanism.
- 1: A plausible cause is named but the mechanism from upgrade to missed alerts is not traced.
- 2: The mechanism is traced from the specific upgrade change through the model input to the sensitivity drop.
- 3: The mechanism is traced, alternative explanations are considered and ruled out or bounded, and the unit-level difference is explained.

### Evidence use and uncertainty (3 points)
- 0: Claims are unsupported by the provided materials.
- 1: Some claims cite the materials; hypotheses and facts are mixed.
- 2: Claims cite the materials and hypotheses are labelled.
- 3: Claims cite the materials, hypotheses are labelled, and the analysis states what data would confirm each.

### Monitoring design (3 points)
- 0: No monitoring proposed.
- 1: Monitoring is proposed in general terms.
- 2: Monitoring names a metric, comparison and threshold that would have caught this incident quickly.
- 3: Monitoring names metric, comparison, threshold and escalation owner, and explains why it generalises to other upgrade-induced failures.

### Memo for clinical leadership (3 points)
- 0: No memo, or the memo restates the technical analysis.
- 1: The memo is plain-language but does not lead to decisions.
- 2: The memo is plain-language, fits one page, and ends with clear decisions.
- 3: The memo does all of the above and correctly conveys patient impact and uncertainty without overstating either.
""",
    "answer": """# Sepsis Model Incident Analysis — Coral Health Network

## 1. Timeline and evidence

- **April:** Sensitivity 0.78 (3A), 0.79 (3B), 0.76 (5). Alert volume roughly 41 per week per unit.
- **27 May:** EHR upgrade. Release notes: lactate results now stored in mg/dL rather than mmol/L in the results table; respiratory rate and temperature moved from the vitals flowsheet to a new "nursing observations" flowsheet on med-surg units only; step-down units retained the legacy flowsheet pending a second phase.
- **28 May to 4 June:** Alert volume on 3A and 3B falls to 14 per week; Unit 5 unchanged at 40.
- **June:** Sensitivity 0.52 (3A), 0.51 (3B), 0.76 (5).

The two facts that matter: the drop is confined to the units whose flowsheets changed, and it begins the day after the upgrade.

## 2. Root cause and mechanism

The model's input specification expects lactate in mmol/L. After the upgrade, lactate is stored in mg/dL. The conversion factor is roughly 9, so a lactate of 4.0 mmol/L (a strong sepsis signal) arrives as 36 mg/dL. If the ingestion layer applied the model's documented plausibility clip (0 to 15 mmol/L), values above 15 would be treated as missing and imputed with the population median, which is about 1.3. That single change turns the model's strongest laboratory signal into a normal reading for every patient with elevated lactate.

This alone would degrade all three units, but Unit 5 did not degrade. The second change explains the difference: on med-surg units only, respiratory rate and temperature moved to a new flowsheet that the model's feed does not read. Those two features are null for 3A and 3B after 27 May and imputed as normal. Unit 5 kept its flowsheet, so its vitals still flow. The lactate change would then be expected to cause a small drop on Unit 5 as well; the tables show none, which suggests the lactate mapping was corrected in the results interface for step-down before or shortly after go-live, or that step-down's lactate draw frequency is low enough to be swamped. That is a hypothesis; the results interface change log would confirm it.

**Alternatives considered.** A change in case mix on 3A and 3B is not supported: admissions and confirmed sepsis counts are flat month to month. A threshold change is ruled out by the model configuration history. Nursing documentation lag would raise, not lower, the count of nulls only on new admissions, and the drop is immediate and uniform.

## 3. Patient impact and uncertainty

With sensitivity halved on two units for five weeks, and roughly 23 confirmed sepsis cases per month across 3A and 3B, the model is estimated to have missed about 6 to 7 cases per month that it would previously have flagged. Whether any of those patients were harmed depends on whether clinical judgement caught them independently; the retrospective chart review should establish that. This analysis cannot say the model caused harm. It can say the model's contribution to early detection was largely absent on two units for five weeks, and nobody was told.

## 4. Monitoring that would have caught this in a day

- **Metric:** daily alert rate per unit, and daily null rate per input feature per unit.
- **Comparison:** each unit against its own trailing 28-day median.
- **Threshold:** alert rate below 50 percent of median for two consecutive days, or any feature's null rate above 20 percent for one day.
- **Escalation:** page the on-call clinical informatics engineer; notify the unit nurse manager.
- **Why it generalises:** upgrade-induced failures show up first as input distribution shifts, not as outcome shifts. Watching nulls and ranges per feature per unit catches unit-scoped changes like this one, and catches unit conversions because the range moves.

---

# Memo to the Chief Nursing Officer and Chief Medical Officer

**Subject:** Sepsis early-warning model on Units 3A and 3B, 28 May to present

**What happened.** On 27 May the electronic health record was upgraded. Two changes in that upgrade stopped the sepsis model from seeing three of its most important inputs on Units 3A and 3B: lactate results, respiratory rate and temperature. The model kept running and kept producing scores, but the scores were built on incomplete information. Its ability to catch sepsis on those two units fell by about a third. Unit 5 was not affected.

**What it means for patients.** We estimate the model missed roughly six to seven cases per month on the two units that it would previously have flagged. We do not yet know whether any patient was harmed; care teams may have caught these cases on their own. A chart review is underway and will answer that.

**Why it took five weeks to notice.** Nothing was watching whether the model's inputs were arriving. The first signal was nurses noticing that alerts had become rare.

**Three decisions we are asking you to make.**
1. Approve restoring the model's inputs on 3A and 3B this week, with a validation run before alerts resume.
2. Approve the daily input-monitoring design described in the analysis, so a similar failure pages an engineer within a day.
3. Approve the retrospective chart review of missed cases and agree how findings will be communicated to families if harm is found.
""",
    "roster": ["Achebe, Chinwe", "Bergström, Linnea", "Castillo, Diego", "Dubois, Margaux", "Eze, Obinna", "Fontaine, Théo", "Gonzalez, Ximena", "Hussein, Rania", "Ibrahim, Khalid", "Jansen, Femke", "Kaur, Harleen", "Lopez, Andrés", "Mbeki, Thandiwe", "Nakashima, Yui", "Olsen, Magnus", "Park, Ji-ho", "Quispe, Rosa", "Rahman, Tariq", "Sato, Aiko", "Torres, Valentina", "Udo, Chidi", "Villanueva, Isabela", "Wang, Mei", "Yilmaz, Emre", "Zapata, Sofía", "Adler, Noah", "Boateng, Kofi"],
})

# ---------------------------------------------------------------------------
# 3. Retail subscription
# ---------------------------------------------------------------------------
SAMPLES.append({
    "id": "retail-subscription-churn",
    "industry": "Retail",
    "organisation": "Palmetto Fresh",
    "title": "Find the root cause of our meal-kit churn",
    "summary": "A grocer's meal-kit subscription is losing customers in a pattern the retention team cannot explain. Choose the method, find the cause, and recommend what to do about it.",
    "course": {"code": "DAT 3200", "title": "Applied Analytics"},
    "skillKeys": ["churn-analysis", "statistical-method-selection", "root-cause-analysis", "evidence-based-reasoning", "stakeholder-communication"],
    "partner": {"organisation": "Palmetto Fresh", "sector": "Retail", "contactName": "Jerome Baptiste", "contactRole": "Director of Subscription Growth", "contactEmail": "j.baptiste@palmettofresh.example"},
    "challenge": {
        "title": "Find the root cause of our meal-kit churn",
        "domain": "Retail",
        "stakeholderRole": "Growth director",
        "deliverable": "A churn analysis that names the method, isolates the cause, quantifies its size, and recommends one intervention with a way to test it.",
        "contributedBy": "Jerome Baptiste",
    },
    "brief": """# Employer brief · Palmetto Fresh

**From:** Jerome Baptiste, Director of Subscription Growth
**For:** DAT 3200, Miami Dade College

Palmetto Fresh is a regional grocer. Two years ago we launched a meal-kit subscription: a weekly box, four plans, delivered from our own stores. It grew well for eighteen months. Since January, monthly churn has climbed from about 6 percent to about 11 percent, and the retention team cannot tell me why. They have tried a discount, which did not move the number, and a new recipe rotation, which did not either.

We have clean data: every subscriber's plan, start month, delivery zip, weekly order history, substitutions, delivery issues, and support tickets. We have a suspicion it has something to do with the switch to a third-party courier in two delivery zones, but the courier's own on-time numbers look fine.

What I need is someone who can pick the right way to look at this, not just run a churn model. Tell me which subscribers are leaving, when in their tenure, what they experienced before they left, what the most likely cause is, how big it is, and what one thing you would do about it and how we would know it worked. If the courier is not the cause, I need to hear that too.

The skills are churn analysis, choosing the right statistical method for the question, root-cause thinking, and explaining the answer to a business owner.
""",
    "assignment": """# Assignment 2 — Subscription Churn Root Cause for Palmetto Fresh (12 points)

## Context

Palmetto Fresh, a regional grocer, runs a meal-kit subscription with four weekly plans delivered from its own stores across 14 delivery zones. Monthly churn rose from 6.1 percent in December to 11.3 percent in May. A 15 percent retention discount in March and a recipe refresh in April did not change the trend. In February the company moved delivery in Zones 9 and 12 to a third-party courier whose reported on-time rate is 96 percent, comparable to the in-house fleet.

You have a subscriber-level dataset description: plan, start month, delivery zone, weekly order and skip history, substitution counts per box, delivery exceptions (late, damaged, missing item), support tickets with category, and churn month if churned. You also have monthly churn by zone, by plan, and by tenure band, and the courier's monthly on-time and exception reports for Zones 9 and 12.

You are working for the Director of Subscription Growth, who has to decide what to do next month.

## What you must produce

Produce a churn analysis that selects and justifies an analytical method, isolates the most likely cause of the churn increase, quantifies its size, and recommends one intervention with a way to test whether it worked. Your analysis must contain exactly four sections: the question and the method you chose over the alternatives, what the data shows about who is leaving and when, the root cause with the evidence chain, and a recommendation with a test design. State clearly if the courier hypothesis is not supported.

Write for a business reader who will fund the intervention.

## Constraints

- Length: 800 to 1,200 words.
- Name at least two methods you considered and say why you chose the one you did for this question.
- Quantify: how many subscribers per month the cause accounts for, and what churn would be without it.
- The test design must name the comparison group, the metric, the duration and the decision rule.
- Submit as a single document.

## Rubric

### Method selection and justification (3 points)
- 0: No method named, or a method applied without reference to the question.
- 1: A method is named; alternatives are not discussed.
- 2: A method is chosen over named alternatives with reasons tied to the question and data.
- 3: The choice is justified, its assumptions and limits for this dataset are stated, and the analysis explains how the alternatives would have misled.

### Root cause isolated with evidence chain (3 points)
- 0: No cause proposed, or a cause asserted without evidence.
- 1: A cause is proposed with partial evidence; confounds are not addressed.
- 2: A cause is isolated with an evidence chain that addresses the obvious confound.
- 3: A cause is isolated, confounds are addressed, and competing explanations (including the courier) are explicitly tested and resolved.

### Quantification (3 points)
- 0: No quantification.
- 1: Descriptive numbers only, not tied to the cause.
- 2: The cause's share of the churn increase is estimated with a stated basis.
- 3: The estimate is given with its uncertainty and a counterfactual churn rate.

### Recommendation and test design (3 points)
- 0: No recommendation, or one that does not follow from the cause.
- 1: A recommendation follows from the cause but has no test.
- 2: The recommendation has a test with comparison group, metric and duration.
- 3: The test also states a decision rule and what would be done if it fails.
""",
    "answer": """# Churn Root Cause — Palmetto Fresh meal-kit subscription

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
""",
    "roster": ["Adebayo, Ngozi", "Blanchard, Étienne", "Chowdhury, Farhan", "Dominguez, Paloma", "Eriksen, Sigrid", "Fujimoto, Ren", "Garza, Emiliano", "Hoffmann, Klara", "Iyer, Ananya", "Jimenez, Rocío", "Kaplan, Ezra", "Lam, Vivian", "Mahmoud, Omar", "Nwosu, Ifeoma", "Ortega, Sebastián", "Popescu, Ilinca", "Qureshi, Zara", "Rossi, Giulia", "Sandoval, Joaquín", "Thompson, Malik", "Ueda, Sora", "Vega, Marisol", "Whitfield, Jada", "Xu, Liang", "Yoon, Da-eun", "Zimmermann, Felix", "Ali, Samir", "Bautista, Carmen", "Cruz, Teodoro", "Diallo, Mariama"],
})

# ---------------------------------------------------------------------------
# 4. Logistics
# ---------------------------------------------------------------------------
SAMPLES.append({
    "id": "logistics-vendor-scoring-bias",
    "industry": "Logistics",
    "organisation": "Gulfstream Last Mile",
    "title": "Find why our vendor-scoring model flags the wrong accounts",
    "summary": "A delivery carrier's vendor-risk model keeps flagging reliable contractors and clearing unreliable ones. Trace the bias through the data pipeline and recommend a fix.",
    "course": {"code": "DAT 3200", "title": "Applied Analytics"},
    "skillKeys": ["data-pipeline-diagnosis", "fairness-analysis", "root-cause-analysis", "robustness-evaluation", "risk-prioritisation"],
    "partner": {"organisation": "Gulfstream Last Mile", "sector": "Logistics", "contactName": "Dana Whitlock", "contactRole": "VP Network Operations", "contactEmail": "d.whitlock@gulfstreamlm.example"},
    "challenge": {
        "title": "Find why our vendor-scoring model flags the wrong accounts",
        "domain": "Logistics",
        "stakeholderRole": "Operations lead",
        "deliverable": "A pipeline diagnosis that locates where the bias enters, shows its effect on scores, and recommends a fix with a validation plan.",
        "contributedBy": "Dana Whitlock",
    },
    "brief": """# Employer brief · Gulfstream Last Mile

**From:** Dana Whitlock, VP Network Operations
**For:** DAT 3200, Miami Dade College

Gulfstream contracts about 340 independent delivery vendors across South Florida. Every month a scoring model rates each vendor on reliability, and the bottom decile gets a performance review and can lose routes. Since we rebuilt the scoring pipeline last fall, our route managers say the model is flagging vendors they consider reliable and clearing ones they consider problems. Two of the flagged vendors have been with us for six years with clean records; one that was cleared had three route abandonments in a quarter.

The model itself has not changed. What changed is the pipeline that feeds it: we moved from a nightly batch to a streaming feed, added a new scan-event source from the handheld devices, and started filling gaps in delivery timestamps with an estimate.

I need someone to trace the bias from the pipeline into the scores. Where does it enter, which vendors does it hurt and help, how much does it move a score, and what is the fix. I also need a plan to validate the fix before we act on scores again, because we have route managers who no longer trust the number and vendors who may have been wrongly reviewed.

The skills: data pipeline diagnosis, fairness thinking applied to a scoring system, root-cause analysis, and prioritising what to fix first when several things are wrong.
""",
    "assignment": """# Assignment 3 — Vendor-Scoring Pipeline Diagnosis for Gulfstream Last Mile (12 points)

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
""",
    "answer": """# Vendor-Scoring Pipeline Diagnosis — Gulfstream Last Mile

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
""",
    "roster": ["Amadi, Chiamaka", "Bishop, Terrence", "Calderón, Ignacio", "Dvořák, Petra", "Escobar, Renata", "Fernández, Álvaro", "Gutierrez, Daniela", "Hayashi, Kenta", "Ionescu, Andrei", "Jang, Min-seo", "Khan, Ayesha", "Lindgren, Oskar", "Martínez, Guadalupe", "Ndiaye, Awa", "Oduya, Femi", "Pacheco, Nicolás", "Ramirez, Esperanza", "Sørensen, Freja", "Tremblay, Gabrielle", "Umar, Halima", "Varga, Bence", "Washington, Jamal", "Yamamoto, Sakura", "Zhang, Bo", "Abernathy, Cole", "Brooks, Imani"],
})

# ---------------------------------------------------------------------------
# 5. Hospitality
# ---------------------------------------------------------------------------
SAMPLES.append({
    "id": "hospitality-chatbot-policy-audit",
    "industry": "Hospitality",
    "organisation": "Sunward Hotels",
    "title": "Audit our concierge chatbot's cancellation answers",
    "summary": "A hotel group's AI concierge gives guests inconsistent answers about the cancellation policy. Audit the failures and design the evaluation that would catch them before guests do.",
    "course": {"code": "CAI 3100", "title": "Applied AI"},
    "skillKeys": ["conversational-ai-evaluation", "evaluation-design", "policy-compliance-analysis", "documentation-review", "risk-prioritisation", "stakeholder-communication"],
    "partner": {"organisation": "Sunward Hotels", "sector": "Hospitality", "contactName": "Priyanka Raman", "contactRole": "VP Guest Experience", "contactEmail": "p.raman@sunwardhotels.example"},
    "challenge": {
        "title": "Audit our concierge chatbot's cancellation answers",
        "domain": "Hospitality",
        "stakeholderRole": "Guest experience lead",
        "deliverable": "A failure audit of the chatbot's policy answers and an evaluation design with test cases, metrics and a release gate.",
        "contributedBy": "Priyanka Raman",
    },
    "brief": """# Employer brief · Sunward Hotels

**From:** Priyanka Raman, VP Guest Experience
**For:** CAI 3100, Miami Dade College

Sunward runs 22 hotels under three brands. Last spring we put an AI concierge on our booking site and in the app. It answers questions about amenities, directions, and policies. It is popular. It is also, we have learned, inconsistent about our cancellation policy. In the last quarter, 140 guests disputed a cancellation fee saying the chatbot told them cancellation was free. In some of those transcripts it did. In others it gave the right answer for the wrong brand, or the right answer for a flexible rate when the guest had booked a non-refundable one.

Our cancellation policy is not simple. It varies by brand, by rate type, by how far out the stay is, and by whether the booking came through us or a third party. The chatbot was given the policy documents and a system prompt. Nobody tested it against the policy systematically before launch.

What I want back: an audit of how and why the answers go wrong, grounded in the transcripts and the policy documents, and an evaluation we can run every time we change the bot, so that it cannot ship if it gets the policy wrong. Test cases, how to score them, and a pass mark. I also need to know which failures cost us money and which cost us trust, because they are not the same.

Skills: evaluating a conversational AI system, designing an evaluation with a release gate, reading a policy closely enough to know when an answer is wrong, and prioritising.
""",
    "assignment": """# Assignment 5 — Concierge Chatbot Policy Audit for Sunward Hotels (12 points)

## Context

Sunward Hotels operates 22 properties under three brands with an AI concierge on its booking site and app. The concierge answers guest questions from a system prompt and a set of policy documents. Cancellation policy varies by brand (Sunward Select, Sunward Resorts, Sunward Suites), by rate type (flexible, advance purchase, non-refundable), by lead time to arrival, and by booking channel (direct or third party). Over the last quarter, 140 guests disputed cancellation fees on the basis of what the chatbot told them.

You have the three brand policy documents, the concierge's system prompt, a coded sample of 60 disputed transcripts with the guest's actual booking details attached, and the dispute outcomes (fee waived, fee upheld, partial refund).

You are working for the VP of Guest Experience, who owns the chatbot and the dispute budget.

## What you must produce

Produce a failure audit of the chatbot's cancellation-policy answers and an evaluation design that would catch these failures before a new version reaches guests. The audit must classify the failures in the transcript sample into named failure types with the mechanism for each, separating failures that cost money from failures that cost trust. The evaluation design must specify test cases (with a stated coverage rule across brand, rate type, lead time and channel), a scoring method, a pass mark, and a release gate. Your document must contain exactly four sections: failure taxonomy with evidence, root causes in the prompt and policy documents, the evaluation design, and prioritised recommendations.

Write for a guest-experience executive who will approve the evaluation and fund the fixes.

## Constraints

- Length: 900 to 1,300 words.
- Every failure type must cite at least one transcript and the policy clause it violated.
- The test set must cover every combination of brand and rate type at minimum, and the coverage rule must be stated.
- The pass mark must be justified against the cost of the failures it prevents.
- Submit as a single document.

## Rubric

### Failure taxonomy grounded in evidence (3 points)
- 0: Failures are described generically without reference to transcripts or policy.
- 1: Failures are grouped, with some transcript references but weak policy grounding.
- 2: Failure types are named, each tied to transcripts and the violated policy clause.
- 3: Failure types are named, tied to transcripts and clauses, and separated by financial versus trust cost with numbers from the sample.

### Root cause in prompt and documents (3 points)
- 0: No root cause.
- 1: Root cause asserted without pointing to the prompt or documents.
- 2: Root causes are located in specific prompt instructions or document structure.
- 3: Root causes are located and each is linked to the failure types it produces.

### Evaluation design with release gate (3 points)
- 0: No evaluation design.
- 1: Test cases are proposed without a coverage rule or scoring method.
- 2: Test cases follow a stated coverage rule, with a scoring method and pass mark.
- 3: The design also justifies the pass mark against failure cost and defines the release gate operationally.

### Prioritised recommendations (3 points)
- 0: No recommendations.
- 1: Recommendations are listed without order.
- 2: Recommendations are ordered by stated criterion.
- 3: Recommendations are ordered, each tied to a failure type, and the executive is told what to approve first and why.
""",
    "answer": """# Concierge Chatbot Cancellation-Policy Audit — Sunward Hotels

**For:** Priyanka Raman, VP Guest Experience

## 1. Failure taxonomy with evidence

From the 60 coded transcripts, four failure types account for 57 cases.

**Type A — Wrong brand policy (22 cases).** The guest asks about cancellation while viewing a Sunward Resorts booking; the bot answers with the Sunward Select policy, which allows free cancellation up to 24 hours before arrival. Resorts policy clause 3.2 requires 72 hours. Transcript 07 is representative: the guest names the property, the bot never asks the brand. Financial cost: 19 of 22 disputes resulted in waived fees, a mean of $187 each.

**Type B — Rate type ignored (18 cases).** The guest holds a non-refundable advance-purchase rate; the bot describes the flexible-rate terms. All three policy documents, clause 4.1, state that advance-purchase rates are non-refundable after booking. Transcript 23: the bot says "you can cancel free of charge up to the day before." Financial cost: 15 fees waived, mean $241.

**Type C — Lead-time arithmetic (11 cases).** The bot states the right policy but miscounts the window, for example telling a guest 70 hours before arrival that they are inside the 72-hour free window. Clause 3.2 and 3.4 define windows from local check-in time. Cost: mostly trust; 8 of 11 fees were upheld after review, but 6 of those guests filed complaints.

**Type D — Channel confusion (6 cases).** Third-party bookings must be cancelled through the third party (clause 6.1); the bot offers to cancel directly, the guest believes it is done, and the stay is charged as a no-show. Cost: both. Fees were waived in 4 cases; all 6 guests left negative reviews naming the bot.

Money failures: Types A and B, roughly $7,200 in waived fees in the sample quarter and an estimated $17,000 across all disputes. Trust failures: Types C and D, lower direct cost, higher review damage.

## 2. Root causes in the prompt and documents

- The system prompt says "answer policy questions using the attached documents" and never instructs the bot to establish brand, rate type, lead time and channel before answering. Produces A, B, D.
- The three policy documents are separate files with near-identical headings. The bot retrieves the first matching clause, which in the sample is the Select document 80 percent of the time. Produces A.
- Rate type is not present in the conversation context; the booking details the guest is viewing are not passed to the bot. Produces B.
- No instruction on time zones or how to compute windows; the bot does mental arithmetic in prose. Produces C.
- The prompt includes "help the guest complete their request" with no carve-out for third-party bookings. Produces D.

## 3. Evaluation design

**Coverage rule.** Every combination of brand (3) × rate type (3) × lead-time bucket (inside window, at boundary, outside window) × channel (direct, third party) = 54 base cases, each in two phrasings (direct question, embedded in a longer request) = 108 cases. Add 12 adversarial cases where the guest states a wrong assumption ("since cancellation is free…").

**Scoring.** Each case has a required answer: the correct policy outcome (free, fee amount or non-refundable), the correct action (cancel here, or redirect to third party), and, where a window is involved, the correct deadline. A response scores 1 only if all required elements are correct and no incorrect policy statement is present. Scored by a rules-based checker on the outcome and action, with an LLM judge for the free-text policy statement, and a human review of every failing case.

**Pass mark and release gate.** 100 percent on outcome and action for Types A, B and D cases, because each failure there costs an average of $190 to $240 and the fix is deterministic. At least 95 percent on deadline arithmetic (Type C), with any failure at the boundary bucket blocking release. The gate: the evaluation runs on every prompt or document change; a failing run blocks deployment and pages the owner.

## 4. Prioritised recommendations

Ordered by waived-fee cost per month, then by trust damage.

1. **Pass booking context to the bot** (brand, rate type, arrival time, channel) and instruct it to confirm these before answering any cancellation question. Fixes A, B, D. Approve first: it removes the two money failures.
2. **Merge the three policy documents into one structured policy table** keyed by brand and rate type, so retrieval cannot pick the wrong brand. Fixes A.
3. **Compute deadlines in code, not prose**: give the bot a tool that returns the deadline from arrival time and policy, in the property's time zone. Fixes C.
4. **Hard rule for third-party bookings**: the bot must redirect and must not say "done." Fixes D.
5. **Adopt the evaluation as the release gate** before any of the above ships.

Approve items 1 and 5 this week; they stop the money loss and make every later change safe.
""",
    "roster": ["Agyemang, Kwabena", "Barros, Inês", "Chaudhry, Bilal", "Delacroix, Amélie", "Ekwueme, Nnamdi", "Flores, Mariana", "Grigoryan, Anahit", "Holm, Astrid", "Ishikawa, Haruto", "Jovanović, Milica", "Kimani, Wanjiru", "Leclerc, Julien", "Mirza, Sana", "Nunes, Tiago", "Oyelowo, Adaora", "Pérez, Santiago", "Radev, Nikolay", "Salazar, Fernanda", "Tran, Bao", "Uzoma, Ebele", "Vasquez, Elena", "Wong, Cheryl", "Xiong, Mai", "Yusupova, Dilnoza", "Zuniga, Alejandro", "Anand, Rohan", "Bello, Aisha", "Carvalho, Luana"],
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
