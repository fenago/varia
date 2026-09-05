import { useEffect, useState, type ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Blueprint, BlueprintButton, Field, FileDrop, Pill } from "@ui/components";
import { useWorkspace } from "@lib/store/workspace";
import { getProvider } from "@lib/store/settings";
import { extractionSummary } from "@lib/store/selectors";
import { parseFiles, parsePastedText } from "@lib/ingest";
import { loadSample } from "@lib/store/samples";
import { guardDraft } from "@lib/llm/extractGuard";
import { SAMPLES } from "@shared/samples";
import { LlmError } from "@lib/llm";
import type { BlueprintDraft, Criterion, SourceFile } from "@shared/types";

type Phase = "idle" | "reading" | "extracting" | "ready" | "error";

const RED = "#8d4a3c";

function kb(bytes: number): string {
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

function ordinal(i: number): string {
  return ["first", "second", "third", "fourth", "fifth", "sixth", "seventh", "eighth"][i] ?? `${i + 1}th`;
}

function stripText(files: SourceFile[]): SourceFile[] {
  return files.map(({ text: _t, ...rest }) => rest);
}

function ConfidencePill({ c }: { c: Criterion }) {
  if (c.anchorsConfidence === "high") return <Pill gate="pass">High</Pill>;
  if (c.anchorsConfidence === "draft") return <Pill gate="watch">Draft</Pill>;
  return <Pill gate="watch">Needs you</Pill>;
}

export default function Import() {
  const navigate = useNavigate();
  const ws = useWorkspace();
  const draft = ws.pendingDraft;
  const rosterCount = ws.roster.students.length;

  const [phase, setPhase] = useState<Phase>(draft ? "ready" : "idle");
  const [message, setMessage] = useState<string>("");
  const [error, setError] = useState<ReactNode>(null);
  const [sources, setSources] = useState<SourceFile[]>(draft?.source.files ?? []);
  const [readSeconds, setReadSeconds] = useState<number | undefined>(draft?.source.readSeconds);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteText, setPasteText] = useState("");
  const [editingAnchors, setEditingAnchors] = useState<string | null>(null);
  const [anchorDraft, setAnchorDraft] = useState<[string, string, string, string]>(["", "", "", ""]);
  const [draftingAnchors, setDraftingAnchors] = useState(false);

  useEffect(() => {
    if (draft && phase === "idle") setPhase("ready");
  }, [draft, phase]);

  function patchDraft(patch: Partial<BlueprintDraft>) {
    if (!draft) return;
    ws.setPendingDraft({ ...draft, ...patch });
  }

  function patchCriterion(id: string, patch: Partial<Criterion>) {
    if (!draft) return;
    patchDraft({ rubric: draft.rubric.map((c) => (c.id === id ? { ...c, ...patch } : c)) });
  }

  function showError(e: unknown) {
    if (e instanceof LlmError && e.kind === "auth") {
      setError(
        <>
          Your Claude key was rejected. <Link to="/settings">Check it in Settings</Link>, or remove it to use demo mode.
        </>,
      );
    } else {
      setError((e as Error)?.message ?? String(e));
    }
    setPhase("error");
  }

  async function extract(files: SourceFile[], rawText: string, secs: number | undefined) {
    setPhase("extracting");
    setMessage("Extracting the blueprint…");
    try {
      const out = await getProvider().extractBlueprint({ files, rawText, course: ws.course });
      const guarded = guardDraft(out, files);
      const merged: BlueprintDraft = {
        ...guarded.draft,
        source: {
          ...guarded.draft.source,
          files: files.length ? stripText(files) : guarded.draft.source.files,
          readSeconds: secs ?? guarded.draft.source.readSeconds,
        },
      };
      setRepairNote(guarded.repairs.length ? `Repaired from your files: ${guarded.repairs.join("; ")}.` : "");
      ws.setPendingDraft(merged);
      setPhase("ready");
      setMessage("");
    } catch (e) {
      showError(e);
    }
  }

  async function handleFiles(files: File[]) {
    setError(null);
    setPhase("reading");
    setMessage(`Reading ${files.length} file${files.length === 1 ? "" : "s"}…`);
    try {
      const parsed = await parseFiles(files, ws.course.id);
      if (parsed.roster) ws.setRoster(parsed.roster);
      setSources(parsed.sources);
      setReadSeconds(parsed.readSeconds);
      await extract(parsed.sources, parsed.rawText, parsed.readSeconds);
    } catch (e) {
      showError(e);
    }
  }

  const [sampleNote, setSampleNote] = useState<string | null>(null);

  const [repairNote, setRepairNote] = useState("");
  const [loadingSample, setLoadingSample] = useState<string | null>(null);

  async function handleSample(id: string) {
    setError(null);
    setSampleNote(null);
    setLoadingSample(id);
    setPhase("reading");
    try {
      const result = await loadSample(id, {
        provider: getProvider(),
        ws,
        actions: { addPartner: ws.addPartner, addChallenge: ws.addChallenge, addSkill: ws.addSkill, setRoster: ws.setRoster, setCourse: ws.setCourse },
        onPhase: (ph, msg) => {
          setPhase(ph === "extracting" ? "extracting" : "reading");
          setMessage(msg);
        },
      });
      setSources(result.parsed.sources);
      setReadSeconds(result.parsed.readSeconds);
      ws.setPendingDraft({ ...result.draft, challengeIds: [result.challenge.id] });
      const by = result.extractedBy === "claude" ? "Claude" : result.extractedBy === "recorded" ? `a recorded ${result.extractionModel} extraction` : "the local parser";
      setSampleNote(`Loaded from the ${result.sample.organisation} sample · extracted by ${by}`);
      setRepairNote(result.repairs.length ? `Repaired from the sample files: ${result.repairs.join("; ")}.` : "");
      setPhase("ready");
      setMessage("");
    } catch (e) {
      showError(e);
    } finally {
      setLoadingSample(null);
    }
  }

  async function handlePaste() {
    if (!pasteText.trim()) return;
    setError(null);
    const parsed = parsePastedText(pasteText);
    setSources(parsed.sources);
    setReadSeconds(1);
    setPasteOpen(false);
    await extract(parsed.sources, parsed.rawText, 1);
  }

  async function reviewDraftAnchors() {
    if (!draft) return;
    setDraftingAnchors(true);
    setError(null);
    try {
      const provider = getProvider();
      let rubric = draft.rubric;
      for (const c of draft.rubric.filter((x) => x.anchors === null)) {
        const anchors = await provider.draftAnchors(c, { construct: draft.construct, taskPrompt: draft.taskPrompt });
        rubric = rubric.map((x) => (x.id === c.id ? { ...x, anchors, anchorsConfidence: "draft" as const } : x));
      }
      patchDraft({ rubric });
    } catch (e) {
      showError(e);
      setPhase("ready");
    } finally {
      setDraftingAnchors(false);
    }
  }

  function openAnchorEditor(c: Criterion) {
    setEditingAnchors(c.id);
    setAnchorDraft(c.anchors ? [...c.anchors] : ["", "", "", ""]);
  }

  function saveAnchors() {
    if (!editingAnchors) return;
    patchCriterion(editingAnchors, { anchors: anchorDraft, anchorsConfidence: "high" });
    setEditingAnchors(null);
  }

  function openAsBlueprint(to: string) {
    try {
      ws.saveDraftAsBlueprint();
      navigate(to);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  const missing = draft?.rubric.filter((c) => c.anchors === null) ?? [];
  const busy = phase === "reading" || phase === "extracting";
  const summary = extractionSummary(draft, rosterCount);
  const missingIndex = draft && missing.length ? draft.rubric.findIndex((c) => c.id === missing[0].id) : -1;

  return (
    <div className="va-split" style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) 360px", gap: 28, alignItems: "start", maxWidth: 1180 }}>
      <div className="va-stack" style={{ gap: 22 }}>
        <Blueprint style={{ padding: "18px 20px" }}>
          <div className="va-row-flex" style={{ alignItems: "baseline", gap: 10, marginBottom: 4 }}>
            <h6 style={{ margin: 0 }}>Start from a sample</h6>
            <span className="text-muted" style={{ fontSize: 12 }}>Five employer problems, each with the brief the business sent and the assignment built from it, used in real MDC courses. Employer names are stand-ins until a partner signs on. Loading one runs the same file parsing and extraction as an upload.</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column" }}>
            {SAMPLES.map((sm) => (
              <div
                key={sm.id}
                className="va-row"
                role="button"
                tabIndex={0}
                aria-label={`Load the ${sm.organisation} sample`}
                onClick={() => !busy && handleSample(sm.id)}
                onKeyDown={(e) => { if ((e.key === "Enter" || e.key === " ") && !busy) { e.preventDefault(); handleSample(sm.id); } }}
                style={{ display: "grid", gridTemplateColumns: "110px minmax(0,1fr) auto", gap: 14, alignItems: "center", padding: "10px 6px", borderTop: "1px solid var(--color-divider)" }}
              >
                <span className="va-kicker" style={{ justifySelf: "start", color: "var(--color-accent-700)" }}>{sm.industry}</span>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontFamily: "var(--font-heading)", fontSize: 15, lineHeight: 1.2 }}>
                    {sm.organisation} · {sm.title}
                  </div>
                  <div className="text-muted" style={{ fontSize: 12.5, lineHeight: 1.45 }}>{sm.summary}</div>
                  <div className="text-muted" style={{ fontSize: 11.5 }}>{sm.course.code} · {sm.course.title}</div>
                </div>
                <button type="button" className="btn btn-secondary" disabled={busy} onClick={(e) => { e.stopPropagation(); handleSample(sm.id); }}>
                  {loadingSample === sm.id ? "Loading…" : "Load"}
                </button>
              </div>
            ))}
          </div>
        </Blueprint>

        <FileDrop
          onFiles={handleFiles}
          disabled={busy}
          actions={
            <>
              <button type="button" className="btn btn-secondary" onClick={() => setPasteOpen((o) => !o)} disabled={busy}>
                Paste text instead
              </button>
              <button type="button" className="btn btn-secondary" disabled title="Not in this prototype">
                Import from Canvas
              </button>
            </>
          }
        />

        {pasteOpen && (
          <Blueprint style={{ padding: "18px 20px" }}>
            <h6 style={{ margin: "0 0 10px" }}>Paste the assignment text</h6>
            <textarea
              className="input va-textarea"
              style={{ minHeight: 160, width: "100%" }}
              value={pasteText}
              onChange={(e) => setPasteText(e.target.value)}
              placeholder="Paste the task prompt, rubric, and (if you have one) your model answer."
            />
            <div className="va-btn-row" style={{ marginTop: 10 }}>
              <BlueprintButton onClick={handlePaste} disabled={!pasteText.trim() || busy}>Read text</BlueprintButton>
              <button type="button" className="btn btn-ghost" onClick={() => setPasteOpen(false)}>Cancel</button>
            </div>
          </Blueprint>
        )}

        {busy && (
          <Blueprint style={{ padding: "18px 20px" }} role="status" aria-live="polite">
            <div className="va-heading-16">{message}</div>
            <div className="va-progress" style={{ marginTop: 10 }}>
              <div className="va-progress-fill" style={{ width: phase === "reading" ? "30%" : "70%" }} />
            </div>
            <div className="va-muted-12" style={{ marginTop: 8 }}>
              {phase === "extracting" ? "Finding the construct, the rubric criteria and the model answer." : "Parsing the files in your browser. Nothing is uploaded."}
            </div>
          </Blueprint>
        )}

        {error && (
          <div style={{ color: RED, fontSize: 13 }} role="alert">{error}</div>
        )}

        {!draft && !busy && (
          <Blueprint style={{ padding: "18px 20px" }}>
            <h6 style={{ margin: "0 0 6px" }}>Nothing loaded yet</h6>
            <p className="card-body" style={{ margin: 0 }}>
              Drop your assignment above. The system reads it in your browser, then pulls out the skill being measured, the rubric criteria and your model answer for you to confirm.
            </p>
          </Blueprint>
        )}

        {draft && (
          <>
            <Blueprint style={{ padding: "20px 22px" }}>
              <div className="va-row-flex" style={{ marginBottom: 12 }}>
                <h6 style={{ margin: 0 }}>Uploaded</h6>
                <span className="text-muted" style={{ fontSize: 12 }}>
                  {sources.length} file{sources.length === 1 ? "" : "s"}{readSeconds != null ? ` · read in ${readSeconds} second${readSeconds === 1 ? "" : "s"}` : ""}{sampleNote ? ` · ${sampleNote}` : ""}
                </span>
                {repairNote ? <div className="va-muted-12" style={{ marginTop: 4 }}>{repairNote}</div> : null}
              </div>
              <table className="table">
                <thead><tr><th>File</th><th>Recognised as</th><th>Size</th><th>Status</th></tr></thead>
                <tbody>
                  {sources.length === 0 && (
                    <tr><td colSpan={4} className="text-muted">No files — the draft below came from pasted text or the demo.</td></tr>
                  )}
                  {sources.map((f) => (
                    <tr key={f.name}>
                      <td>{f.name}</td>
                      <td>{f.kind === "roster" ? `${rosterCount} enrolled students` : f.recognisedAs}</td>
                      <td>{kb(f.sizeBytes)}</td>
                      <td>{f.status === "read" ? <Pill gate="pass">Read</Pill> : <Pill gate="fail">Failed</Pill>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Blueprint>

            <Blueprint style={{ padding: "20px 22px" }}>
              <div className="va-row-flex" style={{ marginBottom: 6 }}>
                <h6 style={{ margin: 0 }}>What the system pulled out</h6>
                <span className="text-muted" style={{ fontSize: 12 }}>Correct anything that is wrong — this becomes the blueprint</span>
              </div>
              <Field
                label="The skill being measured"
                hint={`— extracted from your prompt, ${draft.source.extractionConfidence ?? "medium"} confidence`}
                style={{ margin: "14px 0" }}
              >
                <textarea
                  className="input va-textarea"
                  style={{ minHeight: 72 }}
                  value={draft.construct}
                  onChange={(e) => patchDraft({ construct: e.target.value })}
                />
              </Field>
              <div style={{ fontSize: 12, color: "color-mix(in srgb,var(--color-text) 70%,transparent)", marginBottom: 6 }}>Rubric criteria found</div>
              <table className="table" style={{ marginBottom: 14 }}>
                <thead><tr><th style={{ width: "52%" }}>Criterion</th><th>Points</th><th>Anchors found</th><th>Confidence</th></tr></thead>
                <tbody>
                  {draft.rubric.map((c) => (
                    <tr key={c.id}>
                      <td>{c.name}</td>
                      <td>{c.points}</td>
                      <td>{c.anchors ? "Yes" : "Not found"}</td>
                      <td><ConfidencePill c={c} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {missing.length > 0 && editingAnchors === null && (
                <Blueprint style={{ padding: "12px 14px", background: "var(--color-surface)", fontSize: 13, lineHeight: 1.55 }}>
                  <strong>{missing.length === 1 ? "One thing needs you." : `${missing.length} things need you.`}</strong>{" "}
                  {missing.length === 1
                    ? `Your ${ordinal(missingIndex)} criterion has no level descriptions in the file.`
                    : `${missing.length} criteria have no level descriptions in the file.`}{" "}
                  Write them, or accept the draft the system proposes — the judge that checks construct equivalence is less reliable without them.
                  <div className="va-btn-row" style={{ marginTop: 10 }}>
                    <button type="button" className="btn btn-secondary" onClick={reviewDraftAnchors} disabled={draftingAnchors}>
                      {draftingAnchors ? "Drafting…" : "Review draft anchors"}
                    </button>
                    <button type="button" className="btn btn-ghost" onClick={() => openAnchorEditor(missing[0])}>Write my own</button>
                  </div>
                </Blueprint>
              )}

              {editingAnchors !== null && (
                <Blueprint style={{ padding: "14px 16px", background: "var(--color-surface)" }}>
                  <div className="va-heading-15" style={{ marginBottom: 8 }}>
                    Level descriptions — {draft.rubric.find((c) => c.id === editingAnchors)?.name}
                  </div>
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
                </Blueprint>
              )}

              {missing.length === 0 && draft.rubric.some((c) => c.anchorsConfidence === "draft") && (
                <div className="va-muted-12" style={{ lineHeight: 1.5 }}>
                  Drafted anchors are marked "Draft". You can rewrite them on the Blueprint page.
                </div>
              )}
            </Blueprint>

            <Blueprint style={{ padding: "20px 22px" }}>
              <h6 style={{ margin: "0 0 6px" }}>Surface dimensions it can vary</h6>
              <p className="text-muted" style={{ fontSize: 12.5, margin: "0 0 14px" }}>Proposed from your prompt. Deselect anything that would change what you are testing.</p>
              <div className="va-tags">
                {draft.surfaceDimensions.map((d) =>
                  d.locked ? (
                    <span key={d.key} className="tag tag-outline">{d.label} · {d.note ?? "held constant"}</span>
                  ) : (
                    <span
                      key={d.key}
                      className="tag tag-accent is-toggle"
                      style={d.enabled ? undefined : { opacity: 0.45 }}
                      title={d.enabled ? "Click to deselect" : "Click to select"}
                      onClick={() =>
                        patchDraft({ surfaceDimensions: draft.surfaceDimensions.map((x) => (x.key === d.key ? { ...x, enabled: !x.enabled } : x)) })
                      }
                    >
                      {d.label} · {d.note ?? `${d.values.length} found`}
                    </span>
                  ),
                )}
              </div>
            </Blueprint>
          </>
        )}
      </div>

      <div className="va-sticky">
        <Blueprint style={{ padding: "18px 20px" }}>
          <h6 style={{ margin: "0 0 12px" }}>Extraction summary</h6>
          {draft ? (
            <div className="va-stack" style={{ gap: 9, fontSize: 13.5 }}>
              {summary.map((it, i) => (
                <div key={i} className="va-check">
                  <span className={it.warn ? "va-check-warn" : it.ok ? "va-check-ok" : "va-check-bad"}>{it.warn ? "!" : it.ok ? "✓" : "×"}</span>
                  <span>{it.text}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="card-body" style={{ margin: 0 }}>Nothing extracted yet. Load a file or paste text to begin.</p>
          )}
          <BlueprintButton block style={{ marginTop: 14 }} disabled={!draft || busy} onClick={() => openAsBlueprint("/blueprint")}>
            Open as blueprint
          </BlueprintButton>
          <button type="button" className="btn btn-secondary btn-block" disabled={!draft || busy} onClick={() => openAsBlueprint("/generate")}>
            Skip review, generate now
          </button>
        </Blueprint>
        <Blueprint style={{ padding: "18px 20px" }}>
          <h6 style={{ margin: "0 0 10px" }}>No model answer?</h6>
          <p className="card-body" style={{ margin: 0 }}>
            The system can draft one from your rubric for you to correct. It is required: the rubric-stability check works by adapting your answer into each student's scenario.
          </p>
        </Blueprint>
      </div>
    </div>
  );
}
