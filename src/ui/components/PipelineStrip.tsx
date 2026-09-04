export interface PipelineStep {
  step: string;
  who: string;
  what: string;
}

export interface PipelineStripProps {
  steps: PipelineStep[];
  className?: string;
}

/**
 * Six cells in a row connected by a hairline: step name (Barlow Condensed),
 * actor as a kicker, what as muted text. Wraps to three columns under 1000px.
 */
export function PipelineStrip({ steps, className }: PipelineStripProps) {
  return (
    <ol className={["va-pipeline", className].filter(Boolean).join(" ")}>
      {steps.map((s, i) => (
        <li key={s.step} className="va-pipeline-cell">
          <div className="va-pipeline-index" aria-hidden="true">{i + 1}</div>
          <div className="va-kicker">{s.who}</div>
          <div className="va-pipeline-step">{s.step}</div>
          <div className="text-muted va-muted-125">{s.what}</div>
        </li>
      ))}
    </ol>
  );
}
