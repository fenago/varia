/**
 * The guided demo: one button carries a non-technical instructor from an
 * employer's problem to a graded, verified piece of student work, on the
 * recorded data, with nothing spent. Copy rule: plain English, second person,
 * value first; no metric names except on the Report stop, and there only as
 * "different enough / same skill / one rubric / equally hard".
 */

export type WalkRoute =
  | { kind: "path"; path: string }
  /** Resolved against the workspace by the store (see lib/store/walkthrough.ts) */
  | { kind: "report" }
  | { kind: "grade" }
  | { kind: "evidence" }
  | { kind: "talent" };

export type WalkAction =
  /** "Do it for me" clicks the target (or the first button inside it) */
  | "click"
  /** Opens the first student's private task link in a new tab */
  | "open-task"
  /** Nothing to do; Next moves on */
  | "none";

export interface WalkStop {
  key: string;
  route: WalkRoute;
  /** Where you are, e.g. "Step 2 of 6 · Check what we found" */
  title: string;
  /** What just happened, one sentence */
  happened: string;
  /** Why it matters to you, two sentences */
  why: string;
  /** What to press, naming the button */
  doNow: string;
  /** data-walk value to highlight on the page */
  target: string;
  /** How the stop advances */
  advance: "button" | "manual";
  action: WalkAction;
  /** Label for the primary button when advance === "button" */
  buttonLabel?: string;
}

export const WALK_SAMPLE_ID = "ml-lending-fairness-audit";
export const WALK_SAMPLE_ORG = "Bayfront Regional Bank";

