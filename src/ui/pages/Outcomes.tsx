/* type-scale: applied */
import { Blueprint, Pill } from "@ui/components";
import { GRANT_CONTEXT, OUTCOME_LENSES, outcomesProgress, type Outcome } from "@shared/outcomes";

const TYPE_LABEL: Record<Outcome["type"], string> = {
  required: "Required",
  optional: "Optional",
  practice: "Practice",
};

function ResultCell({ o }: { o: Outcome }) {
  if (!o.result) {
    return (
      <Pill gate="watch" title="No data reported yet for this metric">
        Pending
      </Pill>
    );
  }
  return (
    <div>
      <strong>{o.result.value}</strong>
      <div className="text-muted" style={{ fontSize: 13 }}>
        as of {o.result.asOf}
        {o.result.note ? ` · ${o.result.note}` : ""}
      </div>
    </div>
  );
}

function LensTable({ lens }: { lens: (typeof OUTCOME_LENSES)[number] }) {
  const { title, tally, framing, outcomes } = lens;
  const reported = outcomes.filter((o) => o.result !== null).length;
  return (
    <Blueprint style={{ padding: "22px 24px" }}>
      <div className="va-row-flex" style={{ justifyContent: "space-between", alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
        <h5 style={{ margin: 0 }}>{title}</h5>
        <span className="text-muted" style={{ fontSize: 14 }}>
          {tally} · {reported} of {outcomes.length} reported
        </span>
      </div>
      <p className="text-muted" style={{ margin: "6px 0 14px", fontSize: 15, lineHeight: 1.55, maxWidth: "80ch" }}>{framing}</p>
      <div className="va-table-scroll">
        <table className="table">
          <thead>
            <tr>
              <th style={{ width: "28%" }}>Outcome</th>
              <th>Impact</th>
              <th style={{ width: "30%" }}>Metric + target</th>
              <th>Type</th>
              <th style={{ width: "22%" }}>Result</th>
            </tr>
          </thead>
          <tbody>
            {outcomes.map((o) => (
              <tr key={o.id}>
                <td style={{ fontWeight: 600 }}>{o.outcome}</td>
                <td>{o.impact}</td>
                <td>{o.metric}</td>
                <td>{TYPE_LABEL[o.type]}</td>
                <td>
                  <ResultCell o={o} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Blueprint>
  );
}

export default function Outcomes() {
  const progress = outcomesProgress();
  return (
    <div className="va-page va-page-narrow" style={{ gap: 24 }}>
      <Blueprint className="va-dark" style={{ padding: "26px 28px" }}>
        <div className="va-kicker">Grant outcomes report</div>
        <h3 style={{ margin: "6px 0 10px", maxWidth: "36ch" }}>
          What the pilot reports on, and where the numbers stand
        </h3>
        <p style={{ margin: 0, fontSize: 16, lineHeight: 1.6, maxWidth: "76ch" }}>
          {GRANT_CONTEXT.agreement} · {GRANT_CONTEXT.participant}. {GRANT_CONTEXT.term}. The SOW
          obligation this page serves: {GRANT_CONTEXT.obligation}
        </p>
        <div style={{ marginTop: 14, fontSize: 15, color: "#8fa8bf" }}>
          {progress.reported} of {progress.total} metrics reported so far.{" "}
          {progress.reported === 0
            ? "Data collection has not started; every metric below is a committed slot waiting on pilot data."
            : ""}
        </div>
      </Blueprint>

      {OUTCOME_LENSES.map((lens) => (
        <LensTable key={lens.key} lens={lens} />
      ))}

      <Blueprint style={{ padding: "18px 22px" }}>
        <h6 style={{ margin: "0 0 8px" }}>How a number gets onto this page</h6>
        <p style={{ margin: 0, fontSize: 15, lineHeight: 1.6, maxWidth: "80ch" }}>
          Each row above is a slot in <code>src/shared/outcomes.ts</code>. When a figure is in hand,
          its <code>result</code> gains a value, an as-of date, and a note on the sample it came
          from, and this page renders it in place of the Pending pill — the template never changes
          shape, so partial reporting is always presentable.
        </p>
      </Blueprint>
    </div>
  );
}
