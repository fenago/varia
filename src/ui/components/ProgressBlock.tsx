import type { RunProgress, UsageTotals } from "@shared/types";
/* type-scale: applied */
import { describeProgress, formatElapsed } from "@lib/store/progress";
import { useElapsed } from "@ui/hooks/useElapsed";
import { Blueprint } from "./Blueprint";
import { Stamp } from "./Stamp";

export interface ProgressBlockProps {
  progress: RunProgress;
  onCancel?: () => void;
  title?: string;
  /** Wave 6b additions — all optional, older call sites keep working. */
  usage?: UsageTotals;
  /** Overrides progress.startedAt for the elapsed clock */
  startedAt?: string;
  onResume?: () => void;
  /** A fatal error to show on the terminal row (defaults to progress.message when phase is failed) */
  error?: string | null;
  /** Single-line variant for tight spaces (rail cards, banners) */
  compact?: boolean;
}

const TONE_GATE = { neutral: "watch", pass: "pass", watch: "watch", fail: "fail" } as const;

/**
 * Honest progress for any long step: what is happening now, k of n, elapsed,
 * estimated remaining, cost so far, the last thing that finished, warnings,
 * and a clear terminal state with Resume. Never a spinner without words.
 */
export function ProgressBlock({ progress, onCancel, title = "Run in progress", usage, startedAt, onResume, error, compact = false }: ProgressBlockProps) {
  const text = describeProgress(progress);
  const running = !text.terminal;
  const elapsed = useElapsed(startedAt ?? progress.startedAt ?? null, running);
  const fatal = progress.phase === "failed" ? (error ?? progress.message) : error ?? null;
  const showResume = onResume && (progress.phase === "partial" || progress.phase === "failed" || progress.phase === "cancelled");

  if (compact) {
    return (
      <div className={`va-progress-compact va-progress-tone-${text.tone}`} role="status" aria-live="polite">
        <span className="va-progress-compact-head">{text.headline}</span>
        <span className="text-muted">
          {progress.done} / {progress.total}
          {running && text.eta ? ` · ${text.eta}` : ""}
        </span>
        <div className="va-progress" aria-hidden="true" style={{ flex: 1, minWidth: 80 }}>
          <div className="va-progress-fill" style={{ width: `${text.pct}%` }} />
        </div>
      </div>
    );
  }

  return (
    <Blueprint style={{ padding: "18px 20px" }} role="status" aria-live="polite" aria-busy={running}>
      <div className="va-row-flex" style={{ marginBottom: 8, gap: 10, alignItems: "baseline" }}>
        <h6 style={{ margin: 0 }}>{title}</h6>
        <span className="text-muted" style={{ fontSize: 14, marginLeft: "auto", fontVariantNumeric: "tabular-nums" }}>
          {progress.done} / {progress.total}
          {elapsed > 0 || running ? ` · ${formatElapsed(elapsed)} elapsed` : ""}
        </span>
      </div>

      <div className="va-row-flex" style={{ gap: 10, alignItems: "baseline", marginBottom: 6 }}>
        <div className="va-progress-headline">{text.headline}</div>
        {running && text.eta ? <span className="text-muted" style={{ fontSize: 14 }}>{text.eta}</span> : null}
        {text.terminal ? <Stamp gate={TONE_GATE[text.tone]}>{progress.phase === "partial" ? `${progress.done} of ${progress.total} done` : progress.phase}</Stamp> : null}
      </div>

      <div className="va-progress" aria-hidden="true">
        <div className={`va-progress-fill${running ? " is-running" : ""}${text.tone === "fail" ? " is-fail" : ""}`} style={{ width: `${text.pct}%` }} />
      </div>

      <div className="va-muted-12" style={{ marginTop: 8, lineHeight: 1.5 }}>{text.detail}</div>

      {running && (progress.current || progress.lastDone) ? (
        <dl className="va-progress-now">
          {progress.current ? (
            <>
              <dt>Now</dt>
              <dd>{progress.current}</dd>
            </>
          ) : null}
          {progress.lastDone ? (
            <>
              <dt>Last</dt>
              <dd>{progress.lastDone}</dd>
            </>
          ) : null}
        </dl>
      ) : null}

      {usage && usage.calls > 0 ? (
        <div className="va-muted-12" style={{ marginTop: 6, fontVariantNumeric: "tabular-nums" }}>
          Actual cost so far ${usage.costUsd.toFixed(2)} · {usage.calls} call{usage.calls === 1 ? "" : "s"}
        </div>
      ) : null}

      {progress.warnings && progress.warnings.length ? (
        <ul className="va-progress-warnings" aria-label="Warnings">
          {progress.warnings.slice(-5).map((w) => (
            <li key={w}>{w}</li>
          ))}
        </ul>
      ) : null}

      {fatal ? (
        <div className="va-progress-fatal" role="alert">
          {fatal}
        </div>
      ) : null}

      {(onCancel && running) || showResume ? (
        <div className="va-btn-row" style={{ marginTop: 12 }}>
          {onCancel && running ? (
            <button type="button" className="btn btn-secondary" onClick={onCancel}>
              Stop and keep what's done
            </button>
          ) : null}
          {showResume ? (
            <button type="button" className="btn btn-primary blueprint" onClick={onResume}>
              {progress.phase === "failed" ? "Retry" : "Resume"}
            </button>
          ) : null}
        </div>
      ) : null}
    </Blueprint>
  );
}