export const WALKTHROUGH: WalkStop[] = [
  {
    key: "promise",
    route: { kind: "path", path: "/" },
    title: "Before we start · the promise",
    happened: "You pressed the walkthrough button. Everything you are about to see was prepared in advance, so nothing is spent.",
    why: "In the next few minutes you will take a real problem from a local bank, turn it into an assignment, give every student their own version, prove the versions were fair, grade the work, and hand the student a record an employer can check. That is the whole product, and you will not type a thing.",
    doNow: "Press Next.",
    target: "promise",
    advance: "manual",
    action: "none",
  },
  {
    key: "load",
    route: { kind: "path", path: "/import" },
    title: "Step 1 of 6 · Load your assignment",
    happened: "You are on the page where an assignment enters VARIA.",
    why: "Instead of writing a case study, you start from something a real employer needs done. Bayfront Regional Bank has a loan model that is turning down applicants in two regions and cannot say why; a student who audits it has done a slice of a real job.",
    doNow: "Press Do it for me, which picks the Bayfront problem for you.",
    target: "pick-sample",
    advance: "button",
    action: "click",
    buttonLabel: "Do it for me",
  },
  {
    key: "found",
    route: { kind: "path", path: "/import" },
    title: "Step 1 of 6 · Here is what we found",
    happened: "VARIA read the employer's brief, the assignment sheet, the rubric and the model answer, and pulled out what matters.",
    why: "You did not fill in a form. The skill being tested, the four things you grade on, and your model answer were all found in the files you already had. The number of versions is set to three, so a first run is small and cheap.",
    doNow: "Press Do it for me, which presses Looks right, continue.",
    target: "continue-found",
    advance: "button",
    action: "click",
    buttonLabel: "Do it for me",
  },
  {
    key: "check",
    route: { kind: "path", path: "/blueprint" },
    title: "Step 2 of 6 · Check what we found",
    happened: "This is the part that stays the same for every student: the skill, the rubric and the model answer.",
    why: "Because these never change, every student's grade means the same thing, even though each student gets a different task. If something here is wrong you fix it once, and every version inherits the fix.",
    doNow: "Press Do it for me, which presses Continue to making the versions.",
    target: "continue-check",
    advance: "button",
    action: "click",
    buttonLabel: "Do it for me",
  },
  {
    key: "make",
    route: { kind: "path", path: "/generate" },
    title: "Step 3 of 6 · Make the versions",
    happened: "You are about to give every student their own version of the bank's problem.",
    why: "Each version has a different organisation, a different person asking for the work and a different situation, but tests exactly the same skill. Ten versions were made and checked in advance for this walkthrough, so pressing the button spends nothing.",
    doNow: "Press Do it for me, which presses Make the versions. The report opens when it is done.",
    target: "make",
    advance: "button",
    action: "click",
    buttonLabel: "Do it for me",
  },
  {
    key: "report",
    route: { kind: "report" },
    title: "Step 4 of 6 · Check the versions",
    happened: "Every version was checked four ways before any student can see it.",
    why: "The versions are different enough that sharing answers is useless, they measure the same skill, one rubric still grades all of them, and they are equally hard to read. Nobody is watched; the fairness is measured and on the record. The verdict at the top tells you in a sentence whether you can release.",
    doNow: "Press Do it for me, which presses Release. If the verdict were not ready, the same spot would tell you exactly what to fix.",
    target: "release",
    advance: "button",
    action: "click",
    buttonLabel: "Do it for me",
  },
  {
    key: "release",
    route: { kind: "path", path: "/roster" },
    title: "Step 5 of 6 · Release to students",
    happened: "The versions are released. Each student now has a private link to their own task.",
    why: "No two students got the same task, so copying from a friend does not work, and you never had to proctor anyone. The links go into your course page or an email; there is also a Word document per student if you prefer paper.",
    doNow: "Press Do it for me, which copies all the student links for you.",
    target: "student-links",
    advance: "button",
    action: "click",
    buttonLabel: "Do it for me",
  },
  {
    key: "student",
    route: { kind: "path", path: "/roster" },
    title: "Step 5 of 6 · What a student sees",
    happened: "You can open any student's task exactly as they would.",
    why: "The student sees only their own task and the rubric it will be graded on: no model answer, no other students, nothing technical. That page is what makes the work theirs.",
    doNow: "Press Do it for me to open the first student's task in a new tab, then come back here and press Next.",
    target: "student-links",
    advance: "button",
    action: "open-task",
    buttonLabel: "Do it for me",
  },
  {
    key: "grade",
    route: { kind: "grade" },
    title: "Step 6 of 6 · Grade the work",
    happened: "Work has come back. This is a student's submission beside the one rubric.",
    why: "You grade every student with the same rubric, and each student's version comes with the model answer rewritten for their situation, so you compare like with like. If you want a starting point, VARIA can suggest scores; you always decide.",
    doNow: "Look at the rubric on the right. When you are ready, press Next.",
    target: "rubric",
    advance: "manual",
    action: "none",
  },
  {
    key: "evidence",
    route: { kind: "evidence" },
    title: "After grading · the student's record",
    happened: "The grade became a record the student can keep and share.",
    why: "It holds the task, the result, the skills shown, and the proof that the version was fair, signed so nobody can alter it. A student leaves your course with evidence of real work on a real employer's problem, not just a letter grade.",
    doNow: "Read the record, then press Next.",
    target: "record",
    advance: "manual",
    action: "none",
  },
  {
    key: "talent",
    route: { kind: "talent" },
    title: "What the employer sees",
    happened: "This is Bayfront's view: the students who did their problem and chose to share the work appear here.",
    why: "Sharing is the student's choice, from their record or portfolio; nothing appears here until they say so. When they do, the employer reads real work on their own problem, checks it in seconds, and can endorse it or invite the student to interview. That is how coursework turns into a job lead, and why an employer keeps sending problems.",
    doNow: "Have a look at the employer's side, then press Next.",
    target: "candidates",
    advance: "manual",
    action: "none",
  },
  {
    key: "done",
    route: { kind: "path", path: "/import" },
    title: "You did it",
    happened: "In six steps you took an employer's problem to graded, verified student work that the employer can see.",
    why: "Load, check, make, check the versions, release, grade. Nothing was proctored, nothing was typed twice, and nothing was spent. Your own assignment goes through the same six steps: add your key in Settings, upload the sheet, and start with three versions.",
    doNow: "Press Finish to leave the walkthrough, or Back to revisit any stop.",
    target: "upload-own",
    advance: "manual",
    action: "none",
  },
];
