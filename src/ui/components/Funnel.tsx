import type { ReactNode } from "react";
import { Blueprint } from "./Blueprint";

export interface FunnelStep {
  label: string;
  value: number;
  sub?: ReactNode;
}

export interface FunnelProps {
  steps: FunnelStep[];
  className?: string;
}

/**
 * A horizontal funnel: equal cells, big number, label, optional sub-line,
 * a thin accent rule between cells. One blueprint object.
 * Collapses to two columns under 900px (see .va-funnel in app.css).
 */
export function Funnel({ steps, className }: FunnelProps) {
  return (
    <Blueprint className={["va-funnel", className].filter(Boolean).join(" ")}>
      {steps.map((s, i) => (
        <div key={s.label} className="va-funnel-cell">
          {i > 0 && <span className="va-funnel-arrow" aria-hidden="true" />}
          <div className="va-stat-number">{s.value}</div>
          <div className="va-funnel-label">{s.label}</div>
          {s.sub != null && <div className="va-muted-12">{s.sub}</div>}
        </div>
      ))}
    </Blueprint>
  );
}
