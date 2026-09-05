import { Fragment, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Blueprint, BlueprintButton, Dialog, EmptyState, Pill, ProgressBlock, Stamp } from "@ui/components";
import { Info, Term } from "@ui/components/Info";
import { StepIntro } from "@ui/components/StepIntro";
import { Verdict } from "@ui/components/Verdict";
import { usePageTitle } from "@ui/shell/PageTitleContext";
import { useWorkspace } from "@lib/store/workspace";
import { activeRun, currentThresholds, studentById } from "@lib/store/selectors";
import { runCompletion } from "@lib/store/orchestrator";
import { cosine, isScorable, tfidfVectors } from "@lib/metrics";
import { FRONTIER_BAND, STRATEGY_LABELS } from "@shared/thresholds";
import type { Check, Property, Run, Variant } from "@shared/types";

const RED = "#8d4a3c";
const ORDER: Property[] = ["p1", "p2", "p3", "p4"];
const IN_FLIGHT = new Set(["queued", "generating", "judging", "scoring"]);
const AXES = [90, 393, 696, 999];
const AXIS_LABELS = ["Different", "Same skill", "Rubric fits", "Same difficulty"];
const WORDS = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"];

/** Plain-language meaning of each check, for an instructor who has not read the paper. */
const PLAIN: Record<Property, { meaning: string; term: string; passText: string; failLead: string }> = {
  p1: {
    meaning: "No two students got a version alike enough to share answers.",
    term: "p1",
    passText: "The versions are different enough on the surface.",
    failLead: "some versions are too alike",
  },
  p2: {
    meaning: "Every version still tests the skill your rubric grades, not something else.",
    term: "p2",
    passText: "Every version measures the same skill.",
    failLead: "some versions test a different skill",
  },
  p3: {
    meaning: "Your rubric should fit every version. This one is estimated, not measured directly, so it never blocks release.",
    term: "p3",
    passText: "The rubric appears to fit every version.",
    failLead: "the rubric may not fit every version",
  },
  p4: {
    meaning: "Nobody got a version that is materially harder to read than the others.",
    term: "p4",
    passText: "The versions are equally hard to read.",
    failLead: "some versions read harder than the rest",
  },
};

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

/** One plain row per check: stamp, name, meaning, and the number as a hover term. */
function CheckRow({ check, p }: { check: Check; p: Property }) {
  const plain = PLAIN[p];
  const gate = check.gate;
  const stampGate = gate === "pass" ? "pass" : gate === "advisory" ? "watch" : "fail";
  const stampText = gate === "pass" ? "Passed" : gate === "advisory" ? "Estimated" : "Needs attention";
  return (
    <div style={{ display: "grid", gridTemplateColumns: "118px minmax(0,1fr)", gap: 14, alignItems: "start", padding: "12px 0", borderTop: "1px solid var(--color-divider)" }}>
      <div style={{ paddingTop: 2 }}>
        <Stamp gate={stampGate}>{stampText}</Stamp>
      </div>
      <div>
        <div className="va-row-flex" style={{ gap: 8, alignItems: "baseline", flexWrap: "wrap" }}>
          <span style={{ fontFamily: "var(--font-heading)", fontSize: 16 }}>{check.label}</span>
          <Info term={plain.term} />
          <Term term={p === "p1" ? "cosine" : p === "p2" ? "equivalence" : p === "p3" ? "rubric-stability" : "sigma-flesch"} className="va-muted-115">
            {check.metricLabel}
          </Term>
        </div>
        <div className="va-muted-125" style={{ marginTop: 3, lineHeight: 1.5 }}>{plain.meaning}</div>
        {gate !== "pass" && check.note && (
          <div style={{ marginTop: 4, fontSize: 12.5, lineHeight: 1.5, color: gate === "fail" ? RED : undefined }} className={gate === "fail" ? undefined : "text-muted"}>
            {check.note}
          </div>
        )}
      </div>
    </div>
  );
}

