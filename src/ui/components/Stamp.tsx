import type { ReactNode } from "react";
import type { PillGate } from "./Pill";

const CLASS: Record<PillGate, string> = {
  pass: "va-pass",
  fail: "va-fail",
  advisory: "va-watch",
  watch: "va-watch",
};

export interface StampProps {
  gate: PillGate;
  children: ReactNode;
  title?: string;
  className?: string;
}

/** Small bordered uppercase label: "Validated by Northline Talent Systems", "Not yet validated". */
export function Stamp({ gate, children, title, className }: StampProps) {
  return (
    <span className={["va-stamp", CLASS[gate], className].filter(Boolean).join(" ")} title={title}>
      {children}
    </span>
  );
}
