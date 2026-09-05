# Assignment 5 — Concierge Chatbot Policy Audit for Sunward Hotels (12 points)

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
