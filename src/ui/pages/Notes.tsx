import { Blueprint } from "@ui/components";
import { PROPERTY_LABELS } from "@shared/thresholds";
import type { Property } from "@shared/types";

const ASSUMPTIONS = [
  {
    n: "Assumption 01",
    t: "The professor never sees a threshold unless something fails",
    b: <>Plain-language labels carry the interface — "Do the versions look different enough?" — with the paper's metric names (cosine, σFlesch, τ<sub>div</sub>) available on hover. Failures are the only place numbers lead.</>,
  },
  {
    n: "Assumption 02",
    t: "All four properties must pass individually",
    b: "The composite score J is shown for comparison across runs, but release is gated on four separate pass checks, not on the average. A set can average 0.86 and still be unreleasable.",
  },
  {
    n: "Assumption 03",
    t: "Prompting strategy is an operating point, not a setting",
    b: "The paper finds no dominant strategy, so the generation step asks what the course is protecting against — construct fidelity or copy-paste — and maps that to zero-shot / structured CoT versus few-shot / dimension-preserving.",
  },
  {
    n: "Assumption 04",
    t: "Rubric stability is flagged as a proxy",
    b: "P3 is currently readability dispersion of the canonical solution, not full rubric re-application. The UI labels it provisional so an institution never over-reads it.",
  },
];

const ORDER: Property[] = ["p1", "p2", "p3", "p4"];

export default function Notes() {
  return (
    <div className="va-page" style={{ maxWidth: 920, gap: 26 }}>
      <p style={{ fontSize: 16, lineHeight: 1.6, maxWidth: "70ch", textWrap: "pretty" }}>
        These mockups turn the VARIA benchmark into a working product: a professor authors one assessment blueprint, the system generates a different-looking task for every student, and nothing is released until the variant set passes the paper's four integrity properties. Oversight roles get the same numbers, aggregated.
      </p>

      <div className="va-two">
        {ASSUMPTIONS.map((a) => (
          <Blueprint key={a.n} className="card">
            <div className="card-kicker">{a.n}</div>
            <div className="card-title">{a.t}</div>
            <p className="card-body">{a.b}</p>
          </Blueprint>
        ))}
      </div>

      <Blueprint style={{ padding: "20px 22px" }}>
        <h6 style={{ margin: "0 0 10px" }}>The four properties, as the app words them</h6>
        <table className="table">
          <thead>
            <tr><th>Paper</th><th>Instructor sees</th><th>Measured by</th><th>Release gate</th></tr>
          </thead>
          <tbody>
            {ORDER.map((p) => (
              <tr key={p}>
                <td>{PROPERTY_LABELS[p].paper}</td>
                <td>{PROPERTY_LABELS[p].label}</td>
                <td>{PROPERTY_LABELS[p].measuredBy}</td>
                <td>{PROPERTY_LABELS[p].gateText}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Blueprint>

      <p className="text-muted" style={{ fontSize: 13, maxWidth: "70ch" }}>
        Next steps once a direction is picked: an LMS-embedded variant of screens 4 and 5, the appeal flow for a student who claims their variant was harder, and the admin page for setting institution-wide thresholds.
      </p>
    </div>
  );
}
