import type { OutcomeEvent, OutcomeKind } from "@shared/types";
import type { PillGate } from "./Pill";
import { Stamp } from "./Stamp";

const LABEL: Record<OutcomeKind, string> = {
  interviewed: "Interviewed",
  offered: "Offered",
  hired: "Hired",
  ramped: "Ramped",
  promoted: "Promoted",
};

const GATE: Record<OutcomeKind, PillGate> = {
  interviewed: "watch",
  offered: "pass",
  hired: "pass",
  ramped: "pass",
  promoted: "pass",
};

export interface OutcomeStampsProps {
  outcomes: OutcomeEvent[];
  className?: string;
}

/** One Stamp per outcome, organisation in the tooltip. Renders nothing for an empty list. */
export function OutcomeStamps({ outcomes, className }: OutcomeStampsProps) {
  if (outcomes.length === 0) return null;
  return (
    <span className={["va-tags", className].filter(Boolean).join(" ")}>
      {outcomes.map((o) => (
        <Stamp
          key={o.id}
          gate={GATE[o.kind]}
          title={`${LABEL[o.kind]} · ${o.organisation} · ${new Date(o.at).toLocaleDateString()}${o.onboardingHours != null ? ` · ${o.onboardingHours} h to productive` : ""}`}
        >
          {LABEL[o.kind]}
        </Stamp>
      ))}
    </span>
  );
}
