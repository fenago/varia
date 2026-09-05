import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Blueprint, BlueprintButton, EmptyState, Field, Info, ProgressBlock, SegChoice, StepIntro } from "@ui/components";
import { useWorkspace } from "@lib/store/workspace";
import { useSettings } from "@lib/store/settings";
import { activeBlueprint, activeRun } from "@lib/store/selectors";
import { runCompletion } from "@lib/store/orchestrator";
import { fixtureForBlueprint } from "@lib/store/fixtures";
import { estimateRunCost } from "@lib/llm";
import { PILOT_DP_FLESCH_SIGMA, STRATEGY_LABELS, THREAT_TO_STRATEGY } from "@shared/thresholds";
import { currentThresholds } from "@lib/store/selectors";
import { GENERATOR_MODELS, JUDGE_MODELS, type AdvancedRunOptions, type Strategy, type ThreatProfile } from "@shared/types";
import { RUN_PRESETS, modelCaveat, modelOptionText, modelsByFamily, type ModelRole, type RunPreset } from "@shared/models";

const RED = "#8d4a3c";
const AMBER = "#8a6d2f";
const IN_FLIGHT = new Set(["queued", "generating", "judging", "scoring"]);

function modelLabel(id: string): string {
  return GENERATOR_MODELS.find((m) => m.id === id)?.label ?? JUDGE_MODELS.find((m) => m.id === id)?.label ?? id;
}

/** Whole catalog grouped by family; label, note and price per million in the option text. */
function ModelOptions({ role }: { role: ModelRole }) {
  return (
    <>
      {modelsByFamily(role).map((g) => (
        <optgroup key={g.family} label={g.label}>
          {g.models.map((m) => (
            <option key={m.id} value={m.id}>
              {modelOptionText(m)}
            </option>
          ))}
        </optgroup>
      ))}
    </>
  );
}

function ModelCaveat({ id }: { id: string }) {
  const text = modelCaveat(id);
  if (!text) return null;
  return (
    <div className="va-muted-12" style={{ marginTop: 6, lineHeight: 1.5 }}>
      {text}
    </div>
  );
}

function actualSoFar(run: { usage?: { costUsd: number; calls: number } } | null | undefined): string | null {
  if (!run?.usage) return null;
  return `Spent so far: $${run.usage.costUsd.toFixed(2)} · ${run.usage.calls} call${run.usage.calls === 1 ? "" : "s"}`;
}

/** The one question, in the instructor's words. */
type Worry = "copying" | "fairness" | "manual";
const WORRIES: { id: Worry; title: string; body: string; term: string }[] = [
  { id: "copying", title: "Students copying from each other", body: "Big class, formative work. Versions differ as much as possible on the surface so shared answers do not fit.", term: "formative" },
  { id: "fairness", title: "Getting a fair, defensible grade", body: "High stakes. Versions measure the skill as faithfully as possible and are as equal in difficulty as possible.", term: "high-stakes" },
  { id: "manual", title: "I know which strategy I want", body: "Pick one of the paper's four prompting strategies yourself.", term: "strategy" },
];