export default function Report() {
  const navigate = useNavigate();
  const ws = useWorkspace();
  const run = activeRun(ws);
  usePageTitle(run ? `Check the versions — ${run.blueprintName}` : null);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [showEvidence, setShowEvidence] = useState(false);
  const [openWhy, setOpenWhy] = useState<string | null>(null);
  const policyAllows = currentThresholds(ws).allowOverThresholdRelease !== false;

  const lines = useMemo(() => (run ? buildLines(run) : []), [run]);

  const intro = (
    <StepIntro
      step={4}
      title="Check the versions"
      what="Before anyone sees a version, VARIA checks four things: the versions look different, they measure the same skill, one rubric still fits, and they are equally hard to read."
      doThis="Read the verdict. If something failed, the report names the versions and offers a fix."
      next="Release the versions to your students."
      learn={["four-checks", "release", "over-threshold"]}
    />
  );

  if (!run) {
    return (
      <div className="va-page">
        {intro}
        <EmptyState
          heading="Nothing to check yet"
          text="Make the versions first. Then this page tells you, in plain words, whether they are fair enough to release."
          actionLabel="Go to Make the versions"
          onAction={() => navigate("/generate")}
        />
      </div>
    );
  }

  const inFlight = IN_FLIGHT.has(run.status);
  if (inFlight && !run.report) {
    return (
      <div className="va-page" style={{ maxWidth: 640 }}>
        {intro}
        <ProgressBlock progress={run.progress} usage={run.usage} startedAt={run.startedAt} onCancel={ws.cancelRun} onResume={() => void ws.resumeRun(run.id)} error={run.error ?? null} title={`Making ${run.n} versions of ${run.blueprintName}`} />
      </div>
    );
  }
  if (!run.report) {
    const c = runCompletion(run);
    return (
      <div className="va-page">
        {intro}
        <EmptyState
          heading={run.status === "failed" ? "Making the versions failed" : c.resumable ? "Making the versions stopped part-way" : "No result yet"}
          text={
            c.resumable
              ? `${c.generated} of ${run.n} versions were made and kept. ${run.progress.message}${run.error ? ` · ${run.error}` : ""}`
              : run.error ?? "This run finished without a result. Make the versions again."
          }
          actionLabel={c.resumable ? `Continue: ${run.n - c.generated} to go` : "Back to Make the versions"}
          onAction={() => (c.resumable ? void ws.resumeRun(run.id).catch(() => {}) : navigate("/generate"))}
        />
      </div>
    );
  }

  const report = run.report;
  const failing = ORDER.filter((p) => report.checks[p].gate === "fail");
  const fails = failing.length;
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

  // ---- The verdict, in one plain sentence -------------------------------------------------
  const failNames = failing.map((p) => PLAIN[p].failLead);
  const failJoined = failNames.length <= 1 ? failNames[0] ?? "" : `${failNames.slice(0, -1).join(", ")} and ${failNames[failNames.length - 1]}`;
  const fixIsJargon = report.checks.p4.gate === "fail" && outliers.length > 0;
  const canFix = outliers.length > 0;

  let verdict: JSX.Element;
  if (inFlight) {
    verdict = <ProgressBlock progress={run.progress} usage={run.usage} startedAt={run.startedAt} onCancel={ws.cancelRun} error={run.error ?? null} title={`Fixing ${numberWord(outliers.length)} versions`} />;
  } else if (released) {
    verdict = (
      <Verdict
        tone="pass"
        stamp="Released"
        headline={`Released on ${fmtDate(run.release!.releasedAt)}`}
        body={
          run.release!.overThreshold
            ? `These ${scorable} versions were released over a threshold with this reason on the record: “${run.release!.reason ?? ""}”.`
            : `These ${scorable} versions passed all four checks and are with your students. Nothing here needs your attention.`
        }
        action={{ label: "Go to release and roster", onClick: () => navigate("/roster") }}
        secondary={outliers.length > 0 ? { label: busy ? "Fixing…" : `Fix the ${numberWord(outliers.length)} named versions`, onClick: () => void regenerate(), disabled: busy } : undefined}
      />
    );
  } else if (report.releasable) {
    verdict = (
      <Verdict
        tone="pass"
        stamp="Ready"
        headline="Ready to release"
        body={`All ${scorable} versions measure the same skill, are equally hard to read, and are different enough that students cannot usefully share answers.`}
        action={{ label: `Release ${scorable} versions`, onClick: releaseClean }}
        secondary={outliers.length > 0 ? { label: busy ? "Fixing…" : `Fix ${numberWord(outliers.length)} first`, onClick: () => void regenerate(), disabled: busy } : undefined}
      />
    );
  } else {
    const firstFail = failing[0];
    const note = firstFail ? report.checks[firstFail].note : null;
    verdict = (
      <Verdict
        tone="fail"
        stamp="Not ready"
        headline={`Not ready yet: ${failJoined || "one check needs attention"}`}
        body={
          <>
            {note ? `${note} ` : ""}
            {canFix ? "You can fix the named versions, or release anyway with a reason that goes on the record." : "You can make the versions again with more variation, or release anyway with a reason that goes on the record."}
            {!policyAllows ? " Your institution's policy does not allow releasing over a threshold, so the checks have to clear first." : ""}
          </>
        }
        action={
          canFix
            ? { label: busy ? "Fixing…" : fixIsJargon ? "Fix the named versions" : "Fix the named versions", onClick: () => void regenerate(), disabled: busy }
            : { label: "Make the versions again", onClick: () => navigate("/generate") }
        }
        secondary={policyAllows ? { label: "Release anyway", onClick: () => setDialogOpen(true), disabled: busy } : undefined}
      />
    );
  }

  return (
    <div className="va-page">
      {intro}

      {verdict}

      {!inFlight && !released && !report.releasable && fixIsJargon && (
        <div className="va-muted-125" style={{ marginTop: -8 }}>
          Or{" "}
          <button type="button" className="btn btn-ghost" style={{ padding: "0 4px" }} onClick={() => void loosenJargon()} disabled={busy}>
            keep the wording simpler and fix the named versions
          </button>
          <span className="text-muted"> (stops varying the professional vocabulary between students)</span>
        </div>
      )}
      {run.status === "partial" && !inFlight && (
        <div style={{ fontSize: 12.5, color: RED }}>
          {run.n - runCompletion(run).generated} of {run.n} versions are missing and left out of the checks.
          {runCompletion(run).resumable ? (
            <button type="button" className="btn btn-secondary" style={{ marginLeft: 10 }} onClick={() => void ws.resumeRun(run.id).catch(() => {})}>
              Make the missing ones
            </button>
          ) : null}
        </div>
      )}
      {error && <div style={{ color: RED, fontSize: 13 }} role="alert">{error}</div>}

      <Blueprint style={{ padding: "20px 22px" }}>
        <div className="va-row-flex" style={{ gap: 10, alignItems: "baseline", marginBottom: 4 }}>
          <h6 style={{ margin: 0 }}>The four checks</h6>
          <Info term="four-checks" />
          <span className="va-muted-12">
            {fails === 0 ? "All four passed." : `${numberWord(fails)} of four need${fails === 1 ? "s" : ""} attention.`} Release needs each one on its own; the overall score below is for comparing runs.
          </span>
        </div>
        <div>
          {ORDER.map((p) => (
            <CheckRow key={p} check={report.checks[p]} p={p} />
          ))}
        </div>
        <div className="va-muted-12" style={{ marginTop: 12, lineHeight: 1.6 }}>
          Overall score {report.joint.toFixed(2)} <Info term="joint-score" />{" "}
          <span>(the paper's composite; for comparing runs, not for approving one. The pilot's frontier models scored {FRONTIER_BAND[0].toFixed(2)}–{FRONTIER_BAND[1].toFixed(2)}, an approximate comparison.)</span>
        </div>
      </Blueprint>

      <Blueprint style={{ padding: "16px 22px" }}>
        <div className="va-row-flex" style={{ gap: 12 }}>
          <h6 style={{ margin: 0 }}>The evidence</h6>
          <span className="va-muted-12">Every version plotted on the four checks, the numbers behind each one, the judge's reasoning, and how this run was made.</span>
          <button type="button" className="btn btn-ghost" style={{ marginLeft: "auto" }} onClick={() => setShowEvidence((v) => !v)}>
            {showEvidence ? "Hide the evidence" : "Show the evidence"}
          </button>
        </div>

        {showEvidence && (
          <div className="va-stack" style={{ gap: 18, marginTop: 14 }}>
            <div className="va-muted-115" style={{ lineHeight: 1.6 }}>
              Made with {STRATEGY_LABELS[run.strategy]} <Info term={run.strategy} /> on {run.generatorModel} <Info term="generator" />, judged by {run.judgeModel} × {run.judgeSamples} <Info term="judge-samples" /> · single trial · no seed
              {report.metricsVersion ? <> · metrics v{report.metricsVersion}</> : null}
              {run.usage ? <> · actual cost ${run.usage.costUsd.toFixed(2)} in {run.usage.calls} call{run.usage.calls === 1 ? "" : "s"} <Info term="actual-cost" /></> : null}
              {report.boilerplateLinesRemoved ? <> · {report.boilerplateLinesRemoved} line{report.boilerplateLinesRemoved === 1 ? "" : "s"} shared by most versions removed before scoring</> : null}
            </div>

            <div>
              <div className="va-row-flex" style={{ gap: 12, marginBottom: 6 }}>
                <span style={{ fontFamily: "var(--font-heading)", fontSize: 15 }}>Every version, on all four checks</span>
                <span className="text-muted" style={{ fontSize: 12 }}>
                  {scorable} versions{outliers.length ? ` · the ${numberWord(outliers.length)} named version${outliers.length === 1 ? " is" : "s are"} drawn solid` : " · none named"}
                </span>
                <div className="va-btn-row" style={{ marginLeft: "auto", gap: 8 }}>
                  <button type="button" className="btn btn-secondary" onClick={exportCsv}>Export CSV</button>
                  <button type="button" className="btn btn-secondary" onClick={() => ws.sendToReviewer(run.id)}>Send to reviewer</button>
                </div>
              </div>
              <svg viewBox="0 0 1060 250" style={{ width: "100%", height: "auto", display: "block" }} role="img" aria-label="Every version plotted on the four checks">
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
              <div className="va-muted-12">Each line is one version. Higher is better on every axis; a line that dips is a version that scored worse on that check.</div>
            </div>

            <div style={{ overflowX: "auto" }}>
              <div className="va-row-flex" style={{ gap: 8, marginBottom: 6 }}>
                <span style={{ fontFamily: "var(--font-heading)", fontSize: 15 }}>Each version's numbers</span>
                <span className="va-muted-12">Reading ease <Info term="flesch" />, vocabulary variety, solution steps, same-skill score <Info term="equivalence" />, and why the judge scored it that way.</span>
              </div>
              <table className="table">
                <thead>
                  <tr><th>Version</th><th>Student</th><th>Setting</th><th>Reading ease</th><th>Vocabulary</th><th>Steps</th><th>Same skill</th><th>Why</th></tr>
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
                                <span className="va-kicker">Judge sample {i + 1}</span> {Object.entries(s.dimensionScores).map(([d, n]) => `${d}: ${n}`).join(" · ")}
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

            {fails === 0 ? null : (
              <div className="va-muted-12">
                <Pill gate="watch">{fails} of 4</Pill> Release is gated on each check separately, never on the overall score.
              </div>
            )}
          </div>
        )}
      </Blueprint>

      <Dialog
        open={dialogOpen}
        title={`Release all ${scorable} anyway`}
        onClose={() => setDialogOpen(false)}
        actions={
          <>
            <button type="button" className="btn btn-ghost" onClick={() => setDialogOpen(false)}>Cancel</button>
            <BlueprintButton onClick={releaseWithReason} disabled={!reason.trim()}>Release with this reason</BlueprintButton>
          </>
        }
      >
        <p className="card-body" style={{ margin: "0 0 10px" }}>
          Your reason is recorded next to the check{fails === 1 ? "" : "s"} that did not pass, and shown to anyone reviewing this release. <Info term="over-threshold" />
        </p>
        <textarea
          className="input va-textarea"
          style={{ width: "100%", minHeight: 80 }}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder='e.g. "Low-stakes practice; I care more about copy-resistance than identical difficulty"'
          autoFocus
        />
      </Dialog>
    </div>
  );
}
