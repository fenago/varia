import { useEffect, useMemo, useState } from "react";
import { Navigate, useNavigate, useParams } from "react-router-dom";
import { Blueprint, BlueprintButton, Dialog, EmptyState, Pill, SegScale } from "@ui/components";
import { useWorkspace } from "@lib/store/workspace";
import {
  activeRun,
  domainStakeholderLabel,
  nextUngraded,
  openAppealForVariant,
  readingEaseContext,
  rosterRows,
  studentById,
  submissionForVariant,
  variantById,
} from "@lib/store/selectors";
import type { LevelScore } from "@shared/types";

const RED = "#8d4a3c";

function paragraphs(text: string) {
  return text
    .split(/\n{2,}|\n(?=[A-Z*\-•\d])/)
    .map((p) => p.trim())
    .filter(Boolean);
}

export default function Grade() {
  const { variantId } = useParams<{ variantId: string }>();
  const ws = useWorkspace();
  const navigate = useNavigate();
  const run = activeRun(ws);

  // Bare /grade → first submitted-but-ungraded, else first variant.
  if (!variantId) {
    if (!run) {
      return (
        <EmptyState
          heading="Nothing to grade yet"
          text="Generate and release a set of versions first."
          actionLabel="Go to generation"
          onAction={() => navigate("/generate")}
        />
      );
    }
    const rows = rosterRows(ws, run.id);
    const first = rows.find((r) => r.status === "submitted" || r.status === "appeal") ?? rows[0];
    if (!first) {
      return (
        <EmptyState
          heading="No versions in this run"
          text="The active run has no variants to grade."
          actionLabel="Open the integrity report"
          onAction={() => navigate("/report")}
        />
      );
    }
    return <Navigate to={`/grade/${first.variant.id}`} replace />;
  }

  return <GradeView variantId={variantId} />;
}

