import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Blueprint, BlueprintButton, EmptyState, Field, ProgressBlock, SegChoice } from "@ui/components";
import { useWorkspace } from "@lib/store/workspace";
import { useSettings } from "@lib/store/settings";
import { activeBlueprint, activeRun } from "@lib/store/selectors";
import { runCompletion } from "@lib/store/orchestrator";
import { estimateRunCost } from "@lib/llm";
import { PILOT_DP_FLESCH_SIGMA, STRATEGY_LABELS, THREAT_OPTIONS, THREAT_TO_STRATEGY } from "@shared/thresholds";
import { currentThresholds } from "@lib/store/selectors";
import { GENERATOR_MODELS, JUDGE_MODELS, type AdvancedRunOptions, type Strategy, type ThreatProfile } from "@shared/types";
import { modelCaveat, modelOptionText, modelsByFamily, type ModelRole } from "@shared/models";

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
  return `Actual so far: $${run.usage.costUsd.toFixed(2)} · ${run.usage.calls} call${run.usage.calls === 1 ? "" : "s"}`;
}

export default function Generate() {
  const navigate = useNavigate();
  const ws = useWorkspace();
  const settings = useSettings();
  const bp = activeBlueprint(ws);
  const run = activeRun(ws);

  const rosterSize = ws.roster.students.length;
  const [threat, setThreat] = useState<ThreatProfile>("high-stakes");
  const [manual, setManual] = useState<Strategy>("zero-shot");
  const [n, setN] = useState<number>(Math.max(2, Math.min(200, rosterSize || 10)));
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [judgeSamples, setJudgeSamplesLocal] = useState<number>(Math.max(3, Math.min(9, settings.judgeSamples)));
  const adv: AdvancedRunOptions = settings.advancedDefaults;
  const thresholds = currentThresholds(ws);

  const strategy: Strategy = threat === "manual" ? manual : THREAT_TO_STRATEGY[threat];
  const est = useMemo(
    () => estimateRunCost(n, judgeSamples, settings.generatorModel, settings.judgeModel),
    [n, judgeSamples, settings.generatorModel, settings.judgeModel],
  );
  const sameModel = settings.generatorModel === settings.judgeModel;
  const inFlight = !!run && IN_FLIGHT.has(run.status) && (starting || run.blueprintId === bp?.id);

  if (!bp) {
    return (
      <EmptyState
        heading="No blueprint to generate from"
        text="Load an assessment and confirm its blueprint first. Generation needs the construct, the rubric and a model answer."
        actionLabel="Load your assessment"
        onAction={() => navigate("/import")}
      />
    );
  }

  const enabledDims = bp.surfaceDimensions.filter((d) => !d.locked && d.enabled).map((d) => d.key);

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
      if (finished.status === "failed") throw new Error(finished.error ?? "Generation failed.");
      if (finished.status === "cancelled") {
        setError("Run cancelled.");
        return;
      }
      navigate("/report");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setStarting(false);
    }
  }

  return (
    <div className="va-split" style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) 340px", gap: 28, alignItems: "start", maxWidth: 1180 }}>
      <div className="va-stack" style={{ gap: 22 }}>
        <Blueprint style={{ padding: "20px 22px" }}>
          <h6 style={{ margin: "0 0 6px" }}>What is this assessment protecting against?</h6>
          <p className="card-body" style={{ margin: "0 0 16px", maxWidth: "62ch" }}>
            Your answer picks the generation strategy. The benchmark found no single best one — each buys a different property at the other's expense.
          </p>
          <div className="va-stack" style={{ gap: 12 }}>
            {THREAT_OPTIONS.map((opt) => {
              const selected = threat === opt.id;
              return (
                <Blueprint
                  key={opt.id}
                  as="label"
                  style={{ display: "flex", gap: 14, padding: "14px 16px", cursor: "pointer", background: selected ? "var(--color-accent-100)" : undefined }}
                >
                  <span className="radio" style={{ pointerEvents: "none" }}>
                    <input type="radio" name="threat" checked={selected} onChange={() => setThreat(opt.id)} disabled={inFlight} />
                    <span className="dot" />
                  </span>
                  <span>
                    <span className="va-heading-16" style={{ display: "block" }}>{opt.title}</span>
                    <span className="text-muted" style={{ fontSize: 13 }}>
                      {opt.description}
                      {opt.id === "copy-at-scale"
                        ? ` Note: at the institution's current difficulty limit (${thresholds.p4FleschSigma.toFixed(1)} σ Flesch) dimension-preserving sets usually need regeneration or a reasoned release; the pilot measured σ ${PILOT_DP_FLESCH_SIGMA[0]}–${PILOT_DP_FLESCH_SIGMA[1]} for this strategy.`
                        : ""}
                    </span>
                  </span>
                </Blueprint>
              );
            })}
          </div>
          {threat === "manual" && (
            <div style={{ marginTop: 14 }}>
              <div className="va-muted-12" style={{ marginBottom: 6 }}>Strategy</div>
              <SegChoice<Strategy>
                name="strategy"
                value={manual}
                onChange={setManual}
                options={(Object.keys(STRATEGY_LABELS) as Strategy[]).map((s) => ({ value: s, label: STRATEGY_LABELS[s] }))}
              />
            </div>
          )}
        </Blueprint>

        <Blueprint style={{ padding: "20px 22px" }}>
          <h6 style={{ margin: "0 0 14px" }}>Surface dimensions to vary</h6>
          <p className="card-body" style={{ margin: "0 0 14px", maxWidth: "62ch" }}>
            These are the details that change between students. Reading level stays locked — varying it is what breaks difficulty parity.
          </p>
          <div className="va-tags">
            {bp.surfaceDimensions.map((d) =>
              d.locked ? (
                <span key={d.key} className="tag tag-outline">{d.label} · locked</span>
              ) : (
                <span
                  key={d.key}
                  className="tag tag-accent is-toggle"
                  role="checkbox"
                  aria-checked={d.enabled}
                  tabIndex={0}
                  style={d.enabled ? undefined : { opacity: 0.45 }}
                  title={d.enabled ? "Click to stop varying this" : "Click to vary this"}
                  onClick={() => !inFlight && toggleDim(d.key)}
                  onKeyDown={(e) => {
                    if ((e.key === "Enter" || e.key === " ") && !inFlight) {
                      e.preventDefault();
                      toggleDim(d.key);
                    }
                  }}
                >
                  {d.label} · {d.values.length ? (d.values.length <= 4 ? d.values.join(", ") : `${d.values.length} variants`) : d.note ?? "—"}
                </span>
              ),
            )}
          </div>
          {enabledDims.length === 0 && (
            <div style={{ color: RED, fontSize: 12.5, marginTop: 10 }}>Enable at least one dimension, or every version will read the same.</div>
          )}
        </Blueprint>

        <details className="blueprint" style={{ padding: "16px 22px" }}>
          <summary style={{ cursor: "pointer", fontFamily: "var(--font-heading)", fontSize: 13, letterSpacing: ".12em", textTransform: "uppercase" }}>
            Advanced · the paper's ablations and the app's policies
          </summary>
          <p className="card-body" style={{ margin: "10px 0 14px", maxWidth: "66ch" }}>
            Defaults reproduce the pilot. Change these to reproduce an ablation or to tune the outlier rule. They are saved for this browser and recorded on every run.
          </p>
          <div className="va-two" style={{ gap: 14 }}>
            <label style={{ display: "flex", gap: 8, alignItems: "flex-start", fontSize: 13.5 }}>
              <input type="checkbox" checked={adv.negativeAnchors} disabled={inFlight} onChange={(e) => settings.setAdvanced({ negativeAnchors: e.target.checked })} />
              <span>
                Negative anchors in few-shot
                <span className="va-muted-115" style={{ display: "block" }}>Off reproduces the θ−FS ablation (equivalence −0.02 in the pilot, J unchanged).</span>
              </span>
            </label>
            <label style={{ display: "flex", gap: 8, alignItems: "flex-start", fontSize: 13.5 }}>
              <input type="checkbox" checked={adv.constructMap} disabled={inFlight} onChange={(e) => settings.setAdvanced({ constructMap: e.target.checked })} />
              <span>
                Construct-map step in structured CoT
                <span className="va-muted-115" style={{ display: "block" }}>Off reproduces the θ−SC ablation (equivalence −0.01, J unchanged).</span>
              </span>
            </label>
            <Field label="Readability band (dimension-preserving)" hint={`— ±${adv.readabilityBand} Flesch points around the original`}>
              <input className="input" type="number" min={3} max={15} step={1} value={adv.readabilityBand} disabled={inFlight} onChange={(e) => settings.setAdvanced({ readabilityBand: Number(e.target.value) })} />
            </Field>
            <Field label="Outlier rule: σ multiplier" hint="— versions more than k·σ harder than the mean are named">
              <input className="input" type="number" min={0.5} max={2} step={0.1} value={adv.outlierSigma} disabled={inFlight} onChange={(e) => settings.setAdvanced({ outlierSigma: Number(e.target.value) })} />
            </Field>
            <Field label="Outlier rule: minimum named" hint="— always name at least this many hardest when P4 fails">
              <input className="input" type="number" min={1} max={5} step={1} value={adv.outlierMinNamed} disabled={inFlight} onChange={(e) => settings.setAdvanced({ outlierMinNamed: Number(e.target.value) })} />
            </Field>
            <Field label="Concurrency" hint="— generation / judge requests in flight">
              <div style={{ display: "flex", gap: 8 }}>
                <input className="input" type="number" min={1} max={8} value={adv.concurrencyGenerate} disabled={inFlight} onChange={(e) => settings.setAdvanced({ concurrencyGenerate: Number(e.target.value) })} aria-label="Generation concurrency" />
                <input className="input" type="number" min={1} max={8} value={adv.concurrencyJudge} disabled={inFlight} onChange={(e) => settings.setAdvanced({ concurrencyJudge: Number(e.target.value) })} aria-label="Judge concurrency" />
              </div>
            </Field>
          </div>
        </details>
      </div>

      <div className="va-sticky">
        {run && !inFlight && run.blueprintId === bp?.id && runCompletion(run).resumable ? (
          <Blueprint style={{ padding: "16px 18px", marginBottom: 14 }}>
            <h6 style={{ margin: "0 0 6px" }}>A run stopped part-way</h6>
            <div className="va-muted-12" style={{ lineHeight: 1.5, marginBottom: 10 }}>
              {runCompletion(run).generated} of {run.n} versions done · {run.progress.message}
              {run.error ? ` · ${run.error}` : ""}
            </div>
            <BlueprintButton
              block
              onClick={() => {
                setError(null);
                void ws.resumeRun(run.id).then(() => {
                  const r = useWorkspace.getState().runs.find((x) => x.id === run.id);
                  if (r?.report) navigate("/report");
                }).catch((e) => setError((e as Error).message));
              }}
            >
              Resume: generate the remaining {run.n - runCompletion(run).generated}
            </BlueprintButton>
          </Blueprint>
        ) : null}
        {inFlight && run ? (
          <>
            <ProgressBlock progress={run.progress} usage={run.usage} startedAt={run.startedAt} onCancel={ws.cancelRun} onResume={() => void ws.resumeRun(run.id)} error={run.error ?? null} title={`Generating ${run.n} versions`} />
            {actualSoFar(run) && (
              <div className="va-muted-12" style={{ marginTop: 8, lineHeight: 1.5 }}>
                {actualSoFar(run)}
              </div>
            )}
          </>
        ) : (
          <Blueprint style={{ padding: "18px 20px" }}>
            <h6 style={{ margin: "0 0 14px" }}>Run</h6>
            <Field label="Versions to generate" hint={rosterSize ? `— ${rosterSize} enrolled` : undefined} style={{ marginBottom: 12 }}>
              <input
                className="input"
                type="number"
                min={2}
                max={200}
                value={n}
                onChange={(e) => setN(Math.max(2, Math.min(200, Number(e.target.value) || 2)))}
              />
            </Field>
            <Field label="Generator" style={{ marginBottom: 12 }}>
              <select className="input" value={settings.generatorModel} onChange={(e) => settings.setModels({ generatorModel: e.target.value })}>
                <ModelOptions role="generator" />
              </select>
              <ModelCaveat id={settings.generatorModel} />
            </Field>
            <Field label="Judge (held fixed)" style={{ marginBottom: 10 }}>
              <select className="input" value={settings.judgeModel} onChange={(e) => settings.setModels({ judgeModel: e.target.value })}>
                <ModelOptions role="judge" />
              </select>
              <ModelCaveat id={settings.judgeModel} />
              {sameModel ? (
                <div style={{ color: AMBER, fontSize: 12.5, marginTop: 6, lineHeight: 1.5 }} role="alert">
                  The judge is the same model as the generator. The paper flags intra-family judging as a validity threat; pick a different judge if you can.
                </div>
              ) : (
                <div className="va-muted-12" style={{ marginTop: 6, lineHeight: 1.5 }}>Every model in the catalog is from one vendor; the paper's follow-up uses a cross-family judge panel.</div>
              )}
            </Field>
            <Field label="Judge samples per version" hint="— self-consistency; the pilot used 5" style={{ marginBottom: 14 }}>
              <input
                className="input"
                type="number"
                min={3}
                max={9}
                value={judgeSamples}
                onChange={(e) => setJudgeSamplesLocal(Math.max(3, Math.min(9, Math.round(Number(e.target.value) || 5))))}
              />
            </Field>
            <div className="va-muted-12" style={{ lineHeight: 1.5, marginBottom: 10 }}>
              Validate your specific model and prompt pair. In the pilot, the same strategy ranged from J 0.70 to 0.90 across models.
            </div>
            <div className="text-muted" style={{ fontSize: 12, lineHeight: 1.5, marginBottom: 12 }}>
              Est. {est.minutes} min · ~${est.usd.toFixed(2)} at list prices for {modelLabel(settings.generatorModel)} and {modelLabel(settings.judgeModel)}.
              {actualSoFar(run) && (
                <>
                  <br />
                  {actualSoFar(run)}
                </>
              )}
            </div>
            <BlueprintButton block onClick={generate} disabled={starting || enabledDims.length === 0}>
              {starting ? "Starting…" : `Generate ${n} versions`}
            </BlueprintButton>
            {settings.mode === "demo" && (
              <div className="va-muted-12" style={{ marginTop: 10, lineHeight: 1.5 }}>
                Demo mode: replays a seeded run. Add your key in <Link to="/settings">Settings</Link> to generate for real.
              </div>
            )}
            {settings.mode === "live" && (
              <div className="va-muted-12" style={{ marginTop: 10, lineHeight: 1.5 }}>
                Live mode · {modelLabel(settings.generatorModel)} generates, {modelLabel(settings.judgeModel)} judges. Calls go straight from this browser to Anthropic.
              </div>
            )}
            {error && <div style={{ color: RED, fontSize: 13, marginTop: 10 }} role="alert">{error}</div>}
          </Blueprint>
        )}
        <Blueprint style={{ padding: "18px 20px" }}>
          <h6 style={{ margin: "0 0 10px" }}>Institution policy</h6>
          <p className="card-body" style={{ margin: 0 }}>
            Only benchmark-cleared frontier generators are selectable. Small open models were 30–38 points below the frontier band on the composite score and cannot be used for graded work.
          </p>
        </Blueprint>
      </div>
    </div>
  );
}
