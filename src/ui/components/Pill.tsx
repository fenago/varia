import type { ReactNode } from "react";

export type PillGate = "pass" | "fail" | "advisory" | "watch";

const CLASS: Record<PillGate, string> = {
  pass: "va-pass",
  fail: "va-fail",
  advisory: "va-watch",
  watch: "va-watch",
};

export interface PillProps {
  gate: PillGate;
  children: ReactNode;
  className?: string;
  title?: string;
  style?: React.CSSProperties;
}

/** Status pill: `va-pill va-pass|va-fail|va-watch`. */
export function Pill({ gate, children, className, title, style }: PillProps) {
  return (
    <span className={["va-pill", CLASS[gate], className].filter(Boolean).join(" ")} title={title} style={style}>
      {children}
    </span>
  );
}
