# Assignment 4 — Member Message Triage Design for Coral Health Plan (12 points)

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
