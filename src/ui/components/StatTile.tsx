import type { ReactNode } from "react";
import { Blueprint } from "./Blueprint";

export type StatColor = "pass" | "fail" | "watch";

const COLOR: Record<StatColor, string> = {
  pass: "#3d6b4d",
  fail: "#8d4a3c",
  watch: "#8a6d2f",
};

export interface StatTileProps {
  kicker: string;
  value: ReactNode;
  sub?: ReactNode;
  /** Limited to the three status colours. */
  color?: StatColor;
  className?: string;
}

/** The 4-up stat tile from Roster and Console. */
export function StatTile({ kicker, value, sub, color, className }: StatTileProps) {
  return (
    <Blueprint className={className} style={{ padding: "16px 18px" }}>
      <div className="va-kicker-11">{kicker}</div>
      <div className="va-stat-number" style={color ? { color: COLOR[color] } : undefined}>
        {value}
      </div>
      {sub != null && <div className="va-muted-12">{sub}</div>}
    </Blueprint>
  );
}
