# Concierge Chatbot Cancellation-Policy Audit — Sunward Hotels

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
