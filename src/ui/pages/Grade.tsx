import { useEffect, useMemo, useState } from "react";
/* type-scale: applied */
import { Navigate, useNavigate, useParams } from "react-router-dom";
import { Blueprint, BlueprintButton, Dialog, EmptyState, Pill, SegScale, StepProgressBlock, type StepProgress } from "@ui/components";
import { Info } from "@ui/components/Info";
import { StepIntro } from "@ui/components/StepIntro";
import { useWorkspace } from "@lib/store/workspace";
import {
  activeRun,
  domainStakeholderLabel,
  nextUngraded,
  openAppealForVariant,
  readingEaseContext,
  rosterRows,
  studentById,
  evidenceForVariant,
  submissionForVariant,
  variantById,
} from "@lib/store/selectors";
import type { LevelScore } from "@shared/types";
import { getProvider, useSettings } from "@lib/store/settings";

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
  const [evidenceError, setEvidenceError] = useState<string | null>(null);
  const evidence = variant ? evidenceForVariant(ws, variant.id) : null;
  const [showFull, setShowFull] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [appealDialog, setAppealDialog] = useState<"open" | "resolve" | null>(null);
  const [appealText, setAppealText] = useState("");
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteText, setPasteText] = useState("");
  const [suggesting, setSuggesting] = useState(false);
  const [suggestStep, setSuggestStep] = useState<StepProgress | null>(null);
  const [suggestError, setSuggestError] = useState<string | null>(null);
  const settings = useSettings();
  const preScore = submission?.preScore ?? null;

  useEffect(() => {
    setScores((submission?.grade?.scores as Record<string, LevelScore>) ?? {});
    setShowSolution(false);
    setShowFull(false);
    setNote(null);
    setError(null);
  }, [variantId, submission?.grade]);

  const allScored = useMemo(() => rubric.length > 0 && rubric.every((c) => scores[c.id] !== undefined), [rubric, scores]);
  const canGrade = !!submission?.submittedAt;

  const intro = (
    <StepIntro
      step={6}
      title="Grade the work"
      what="One rubric grades every version. Each student's version comes with its own model answer so you compare against the right reference."
      doThis="Read the submission, score each criterion, save. Ask for suggested scores if you want a starting point."
      next="The graded work becomes a verified record the student can share."
      learn={["rubric", "pre-score", "evidence-record"]}
    />
  );

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

  const submitPaste = () => {
    const text = pasteText.trim();
    if (!text) return;
    try {
      ws.setSubmissionText(variant.id, text, undefined, run.id);
      setPasteOpen(false);
      setPasteText("");
      setNote("Submission saved.");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const suggest = async () => {
    if (!submission?.text || !blueprint) return;
    setSuggesting(true);
    setSuggestError(null);
    const modelLabel = getProvider().mode === "live" ? settings.judgeModel : "the demo grader";
    setSuggestStep({ phase: "prescore", headline: `Reading the submission against the rubric with ${modelLabel}`, detail: "Each criterion gets a suggested level and a one-sentence reason. You decide what to save.", note: getProvider().mode === "live" ? "Usually 15–40 seconds." : undefined, startedAt: new Date().toISOString(), pct: 60 });
    try {
      const provider = getProvider();
      if (!provider.preScoreSubmission) throw new Error("This provider cannot suggest scores.");
      const out = await provider.preScoreSubmission({
        blueprint,
        variant: { id: variant.id, text: variant.text, adaptedSolution: variant.adaptedSolution },
        submissionText: submission.text,
        judgeModel: settings.judgeModel,
      });
      ws.applyPreScore(variant.id, out, provider.mode === "demo" ? "demo-provider" : settings.judgeModel, run.id);
      setSuggestStep((prev) => (prev ? { ...prev, headline: "Suggestions ready", detail: out.summary, done: true, pct: 100 } : null));
      window.setTimeout(() => setSuggestStep((cur) => (cur && cur.done ? null : cur)), 2500);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setSuggestError(msg);
      setSuggestStep((prev) => (prev ? { ...prev, error: msg } : null));
    } finally {
      setSuggesting(false);
    }
  };

  const applySuggestions = () => {
    if (!preScore) return;
    setScores({ ...preScore.scores });
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
    <div className="va-page" style={{ gap: 22, maxWidth: 1180 }}>
    {intro}
    <div className="va-split" style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) 400px", gap: 26, alignItems: "start" }}>
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
            The task this student received <Info term="version" />
          </div>
          {paragraphs(variant.text).map((p, i) => (
            <p key={i} style={{ margin: "0 0 10px", fontSize: 16, lineHeight: 1.6 }}>
              {p}
            </p>
          ))}
        </div>

        <div className="va-kicker" style={{ marginBottom: 8 }}>
          What the student handed in <Info term="submission" />
        </div>
        {submission?.origin === "ai-sample" && (
          <div className="va-surface-box" style={{ marginBottom: 10, fontSize: 15, borderLeft: "2px solid #8a6d2f" }}>
            <strong>This is an AI-written sample, not a student's work.</strong> <Info term="ai-sample" /> A model wrote it at the {submission.sampleTier} tier so the demo has something to grade. The grade shown is a suggestion until you save one.
          </div>
        )}
        {submission?.text ? (
          <>
            <div className={showFull ? undefined : "va-clip"} style={{ fontSize: 16, lineHeight: 1.65, maxHeight: showFull ? undefined : 300 }}>
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
          <p className="text-muted" style={{ margin: 0, fontSize: 16 }}>
            Nothing handed in yet. Import files on the previous step, or paste the student's text below.
          </p>
        )}
        <div className="va-btn-row" style={{ marginTop: 10 }}>
          <button type="button" className="btn btn-secondary" onClick={() => { setPasteText(submission?.text ?? ""); setPasteOpen(true); }}>
            {submission?.text ? "Replace submission" : "Paste a submission"}
          </button>
          {submission?.sourceFile && <span className="va-muted-12" style={{ alignSelf: "center" }}>from {submission.sourceFile}</span>}
        </div>
        {pasteOpen && (
          <div style={{ marginTop: 10 }}>
            <textarea className="input" data-testid="paste-submission" style={{ minHeight: 160, width: "100%" }} value={pasteText} onChange={(e) => setPasteText(e.target.value)} placeholder="Paste the student's submission text" />
            <div className="va-btn-row" style={{ marginTop: 8 }}>
              <BlueprintButton onClick={submitPaste} disabled={!pasteText.trim()}>Save submission</BlueprintButton>
              <button type="button" className="btn btn-ghost" onClick={() => setPasteOpen(false)}>Cancel</button>
            </div>
          </div>
        )}
      </Blueprint>

      <div className="va-sticky">
        <Blueprint style={{ padding: "18px 20px" }} data-walk="rubric">
          <div className="va-row-flex" style={{ gap: 8, marginBottom: 4 }}>
            <h6 style={{ margin: 0 }}>Score with the rubric</h6>
            <Info term="rubric" />
            <span className="va-muted-115" style={{ marginLeft: "auto" }}>
              the same for all {totalN} versions
            </span>
          </div>
          <div className="va-stack" style={{ gap: 16, marginTop: 12 }}>
            {rubric.length === 0 && <p className="text-muted" style={{ margin: 0, fontSize: 15 }}>This run's blueprint has no rubric.</p>}
            {rubric.map((c) => (
              <div key={c.id}>
                <div className="va-row-flex" style={{ fontSize: 15.5, marginBottom: 6, gap: 8 }}>
                  <span>{c.name}</span>
                  {preScore && preScore.scores[c.id] !== undefined && (
                    <span className="va-pill va-watch" title={preScore.rationale[c.id] ?? ""} style={{ marginLeft: "auto", cursor: "help" }}>
                      suggested {preScore.scores[c.id]}
                    </span>
                  )}
                </div>
                <SegScale
                  name={`crit-${c.id}`}
                  value={scores[c.id] ?? null}
                  disabled={!canGrade}
                  onChange={(v) => setScores((s) => ({ ...s, [c.id]: v as LevelScore }))}
                />
                {preScore?.rationale[c.id] && (
                  <details style={{ marginTop: 4 }}>
                    <summary className="va-muted-115" style={{ cursor: "pointer" }}>Why</summary>
                    <div className="va-muted-12" style={{ lineHeight: 1.5, marginTop: 2 }}>{preScore.rationale[c.id]}</div>
                  </details>
                )}
              </div>
            ))}
          </div>
          {canGrade && (
            <div style={{ marginTop: 12, borderTop: "1px solid var(--color-divider)", paddingTop: 10 }}>
              {suggestStep && (
                <div style={{ marginBottom: 10 }}>
                  <StepProgressBlock step={suggestStep} onRetry={suggestStep.error ? suggest : undefined} />
                </div>
              )}
              <div className="va-btn-row">
                <button type="button" className="btn btn-secondary" onClick={suggest} disabled={suggesting}>
                  {suggesting ? "Reading the submission…" : preScore ? "Suggest again" : "Suggest scores"}
                </button>
                {preScore && (
                  <button type="button" className="btn btn-secondary" onClick={applySuggestions}>Apply suggestions</button>
                )}
              </div>
              {preScore && (
                <div className="va-muted-115" style={{ marginTop: 6, lineHeight: 1.5 }}>
                  Suggested by {preScore.model} on {formatShort(preScore.at)}; you decide. <Info term="pre-score" /> Only what you save counts as the grade.
                  <div style={{ marginTop: 4 }}>{preScore.summary}</div>
                </div>
              )}
              {suggestError && !suggestStep && <div style={{ marginTop: 6, fontSize: 14, color: RED }}>{suggestError}</div>}
            </div>
          )}
          <BlueprintButton block style={{ marginTop: 16 }} disabled={!canGrade || !allScored} onClick={save}>
            Save score · next submission
          </BlueprintButton>
          {!canGrade ? (
            <div className="va-muted-115" style={{ marginTop: 8 }}>
              Nothing to grade until this student hands something in.
            </div>
          ) : !allScored ? (
            <div className="va-muted-115" style={{ marginTop: 8 }}>
              Score every criterion to save.
            </div>
          ) : null}
          {note && (
            <div className="va-muted-12" style={{ marginTop: 8 }}>
              {note}
            </div>
          )}
          {error && (
            <div style={{ marginTop: 8, fontSize: 14, color: RED }}>
              {error}
            </div>
          )}
        </Blueprint>

        <Blueprint style={{ padding: "18px 20px" }}>
          <div className="va-row-flex" style={{ gap: 8, alignItems: "baseline", marginBottom: 10 }}>
            <h6 style={{ margin: 0 }}>Model answer for this version</h6>
            <Info term="model-answer" />
          </div>
          <p className="card-body" style={{ margin: "0 0 12px" }}>
            Your model answer, rewritten into this student's {variant.surfaceAssignment.domain ?? "own"} scenario. Compare their work against this, not against the original.
          </p>
          <button type="button" className="btn btn-secondary btn-block" style={{ marginTop: 0 }} onClick={() => setShowSolution((s) => !s)}>
            {showSolution ? "Hide the model answer" : "Open the model answer"}
          </button>
          {showSolution && (
            <div className="va-surface-box" style={{ marginTop: 12, fontSize: 15, lineHeight: 1.6 }}>
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

          {submission?.grade && (
            <div style={{ marginTop: 12 }}>
              {evidence ? (
                <div className="va-muted-12" style={{ lineHeight: 1.55 }}>
                  This grade is a verified record{" "}
                  <a href={`/evidence/${variant.id}`} target="_blank" rel="noopener noreferrer">
                    {evidence.id}
                  </a>{" "}
                  the student can share with employers. <Info term="evidence-record" />
                  <div style={{ marginTop: 4 }}>
                    It sits in the student's{" "}
                    {evidence.bridge?.learnerId ? (
                      <a href={`/portfolio/${evidence.bridge.learnerId}`} target="_blank" rel="noopener noreferrer">
                        portfolio
                      </a>
                    ) : (
                      "portfolio"
                    )}
                    .
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  className="btn btn-secondary btn-block"
                  onClick={async () => {
                    setEvidenceError(null);
                    try {
                      await ws.issueEvidenceRecord(variant.id);
                    } catch (e) {
                      setEvidenceError(e instanceof Error ? e.message : String(e));
                    }
                  }}
                >
                  Make this a verified record the student can share
                </button>
              )}
              {evidenceError && (
                <div style={{ color: "#8d4a3c", fontSize: 14, marginTop: 6 }}>{evidenceError}</div>
              )}
            </div>
          )}

          {appeal && (
            <div style={{ marginTop: 12 }}>
              <div className="va-row-flex" style={{ gap: 8, marginBottom: 6 }}>
                <Pill gate="fail">Appeal</Pill>
                <span className="va-muted-115">opened {formatShort(appeal.openedAt)}</span>
              </div>
              <div style={{ fontSize: 15, lineHeight: 1.5, marginBottom: 8 }}>“{appeal.note}”</div>
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
        <p className="text-muted" style={{ margin: "0 0 10px", fontSize: 15 }}>
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
    </div>
  );
}

function formatShort(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${d.getDate()} ${months[d.getMonth()]}`;
}
