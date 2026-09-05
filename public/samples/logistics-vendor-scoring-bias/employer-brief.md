# Employer brief · Gulfstream Last Mile

**From:** Dana Whitlock, VP Network Operations
**For:** DAT 3200, Miami Dade College

Gulfstream contracts about 340 independent delivery vendors across South Florida. Every month a scoring model rates each vendor on reliability, and the bottom decile gets a performance review and can lose routes. Since we rebuilt the scoring pipeline last fall, our route managers say the model is flagging vendors they consider reliable and clearing ones they consider problems. Two of the flagged vendors have been with us for six years with clean records; one that was cleared had three route abandonments in a quarter.

The model itself has not changed. What changed is the pipeline that feeds it: we moved from a nightly batch to a streaming feed, added a new scan-event source from the handheld devices, and started filling gaps in delivery timestamps with an estimate.

I need someone to trace the bias from the pipeline into the scores. Where does it enter, which vendors does it hurt and help, how much does it move a score, and what is the fix. I also need a plan to validate the fix before we act on scores again, because we have route managers who no longer trust the number and vendors who may have been wrongly reviewed.

The skills: data pipeline diagnosis, fairness thinking applied to a scoring system, root-cause analysis, and prioritising what to fix first when several things are wrong.