export default function Generate() {
  const navigate = useNavigate();
  const ws = useWorkspace();
  const settings = useSettings();
  const bp = activeBlueprint(ws);
  const run = activeRun(ws);

  const rosterSize = ws.roster.students.length;
  // Without a key, this replays the recorded run for the blueprint, so N defaults to (and is
  // capped at) the number of recorded versions; cycling them would only manufacture duplicates.
  const recorded = settings.mode === "demo" && bp ? fixtureForBlueprint(bp.id, bp.name) : null;
  const recordedCount = recorded ? recorded.run.variants.filter((v) => v.text && !v.error).length : 0;
  const nMax = recordedCount > 0 ? recordedCount : 200;

  const [worry, setWorry] = useState<Worry>(settings.preset === "formative" ? "copying" : "fairness");
  const [manual, setManual] = useState<Strategy>("zero-shot");
  // Start small: a first run of 5 shows what you get for a few dollars. "All my students" is one click.
  const [n, setNState] = useState<number>(Math.max(2, Math.min(nMax, ws.versionCount ?? 3)));
  const setN = (v: number) => { setNState(v); ws.setVersionCount(v); };
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [judgeSamples, setJudgeSamplesLocal] = useState<number>(Math.max(3, Math.min(9, settings.judgeSamples)));
  const adv: AdvancedRunOptions = settings.advancedDefaults;
  const thresholds = currentThresholds(ws);

  const threat: ThreatProfile = worry === "manual" ? "manual" : worry === "copying" ? "copy-at-scale" : "high-stakes";
  const strategy: Strategy = worry === "manual" ? manual : THREAT_TO_STRATEGY[threat as Exclude<ThreatProfile, "manual">];
  const est = useMemo(
    () => estimateRunCost(n, judgeSamples, settings.generatorModel, settings.judgeModel, strategy),
    [n, judgeSamples, settings.generatorModel, settings.judgeModel, strategy],
  );
  const sameModel = settings.generatorModel === settings.judgeModel;
  const inFlight = !!run && IN_FLIGHT.has(run.status) && (starting || run.blueprintId === bp?.id);

  if (!bp) {
    return (
      <div className="va-stack" style={{ gap: 22, maxWidth: 980 }}>
        <StepIntro
          step={3}
          title="Make the versions"
          what="Every student gets a different version of the same task. The versions are checked before anyone sees them."
          doThis="There is nothing to make from yet. Load an assignment first."
          next="You get a report saying whether the versions are fair enough to release."
          learn={["version"]}
        />
        <EmptyState heading="Nothing to make versions from" text="Load an assignment and check what we found first. Making versions needs the skill, the rubric and a model answer." actionLabel="Load your assignment" onAction={() => navigate("/import")} />
      </div>
    );
  }

  const enabledDims = bp.surfaceDimensions.filter((d) => !d.locked && d.enabled).map((d) => d.key);

  /** Choosing a worry picks the preset (models, judge samples) and the strategy. */
  function chooseWorry(w: Worry) {
    setWorry(w);
    if (w === "copying") {
      settings.setPreset("formative");
      setJudgeSamplesLocal(RUN_PRESETS.formative.judgeSamples);
    } else if (w === "fairness") {
      settings.setPreset("high-stakes");
      setJudgeSamplesLocal(RUN_PRESETS["high-stakes"].judgeSamples);
    }
  }

  function changeJudgeSamples(raw: number) {
    const v = Math.max(3, Math.min(9, Math.round(raw || 5)));
    setJudgeSamplesLocal(v);
    settings.setJudgeSamples(v);
  }

  function toggleDim(key: string) {
    if (!bp) return;
    ws.updateBlueprint(bp.id, {
      surfaceDimensions: bp.surfaceDimensions.map((d) => (d.key === key && !d.locked ? { ...d, enabled: !d.enabled } : d)),
    });
  }

  async function generate() {
    setError(null);
    setStarting(true);
    try {
      const runId = await ws.startRun({
        threatProfile: threat,
        strategy,
        n,
        enabledDimensions: enabledDims,
        generatorModel: settings.generatorModel,
        judgeModel: settings.judgeModel,
        judgeSamples,
        advanced: adv,
      });
      const finished = useWorkspace.getState().runs.find((r) => r.id === runId);
      if (!finished) throw new Error("The run disappeared.");
      if (finished.status === "failed") throw new Error(finished.error ?? "Making the versions failed.");
      if (finished.status === "cancelled") {
        setError("Stopped. What was already made is kept; you can resume.");
        return;
      }
      navigate("/report");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setStarting(false);
    }
  }

  const consequence =
    worry === "copying"
      ? `Versions will differ more on the surface. About $${est.perStudentUsd.toFixed(2)} per student.`
      : worry === "fairness"
        ? `Versions measure the skill most faithfully and stay closest in difficulty. About $${est.perStudentUsd.toFixed(2)} per student.`
        : `${STRATEGY_LABELS[strategy]}. About $${est.perStudentUsd.toFixed(2)} per student.`;

  const facts =
    settings.mode === "demo"
      ? `Replaying the recorded run: ${n} versions, made with ${modelLabel(recorded?.models.generator ?? settings.generatorModel)} · no cost · under a minute`
      : `Making ${n} version${n === 1 ? "" : "s"}${rosterSize > 0 && n < rosterSize ? ` (the first ${n} of your ${rosterSize} students)` : rosterSize > 0 ? ` (one for each of your ${rosterSize} students)` : ""} with ${modelLabel(settings.generatorModel)} · about $${est.usd.toFixed(2)} · about ${est.minutes} minute${est.minutes === 1 ? "" : "s"}`;

  return (
    <div className="va-stack" style={{ gap: 22, maxWidth: 980 }}>
      <StepIntro
        step={3}
        title="Make the versions"
        what="Every student gets a different version of the same task. The versions are checked before anyone sees them."
        doThis="Answer one question and press the button."
        next="You get a report saying whether the versions are fair enough to release."
        learn={["version", "strategy", "four-checks"]}
      />

      {run && !inFlight && run.blueprintId === bp.id && runCompletion(run).resumable && (
        <Blueprint style={{ padding: "16px 18px", background: "var(--color-surface)" }}>
          <div className="va-heading-16" style={{ marginBottom: 4 }}>A previous attempt stopped part-way</div>
          <div className="va-muted-12" style={{ lineHeight: 1.5, marginBottom: 10 }}>
            {runCompletion(run).generated} of {run.n} versions were made · {run.progress.message}
            {run.error ? ` · ${run.error}` : ""}
          </div>
          <BlueprintButton
            onClick={() => {
              setError(null);
              void ws
                .resumeRun(run.id)
                .then(() => {
                  const r = useWorkspace.getState().runs.find((x) => x.id === run.id);
                  if (r?.report) navigate("/report");
                })
                .catch((e) => setError((e as Error).message));
            }}
          >
            Finish the remaining {run.n - runCompletion(run).generated}
          </BlueprintButton>
        </Blueprint>
      )}

      {inFlight && run ? (
        <ProgressBlock progress={run.progress} usage={run.usage} startedAt={run.startedAt} onCancel={ws.cancelRun} onResume={() => void ws.resumeRun(run.id)} error={run.error ?? null} title={`Making ${run.n} versions`} />
      ) : (
        <Blueprint style={{ padding: "22px 24px" }}>
          <div className="va-kicker" style={{ marginBottom: 4 }}>For: {bp.name}</div>
          <h6 style={{ margin: "0 0 6px" }}>
            What are you most worried about? <Info term="threat-profile" />
          </h6>
          <p className="va-muted-125" style={{ margin: "0 0 14px", maxWidth: "64ch" }}>
            Your answer chooses how the versions are made. The research found no single best way: each choice trades one thing for another.
          </p>
          <div className="va-stack" style={{ gap: 10 }}>
            {WORRIES.map((w) => {
              const selected = worry === w.id;
              return (
                <Blueprint key={w.id} as="label" style={{ display: "flex", gap: 14, padding: "14px 16px", cursor: "pointer", background: selected ? "var(--color-accent-100)" : undefined }}>
                  <span className="radio" style={{ pointerEvents: "none" }}>
                    <input type="radio" name="worry" checked={selected} onChange={() => chooseWorry(w.id)} disabled={inFlight} />
                    <span className="dot" />
                  </span>
                  <span>
                    <span className="va-heading-16" style={{ display: "block" }}>
                      {w.title} <Info term={w.term} />
                    </span>
                    <span className="text-muted" style={{ fontSize: 13 }}>{w.body}</span>
                  </span>
                </Blueprint>
              );
            })}
          </div>
          {worry === "manual" && (
            <div style={{ marginTop: 12 }}>
              <SegChoice<Strategy> name="strategy" value={manual} onChange={setManual} options={(Object.keys(STRATEGY_LABELS) as Strategy[]).map((s) => ({ value: s, label: STRATEGY_LABELS[s] }))} />
            </div>
          )}
          <p style={{ margin: "14px 0 0", fontSize: 14, lineHeight: 1.5, color: "var(--color-accent-700)", fontFamily: "var(--font-heading)" }}>{consequence}</p>

          <div style={{ marginTop: 18, borderTop: "1px solid var(--color-divider)", paddingTop: 16 }}>
            <div className="va-row-flex" style={{ alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 12 }}>
              <label htmlFor="versionCount" className="va-heading-16" style={{ margin: 0 }}>How many versions?</label>
              <input
                id="versionCount"
                className="input"
                type="number"
                min={2}
                max={nMax}
                value={n}
                onChange={(e) => setN(Math.max(2, Math.min(nMax, Number(e.target.value) || 2)))}
                style={{ width: 88 }}
                aria-describedby="versionCountHint"
              />
              <div className="va-btn-row" style={{ gap: 6 }}>
                {[3, 5, 10].filter((k) => k <= nMax).map((k) => (
                  <button key={k} type="button" className={`btn ${n === k ? "btn-secondary" : "btn-ghost"}`} onClick={() => setN(k)}>{k}</button>
                ))}
                {rosterSize > 0 && rosterSize <= nMax && (
                  <button type="button" className={`btn ${n === rosterSize ? "btn-secondary" : "btn-ghost"}`} onClick={() => setN(rosterSize)}>
                    All {rosterSize} students
                  </button>
                )}
              </div>
              <span id="versionCountHint" className="text-muted" style={{ fontSize: 12.5 }}>
                {recordedCount > 0 ? `Replaying a recorded run: up to ${recordedCount} versions.` : "Start with a few to see what you get; you can make more later. Cost grows with the count."}
              </span>
            </div>
            <p style={{ margin: "0 0 12px", fontSize: 14.5 }}>
              {facts} <Info term="generator" />
            </p>
            <div className="va-btn-row" style={{ alignItems: "center" }}>
              <BlueprintButton onClick={generate} disabled={starting || enabledDims.length === 0}>
                {starting ? "Starting…" : "Make the versions"}
              </BlueprintButton>
              <button type="button" className="btn btn-ghost" onClick={() => setOptionsOpen((o) => !o)}>
                {optionsOpen ? "Hide options" : "Show options"}
              </button>
              {actualSoFar(run) && <span className="va-muted-12">{actualSoFar(run)}</span>}
            </div>
            {enabledDims.length === 0 && (
              <div style={{ color: RED, fontSize: 12.5, marginTop: 8 }}>Nothing is set to vary, so every version would read the same. Turn something on under options.</div>
            )}
            {settings.mode === "demo" && (
              <div className="va-muted-12" style={{ marginTop: 10, lineHeight: 1.5 }}>
                No key is set, so this replays a recorded run of {recordedCount || "the"} versions <Info term="recorded-run" />. Add your key in <Link to="/settings">Settings</Link> to make versions for your {rosterSize} students.
              </div>
            )}
            {settings.mode === "live" && (
              <div className="va-muted-12" style={{ marginTop: 10, lineHeight: 1.5 }}>
                {modelLabel(settings.generatorModel)} writes the versions and {modelLabel(settings.judgeModel)} checks them. Calls go straight from this browser to Anthropic.
              </div>
            )}
            {error && (
              <div style={{ color: RED, fontSize: 13, marginTop: 10 }} role="alert">
                {error}
              </div>
            )}
          </div>

          {optionsOpen && (
            <div style={{ marginTop: 18, borderTop: "1px solid var(--color-divider)", paddingTop: 16 }} className="va-stack">
              <div className="va-two" style={{ gap: 16 }}>

                <Field label="Preset">
                  <SegChoice<RunPreset> name="preset" value={settings.preset} onChange={(id) => { settings.setPreset(id); if (id !== "custom") setJudgeSamplesLocal(RUN_PRESETS[id].judgeSamples); }} options={[{ value: "high-stakes", label: "High-stakes" }, { value: "formative", label: "Formative" }, { value: "custom", label: "Custom" }]} />
                </Field>
              </div>
              <div className="va-two" style={{ gap: 16 }}>
                <Field label="Model that writes the versions" hint="the generator">
                  <select className="input" value={settings.generatorModel} onChange={(e) => settings.setModels({ generatorModel: e.target.value })}>
                    <ModelOptions role="generator" />
                  </select>
                  <ModelCaveat id={settings.generatorModel} />
                </Field>
                <Field label="Model that checks them" hint="the judge, held fixed for the whole run">
                  <select className="input" value={settings.judgeModel} onChange={(e) => settings.setModels({ judgeModel: e.target.value })}>
                    <ModelOptions role="judge" />
                  </select>
                  <ModelCaveat id={settings.judgeModel} />
                  {sameModel ? (
                    <div style={{ color: AMBER, fontSize: 12.5, marginTop: 6, lineHeight: 1.5 }} role="alert">
                      The checker is the same model as the writer. The research flags that as a risk; pick a different one if you can.
                    </div>
                  ) : (
                    <div className="va-muted-12" style={{ marginTop: 6, lineHeight: 1.5 }}>Every model here is from one vendor; the paper's follow-up uses a cross-family panel.</div>
                  )}
                </Field>
              </div>
              <Field label="How many times each version is checked" hint="the paper used 5; fewer is cheaper">
                <input className="input" type="number" min={3} max={9} value={judgeSamples} onChange={(e) => changeJudgeSamples(Number(e.target.value))} style={{ maxWidth: 120 }} />
                <span className="va-muted-12" style={{ marginLeft: 8 }}>
                  <Info term="judge-samples" />
                </span>
              </Field>

              <div>
                <div className="va-heading-15" style={{ marginBottom: 6 }}>
                  What varies between students <Info term="surface-dimension" />
                </div>
                <p className="va-muted-125" style={{ margin: "0 0 8px" }}>Reading level and the number of steps always stay the same, so every version is equally hard.</p>
                <div className="va-tags">
                  {bp.surfaceDimensions.map((d) =>
                    d.locked ? (
                      <span key={d.key} className="tag tag-outline">{d.label} · stays the same</span>
                    ) : (
                      <span
                        key={d.key}
                        className="tag tag-accent is-toggle"
                        role="checkbox"
                        aria-checked={d.enabled}
                        tabIndex={0}
                        style={d.enabled ? undefined : { opacity: 0.45 }}
                        title={d.enabled ? "Click to keep this the same for everyone" : "Click to vary this"}
                        onClick={() => !inFlight && toggleDim(d.key)}
                        onKeyDown={(e) => {
                          if ((e.key === "Enter" || e.key === " ") && !inFlight) {
                            e.preventDefault();
                            toggleDim(d.key);
                          }
                        }}
                      >
                        {d.label} · {d.values.length ? (d.values.length <= 4 ? d.values.join(", ") : `${d.values.length} options`) : d.note ?? "—"}
                      </span>
                    ),
                  )}
                </div>
              </div>

              <details className="blueprint" style={{ padding: "12px 16px" }}>
                <summary className="va-kicker" style={{ cursor: "pointer" }}>Advanced: the paper's ablations and the app's policies</summary>
                <p className="card-body" style={{ margin: "10px 0 14px", maxWidth: "66ch" }}>Defaults reproduce the pilot. Change these to reproduce an ablation or to tune the outlier rule. They are saved for this browser and recorded on every run.</p>
                <div className="va-two" style={{ gap: 14 }}>
                  <label style={{ display: "flex", gap: 8, alignItems: "flex-start", fontSize: 13.5 }}>
                    <input type="checkbox" checked={adv.negativeAnchors} disabled={inFlight} onChange={(e) => settings.setAdvanced({ negativeAnchors: e.target.checked })} />
                    <span>
                      Negative examples in few-shot
                      <span className="va-muted-115" style={{ display: "block" }}>Off reproduces the θ−FS ablation (equivalence −0.02 in the pilot, J unchanged).</span>
                    </span>
                  </label>
                  <label style={{ display: "flex", gap: 8, alignItems: "flex-start", fontSize: 13.5 }}>
                    <input type="checkbox" checked={adv.constructMap} disabled={inFlight} onChange={(e) => settings.setAdvanced({ constructMap: e.target.checked })} />
                    <span>
                      Construct-map step in structured chain-of-thought
                      <span className="va-muted-115" style={{ display: "block" }}>Off reproduces the θ−SC ablation (equivalence −0.01, J unchanged).</span>
                    </span>
                  </label>
                  <Field label="Reading-difficulty band (dimension-preserving)" hint={`±${adv.readabilityBand} Flesch points around the original`}>
                    <input className="input" type="number" min={3} max={15} step={1} value={adv.readabilityBand} disabled={inFlight} onChange={(e) => settings.setAdvanced({ readabilityBand: Number(e.target.value) })} />
                  </Field>
                  <Field label="Outlier rule: σ multiplier" hint="versions more than k·σ harder than the mean are named">
                    <input className="input" type="number" min={0.5} max={2} step={0.1} value={adv.outlierSigma} disabled={inFlight} onChange={(e) => settings.setAdvanced({ outlierSigma: Number(e.target.value) })} />
                  </Field>
                  <Field label="Outlier rule: minimum named" hint="always name at least this many hardest when the difficulty check fails">
                    <input className="input" type="number" min={1} max={5} step={1} value={adv.outlierMinNamed} disabled={inFlight} onChange={(e) => settings.setAdvanced({ outlierMinNamed: Number(e.target.value) })} />
                  </Field>
                  <Field label="Concurrency" hint="writing / checking requests in flight">
                    <div style={{ display: "flex", gap: 8 }}>
                      <input className="input" type="number" min={1} max={8} value={adv.concurrencyGenerate} disabled={inFlight} onChange={(e) => settings.setAdvanced({ concurrencyGenerate: Number(e.target.value) })} aria-label="Generation concurrency" />
                      <input className="input" type="number" min={1} max={8} value={adv.concurrencyJudge} disabled={inFlight} onChange={(e) => settings.setAdvanced({ concurrencyJudge: Number(e.target.value) })} aria-label="Judge concurrency" />
                    </div>
                  </Field>
                </div>
              </details>

              <div className="va-muted-12" style={{ lineHeight: 1.5 }}>
                <strong>Institution policy.</strong> Only research-cleared frontier models are offered. Small open models scored 30–38 points lower in the benchmark and cannot be used for graded work. Validate your specific model and strategy pair: in the pilot the same strategy ranged from J 0.70 to 0.90 across models. With copy-resistance chosen, at the current difficulty limit ({thresholds.p4FleschSigma.toFixed(1)} σ Flesch) sets sometimes need a regeneration; the pilot measured σ {PILOT_DP_FLESCH_SIGMA[0]}–{PILOT_DP_FLESCH_SIGMA[1]} for that strategy.
              </div>
            </div>
          )}
        </Blueprint>
      )}
    </div>
  );
}
