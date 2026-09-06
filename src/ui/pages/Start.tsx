import { useNavigate } from "react-router-dom";
/* type-scale: applied */
import { AudienceCard, Blueprint, BlueprintButton, Pill, WalkthroughButton, JourneyInfographic } from "@ui/components";
import { AUDIENCES } from "@shared/audiences";
import { useWorkspace } from "@lib/store/workspace";
import { activeRun, studentById } from "@lib/store/selectors";
import { PROPERTY_LABELS } from "@shared/thresholds";
import type { Property } from "@shared/types";

const STEPS = [
  { n: "01", title: "Upload", body: "Drop your assignment sheet and rubric. Word, PDF, or paste the text.", time: "~2 min" },
  { n: "02", title: "Confirm", body: "Check what the system pulled out: the skill, the rubric criteria, your model answer.", time: "~5 min" },
  { n: "03", title: "Generate", body: "Answer one question — what are you protecting against — and press go.", time: "~4 min, unattended" },
  { n: "04", title: "Check & release", body: "Four green checks means release. A red one tells you which versions to redo.", time: "~3 min" },
  { n: "05", title: "Grade", body: "One rubric, every submission, with each student's own model answer beside it.", time: "as usual" },
  { n: "06", title: "Share", body: "The graded task becomes a signed work sample in the student's portfolio. They choose which employers see it; employers verify, endorse and hire from it.", time: "the student's call" },
];

const FALLBACK_EXCERPTS = [
  { id: "—", who: "no run loaded", text: "Not yet: load a recorded run or generate one to see three real versions here." },
];

const READ_TABLE: { p: Property; pill: { gate: "pass" | "fail" | "advisory"; text: string } }[] = [
  { p: "p1", pill: { gate: "pass", text: "Pass" } },
  { p: "p2", pill: { gate: "pass", text: "Pass" } },
  { p: "p3", pill: { gate: "advisory", text: "Advisory" } },
  { p: "p4", pill: { gate: "fail", text: "Over threshold" } },
];

const ANALYSING = [
  { t: "Grade against the adapted model answer", b: "Each student's version has its own expert answer, rewritten into their scenario. Compare to that, not to the original." },
  { t: "Watch the score spread by version", b: "If one version's mean score sits well below the rest, that is evidence the difficulty check missed something. The roster flags it for you." },
  { t: "Handle appeals with the numbers", b: "A student claiming an unfair version gets a documented answer: their version's reading ease against the set mean, on the record." },
  { t: "Two identical submissions are now meaningful", b: "Because no two students received the same task, matching answers are a finding rather than a coincidence." },
];

const FAQ = [
  { t: "Do I have to rewrite my rubric?", b: "No. The rubric is what is held constant — it is the thing the checks are protecting." },
  { t: "What if I don't trust a version?", b: "Reject and regenerate any single version before release. Rejections are logged with your reason." },
  { t: "Is this proctoring?", b: "No. Nothing monitors the student. The task design is what makes sharing answers unproductive." },
  { t: "Can I reuse a set next term?", b: "Yes; regenerate before reuse, since released tasks circulate. The blueprint, rubric and employer validation carry over unchanged." },
];

function surname(name: string | undefined): string {
  if (!name) return "";
  return name.split(",")[0].trim();
}