/** A minimal step tracker for non-run work (extraction, sample load, pre-scoring). */
export interface StepProgress {
  phase: string;
  headline: string;
  detail?: string;
  startedAt: string;
  /** 0..100 or null for indeterminate-but-labelled */
  pct?: number | null;
  note?: string;
  error?: string | null;
  done?: boolean;
}

export interface StepProgressBlockProps {
  step: StepProgress;
  onRetry?: () => void;
  title?: string;
}

/** Same honesty for one-off steps: headline, elapsed, note, error + Retry. */
export function StepProgressBlock({ step, onRetry, title }: StepProgressBlockProps) {
  const running = !step.done && !step.error;
  const elapsed = useElapsed(step.startedAt, running);
  return (
    <Blueprint style={{ padding: "16px 20px" }} role="status" aria-live="polite" aria-busy={running}>
      {title ? (
        <div className="va-row-flex" style={{ marginBottom: 6 }}>
          <h6 style={{ margin: 0 }}>{title}</h6>
          <span className="text-muted" style={{ fontSize: 14, marginLeft: "auto", fontVariantNumeric: "tabular-nums" }}>{formatElapsed(elapsed)} elapsed</span>
        </div>
      ) : null}
      <div className="va-row-flex" style={{ gap: 10, alignItems: "baseline" }}>
        <div className="va-progress-headline">{step.headline}</div>
        {!title ? <span className="text-muted" style={{ fontSize: 14, marginLeft: "auto", fontVariantNumeric: "tabular-nums" }}>{formatElapsed(elapsed)}</span> : null}
        {step.done ? <Stamp gate="pass">Done</Stamp> : step.error ? <Stamp gate="fail">Failed</Stamp> : null}
      </div>
      <div className="va-progress" aria-hidden="true" style={{ marginTop: 8 }}>
        <div className={`va-progress-fill${running ? " is-running" : ""}${step.error ? " is-fail" : ""}`} style={{ width: `${step.done ? 100 : step.pct ?? (step.error ? 100 : 35)}%` }} />
      </div>
      {step.detail ? <div className="va-muted-12" style={{ marginTop: 8, lineHeight: 1.5 }}>{step.detail}</div> : null}
      {step.note && running ? <div className="va-muted-12" style={{ marginTop: 4 }}>{step.note}</div> : null}
      {step.error ? (
        <div className="va-progress-fatal" role="alert">
          {step.error}
        </div>
      ) : null}
      {step.error && onRetry ? (
        <div className="va-btn-row" style={{ marginTop: 10 }}>
          <button type="button" className="btn btn-primary blueprint" onClick={onRetry}>
            Retry
          </button>
        </div>
      ) : null}
    </Blueprint>
  );
}
