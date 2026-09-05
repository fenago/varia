import { Fragment, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Blueprint, BlueprintButton, CheckBar, Dialog, EmptyState, Pill, ProgressBlock } from "@ui/components";
import { usePageTitle } from "@ui/shell/PageTitleContext";
import { useWorkspace } from "@lib/store/workspace";
import { activeRun, currentThresholds, studentById } from "@lib/store/selectors";
import { runCompletion } from "@lib/store/orchestrator";
import { cosine, isScorable, tfidfVectors } from "@lib/metrics";
import { FRONTIER_BAND, STRATEGY_LABELS } from "@shared/thresholds";
import type { Property, Run, Variant } from "@shared/types";

const RED = "#8d4a3c";
const ORDER: Property[] = ["p1", "p2", "p3", "p4"];
const IN_FLIGHT = new Set(["queued", "generating", "judging", "scoring"]);
const AXES = [90, 393, 696, 999];
const AXIS_LABELS = ["Different", "Same skill", "Rubric fits", "Same difficulty"];
const WORDS = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"];

function numberWord(n: number): string {
  return WORDS[n] ?? String(n);
}
function clamp01(x: number): number {
  return Math.max(0, Math.min(1, x));
}
function yFor(v: number): number {
  return 30 + (1 - clamp01(v)) * 180;
}
function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

interface Line {
  id: string;
  points: string;
  outlier: boolean;
}

function buildLines(run: Run): Line[] {
  const vs = run.variants.filter(isScorable);
  if (!vs.length) return [];
  const vecs = tfidfVectors(vs.map((v) => v.text));
  const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
  const fleschMean = mean(vs.map((v) => v.metrics.fleschEase));
  const solMean = mean(vs.map((v) => v.metrics.solutionFleschEase));
  const outliers = new Set(run.report?.outliers ?? []);
  return vs.map((v, i) => {
    let cosSum = 0;
    for (let j = 0; j < vs.length; j++) if (j !== i) cosSum += cosine(vecs[i], vecs[j]);
    const p1 = vs.length > 1 ? 1 - cosSum / (vs.length - 1) : 1;
    const p2 = v.metrics.equivalence ?? 0;
    const p3 = 1 - Math.abs(v.metrics.solutionFleschEase - solMean) / 45;
    const p4 = 1 - Math.abs(v.metrics.fleschEase - fleschMean) / 25;
    const ys = [p1, p2, p3, p4].map(yFor);
    return { id: v.id, points: AXES.map((x, k) => `${x},${ys[k].toFixed(1)}`).join(" "), outlier: outliers.has(v.id) };
  });
}

function csvFor(run: Run, nameOf: (v: Variant) => string): string {
  const esc = (s: string | number | boolean | null | undefined) => `"${String(s ?? "").replace(/"/g, '""')}"`;
  const head = ["id", "student", "domain", "stakeholder", "fleschEase", "lexicalComplexity", "stepCount", "solutionFleschEase", "equivalence", "judgeRationale", "p4Outlier", "p2Low", "status"];
  const rows = run.variants.map((v) =>
    [
      v.id,
      nameOf(v),
      v.surfaceAssignment.domain ?? "",
      v.surfaceAssignment.stakeholder ?? "",
      v.metrics.fleschEase.toFixed(1),
      v.metrics.lexicalComplexity.toFixed(3),
      v.metrics.stepCount,
      v.metrics.solutionFleschEase.toFixed(1),
      v.metrics.equivalence == null ? "" : v.metrics.equivalence.toFixed(3),
      (v.metrics.judgeSamples ?? []).map((s) => s.rationale).filter(Boolean).join(" | "),
      v.flags.p4Outlier,
      v.flags.p2Low,
      v.status,
    ].map(esc).join(","),
  );
  return [head.join(","), ...rows].join("\n");
}

