# Member Message Triage — System Design and Evaluation Plan

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
