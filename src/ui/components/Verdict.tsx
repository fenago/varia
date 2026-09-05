import type { ReactNode } from "react";
import { Blueprint } from "./Blueprint";
import { Stamp } from "./Stamp";

export interface VerdictAction {
  label: string;
  onClick: () => void;
  disabled?: boolean;
}

export interface VerdictProps {
  tone: "pass" | "watch" | "fail";
  /** One plain sentence, e.g. "Ready to release" */
  headline: string;
  /** One or two plain sentences saying why and what it means */
  body: ReactNode;
  action?: VerdictAction;
  secondary?: VerdictAction;
  /** Small stamp text; defaults by tone */
  stamp?: string;
  className?: string;
}

const DEFAULT_STAMP: Record<VerdictProps["tone"], string> = {
  pass: "All clear",
  watch: "Needs a look",
  fail: "Not yet",
};

/**
 * A large plain-language verdict for the report and roster pages: the answer first,
 * the reason second, the one thing to do third.
 */
export function Verdict({ tone, headline, body, action, secondary, stamp, className }: VerdictProps) {
  return (
    <Blueprint className={`va-verdict is-${tone} ${className ?? ""}`} style={{ padding: "20px 24px" }}>
      <div className="va-verdict-top">
        <Stamp gate={tone}>{stamp ?? DEFAULT_STAMP[tone]}</Stamp>
      </div>
      <div className="va-verdict-headline">{headline}</div>
      <div className="va-verdict-body">{body}</div>
      {action || secondary ? (
        <div className="va-btn-row" style={{ marginTop: 14 }}>
          {action ? (
            <button type="button" className="btn btn-primary blueprint" onClick={action.onClick} disabled={action.disabled}>
              <i className="corner tl" /><i className="corner tr" /><i className="corner bl" /><i className="corner br" />
              {action.label}
            </button>
          ) : null}
          {secondary ? (
            <button type="button" className="btn btn-secondary" onClick={secondary.onClick} disabled={secondary.disabled}>
              {secondary.label}
            </button>
          ) : null}
        </div>
      ) : null}
    </Blueprint>
  );
}
