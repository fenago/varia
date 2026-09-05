import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Blueprint as Frame, BlueprintButton, EmptyState, Field, Info, StepIntro } from "@ui/components";
import { useWorkspace } from "@lib/store/workspace";
import { getProvider } from "@lib/store/settings";
import { activeBlueprint, blueprintLibrary, readinessOf } from "@lib/store/selectors";
import { parseFiles } from "@lib/ingest";
import { LlmError } from "@lib/llm";
import type { Criterion } from "@shared/types";

const RED = "#8d4a3c";
const GREEN = "#3d6b4d";
const AMBER = "#8a6d2f";

function anchorsWord(c: Criterion): string {
  if (!c.anchors) return "missing";
  return c.anchorsConfidence === "high" ? "written" : "drafted";
}

function anchorsColor(c: Criterion): string {
  if (!c.anchors) return AMBER;
  return c.anchorsConfidence === "high" ? GREEN : AMBER;
}

/** Plain sentences an instructor can act on, derived from the readiness items. */
function readinessSentences(bp: NonNullable<ReturnType<typeof activeBlueprint>>): { ok: boolean; text: string }[] {
  const out: { ok: boolean; text: string }[] = [];
  const missing = bp.rubric.filter((c) => !c.anchors);
  const drafted = bp.rubric.filter((c) => c.anchors && c.anchorsConfidence === "draft");
  if (!bp.construct.trim()) out.push({ ok: false, text: "The skill statement is empty. Say in one sentence what every student must be able to do." });
  if (bp.rubric.length < 3) out.push({ ok: false, text: `Only ${bp.rubric.length} rubric criteria. Three or more make the checks reliable.` });
  if (missing.length) out.push({ ok: false, text: `${missing.length === 1 ? "One criterion has" : `${missing.length} criteria have`} no level descriptions. Add them, or let us draft them.` });
  if (drafted.length) out.push({ ok: true, text: `${drafted.length === 1 ? "One criterion's" : `${drafted.length} criteria's`} level descriptions were drafted for you. Please read them.` });
  if (!bp.canonicalSolution.trim()) out.push({ ok: false, text: "There is no model answer yet. It is needed to check that the rubric fits every version." });
  if (!out.length) out.push({ ok: true, text: "Everything we need is here." });
  return out;
}

export default function BlueprintPage() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const ws = useWorkspace();
  const bp = activeBlueprint(ws);

  const [editing, setEditing] = useState(params.get("edit") === "1");
  const [name, setName] = useState(bp?.name ?? "");
  const [construct, setConstruct] = useState(bp?.construct ?? "");
  const [solutionOpen, setSolutionOpen] = useState(false);
  const [solution, setSolution] = useState(bp?.canonicalSolution ?? "");
  const [editingAnchors, setEditingAnchors] = useState<string | null>(null);
  const [anchorDraft, setAnchorDraft] = useState<[string, string, string, string]>(["", "", "", ""]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<React.ReactNode>(null);
  const [answerOpen, setAnswerOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setName(bp?.name ?? "");
    setConstruct(bp?.construct ?? "");
    setSolution(bp?.canonicalSolution ?? "");
    setSolutionOpen(false);
    setEditingAnchors(null);
  }, [bp?.id]);

  useEffect(() => {
    if (params.get("edit") === "1") setEditing(true);
  }, [params]);

  if (!bp) {
    return (
      <div className="va-stack" style={{ gap: 22, maxWidth: 980 }}>
        <StepIntro
          step={2}
          title="Check what we found"
          what="This is the blueprint: the skill, the rubric and your model answer. It is what stays the same for every student."
          doThis="There is nothing to check yet. Load an assignment first."
          next="We make one version per student from it."
          learn={["blueprint"]}
        />
        <EmptyState heading="Nothing loaded yet" text="Load an assignment first. We read it and show you what we found, and this is where you confirm it." actionLabel="Load your assignment" onAction={() => navigate("/import")} />
      </div>
    );
  }

  const readiness = readinessOf(bp);
  const sentences = readinessSentences(bp);
  const library = blueprintLibrary(ws);
  const words = bp.canonicalSolution.trim() ? bp.canonicalSolution.trim().split(/\s+/).length : 0;
  const varies = bp.surfaceDimensions.filter((d) => !d.locked && d.enabled);
  const fixed = bp.surfaceDimensions.filter((d) => d.locked || !d.enabled);
  const totalPoints = bp.rubric.reduce((s, c) => s + c.points, 0);

  function fail(e: unknown) {
    if (e instanceof LlmError && e.kind === "auth") {
      setError(
        <>
          Your Claude key was rejected. <Link to="/settings">Check it in Settings</Link>.
        </>,
      );
    } else {
      setError((e as Error)?.message ?? String(e));
    }
  }

  function commitName() {
    if (bp && name.trim() && name !== bp.name) ws.updateBlueprint(bp.id, { name: name.trim() });
  }
  function commitConstruct() {
    if (bp && construct !== bp.construct) ws.updateBlueprint(bp.id, { construct });
  }
  function commitSolution() {
    if (bp && solution !== bp.canonicalSolution) ws.updateBlueprint(bp.id, { canonicalSolution: solution, canonicalSolutionSource: "written" });
  }

  function openAnchorEditor(c: Criterion) {
    setEditingAnchors(c.id);
    setAnchorDraft(c.anchors ? [...c.anchors] : ["", "", "", ""]);
  }
  function saveAnchors() {
    if (!bp || !editingAnchors) return;
    ws.patchCriterion(bp.id, editingAnchors, { anchors: anchorDraft, anchorsConfidence: "high" });
    setEditingAnchors(null);
  }

  async function draftSolution() {
    if (!bp) return;
    setBusy("solution");
    setError(null);
    try {
      const text = await getProvider().draftCanonicalSolution({ construct: bp.construct, taskPrompt: bp.taskPrompt, rubric: bp.rubric });
      ws.updateBlueprint(bp.id, { canonicalSolution: text, canonicalSolutionSource: "drafted" });
      setSolution(text);
      setSolutionOpen(true);
      setEditing(true);
    } catch (e) {
      fail(e);
    } finally {
      setBusy(null);
    }
  }

  async function uploadSolution(files: File[]) {
    if (!bp || !files.length) return;
    setBusy("upload");
    setError(null);
    try {
      const parsed = await parseFiles(files, ws.course.id);
      const src = parsed.sources.find((s) => s.kind === "solution" && s.text) ?? parsed.sources.find((s) => s.text);
      if (!src?.text) throw new Error("Could not read any text from that file.");
      ws.updateBlueprint(bp.id, { canonicalSolution: src.text, canonicalSolutionSource: "found" });
      setSolution(src.text);
    } catch (e) {
      fail(e);
    } finally {
      setBusy(null);
    }
  }

  function leaveEditing() {
    if (solutionOpen) commitSolution();
    setSolutionOpen(false);
    setEditingAnchors(null);
    setEditing(false);
    if (params.get("edit")) {
      params.delete("edit");
      setParams(params, { replace: true });
    }
  }

  const editingCriterion = editingAnchors ? bp.rubric.find((c) => c.id === editingAnchors) : null;

  return (
    <div className="va-stack" style={{ gap: 22, maxWidth: 980 }}>
      <StepIntro
        step={2}
        title="Check what we found"
        what="This is the blueprint: the skill, the rubric and your model answer. It is what stays the same for every student."
        doThis="Read it. Fix anything that is wrong. The rubric here is what will grade every version."
        next="We make one version per student from it."
        learn={["blueprint", "construct", "rubric", "anchors"]}
      />

      {/* Readiness as sentences, always visible */}
      <Frame style={{ padding: "14px 18px", background: readiness.ready ? "var(--color-accent-100)" : "var(--color-surface)" }}>
        <div className="va-stack" style={{ gap: 6, fontSize: 13.5 }}>
          {sentences.map((s, i) => (
            <div key={i} className="va-check">
              <span className={s.ok ? "va-check-ok" : "va-check-warn"}>{s.ok ? "✓" : "!"}</span>
              <span>{s.text}</span>
            </div>
          ))}
        </div>
      </Frame>

      {!editing ? (
        <Frame style={{ padding: "22px 24px" }}>
          <div className="va-kicker" style={{ marginBottom: 4 }}>The blueprint</div>
          <h3 style={{ margin: "0 0 14px", maxWidth: "32ch" }}>{bp.name}</h3>

          <div className="va-stack" style={{ gap: 18 }}>
            <div>
              <div className="va-heading-15" style={{ marginBottom: 4 }}>
                The skill every student must show <Info term="construct" />
              </div>
              <p style={{ margin: 0, fontSize: 14.5, lineHeight: 1.6, maxWidth: "76ch" }}>{bp.construct || <span className="text-muted">Not written yet.</span>}</p>
            </div>

            <div>
              <div className="va-heading-15" style={{ marginBottom: 6 }}>
                The rubric, {bp.rubric.length} criteria, {totalPoints} points <Info term="rubric" />
              </div>
              <table className="table">
                <thead>
                  <tr>
                    <th>Criterion</th>
                    <th style={{ width: 90 }}>Points</th>
                    <th style={{ width: 240 }}>
                      Level descriptions <Info term="anchors" />
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {bp.rubric.map((c) => (
                    <tr key={c.id}>
                      <td>{c.name}</td>
                      <td>{c.points}</td>
                      <td style={{ color: anchorsColor(c) }}>{anchorsWord(c)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div>
              <div className="va-heading-15" style={{ marginBottom: 4 }}>
                Your model answer <Info term="model-answer" />
              </div>
              {bp.canonicalSolution.trim() ? (
                <>
                  <div className="va-surface-box va-clip" style={{ maxHeight: answerOpen ? "none" : 120, fontSize: 13.5, whiteSpace: "pre-wrap" }}>
                    {bp.canonicalSolution}
                    {!answerOpen && <div className="va-fade" />}
                  </div>
                  <div className="va-row-flex" style={{ gap: 12, marginTop: 6 }}>
                    <button type="button" className="btn btn-ghost" style={{ padding: "2px 6px" }} onClick={() => setAnswerOpen((o) => !o)}>
                      {answerOpen ? "Show less" : "Read the whole answer"}
                    </button>
                    <span className="va-muted-12">{words} words · {bp.canonicalSolutionSource === "drafted" ? "drafted for you; please read it" : bp.canonicalSolutionSource === "found" ? "from your files" : "written here"}</span>
                  </div>
                </>
              ) : (
                <div className="va-surface-box" style={{ fontSize: 13.5 }}>
                  <span style={{ color: AMBER }}>No model answer yet.</span> Every version gets its own adapted copy of your answer; that is how we check the rubric still fits.
                  <div className="va-btn-row" style={{ marginTop: 10 }}>
                    <button type="button" className="btn btn-secondary" onClick={draftSolution} disabled={busy !== null}>
                      {busy === "solution" ? "Drafting…" : "Draft one for me"}
                    </button>
                    <button type="button" className="btn btn-secondary" onClick={() => fileRef.current?.click()} disabled={busy !== null}>
                      {busy === "upload" ? "Reading…" : "Upload a file"}
                    </button>
                  </div>
                </div>
              )}
            </div>

            <div className="va-two" style={{ gap: 16 }}>
              <div>
                <div className="va-heading-15" style={{ marginBottom: 4 }}>
                  What will vary between students <Info term="surface-dimension" />
                </div>
                {varies.length ? (
                  <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13.5, lineHeight: 1.6 }}>
                    {varies.map((d) => (
                      <li key={d.key}>
                        {d.label}
                        {d.values.length ? <span className="text-muted"> · {d.values.length <= 3 ? d.values.join(", ") : `${d.values.length} options`}</span> : null}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p style={{ margin: 0, fontSize: 13.5, color: RED }}>Nothing is set to vary, so every version would read the same. Turn something on under Edit.</p>
                )}
              </div>
              <div>
                <div className="va-heading-15" style={{ marginBottom: 4 }}>What stays the same</div>
                <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13.5, lineHeight: 1.6 }}>
                  <li>The skill and the rubric</li>
                  {fixed.map((d) => (
                    <li key={d.key}>{d.label}</li>
                  ))}
                </ul>
              </div>
            </div>
          </div>

          <div className="va-btn-row" style={{ marginTop: 20 }}>
            <BlueprintButton onClick={() => navigate("/generate")} disabled={!readiness.ready}>
              Continue to making the versions
            </BlueprintButton>
            <button type="button" className="btn btn-secondary" onClick={() => setEditing(true)}>
              Edit
            </button>
            {!readiness.ready && <span className="va-muted-12">Fix the items above first.</span>}
          </div>
          {error && (
            <div style={{ color: RED, fontSize: 13, marginTop: 10 }} role="alert">
              {error}
            </div>
          )}
        </Frame>
      ) : (
        <>
          <Frame style={{ padding: "14px 18px", display: "flex", alignItems: "center", gap: 12 }}>
            <span className="va-heading-16" style={{ flex: 1 }}>Editing the blueprint</span>
            <BlueprintButton onClick={leaveEditing}>Done editing</BlueprintButton>
          </Frame>

          <Frame style={{ padding: "20px 22px" }}>
            <h6 style={{ margin: "0 0 14px" }}>
              Name and skill <Info term="construct" />
            </h6>
            <Field label="Assignment name" style={{ marginBottom: 14 }}>
              <input className="input" value={name} onChange={(e) => setName(e.target.value)} onBlur={commitName} />
            </Field>
            <Field label="The skill every student must show (this stays the same in every version)">
              <textarea className="input va-textarea" style={{ minHeight: 104 }} value={construct} onChange={(e) => setConstruct(e.target.value)} onBlur={commitConstruct} />
            </Field>
          </Frame>

          <Frame style={{ padding: "20px 22px" }}>
            <div className="va-row-flex" style={{ marginBottom: 12 }}>
              <h6 style={{ margin: 0 }}>
                Rubric <Info term="rubric" />
              </h6>
              <span className="text-muted" style={{ fontSize: 12 }}>{bp.rubric.length} criteria · each scored 0 to 3 · grades every version unchanged</span>
              <button type="button" className="btn btn-ghost" style={{ marginLeft: "auto" }} onClick={() => ws.addCriterion(bp.id)}>
                + Add a criterion
              </button>
            </div>
            <table className="table">
              <thead>
                <tr>
                  <th style={{ width: "46%" }}>Criterion</th>
                  <th>Weight</th>
                  <th>
                    Level descriptions <Info term="anchors" />
                  </th>
                  <th style={{ width: 36 }} />
                </tr>
              </thead>
              <tbody>
                {bp.rubric.map((c) => (
                  <tr key={c.id}>
                    <td>
                      <input className="input" style={{ width: "100%" }} defaultValue={c.name} key={`${c.id}-${c.name}`} onBlur={(e) => e.target.value.trim() !== c.name && ws.patchCriterion(bp.id, c.id, { name: e.target.value.trim() || c.name })} />
                    </td>
                    <td>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                        <input
                          className="input"
                          type="number"
                          min={0}
                          max={100}
                          style={{ width: 64 }}
                          defaultValue={Math.round(c.weight * 100)}
                          key={`${c.id}-${c.weight}`}
                          onBlur={(e) => {
                            const w = Math.max(0, Math.min(100, Number(e.target.value))) / 100;
                            if (w !== c.weight) ws.patchCriterion(bp.id, c.id, { weight: w });
                          }}
                        />
                        %
                      </span>
                    </td>
                    <td>
                      <button type="button" className="btn btn-ghost" style={{ padding: "2px 6px", color: anchorsColor(c) }} onClick={() => openAnchorEditor(c)} title="Edit level descriptions">
                        {anchorsWord(c)} · edit
                      </button>
                    </td>
                    <td>
                      <button type="button" className="btn btn-ghost" style={{ padding: "2px 6px" }} onClick={() => ws.removeCriterion(bp.id, c.id)} title="Remove criterion" aria-label={`Remove ${c.name}`}>
                        ×
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {editingCriterion && (
              <Frame style={{ padding: "14px 16px", background: "var(--color-surface)", marginTop: 14 }}>
                <div className="va-heading-15" style={{ marginBottom: 8 }}>Level descriptions — {editingCriterion.name}</div>
                <div className="va-stack" style={{ gap: 8 }}>
                  {[0, 1, 2, 3].map((lvl) => (
                    <Field key={lvl} label={`What a ${lvl} looks like`}>
                      <textarea
                        className="input va-textarea"
                        style={{ minHeight: 48 }}
                        value={anchorDraft[lvl]}
                        onChange={(e) => {
                          const next = [...anchorDraft] as [string, string, string, string];
                          next[lvl] = e.target.value;
                          setAnchorDraft(next);
                        }}
                      />
                    </Field>
                  ))}
                </div>
                <div className="va-btn-row" style={{ marginTop: 10 }}>
                  <BlueprintButton onClick={saveAnchors} disabled={anchorDraft.some((a) => !a.trim())}>
                    Save
                  </BlueprintButton>
                  <button type="button" className="btn btn-ghost" onClick={() => setEditingAnchors(null)}>
                    Cancel
                  </button>
                </div>
              </Frame>
            )}
          </Frame>

          <Frame style={{ padding: "20px 22px" }}>
            <h6 style={{ margin: "0 0 8px" }}>
              Model answer <Info term="model-answer" />
            </h6>
            <p className="card-body" style={{ margin: "0 0 12px" }}>Your expert answer. Every version gets its own adapted copy, which is how we check the rubric still fits.</p>
            {solutionOpen ? (
              <textarea className="input va-textarea" style={{ minHeight: 260, width: "100%", fontSize: 13.5, lineHeight: 1.6 }} value={solution} onChange={(e) => setSolution(e.target.value)} onBlur={commitSolution} />
            ) : bp.canonicalSolution.trim() ? (
              <div className="va-surface-box va-clip" style={{ maxHeight: 150, fontSize: 13.5, whiteSpace: "pre-wrap" }}>
                {bp.canonicalSolution}
                <div className="va-fade" />
              </div>
            ) : (
              <div className="va-surface-box text-muted" style={{ fontSize: 13.5 }}>No model answer yet. Write one, upload it, or let us draft one from your rubric.</div>
            )}
            <div className="va-btn-row" style={{ marginTop: 12 }}>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => {
                  if (solutionOpen) commitSolution();
                  setSolutionOpen((o) => !o);
                }}
              >
                {solutionOpen ? "Done with the answer" : "Edit the answer"}
              </button>
              <button type="button" className="btn btn-secondary" onClick={() => fileRef.current?.click()} disabled={busy !== null}>
                {busy === "upload" ? "Reading…" : "Upload a file"}
              </button>
              <button type="button" className="btn btn-secondary" onClick={draftSolution} disabled={busy !== null}>
                {busy === "solution" ? "Drafting…" : "Draft one for me"}
              </button>
              <span className="va-muted-12">{words ? `${words} words · ${bp.canonicalSolutionSource}` : ""}</span>
            </div>
            {error && (
              <div style={{ color: RED, fontSize: 13, marginTop: 10 }} role="alert">
                {error}
              </div>
            )}
          </Frame>

          <Frame style={{ padding: "20px 22px" }}>
            <h6 style={{ margin: "0 0 8px" }}>
              What will vary between students <Info term="surface-dimension" />
            </h6>
            <p className="card-body" style={{ margin: "0 0 12px" }}>Click to turn a detail on or off. Reading level and the number of steps always stay the same, so every version is equally hard.</p>
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
                    onClick={() => ws.updateBlueprint(bp.id, { surfaceDimensions: bp.surfaceDimensions.map((x) => (x.key === d.key ? { ...x, enabled: !x.enabled } : x)) })}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        ws.updateBlueprint(bp.id, { surfaceDimensions: bp.surfaceDimensions.map((x) => (x.key === d.key ? { ...x, enabled: !x.enabled } : x)) });
                      }
                    }}
                  >
                    {d.label} · {d.values.length ? `${d.values.length} options` : d.note ?? "—"}
                  </span>
                ),
              )}
            </div>
          </Frame>
        </>
      )}

      <input
        ref={fileRef}
        type="file"
        accept=".docx,.pdf,.txt,.md"
        hidden
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          e.target.value = "";
          void uploadSolution(files);
        }}
      />

      {library.length > 1 && (
        <details className="blueprint" style={{ padding: "12px 18px" }}>
          <summary className="va-kicker" style={{ cursor: "pointer" }}>Other assignments in this workspace ({library.length - 1})</summary>
          <div className="va-stack" style={{ gap: 10, fontSize: 13.5, marginTop: 10 }}>
            {library.map((entry) => (
              <button
                key={entry.blueprint.id}
                type="button"
                onClick={() => ws.setActiveBlueprint(entry.blueprint.id)}
                style={{ background: "transparent", border: 0, padding: 0, textAlign: "left", cursor: "pointer", color: "inherit", font: "inherit" }}
                aria-current={entry.active ? "true" : undefined}
              >
                <div style={{ fontWeight: entry.active ? 500 : 400 }}>
                  {entry.blueprint.name.split(" — ")[0]}
                  {entry.active ? <span className="va-muted-12"> · this one</span> : null}
                </div>
                <div className="text-muted" style={{ fontSize: 11.5 }}>{entry.sub}</div>
              </button>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}
