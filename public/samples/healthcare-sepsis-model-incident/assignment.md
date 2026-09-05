# Assignment 4 — Sepsis Model Incident Analysis for Coral Health Network (12 points)

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
