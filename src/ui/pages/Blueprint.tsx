import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Blueprint as Frame, BlueprintButton, EmptyState, Field } from "@ui/components";
import { useWorkspace } from "@lib/store/workspace";
import { getProvider } from "@lib/store/settings";
import { activeBlueprint, blueprintLibrary, readinessOf } from "@lib/store/selectors";
import { parseFiles } from "@lib/ingest";
import { LlmError } from "@lib/llm";
import type { Criterion } from "@shared/types";

const RED = "#8d4a3c";

function anchorsWord(c: Criterion): string {
  if (!c.anchors) return "Missing";
  return c.anchorsConfidence === "high" ? "Written" : "Draft";
}

export default function BlueprintPage() {
  const navigate = useNavigate();
  const ws = useWorkspace();
  const bp = activeBlueprint(ws);

  const [name, setName] = useState(bp?.name ?? "");
  const [construct, setConstruct] = useState(bp?.construct ?? "");
  const [solutionOpen, setSolutionOpen] = useState(false);
  const [solution, setSolution] = useState(bp?.canonicalSolution ?? "");
  const [editingAnchors, setEditingAnchors] = useState<string | null>(null);
  const [anchorDraft, setAnchorDraft] = useState<[string, string, string, string]>(["", "", "", ""]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<React.ReactNode>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setName(bp?.name ?? "");
    setConstruct(bp?.construct ?? "");
    setSolution(bp?.canonicalSolution ?? "");
    setSolutionOpen(false);
    setEditingAnchors(null);
  }, [bp?.id]);

  if (!bp) {
    return (
      <EmptyState
        heading="No blueprint yet"
        text="Load an assessment first. The system extracts the construct, the rubric and your model answer, and this page is where you confirm them."
        actionLabel="Load your assessment"
        onAction={() => navigate("/import")}
      />
    );
  }

  const readiness = readinessOf(bp);
  const library = blueprintLibrary(ws);
  const words = bp.canonicalSolution.trim() ? bp.canonicalSolution.trim().split(/\s+/).length : 0;

  function fail(e: unknown) {
    if (e instanceof LlmError && e.kind === "auth") {
      setError(<>Your Claude key was rejected. <Link to="/settings">Check it in Settings</Link>.</>);
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

  const editingCriterion = editingAnchors ? bp.rubric.find((c) => c.id === editingAnchors) : null;

  return (
    <div className="va-split" style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) 320px", gap: 28, alignItems: "start", maxWidth: 1180 }}>
      <div className="va-stack" style={{ gap: 22 }}>
        <Frame style={{ padding: "20px 22px" }}>
          <h6 style={{ margin: "0 0 14px" }}>Competency construct</h6>
          <Field label="Blueprint name" style={{ marginBottom: 14 }}>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} onBlur={commitName} />
          </Field>
          <Field label="What the task must measure (this is what stays constant across every student's version)">
            <textarea
              className="input va-textarea"
              style={{ minHeight: 104 }}
              value={construct}
              onChange={(e) => setConstruct(e.target.value)}
              onBlur={commitConstruct}
            />
          </Field>
        </Frame>

        <Frame style={{ padding: "20px 22px" }}>
          <div className="va-row-flex" style={{ marginBottom: 12 }}>
            <h6 style={{ margin: 0 }}>Analytic rubric</h6>
            <span className="text-muted" style={{ fontSize: 12 }}>
              {bp.rubric.length} criteria · 4 levels · applies to every variant unchanged
            </span>
            <button type="button" className="btn btn-ghost" style={{ marginLeft: "auto" }} onClick={() => ws.addCriterion(bp.id)}>
              + Criterion
            </button>
          </div>
          <table className="table">
            <thead>
              <tr><th style={{ width: "46%" }}>Criterion</th><th>Weight</th><th>Levels</th><th>Anchors</th><th style={{ width: 36 }} /></tr>
            </thead>
            <tbody>
              {bp.rubric.map((c) => (
                <tr key={c.id}>
                  <td>
                    <input
                      className="input"
                      style={{ width: "100%" }}
                      defaultValue={c.name}
                      key={`${c.id}-${c.name}`}
                      onBlur={(e) => e.target.value.trim() !== c.name && ws.patchCriterion(bp.id, c.id, { name: e.target.value.trim() || c.name })}
                    />
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
                  <td>0–3</td>
                  <td>
                    <button type="button" className="btn btn-ghost" style={{ padding: "2px 6px" }} onClick={() => openAnchorEditor(c)} title="Edit level descriptions">
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
                  <Field key={lvl} label={`Level ${lvl}`}>
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
                <BlueprintButton onClick={saveAnchors} disabled={anchorDraft.some((a) => !a.trim())}>Save anchors</BlueprintButton>
                <button type="button" className="btn btn-ghost" onClick={() => setEditingAnchors(null)}>Cancel</button>
              </div>
            </Frame>
          )}
        </Frame>

        <Frame style={{ padding: "20px 22px" }}>
          <h6 style={{ margin: "0 0 12px" }}>Canonical solution</h6>
          <p className="card-body" style={{ margin: "0 0 12px" }}>
            Your expert answer. Every generated version gets its own adapted copy of this, which is how the system checks the rubric still fits.
          </p>
          {solutionOpen ? (
            <textarea
              className="input va-textarea"
              style={{ minHeight: 260, width: "100%", fontSize: 13.5, lineHeight: 1.6 }}
              value={solution}
              onChange={(e) => setSolution(e.target.value)}
              onBlur={commitSolution}
            />
          ) : bp.canonicalSolution.trim() ? (
            <div className="va-surface-box va-clip" style={{ maxHeight: 150, fontSize: 13.5, whiteSpace: "pre-wrap" }}>
              {bp.canonicalSolution}
              <div className="va-fade" />
            </div>
          ) : (
            <div className="va-surface-box text-muted" style={{ fontSize: 13.5 }}>
              No model answer yet. Write one, upload it, or let the system draft one from your rubric.
            </div>
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
              {solutionOpen ? "Done editing" : "Edit full solution"}
            </button>
            <button type="button" className="btn btn-secondary" onClick={() => fileRef.current?.click()} disabled={busy !== null}>
              {busy === "upload" ? "Reading…" : "Upload .docx"}
            </button>
            <button type="button" className="btn btn-secondary" onClick={draftSolution} disabled={busy !== null}>
              {busy === "solution" ? "Drafting…" : "Draft one for me"}
            </button>
            <span className="va-muted-12">
              {words ? `${words} words · ${bp.canonicalSolutionSource}` : ""}
            </span>
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
          </div>
          {error && <div style={{ color: RED, fontSize: 13, marginTop: 10 }} role="alert">{error}</div>}
        </Frame>
      </div>

      <div className="va-sticky">
        <Frame style={{ padding: "18px 20px" }}>
          <h6 style={{ margin: "0 0 12px" }}>Readiness</h6>
          <div className="va-stack" style={{ gap: 9, fontSize: 13.5 }}>
            {readiness.items.map((it, i) => (
              <div key={i} className="va-check">
                <span className={it.warn ? "va-check-warn" : it.ok ? "va-check-ok" : "va-check-bad"}>{it.warn ? "!" : it.ok ? "✓" : "×"}</span>
                <span>{it.text}</span>
              </div>
            ))}
          </div>
          <BlueprintButton block style={{ marginTop: 14 }} disabled={!readiness.ready} onClick={() => navigate("/generate")}>
            Continue to generation
          </BlueprintButton>
        </Frame>
        <Frame style={{ padding: "18px 20px" }}>
          <h6 style={{ margin: "0 0 10px" }}>Library</h6>
          <div className="va-stack" style={{ gap: 12, fontSize: 13.5 }}>
            {library.map((entry) => (
              <button
                key={entry.blueprint.id}
                type="button"
                onClick={() => ws.setActiveBlueprint(entry.blueprint.id)}
                style={{
                  background: "transparent",
                  border: 0,
                  padding: 0,
                  textAlign: "left",
                  cursor: "pointer",
                  color: "inherit",
                  font: "inherit",
                }}
                aria-current={entry.active ? "true" : undefined}
              >
                <div style={{ fontWeight: entry.active ? 500 : 400 }}>{entry.blueprint.name.split(" — ")[0]}</div>
                <div className="text-muted" style={{ fontSize: 11.5 }}>{entry.sub}</div>
              </button>
            ))}
          </div>
        </Frame>
      </div>
    </div>
  );
}
