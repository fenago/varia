import { useNavigate } from "react-router-dom";
import { Blueprint, Corners } from "@ui/components";
import { usePageTitle } from "@ui/shell/PageTitleContext";
import { RESEARCH_INTRO, RESEARCH_SECTIONS } from "@shared/research";
import { PAPER } from "@shared/about";

/** Lines that look like "P1, surface diversity: …" or "Zero-shot: …" get a bold lead. */
function Line({ text }: { text: string }) {
  const m = text.match(/^((?:P[1-4]|\d\.\d|[A-Z][A-Za-z -]{1,40}),?(?:\s[a-z -]{1,40})?):\s(.+)$/);
  if (m && m[1].length <= 48) {
    return (
      <>
        <strong style={{ fontFamily: "var(--font-heading)", fontWeight: 600 }}>{m[1]}:</strong> {m[2]}
      </>
    );
  }
  return <>{text}</>;
}

export default function Research() {
  usePageTitle("Research grounding", "Orientation");
  const nav = useNavigate();
  const top = RESEARCH_SECTIONS.filter((s) => s.level === 2);

  return (
    <div className="va-page va-page-narrow" style={{ gap: 24 }}>
      <Blueprint className="va-dark" style={{ padding: "26px 28px" }}>
        <div className="va-kicker">{RESEARCH_INTRO.kicker}</div>
        <h3 style={{ margin: "6px 0 10px", color: "#fff", maxWidth: "30ch" }}>{RESEARCH_INTRO.title}</h3>
        <p style={{ margin: 0, fontSize: 15, lineHeight: 1.6, color: "#d5e0ea", maxWidth: "70ch" }}>{RESEARCH_INTRO.lede}</p>
        <div className="va-btn-row" style={{ marginTop: 18 }}>
          <a className="btn btn-primary blueprint" href={PAPER.url} target="_blank" rel="noopener noreferrer" style={{ textDecoration: "none" }}>
            <Corners />
            Read the paper
          </a>
          <button type="button" className="btn va-btn-onDark" onClick={() => nav("/about")}>About VARIA</button>
          <button type="button" className="btn va-btn-onDark" onClick={() => nav("/surface")}>See the pilot numbers</button>
        </div>
      </Blueprint>

      <Blueprint style={{ padding: "16px 20px" }}>
        <div className="va-kicker" style={{ marginBottom: 8 }}>Contents</div>
        <ol style={{ margin: 0, paddingLeft: 20, display: "grid", gridTemplateColumns: "repeat(2, minmax(0,1fr))", gap: "4px 24px", fontSize: 13.5 }}>
          {top.map((s) => (
            <li key={s.id}>
              <a href={`#${s.id}`} style={{ color: "var(--color-accent-700)", textDecoration: "none" }}>{s.title}</a>
            </li>
          ))}
        </ol>
      </Blueprint>

      {RESEARCH_SECTIONS.map((s) =>
        s.level === 2 ? (
          <Blueprint key={s.id} id={s.id} style={{ padding: "22px 24px", scrollMarginTop: 20 }}>
            <h6 style={{ margin: "0 0 12px" }}>{s.title}</h6>
            <Paras paras={s.paras} />
          </Blueprint>
        ) : (
          <Blueprint key={s.id} id={s.id} style={{ padding: "18px 22px", marginLeft: 22, background: "var(--color-surface)", scrollMarginTop: 20 }}>
            <div style={{ fontFamily: "var(--font-heading)", fontSize: 17, marginBottom: 10 }}>{s.title}</div>
            <Paras paras={s.paras} />
          </Blueprint>
        ),
      )}

      <p className="text-muted" style={{ fontSize: 12.5, margin: 0 }}>
        Written by Dr. Ernesto Lee, Miami Dade College. The paper itself: {PAPER.title}, {PAPER.venue}, {PAPER.year}.
      </p>
    </div>
  );
}

function Paras({ paras }: { paras: string[][] }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, fontSize: 14.5, lineHeight: 1.65, maxWidth: "76ch" }}>
      {paras.map((p, i) =>
        p.length === 1 ? (
          <p key={i} style={{ margin: 0, textWrap: "pretty" }}>
            <Line text={p[0]} />
          </p>
        ) : (
          <ul key={i} style={{ margin: 0, paddingLeft: 18, display: "flex", flexDirection: "column", gap: 6 }}>
            {p.map((l, j) => (
              <li key={j}>
                <Line text={l} />
              </li>
            ))}
          </ul>
        ),
      )}
    </div>
  );
}
