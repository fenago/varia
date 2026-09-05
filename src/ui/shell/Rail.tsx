import { NavLink } from "react-router-dom";
import { useWorkspace } from "@lib/store/workspace";
import { journeyState, JOURNEY_LABELS } from "@lib/store/journey";

interface RailItem {
  to: string;
  label: string;
  /** NavLink `end` — exact match only (for "/") */
  end?: boolean;
}

const SECTIONS: { heading: string; items: RailItem[] }[] = [
  {
    heading: "Orientation",
    items: [
      { to: "/", label: "Home", end: true },
      { to: "/for", label: "Who it's for" },
      { to: "/start", label: "Getting started" },
      { to: "/notes", label: "Design notes" },
      { to: "/research", label: "Research grounding" },
      { to: "/glossary", label: "Glossary" },
      { to: "/about", label: "About" },
    ],
  },
  {
    heading: "Instructor",
    items: JOURNEY_LABELS.map((l) => ({ to: l.path, label: l.label })),
  },
  {
    heading: "Oversight",
    items: [
      { to: "/surface", label: "Trade-off surface" },
      { to: "/console", label: "Compliance console" },
      { to: "/employer", label: "Employer validation" },
    ],
  },
  {
    heading: "Setup",
    items: [{ to: "/settings", label: "API key & models" }],
  },
];

export function Rail() {
  const ws = useWorkspace();
  const journey = journeyState(ws);
  const stepFor = (to: string) => journey.steps.find((st) => st.path === to);
  return (
    <aside className="va-rail" aria-label="Navigation">
      <div className="va-rail-brand">
        <div className="va-rail-logo">
          <img
            src="/mdc-logo.png"
            alt="Miami Dade College"
            width={165}
            height={39}
            decoding="async"
          />
        </div>
        <div className="va-rail-word">VARIA</div>
        <div className="va-rail-sub">Assessment Variants</div>
      </div>

      {SECTIONS.map((s) => (
        <nav key={s.heading} aria-label={s.heading}>
          <div className="va-railhd">{s.heading}</div>
          {s.items.map((it) => {
            const st = s.heading === "Instructor" ? stepFor(it.to) : undefined;
            const glyph = st ? (st.status === "done" ? "✓" : st.status === "current" ? "●" : "○") : null;
            return (
              <span key={it.to}>
                <NavLink to={it.to} end={it.end} className="va-nav" aria-current={undefined} title={st ? `${st.status === "done" ? "Done" : st.status === "current" ? "You are here" : "Not yet"}${st.summary ? ` · ${st.summary}` : ""}` : undefined}>
                  {glyph ? <span className={`va-nav-glyph is-${st!.status}`} aria-hidden="true">{glyph}</span> : null}
                  {it.label}
                </NavLink>
                {st && st.status === "current" && st.summary ? <span className="va-nav-summary">{st.summary}</span> : null}
              </span>
            );
          })}
        </nav>
      ))}

      <div className="va-rail-foot">
        <div className="va-rail-foot-k">Signed in</div>
        <div className="va-rail-foot-name">Dr. E. Lee</div>
        <div className="va-rail-foot-k">Miami Dade College · Instructor</div>
      </div>
    </aside>
  );
}
