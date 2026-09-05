# Sepsis Model Incident Analysis — Coral Health Network

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
