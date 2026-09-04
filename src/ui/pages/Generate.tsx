import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Blueprint, BlueprintButton, EmptyState, Field, ProgressBlock, SegChoice } from "@ui/components";
import { useWorkspace } from "@lib/store/workspace";
import { useSettings } from "@lib/store/settings";
import { activeBlueprint, activeRun } from "@lib/store/selectors";
import { estimateRunCost } from "@lib/llm";
import { STRATEGY_LABELS, THREAT_OPTIONS, THREAT_TO_STRATEGY } from "@shared/thresholds";
import { GENERATOR_MODELS, JUDGE_MODELS, type Strategy, type ThreatProfile } from "@shared/types";

const RED = "#8d4a3c";
const IN_FLIGHT = new Set(["queued", "generating", "judging", "scoring"]);

function modelLabel(id: string): string {
  return GENERATOR_MODELS.find((m) => m.id === id)?.label ?? JUDGE_MODELS.find((m) => m.id === id)?.label ?? id;
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

  const strategy: Strategy = threat === "manual" ? manual : THREAT_TO_STRATEGY[threat];
  const est = useMemo(() => estimateRunCost(n, settings.judgeSamples), [n, settings.judgeSamples]);
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
        judgeSamples: settings.judgeSamples,
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
                    <span className="text-muted" style={{ fontSize: 13 }}>{opt.description}</span>
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
      </div>

      <div className="va-sticky">
        {inFlight && run ? (
          <ProgressBlock progress={run.progress} onCancel={ws.cancelRun} title={`Generating ${run.n} versions`} />
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
                {GENERATOR_MODELS.map((m) => (
                  <option key={m.id} value={m.id}>{m.label} — {m.note}</option>
                ))}
              </select>
            </Field>
            <Field label="Judge (held fixed)" style={{ marginBottom: 14 }}>
              <select className="input" value={settings.judgeModel} onChange={(e) => settings.setModels({ judgeModel: e.target.value })}>
                {JUDGE_MODELS.map((m) => (
                  <option key={m.id} value={m.id}>{m.label} · {settings.judgeSamples} samples</option>
                ))}
              </select>
            </Field>
            <div className="text-muted" style={{ fontSize: 12, lineHeight: 1.5, marginBottom: 12 }}>
              Est. {est.minutes} min · ~${est.usd.toFixed(2)}. Judge calls dominate the cost.
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
