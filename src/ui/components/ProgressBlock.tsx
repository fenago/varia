import type { RunProgress } from "@shared/types";
import { Blueprint } from "./Blueprint";

const PHASE_LABEL: Record<RunProgress["phase"], string> = {
  queued: "Queued",
  generating: "Generating versions",
  judging: "Judging construct equivalence",
  scoring: "Scoring the set",
  complete: "Complete",
  partial: "Finished with errors",
  failed: "Failed",
  cancelled: "Cancelled",
};

export interface ProgressBlockProps {
  progress: RunProgress;
  onCancel?: () => void;
  title?: string;
}

/** Phase, done/total, message, thin bar, cancel — shown on Generate while a run is in flight. */
export function ProgressBlock({ progress, onCancel, title = "Run in progress" }: ProgressBlockProps) {
  const pct = progress.total > 0 ? Math.min(100, Math.round((progress.done / progress.total) * 100)) : 0;
  const terminal = ["complete", "partial", "failed", "cancelled"].includes(progress.phase);
  return (
    <Blueprint style={{ padding: "18px 20px" }} role="status" aria-live="polite">
      <div className="va-row-flex" style={{ marginBottom: 10 }}>
        <h6 style={{ margin: 0 }}>{title}</h6>
        <span className="text-muted" style={{ fontSize: 12, marginLeft: "auto" }}>
          {progress.done} / {progress.total}
        </span>
      </div>
      <div className="va-heading-16" style={{ marginBottom: 6 }}>
        {PHASE_LABEL[progress.phase]}
      </div>
      <div className="va-progress" aria-hidden="true">
        <div className="va-progress-fill" style={{ width: `${pct}%` }} />
      </div>
      <div className="va-muted-12" style={{ marginTop: 8, lineHeight: 1.5 }}>
        {progress.message}
      </div>
      {onCancel && !terminal && (
        <button type="button" className="btn btn-secondary" style={{ marginTop: 12 }} onClick={onCancel}>
          Cancel run
        </button>
      )}
    </Blueprint>
  );
}