export default function Report() {
  const navigate = useNavigate();
  const ws = useWorkspace();
  const run = activeRun(ws);
  usePageTitle(run ? `Integrity report — ${run.blueprintName}` : null);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [showVersions, setShowVersions] = useState(false);
  const [openWhy, setOpenWhy] = useState<string | null>(null);
  const policyAllows = currentThresholds(ws).allowOverThresholdRelease !== false;

  const lines = useMemo(() => (run ? buildLines(run) : []), [run]);

  if (!run) {
    return (
      <EmptyState
        heading="No run to report on"
        text="Generate a set of versions first. The report shows the composite integrity score and the four checks that gate release."
        actionLabel="Go to Generate"
        onAction={() => navigate("/generate")}
      />
    );
  }

  const inFlight = IN_FLIGHT.has(run.status);
  if (inFlight && !run.report) {
    return (
      <div className="va-page" style={{ maxWidth: 640 }}>
        <ProgressBlock progress={run.progress} usage={run.usage} startedAt={run.startedAt} onCancel={ws.cancelRun} onResume={() => void ws.resumeRun(run.id)} error={run.error ?? null} title={`Generating ${run.n} versions of ${run.blueprintName}`} />
      </div>
    );
  }
  if (!run.report) {
    const c = runCompletion(run);
    return (
      <EmptyState
        heading={run.status === "failed" ? "The run failed" : c.resumable ? "The run stopped part-way" : "No report yet"}
        text={
          c.resumable
            ? `${c.generated} of ${run.n} versions were generated and kept. ${run.progress.message}${run.error ? ` · ${run.error}` : ""}`
            : run.error ?? "This run finished without producing a report. Generate again."
        }
        actionLabel={c.resumable ? `Resume: ${run.n - c.generated} to go` : "Back to Generate"}
        onAction={() => (c.resumable ? void ws.resumeRun(run.id).catch(() => {}) : navigate("/generate"))}
      />
    );
  }

  const report = run.report;
  const fails = ORDER.filter((p) => report.checks[p].gate === "fail").length;
  const outliers = report.outliers;
  const scorable = run.variants.filter(isScorable).length;
  const released = !!run.release;

  const nameOf = (v: Variant) => studentById(ws, v.studentId)?.name ?? "";

  function exportCsv() {
    if (!run) return;
    const blob = new Blob([csvFor(run, nameOf)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `varia-${run.blueprintName.replace(/\s+/g, "-").toLowerCase()}-${run.id}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  async function regenerate() {
    if (!run) return;
    setBusy(true);
    setError(null);
    try {
      await ws.regenerateOutliers(run.id);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function loosenJargon() {
    if (!run) return;
    setBusy(true);
    setError(null);
    try {
      await ws.loosenJargonAndRegenerate(run.id);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function releaseWithReason() {
    if (!run || !reason.trim()) return;
    try {
      ws.releaseAnyway(run.id, reason.trim());
      setDialogOpen(false);
      setReason("");
    } catch (e) {
      setError((e as Error).message);
    }
  }

  function releaseClean() {
    if (!run) return;
    try {
      ws.releaseRun(run.id);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <div className="va-page">
      <div style={{ display: "grid", gridTemplateColumns: "300px minmax(0,1fr)", gap: 24, alignItems: "stretch" }}>
        <Blueprint style={{ padding: 22, display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", textAlign: "center" }}>
          <div className="va-kicker">Composite integrity</div>
          <div className="va-big-number" style={{ margin: "8px 0 4px" }}>{report.joint.toFixed(2)}</div>
          <div className="text-muted" style={{ fontSize: 12.5, lineHeight: 1.5 }} title="The pilot computed J with 4-gram overlap in the rubric-stability slot; this app uses the paper's formula with the readability proxy for P3.">
            Joint score J, equal weights.<br />Frontier band {FRONTIER_BAND[0].toFixed(2)}–{FRONTIER_BAND[1].toFixed(2)} is an approximate comparison: the pilot scored 4-gram overlap in the rubric-stability slot.
          </div>
          <div className="va-muted-115" style={{ marginTop: 8 }}>
            {STRATEGY_LABELS[run.strategy]} · {run.generatorModel} · judged by {run.judgeModel} × {run.judgeSamples} · single trial · no seed
            {report.metricsVersion ? ` · metrics v${report.metricsVersion}` : ""}
          </div>
          <div style={{ marginTop: 14 }}>
            {fails === 0 ? <Pill gate="pass">All four pass</Pill> : <Pill gate="watch">{fails} of 4 needs attention</Pill>}
          </div>
          {run.status === "partial" && (
            <div style={{ marginTop: 10, fontSize: 11.5, color: RED }}>
              {run.n - runCompletion(run).generated} of {run.n} versions are missing or failed and are excluded.
              {runCompletion(run).resumable && !inFlight ? (
                <div style={{ marginTop: 8 }}>
                  <button type="button" className="btn btn-secondary" onClick={() => void ws.resumeRun(run.id).catch(() => {})}>
                    Resume the run
                  </button>
                </div>
              ) : null}
            </div>
          )}
          {run.usage && (
            <div className="va-muted-12" style={{ marginTop: 10 }}>
              Actual cost ${run.usage.costUsd.toFixed(2)} · {run.usage.calls} call{run.usage.calls === 1 ? "" : "s"}
            </div>
          )}
        </Blueprint>

        <Blueprint style={{ padding: "20px 22px" }}>
          <h6 style={{ margin: "0 0 4px" }}>The four checks</h6>
          <p className="text-muted" style={{ fontSize: 12.5, margin: "0 0 18px" }}>
            Release is gated on all four passing separately — the composite above is for comparing runs, not for approving one.
          </p>
          <div className="va-stack" style={{ gap: 16 }}>
            {ORDER.map((p) => (
              <div key={p}>
                <CheckBar check={report.checks[p]} />
                {p === "p1" && (
                  <div className="va-muted-115" style={{ marginTop: 4 }}>
                    <span className="va-help" title="Mean pairwise Jaccard overlap of word 4-grams; the paper's lexical companion to the cosine. Lower is more diverse.">4-gram overlap {report.ngramOverlapMean.toFixed(3)}</span>
                    {report.boilerplateLinesRemoved ? <span> · {report.boilerplateLinesRemoved} shared line{report.boilerplateLinesRemoved === 1 ? "" : "s"} removed before scoring</span> : null}
                  </div>
                )}
              </div>
            ))}
          </div>
        </Blueprint>
      </div>

      <Blueprint style={{ padding: "20px 22px" }}>
        <div className="va-row-flex" style={{ gap: 12, marginBottom: 6 }}>
          <h6 style={{ margin: 0 }}>Every version, on all four axes</h6>
          <span className="text-muted" style={{ fontSize: 12 }}>
            {scorable} versions{outliers.length ? ` · the ${numberWord(outliers.length)} outlier${outliers.length === 1 ? " is" : "s are"} drawn solid` : " · no outliers"}
          </span>
          <div className="va-btn-row" style={{ marginLeft: "auto", gap: 8 }}>
            <button type="button" className="btn btn-secondary" onClick={exportCsv}>Export CSV</button>
            <button type="button" className="btn btn-secondary" onClick={() => ws.sendToReviewer(run.id)}>Send to reviewer</button>
          </div>
        </div>
        <svg viewBox="0 0 1060 250" style={{ width: "100%", height: 250, display: "block" }} role="img" aria-label="Every version plotted on the four checks">
          <g className="va-ax">
            {AXES.map((x) => <line key={x} x1={x} y1={30} x2={x} y2={210} />)}
          </g>
          <g fill="#1d1f20" fontFamily="Barlow Condensed" fontSize={13} textAnchor="middle">
            {AXES.map((x, i) => <text key={x} x={x} y={232}>{AXIS_LABELS[i]}</text>)}
          </g>
          <g fill="none" stroke="#5980a6" strokeWidth={1} opacity={0.33}>
            {lines.filter((l) => !l.outlier).map((l) => <polyline key={l.id} points={l.points} />)}
          </g>
          <g fill="none" stroke={RED} strokeWidth={1.8}>
            {lines.filter((l) => l.outlier).map((l) => <polyline key={l.id} points={l.points}><title>{l.id}</title></polyline>)}
          </g>
          {outliers.length > 0 && (
            <g fill={RED} fontFamily="Barlow" fontSize={11} textAnchor="end">
              <text x={994} y={206}>{outliers.join(", ")}</text>
            </g>
          )}
          <g fill="#1d1f20" opacity={0.5} fontFamily="Barlow" fontSize={10} textAnchor="end">
            <text x={82} y={34}>better</text><text x={82} y={212}>worse</text>
          </g>
        </svg>
      </Blueprint>

      <Blueprint style={{ padding: "16px 22px" }}>
        <div className="va-row-flex" style={{ gap: 12 }}>
          <h6 style={{ margin: 0 }}>Versions</h6>
          <span className="text-muted" style={{ fontSize: 12 }}>What the paper measures per version: reading ease, lexical complexity, solution steps, equivalence, and the judge's reasoning.</span>
          <button type="button" className="btn btn-ghost" style={{ marginLeft: "auto" }} onClick={() => setShowVersions((v) => !v)}>
            {showVersions ? "Hide" : "Show"}
          </button>
        </div>
        {showVersions && (
          <div style={{ overflowX: "auto", marginTop: 12 }}>
            <table className="table">
              <thead>
                <tr><th>Version</th><th>Student</th><th>Domain · stakeholder</th><th>Reading ease</th><th>Lexical</th><th>Steps</th><th>Equivalence</th><th>Why</th></tr>
              </thead>
              <tbody>
                {run.variants.map((v) => (
                  <Fragment key={v.id}>
                    <tr className={outliers.includes(v.id) ? "va-sel" : undefined}>
                      <td>{v.id}{v.error ? " · failed" : ""}</td>
                      <td>{nameOf(v) || "—"}</td>
                      <td>{[v.surfaceAssignment.domain, v.surfaceAssignment.stakeholder].filter(Boolean).join(" · ") || "—"}</td>
                      <td>{v.metrics.fleschEase.toFixed(1)}</td>
                      <td>{v.metrics.lexicalComplexity.toFixed(2)}</td>
                      <td>{v.metrics.stepCount}</td>
                      <td>{v.metrics.equivalence == null ? "—" : v.metrics.equivalence.toFixed(2)}</td>
                      <td>
                        {v.metrics.judgeSamples?.length ? (
                          <button type="button" className="btn btn-ghost" onClick={() => setOpenWhy(openWhy === v.id ? null : v.id)}>
                            {openWhy === v.id ? "Hide" : "Why"}
                          </button>
                        ) : "—"}
                      </td>
                    </tr>
                    {openWhy === v.id && (
                      <tr>
                        <td colSpan={8} style={{ fontSize: 12.5, lineHeight: 1.5 }}>
                          {v.metrics.judgeSamples.map((s, i) => (
                            <div key={i} style={{ marginBottom: 6 }}>
                              <span className="va-kicker">Sample {i + 1}</span> {Object.entries(s.dimensionScores).map(([d, n]) => `${d}: ${n}`).join(" · ")}
                              <div className="text-muted">{s.rationale}</div>
                            </div>
                          ))}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Blueprint>

      {inFlight ? (
        <ProgressBlock progress={run.progress} usage={run.usage} startedAt={run.startedAt} onCancel={ws.cancelRun} error={run.error ?? null} title={`Regenerating ${numberWord(outliers.length)} versions`} />
      ) : (
        <div className="va-btn-row">
          {released ? (
            <>
              <Pill gate="pass">Released {fmtDate(run.release!.releasedAt)}</Pill>
              {run.release!.overThreshold && (
                <span className="text-muted" style={{ fontSize: 12.5 }}>
                  Over threshold{run.release!.reason ? ` — "${run.release!.reason}"` : ""}. Recorded on the compliance console.
                </span>
              )}
              {outliers.length > 0 && (
                <BlueprintButton onClick={regenerate} disabled={busy}>
                  {busy ? "Regenerating…" : `Regenerate ${outliers.length}`}
                </BlueprintButton>
              )}
              <button type="button" className="btn btn-secondary" onClick={() => navigate("/roster")}>Open roster</button>
            </>
          ) : report.releasable ? (
            <>
              <BlueprintButton onClick={releaseClean}>Release {scorable} versions</BlueprintButton>
              {outliers.length > 0 && (
                <button type="button" className="btn btn-secondary" onClick={regenerate} disabled={busy}>
                  {busy ? "Regenerating…" : `Regenerate ${outliers.length} first`}
                </button>
              )}
              <span className="text-muted" style={{ fontSize: 12.5 }}>All four checks clear. Releasing is recorded on the compliance console.</span>
            </>
          ) : (
            <>
              {outliers.length > 0 && (
                <BlueprintButton onClick={regenerate} disabled={busy}>
                  {busy ? "Regenerating…" : `Regenerate ${outliers.length}`}
                </BlueprintButton>
              )}
              {report.checks.p4.gate === "fail" && (
                <button type="button" className="btn btn-secondary" onClick={loosenJargon} disabled={busy} title="Stops varying the jargon register on this blueprint, then regenerates the named versions">
                  Loosen the jargon register and regenerate
                </button>
              )}
              {policyAllows ? (
                <button type="button" className="btn btn-secondary" onClick={() => setDialogOpen(true)} disabled={busy}>
                  Release all {scorable} anyway
                </button>
              ) : null}
              <span className="text-muted" style={{ fontSize: 12.5 }}>
                Still over threshold on {ORDER.filter((p) => report.checks[p].gate === "fail").map((p) => report.checks[p].label.toLowerCase()).join(", ") || "an advisory check"}.
                {policyAllows
                  ? " Regeneration never releases by itself; releasing over a threshold needs a reason and is recorded on the compliance console."
                  : " Institution policy blocks over-threshold release; regenerate until the checks clear."}
              </span>
            </>
          )}
        </div>
      )}
      {error && <div style={{ color: RED, fontSize: 13 }} role="alert">{error}</div>}

      <Dialog
        open={dialogOpen}
        title={`Release all ${scorable} over threshold`}
        onClose={() => setDialogOpen(false)}
        actions={
          <>
            <button type="button" className="btn btn-ghost" onClick={() => setDialogOpen(false)}>Cancel</button>
            <BlueprintButton onClick={releaseWithReason} disabled={!reason.trim()}>Release with this reason</BlueprintButton>
          </>
        }
      >
        <p className="card-body" style={{ margin: "0 0 10px" }}>
          The reason is recorded on the compliance console next to the failing check{fails === 1 ? "" : "s"} and shown to reviewers.
        </p>
        <textarea
          className="input va-textarea"
          style={{ width: "100%", minHeight: 80 }}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder='e.g. "formative, low stakes, copy-resistance prioritised"'
          autoFocus
        />
      </Dialog>
    </div>
  );
}