function GradeView({ variantId }: { variantId: string }) {
  const ws = useWorkspace();
  const navigate = useNavigate();
  const active = activeRun(ws);
  const hit = variantById(ws, variantId, active?.id) ?? variantById(ws, variantId);
  const run = hit?.run ?? null;
  const variant = hit?.variant ?? null;
  const blueprint = run ? ws.blueprints.find((b) => b.id === run.blueprintId) ?? null : null;
  const rubric = blueprint?.rubric ?? [];
  const student = studentById(ws, variant?.studentId);
  const submission = variant ? submissionForVariant(ws, variant.id, run?.id) : null;
  const appeal = variant ? openAppealForVariant(ws, variant.id, run?.id) : null;
  const ease = readingEaseContext(run, variant);

  const [scores, setScores] = useState<Record<string, LevelScore>>({});
  const [showSolution, setShowSolution] = useState(false);
  const [showFull, setShowFull] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [appealDialog, setAppealDialog] = useState<"open" | "resolve" | null>(null);
  const [appealText, setAppealText] = useState("");

  useEffect(() => {
    setScores((submission?.grade?.scores as Record<string, LevelScore>) ?? {});
    setShowSolution(false);
    setShowFull(false);
    setNote(null);
    setError(null);
  }, [variantId, submission?.grade]);

  const allScored = useMemo(() => rubric.length > 0 && rubric.every((c) => scores[c.id] !== undefined), [rubric, scores]);
  const canGrade = !!submission?.submittedAt;

  if (!run || !variant) {
    return (
      <EmptyState
        heading="Version not found"
        text={`No version with id ${variantId} exists in this workspace.`}
        actionLabel="Back to roster"
        onAction={() => navigate("/roster")}
      />
    );
  }

  const surface = `${domainStakeholderLabel(variant)} · reading ease ${variant.metrics.fleschEase.toFixed(1)}`;
  const totalN = run.variants.filter((v) => !v.error && v.text).length;

  const save = () => {
    try {
      ws.saveGrade(variant.id, scores);
      const next = nextUngraded(ws, run.id, variant.id);
      if (next) navigate(`/grade/${next}`);
      else setNote("All submissions graded.");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const easeLine = (() => {
    if (!ease) return null;
    const x = variant.metrics.fleschEase.toFixed(1);
    if (ease.within3) return `This version's reading ease is ${x} — within 3 points of the set mean, so no difficulty adjustment applies.`;
    if (ease.delta < 0)
      return `This version's reading ease is ${x} — ${Math.abs(ease.delta).toFixed(1)} points below the set mean of ${ease.mean.toFixed(1)}, so it read harder than most. A difficulty note is on the record for appeals.`;
    return `This version's reading ease is ${x} — ${ease.delta.toFixed(1)} points above the set mean of ${ease.mean.toFixed(1)}, so it read easier than most.`;
  })();

  return (
    <div className="va-split" style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) 400px", gap: 26, alignItems: "start", maxWidth: 1180 }}>
      <Blueprint style={{ padding: "22px 24px" }}>
        <div className="va-row-flex" style={{ marginBottom: 14 }}>
          <span className="tag tag-accent">{variant.id}</span>
          <span className="va-heading-19">{student?.name ?? "Unassigned"}</span>
          <span className="va-muted-12" style={{ marginLeft: "auto" }}>
            {surface}
          </span>
        </div>

        <div className="va-surface-box" style={{ padding: "18px 20px", marginBottom: 18 }}>
          <div className="va-kicker" style={{ marginBottom: 8 }}>
            The task this student received
          </div>
          {paragraphs(variant.text).map((p, i) => (
            <p key={i} style={{ margin: "0 0 10px", fontSize: 14, lineHeight: 1.6 }}>
              {p}
            </p>
          ))}
        </div>

        <div className="va-kicker" style={{ marginBottom: 8 }}>
          Submission
        </div>
        {submission?.text ? (
          <>
            <div className={showFull ? undefined : "va-clip"} style={{ fontSize: 14, lineHeight: 1.65, maxHeight: showFull ? undefined : 300 }}>
              {paragraphs(submission.text).map((p, i) => (
                <p key={i}>{p}</p>
              ))}
              {!showFull && <div className="va-fade va-fade-bg" />}
            </div>
            <button type="button" className="btn btn-ghost" style={{ marginTop: 6 }} onClick={() => setShowFull((s) => !s)}>
              {showFull ? "Collapse submission" : "Show full submission"}
            </button>
          </>
        ) : (
          <p className="text-muted" style={{ margin: 0, fontSize: 14 }}>
            Nothing submitted yet.
          </p>
        )}
      </Blueprint>

      <div className="va-sticky">
        <Blueprint style={{ padding: "18px 20px" }}>
          <div className="va-row-flex" style={{ gap: 8, marginBottom: 4 }}>
            <h6 style={{ margin: 0 }}>Rubric</h6>
            <span className="va-muted-115" style={{ marginLeft: "auto" }}>
              unchanged across all {totalN}
            </span>
          </div>
          <div className="va-stack" style={{ gap: 16, marginTop: 12 }}>
            {rubric.length === 0 && <p className="text-muted" style={{ margin: 0, fontSize: 13 }}>This run's blueprint has no rubric.</p>}
            {rubric.map((c) => (
              <div key={c.id}>
                <div style={{ fontSize: 13.5, marginBottom: 6 }}>{c.name}</div>
                <SegScale
                  name={`crit-${c.id}`}
                  value={scores[c.id] ?? null}
                  disabled={!canGrade}
                  onChange={(v) => setScores((s) => ({ ...s, [c.id]: v as LevelScore }))}
                />
              </div>
            ))}
          </div>
          <BlueprintButton block style={{ marginTop: 16 }} disabled={!canGrade || !allScored} onClick={save}>
            Save score · next submission
          </BlueprintButton>
          {!canGrade && (
            <div className="va-muted-115" style={{ marginTop: 8 }}>
              Nothing to grade until this student submits.
            </div>
          )}
          {note && (
            <div className="va-muted-12" style={{ marginTop: 8 }}>
              {note}
            </div>
          )}
          {error && (
            <div style={{ marginTop: 8, fontSize: 12.5, color: RED }}>
              {error}
            </div>
          )}
        </Blueprint>

        <Blueprint style={{ padding: "18px 20px" }}>
          <h6 style={{ margin: "0 0 10px" }}>Reference for this version</h6>
          <p className="card-body" style={{ margin: "0 0 12px" }}>
            The canonical solution, rewritten into this student's {variant.surfaceAssignment.domain ?? "own"} scenario. Compare against this, not the original.
          </p>
          <button type="button" className="btn btn-secondary btn-block" style={{ marginTop: 0 }} onClick={() => setShowSolution((s) => !s)}>
            {showSolution ? "Hide adapted solution" : "Open adapted solution"}
          </button>
          {showSolution && (
            <div className="va-surface-box" style={{ marginTop: 12, fontSize: 13, lineHeight: 1.6 }}>
              {paragraphs(variant.adaptedSolution).map((p, i) => (
                <p key={i} style={{ margin: "0 0 8px" }}>
                  {p}
                </p>
              ))}
            </div>
          )}
          <div className="hr" />
          {easeLine && (
            <div className="va-muted-12" style={{ lineHeight: 1.55 }}>
              {easeLine}
            </div>
          )}

          {appeal && (
            <div style={{ marginTop: 12 }}>
              <div className="va-row-flex" style={{ gap: 8, marginBottom: 6 }}>
                <Pill gate="fail">Appeal</Pill>
                <span className="va-muted-115">opened {formatShort(appeal.openedAt)}</span>
              </div>
              <div style={{ fontSize: 13, lineHeight: 1.5, marginBottom: 8 }}>“{appeal.note}”</div>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => {
                  setAppealText("");
                  setAppealDialog("resolve");
                }}
              >
                Resolve appeal
              </button>
            </div>
          )}
          {!appeal && variant.flags.p4Outlier && (
            <div style={{ marginTop: 12 }}>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => {
                  setAppealText("");
                  setAppealDialog("open");
                }}
              >
                Open appeal on behalf of student
              </button>
            </div>
          )}
        </Blueprint>
      </div>

      <Dialog
        open={appealDialog !== null}
        title={appealDialog === "open" ? "Open a difficulty appeal" : "Resolve this appeal"}
        onClose={() => setAppealDialog(null)}
        actions={
          <>
            <button type="button" className="btn btn-secondary" onClick={() => setAppealDialog(null)}>
              Cancel
            </button>
            <BlueprintButton
              disabled={appealText.trim().length === 0}
              onClick={() => {
                try {
                  if (appealDialog === "open") ws.openAppeal(variant.id, appealText.trim());
                  else if (appeal) ws.resolveAppeal(appeal.id, appealText.trim());
                  setAppealDialog(null);
                } catch (e) {
                  setError(e instanceof Error ? e.message : String(e));
                  setAppealDialog(null);
                }
              }}
            >
              {appealDialog === "open" ? "Open appeal" : "Record resolution"}
            </BlueprintButton>
          </>
        }
      >
        <p className="text-muted" style={{ margin: "0 0 10px", fontSize: 13 }}>
          {appealDialog === "open"
            ? `Records that ${student?.name ?? "this student"} received ${variant.id}, an over-threshold version, and opens an appeal on the audit trail.`
            : `Your resolution is recorded on the audit trail with this version's reading ease (${variant.metrics.fleschEase.toFixed(1)}) against the set mean${ease ? ` (${ease.mean.toFixed(1)})` : ""}.`}
        </p>
        <textarea
          className="input va-textarea"
          style={{ width: "100%", minHeight: 90 }}
          value={appealText}
          onChange={(e) => setAppealText(e.target.value)}
          placeholder={appealDialog === "open" ? "Reason for the appeal" : "Resolution"}
        />
      </Dialog>
    </div>
  );
}

function formatShort(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${d.getDate()} ${months[d.getMonth()]}`;
}
