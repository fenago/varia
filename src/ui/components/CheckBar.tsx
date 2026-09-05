import type { Check, Gate } from "@shared/types";
/* type-scale: applied */
import { Pill } from "./Pill";

const PILL_TEXT: Record<Gate, string> = {
  pass: "Pass",
  fail: "Over threshold",
  advisory: "Advisory",
};

export interface CheckBarProps {
  check: Check;
  /** Override pill text (e.g. "Blocked"). */
  pillText?: string;
}

/** One of the four checks on the Integrity report: label, hover metric, pill, bar, note. */
export function CheckBar({ check, pillText }: CheckBarProps) {
  const fillPct = Math.max(0, Math.min(1, check.barFill)) * 100;
  const tickPct = check.barTick == null ? null : Math.max(0, Math.min(1, check.barTick)) * 100;
  const fillCls = ["va-checkbar-fill", check.gate === "fail" ? "is-fail" : "", check.gate === "advisory" ? "is-advisory" : ""]
    .filter(Boolean)
    .join(" ");
  return (
    <div>
      <div className="va-row-flex" style={{ marginBottom: 5 }}>
        <span className="va-heading-16">{check.label}</span>
        <span className="va-help text-muted" style={{ fontSize: 13 }} title={check.detail}>
          {check.metricLabel}
        </span>
        <Pill gate={check.gate} style={{ marginLeft: "auto" }}>
          {pillText ?? PILL_TEXT[check.gate]}
        </Pill>
      </div>
      <div className="va-checkbar" role="img" aria-label={`${check.label}: ${check.metricLabel}`}>
        <div className={fillCls} style={{ width: `${fillPct}%` }} />
        {tickPct != null && <div className="va-checkbar-tick" style={{ left: `${tickPct}%` }} />}
      </div>
      {check.note && (
        <div className={["va-check-note", check.gate === "fail" ? "is-fail" : "text-muted"].join(" ")}>{check.note}</div>
      )}
    </div>
  );
}
