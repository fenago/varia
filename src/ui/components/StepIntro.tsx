import { useState } from "react";
import { Blueprint } from "./Blueprint";
import { Info } from "./Info";
import { glossaryTerm } from "@shared/glossary";

export const STEP_COUNT = 6;

export interface StepIntroProps {
  /** 0-based step index; shown as "Step n+1 of 6" */
  step: number;
  title: string;
  what: string;
  doThis: string;
  next: string;
  /** Glossary slugs worth learning on this step */
  learn?: string[];
  /** Persist the hide state under this key (default: the step number) */
  storageKey?: string;
}

function readHidden(key: string): boolean {
  try {
    return localStorage.getItem(key) === "1";
  } catch {
    return false;
  }
}
function writeHidden(key: string, hidden: boolean) {
  try {
    if (hidden) localStorage.setItem(key, "1");
    else localStorage.removeItem(key);
  } catch {
    /* storage unavailable */
  }
}

/**
 * A plain-language panel at the top of a step page: what this step is, what to do,
 * and what happens next. Hideable per step; a "Show" pill brings it back.
 */
export function StepIntro({ step, title, what, doThis, next, learn = [], storageKey }: StepIntroProps) {
  const key = `varia.intro.${storageKey ?? step}`;
  const [hidden, setHidden] = useState(() => readHidden(key));
  const kicker = `Step ${step + 1} of ${STEP_COUNT} · what this step does`;

  if (hidden) {
    return (
      <div className="va-stepintro-hidden">
        <span className="va-kicker">{kicker}</span>
        <button
          type="button"
          className="va-pill va-watch va-stepintro-show"
          onClick={() => {
            writeHidden(key, false);
            setHidden(false);
          }}
        >
          Show the guide
        </button>
      </div>
    );
  }

  const learnable = learn.filter((s) => glossaryTerm(s));

  return (
    <Blueprint className="va-stepintro" style={{ padding: "18px 22px" }}>
      <div className="va-stepintro-head">
        <div>
          <div className="va-kicker">{kicker}</div>
          <div className="va-stepintro-title">{title}</div>
        </div>
        <button
          type="button"
          className="btn btn-ghost va-stepintro-hide"
          onClick={() => {
            writeHidden(key, true);
            setHidden(true);
          }}
        >
          Hide
        </button>
      </div>
      <div className="va-stepintro-lines">
        <p><strong>What this is.</strong> {what}</p>
        <p><strong>What to do.</strong> {doThis}</p>
        <p><strong>What happens next.</strong> {next}</p>
      </div>
      {learnable.length ? (
        <div className="va-stepintro-learn">
          <span className="text-muted">Words on this page:</span>
          {learnable.map((s) => (
            <span key={s} className="va-stepintro-learn-item">
              {glossaryTerm(s)!.term} <Info term={s} />
            </span>
          ))}
        </div>
      ) : null}
    </Blueprint>
  );
}
