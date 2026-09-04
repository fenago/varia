import { NavLink } from "react-router-dom";

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
      { to: "/", label: "Getting started", end: true },
      { to: "/notes", label: "Design notes" },
      { to: "/about", label: "About" },
    ],
  },
  {
    heading: "Instructor",
    items: [
      { to: "/import", label: "0 · Load your assessment" },
      { to: "/blueprint", label: "1 · Blueprint" },
      { to: "/generate", label: "2 · Generate variants" },
      { to: "/report", label: "3 · Integrity report" },
      { to: "/roster", label: "4 · Release & roster" },
      { to: "/grade", label: "5 · Grade with rubric" },
    ],
  },
  {
    heading: "Oversight",
    items: [
      { to: "/surface", label: "Trade-off surface" },
      { to: "/console", label: "Compliance console" },
    ],
  },
  {
    heading: "Setup",
    items: [{ to: "/settings", label: "API key & models" }],
  },
];

export function Rail() {
  return (
    <aside className="va-rail" aria-label="Navigation">
      <div className="va-rail-brand">
        <div className="va-rail-logo" aria-hidden="true">
          MDC logo
        </div>
        <div className="va-rail-word">VARIA</div>
        <div className="va-rail-sub">Assessment Variants</div>
      </div>

      {SECTIONS.map((s) => (
        <nav key={s.heading} aria-label={s.heading}>
          <div className="va-railhd">{s.heading}</div>
          {s.items.map((it) => (
            <NavLink
              key={it.to}
              to={it.to}
              end={it.end}
              className="va-nav"
              aria-current={undefined}
            >
              {it.label}
            </NavLink>
          ))}
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
