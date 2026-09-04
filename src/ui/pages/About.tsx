import { useState } from "react";
import { Blueprint, Corners } from "@ui/components";
import { ACKNOWLEDGEMENTS, APP_SUMMARY, CITATION, FIT, GAPS, GRANT, PAPER, PEOPLE } from "@shared/about";

export default function About() {
  const [copied, setCopied] = useState(false);

  const copyCitation = async () => {
    try {
      await navigator.clipboard.writeText(CITATION);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard unavailable; the text is selectable */
    }
  };

  return (
    <div className="va-page va-page-narrow" style={{ gap: 26 }}>
      <Blueprint className="va-dark" style={{ padding: "26px 28px" }}>
        <div className="va-kicker">The paper</div>
        <h3 style={{ margin: "6px 0 10px", maxWidth: "34ch" }}>{PAPER.title}</h3>
        <p style={{ margin: 0, fontSize: 15, lineHeight: 1.6 }}>
          {PAPER.author} · {PAPER.affiliation} · {PAPER.venue}, {PAPER.year}
        </p>
        <div className="va-btn-row" style={{ marginTop: 18 }}>
          <a className="btn btn-primary blueprint" href={PAPER.url} target="_blank" rel="noopener noreferrer" style={{ textDecoration: "none" }}>
            <Corners />
            Read the paper
          </a>
          <a className="btn va-btn-onDark" href={`mailto:${PAPER.email}`} style={{ textDecoration: "none" }}>
            {PAPER.email}
          </a>
        </div>
        <div style={{ marginTop: 12, fontSize: 12, color: "#8fa8bf" }}>{PAPER.url}</div>
      </Blueprint>

      <div className="va-split" style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)", gap: 24, alignItems: "start" }}>
        <Blueprint style={{ padding: "20px 22px" }}>
          <h6 style={{ margin: "0 0 10px" }}>In plain terms</h6>
          <p style={{ margin: 0, fontSize: 14, lineHeight: 1.65 }}>{PAPER.abstractPlain}</p>
        </Blueprint>
        <Blueprint style={{ padding: "20px 22px" }}>
          <h6 style={{ margin: "0 0 10px" }}>Key findings</h6>
          <ol style={{ margin: 0, paddingLeft: 20, fontSize: 13.5, lineHeight: 1.6, display: "flex", flexDirection: "column", gap: 8 }}>
            {PAPER.keyFindings.map((f, i) => (
              <li key={i}>{f}</li>
            ))}
          </ol>
        </Blueprint>
      </div>

      <Blueprint style={{ padding: "20px 22px" }}>
        <h6 style={{ margin: "0 0 10px" }}>What this app does</h6>
        <p style={{ margin: 0, fontSize: 14, lineHeight: 1.65, maxWidth: "76ch" }}>{APP_SUMMARY}</p>
      </Blueprint>

      <Blueprint style={{ padding: "22px 24px" }}>
        <h6 style={{ margin: "0 0 8px" }}>{FIT.heading}</h6>
        <p style={{ margin: "0 0 16px", fontSize: 15, lineHeight: 1.6, maxWidth: "76ch", textWrap: "pretty" }}>{FIT.lede}</p>
        <div style={{ display: "flex", flexDirection: "column", gap: 14, fontSize: 13.5, lineHeight: 1.55 }}>
          {FIT.points.map((p) => (
            <div key={p.title}>
              <div className="va-heading-15">{p.title}</div>
              <div className="text-muted" style={{ maxWidth: "76ch" }}>{p.body}</div>
            </div>
          ))}
        </div>
      </Blueprint>

      <Blueprint style={{ padding: "22px 24px" }}>
        <h6 style={{ margin: "0 0 12px" }}>{GAPS.heading}</h6>
        <ul style={{ margin: 0, paddingLeft: 20, fontSize: 13.5, lineHeight: 1.6, display: "flex", flexDirection: "column", gap: 8, maxWidth: "76ch" }}>
          {GAPS.items.map((g) => (
            <li key={g}>{g}</li>
          ))}
        </ul>
      </Blueprint>

      <Blueprint style={{ padding: "22px 24px" }}>
        <div className="va-kicker">Funded by</div>
        <h6 style={{ margin: "4px 0 12px" }}>{GRANT.name}</h6>
        <p style={{ margin: "0 0 14px", fontSize: 15, lineHeight: 1.6, maxWidth: "76ch", textWrap: "pretty" }}>{GRANT.summary}</p>
        <div className="va-btn-row" style={{ marginBottom: 18, alignItems: "center", gap: 12 }}>
          <a className="btn btn-primary blueprint" href="/axim-milestones.html" target="_blank" rel="noopener noreferrer" style={{ textDecoration: "none" }}>
            <Corners />
            Open the partner journey one-pager
          </a>
          <span className="text-muted" style={{ fontSize: 12.5 }}>
            Milestone-by-milestone talking points for the Axim cohort, September 2026 to September 2027.
          </span>
        </div>
        <table className="table">
          <tbody>
            {GRANT.facts.map((f) => (
              <tr key={f.label}>
                <td style={{ width: "26%", whiteSpace: "nowrap" }} className="va-heading-15">
                  {f.label}
                </td>
                <td>{f.value}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Blueprint>

      <Blueprint style={{ padding: "22px 24px" }}>
        <h6 style={{ margin: "0 0 8px" }}>{ACKNOWLEDGEMENTS.heading}</h6>
        <p style={{ margin: "0 0 14px", fontSize: 14, lineHeight: 1.6, maxWidth: "76ch" }}>{ACKNOWLEDGEMENTS.body}</p>
        <table className="table">
          <tbody>
            {ACKNOWLEDGEMENTS.credits.map((c) => (
              <tr key={c.name}>
                <td style={{ width: "30%" }} className="va-heading-15">
                  {c.name}
                </td>
                <td>{c.role}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Blueprint>

      <Blueprint style={{ padding: "22px 24px" }}>
        <h6 style={{ margin: "0 0 14px" }}>{PEOPLE.heading}</h6>
        <div className="va-split" style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)", gap: 24, alignItems: "start" }}>
          {PEOPLE.groups.map((g) => (
            <div key={g.name}>
              <div className="va-kicker" style={{ marginBottom: 8 }}>{g.name}</div>
              <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 6, fontSize: 14 }}>
                {g.members.map((m) => (
                  <li key={m.name}>
                    {m.name}
                    {m.note ? <span className="text-muted" style={{ fontSize: 12.5 }}> · {m.note}</span> : null}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </Blueprint>

      <Blueprint style={{ padding: "20px 22px" }}>
        <div className="va-row-flex" style={{ marginBottom: 10 }}>
          <h6 style={{ margin: 0 }}>Cite</h6>
          <button type="button" className="btn btn-secondary" style={{ marginLeft: "auto" }} onClick={copyCitation}>
            {copied ? "Copied" : "Copy citation"}
          </button>
        </div>
        <div className="va-surface-box" style={{ fontSize: 13.5, userSelect: "all" }}>
          {CITATION}
        </div>
      </Blueprint>
    </div>
  );
}