export default function Start() {
  const navigate = useNavigate();
  const ws = useWorkspace();
  const run = activeRun(ws);

  const usable = (run?.variants ?? []).filter((x) => x.text && !x.error).slice(0, 3);
  const excerpts = usable.length
    ? usable.map((v) => {
        const who = surname(studentById(ws, v.studentId)?.name) || v.id;
        const t = v.text.trim();
        return { id: v.id, who, text: t.length > 220 ? t.slice(0, 220).replace(/\s+\S*$/, "") + "…" : t };
      })
    : FALLBACK_EXCERPTS;

  return (
    <div className="va-page va-page-narrow" style={{ gap: 30 }}>
      <Blueprint className="va-dark" style={{ padding: "26px 28px" }}>
        <div className="va-kicker" style={{ letterSpacing: ".14em", fontSize: 12 }}>For faculty</div>
        <h3 style={{ margin: "6px 0 10px", maxWidth: "26ch" }}>Upload the assignment you already give. Get a different version for every student.</h3>
        <p style={{ margin: 0, maxWidth: "66ch", fontSize: 17, lineHeight: 1.6 }}>
          You do not write new prompts and you do not learn new terminology. VARIA reads your existing assignment, produces one version per student that looks different but measures the same skill, and refuses to release the set if the versions drift apart. Your rubric never changes.
        </p>
        <div className="va-btn-row" style={{ marginTop: 18 }}>
          <WalkthroughButton onDark />
          <BlueprintButton onClick={() => navigate("/import")}>Start — load a file</BlueprintButton>
          <button type="button" className="btn va-btn-onDark" onClick={() => navigate("/report")}>See a finished report</button>
        </div>
      </Blueprint>

      <div>
        <div className="va-kicker" style={{ marginBottom: 4 }}>Who this is for</div>
        <h6 style={{ margin: "0 0 14px" }}>Four people, one artifact</h6>
        <div className="va-tiles" style={{ gap: 16 }}>
          {AUDIENCES.map((a) => (
            <AudienceCard key={a.key} label={a.label} promise={a.promise} quote={a.quote} to={`/for/${a.key}`} />
          ))}
        </div>
      </div>

      <JourneyInfographic compact />

      <div>
        <h6 style={{ margin: "0 0 16px" }}>The whole thing, in six steps</h6>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 16 }}>
          {STEPS.map((s) => (
            <Blueprint key={s.n} style={{ padding: "16px 16px 18px" }}>
              <div className="va-step-number">{s.n}</div>
              <div className="va-heading-16" style={{ margin: "6px 0 5px" }}>{s.title}</div>
              <p className="card-body" style={{ margin: 0 }}>{s.body}</p>
              <div className="text-muted" style={{ fontSize: 12.5, marginTop: 8 }}>{s.time}</div>
            </Blueprint>
          ))}
        </div>
      </div>

      <div className="va-split" style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)", gap: 24, alignItems: "start" }}>
        <Blueprint style={{ padding: "20px 22px" }}>
          <h6 style={{ margin: "0 0 4px" }}>What you upload</h6>
          <p className="text-muted" style={{ fontSize: 14, margin: "0 0 14px" }}>An actual file from your course. Nothing needs reformatting.</p>
          <div className="va-surface-box">
            <div className="text-muted" style={{ fontSize: 12.5, letterSpacing: ".1em", textTransform: "uppercase", marginBottom: 8 }}>DAT4100_Assignment3.docx</div>
            <p style={{ margin: "0 0 8px" }}><strong>Assignment 3 — Model Card Audit (12 points)</strong></p>
            <p style={{ margin: "0 0 8px" }}>You are auditing a deployed classifier on behalf of a stakeholder. Using the partial model card provided, produce a structured audit that identifies fairness gaps, robustness gaps, and documentation gaps. Justify every finding against evidence in the card and prioritise your recommendations.</p>
            <p style={{ margin: "0 0 8px" }}><strong>Rubric</strong> — Fairness gaps with evidence (3) · Robustness under subgroup shift (3) · Documentation completeness (3) · Prioritisation quality (3)</p>
            <p style={{ margin: 0 }} className="text-muted">Attached: instructor_model_answer.docx, roster.csv</p>
          </div>
          <div className="text-muted" style={{ fontSize: 14, marginTop: 12, lineHeight: 1.5 }}>
            Also accepted: Word, PDF, plain text, or a previous semester's exam. If you have no model answer, the system drafts one for you to correct — it is required, because it is how the rubric check works.
          </div>
        </Blueprint>

        <Blueprint style={{ padding: "20px 22px" }}>
          <h6 style={{ margin: "0 0 4px" }}>What comes back</h6>
          <p className="text-muted" style={{ fontSize: 14, margin: "0 0 14px" }}>One version per student. Same task underneath, different world on top.</p>
          <div className="va-stack" style={{ gap: 10 }}>
            {excerpts.map((e) => (
              <div key={e.id} className="va-quote">
                <div className="text-muted" style={{ fontSize: 12.5, marginBottom: 3 }}>{e.id} · {e.who}</div>
                {e.text}
              </div>
            ))}
          </div>
          <div className="text-muted" style={{ fontSize: 14, marginTop: 12, lineHeight: 1.5 }}>
            Every version keeps the same four rubric criteria, the same number of findings to produce, and the same reading level. Only the scenario, the stakeholder and the domain move.
          </div>
        </Blueprint>
      </div>

      <Blueprint style={{ padding: "22px 24px" }}>
        <h6 style={{ margin: "0 0 4px" }}>How to read what comes back</h6>
        <p className="text-muted" style={{ fontSize: 14, margin: "0 0 18px" }}>Four checks. You only need to act on the ones that are not green.</p>
        <table className="table">
          <thead>
            <tr><th style={{ width: "24%" }}>Check</th><th style={{ width: "30%" }}>Reads as</th><th>If it fails</th><th style={{ width: "22%" }}>What you do</th></tr>
          </thead>
          <tbody>
            {READ_TABLE.map(({ p, pill }) => (
              <tr key={p}>
                <td>{PROPERTY_LABELS[p].label}</td>
                <td><Pill gate={pill.gate}>{pill.text}</Pill></td>
                <td>{PROPERTY_LABELS[p].ifFails}</td>
                <td>{PROPERTY_LABELS[p].whatYouDo}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Blueprint>

      <div className="va-split" style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)", gap: 24, alignItems: "start" }}>
        <Blueprint style={{ padding: "20px 22px" }}>
          <h6 style={{ margin: "0 0 12px" }}>Analysing the submissions</h6>
          <div className="va-stack" style={{ gap: 14, fontSize: 15.5, lineHeight: 1.55 }}>
            {ANALYSING.map((x) => (
              <div key={x.t}><div className="va-heading-15">{x.t}</div><div className="text-muted">{x.b}</div></div>
            ))}
          </div>
        </Blueprint>
        <Blueprint style={{ padding: "20px 22px" }}>
          <h6 style={{ margin: "0 0 12px" }}>Common questions</h6>
          <div className="va-stack" style={{ gap: 14, fontSize: 15.5, lineHeight: 1.55 }}>
            {FAQ.map((x) => (
              <div key={x.t}><div className="va-heading-15">{x.t}</div><div className="text-muted">{x.b}</div></div>
            ))}
          </div>
        </Blueprint>
      </div>
    </div>
  );
}
