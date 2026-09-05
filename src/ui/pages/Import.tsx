import { useEffect, useState, type ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Blueprint, BlueprintButton, Field, FileDrop, Info, Pill, StepIntro, StepProgressBlock, type StepProgress } from "@ui/components";
import { useWorkspace } from "@lib/store/workspace";
import { getSettings, getProvider } from "@lib/store/settings";
import { extractionSummary } from "@lib/store/selectors";
import { parseFiles, parsePastedText } from "@lib/ingest";
import { loadSample } from "@lib/store/samples";
import { guardDraft } from "@lib/llm/extractGuard";
import { SAMPLES } from "@shared/samples";
import { LlmError } from "@lib/llm";
import type { BlueprintDraft, Criterion, SourceFile } from "@shared/types";

type Phase = "idle" | "reading" | "extracting" | "ready" | "error";
type Choice = "sample" | "upload";

const RED = "#8d4a3c";
const GREEN = "#3d6b4d";
const AMBER = "#8a6d2f";

function kb(bytes: number): string {
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

function stripText(files: SourceFile[]): SourceFile[] {
  return files.map(({ text: _t, ...rest }) => rest);
}

function anchorsStatus(c: Criterion): { ok: boolean; text: string; color: string } {
  if (!c.anchors) return { ok: false, text: "needs your level descriptions", color: AMBER };
  if (c.anchorsConfidence === "draft") return { ok: true, text: "level descriptions drafted for you to read", color: AMBER };
  return { ok: true, text: "level descriptions found", color: GREEN };
}

/** A collapsed header for the choice that is not active. */
function CollapsedChoice({ title, hint, onOpen }: { title: string; hint: string; onOpen: () => void }) {
  return (
    <Blueprint style={{ padding: "14px 18px", display: "flex", alignItems: "center", gap: 14, opacity: 0.85 }}>
      <div style={{ flex: 1 }}>
        <div className="va-heading-16">{title}</div>
        <div className="va-muted-12">{hint}</div>
      </div>
      <button type="button" className="btn btn-secondary" onClick={onOpen}>
        Switch to this
      </button>
    </Blueprint>
  );
}

export default function Import() {
  const navigate = useNavigate();
  const ws = useWorkspace();
  const draft = ws.pendingDraft;
  const rosterCount = ws.roster.students.length;

  const [phase, setPhase] = useState<Phase>(draft ? "ready" : "idle");
  const [choice, setChoice] = useState<Choice>("sample");
  const [step, setStep] = useState<StepProgress | null>(null);
  const [retry, setRetry] = useState<(() => void) | null>(null);
  const [error, setError] = useState<ReactNode>(null);
  const [sources, setSources] = useState<SourceFile[]>(draft?.source.files ?? []);
  const [readSeconds, setReadSeconds] = useState<number | undefined>(draft?.source.readSeconds);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteText, setPasteText] = useState("");
  const [editingAnchors, setEditingAnchors] = useState<string | null>(null);
  const [anchorDraft, setAnchorDraft] = useState<[string, string, string, string]>(["", "", "", ""]);
  const [draftingAnchors, setDraftingAnchors] = useState(false);
  const [sampleNote, setSampleNote] = useState<string | null>(null);
  const [repairNote, setRepairNote] = useState("");
  const [loadingSample, setLoadingSample] = useState<string | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);

  useEffect(() => {
    if (draft && phase === "idle") setPhase("ready");
  }, [draft, phase]);

  const modelName = () => {
    try {
      const st = getSettings();
      return st.mode === "live" ? st.generatorModel : "the local parser";
    } catch {
      return "Claude";
    }
  };
  function beginStep(ph: string, headline: string, detail?: string, note?: string, pct: number | null = null) {
    setStep((prev) => ({ phase: ph, headline, detail, note, pct, startedAt: prev && !prev.done && !prev.error ? prev.startedAt : new Date().toISOString(), error: null, done: false }));
  }
  function failStep(msg: string) {
    setStep((prev) => (prev ? { ...prev, error: msg, done: false } : { phase: "error", headline: "Something went wrong", startedAt: new Date().toISOString(), error: msg }));
  }
  function finishStep(headline: string, detail?: string) {
    setStep((prev) => (prev ? { ...prev, headline, detail, done: true, error: null, pct: 100 } : null));
    window.setTimeout(() => setStep((cur) => (cur && cur.done ? null : cur)), 2500);
  }

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
          Your Claude key was rejected. <Link to="/settings">Check it in Settings</Link>, or remove it to use the recorded runs.
        </>,
      );
    } else {
      setError((e as Error)?.message ?? String(e));
    }
    failStep((e as Error)?.message ?? String(e));
    setPhase("error");
  }

  async function extract(files: SourceFile[], rawText: string, secs: number | undefined) {
    setPhase("extracting");
    setRetry(() => () => extract(files, rawText, secs));
    const provider = getProvider();
    const live = provider.mode === "live";
    beginStep(
      "extracting",
      live ? `Reading your assignment with ${modelName()}` : "Reading the rubric and model answer",
      "Finding the skill being measured, the rubric criteria and the model answer.",
      live ? "This usually takes 20–60 seconds." : undefined,
      70,
    );
    try {
      const out = await provider.extractBlueprint({ files, rawText, course: ws.course });
      const guarded = guardDraft(out, files);
      if (guarded.repairs.length) beginStep("repairing", `Filling in ${guarded.repairs.length} thing${guarded.repairs.length === 1 ? "" : "s"} from your files`, guarded.repairs.join("; "), undefined, 90);
      const merged: BlueprintDraft = {
        ...guarded.draft,
        source: {
          ...guarded.draft.source,
          files: files.length ? stripText(files) : guarded.draft.source.files,
          readSeconds: secs ?? guarded.draft.source.readSeconds,
        },
      };
      setRepairNote(guarded.repairs.length ? `Filled in from your files: ${guarded.repairs.join("; ")}.` : "");
      ws.setPendingDraft(merged);
      finishStep("Done reading", `${merged.rubric.length} criteria, ${merged.canonicalSolution ? "model answer found" : "no model answer"}.`);
      setPhase("ready");
    } catch (e) {
      showError(e);
    }
  }

  async function handleFiles(files: File[]) {
    setError(null);
    setPhase("reading");
    setRetry(() => () => handleFiles(files));
    setStep(null);
    beginStep("reading", `Reading ${files.length} file${files.length === 1 ? "" : "s"}`, "Your files are read in this browser. Nothing is uploaded anywhere.", undefined, 25);
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

  async function handleSample(id: string) {
    setError(null);
    setSampleNote(null);
    setLoadingSample(id);
    setPhase("reading");
    setRetry(() => () => handleSample(id));
    setStep(null);
    beginStep("fetching", "Fetching the employer's files", undefined, undefined, 10);
    try {
      const result = await loadSample(id, {
        provider: getProvider(),
        ws,
        actions: { addPartner: ws.addPartner, addChallenge: ws.addChallenge, addSkill: ws.addSkill, setRoster: ws.setRoster, setCourse: ws.setCourse },
        onPhase: (ph, msg, detail) => {
          setPhase(ph === "extracting" || ph === "repairing" ? "extracting" : "reading");
          if (ph === "reading") beginStep("reading", `Reading ${detail?.count ?? ""} files`.replace("  ", " "), "The files are read in this browser. Nothing is uploaded anywhere.", undefined, 30);
          else if (ph === "extracting") {
            const live = getProvider().mode === "live";
            beginStep("extracting", live ? `Reading the assignment with ${detail?.model ?? modelName()}` : msg.replace(/…$/, ""), "Finding the skill being measured, the rubric criteria and the model answer.", live ? "This usually takes 20–60 seconds." : undefined, 70);
          } else if (ph === "repairing") beginStep("repairing", `Filling in ${detail?.repairs ?? ""} thing${detail?.repairs === 1 ? "" : "s"} from the files`.replace("  ", " "), undefined, undefined, 90);
        },
      });
      setSources(result.parsed.sources);
      setReadSeconds(result.parsed.readSeconds);
      ws.setPendingDraft({ ...result.draft, challengeIds: [result.challenge.id] });
      const by = result.extractedBy === "claude" ? "Claude" : result.extractedBy === "recorded" ? `a recorded ${result.extractionModel} extraction` : "the local parser";
      setSampleNote(`Loaded from the ${result.sample.organisation} sample · extracted by ${by}`);
      setRepairNote(result.repairs.length ? `Filled in from the sample files: ${result.repairs.join("; ")}.` : "");
      finishStep(`${result.sample.organisation} loaded`, `${result.draft.rubric.length} criteria · ${result.roster.students.length} students.`);
      setPhase("ready");
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
    setStep(null);
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

  function continueTo(to: string) {
    try {
      ws.saveDraftAsBlueprint();
      navigate(to);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  function startOver() {
    ws.setPendingDraft(null);
    setSources([]);
    setSampleNote(null);
    setRepairNote("");
    setStep(null);
    setError(null);
    setPhase("idle");
  }

  const missing = draft?.rubric.filter((c) => c.anchors === null) ?? [];
  const busy = phase === "reading" || phase === "extracting";
  const summary = extractionSummary(draft, rosterCount);
  const solutionWords = draft?.canonicalSolution?.trim() ? draft.canonicalSolution.trim().split(/\s+/).length : 0;

  return (
    <div className="va-stack" style={{ gap: 22, maxWidth: 980 }}>
      <StepIntro
        step={1}
        title="Load the assignment you already give"
        what="VARIA starts from an assignment you already give. It reads the sheet, the rubric and your model answer."
        doThis="Pick one of the five employer problems below to try it, or upload your own files."
        next="We show you what we found and you confirm it."
        learn={["assessment", "rubric", "model-answer"]}
      />

      {/* Choosing how to start: only shown until something is loaded */}
      {!draft && (
        <>
          {choice === "sample" ? (
            <Blueprint style={{ padding: "18px 20px" }}>
              <div style={{ marginBottom: 10 }}>
                <h6 style={{ margin: "0 0 4px" }}>
                  Try an employer's problem <Info term="challenge" />
                </h6>
                <p className="va-muted-125" style={{ margin: 0 }}>
                  Five real problems that a business in the region would bring, each already written up as an assignment with a rubric and a model answer. Employer names are stand-ins until a partner signs on.
                </p>
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
                    onKeyDown={(e) => {
                      if ((e.key === "Enter" || e.key === " ") && !busy) {
                        e.preventDefault();
                        handleSample(sm.id);
                      }
                    }}
                    style={{ display: "grid", gridTemplateColumns: "110px minmax(0,1fr) auto", gap: 14, alignItems: "center", padding: "12px 6px", borderTop: "1px solid var(--color-divider)" }}
                  >
                    <span className="va-kicker" style={{ justifySelf: "start", color: "var(--color-accent-700)" }}>{sm.industry}</span>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontFamily: "var(--font-heading)", fontSize: 15, lineHeight: 1.2 }}>
                        {sm.organisation} · {sm.title}
                      </div>
                      <div className="text-muted" style={{ fontSize: 12.5, lineHeight: 1.45 }}>{sm.summary}</div>
                      <div className="text-muted" style={{ fontSize: 11.5 }}>{sm.course.code} · {sm.course.title}</div>
                    </div>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      disabled={busy}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleSample(sm.id);
                      }}
                    >
                      {loadingSample === sm.id ? "Loading…" : "Use this"}
                    </button>
                  </div>
                ))}
              </div>
            </Blueprint>
          ) : (
            <CollapsedChoice title="Try an employer's problem" hint="Five ready-made assignments from real problems in the region." onOpen={() => setChoice("sample")} />
          )}

          {choice === "upload" ? (
            <Blueprint style={{ padding: "18px 20px" }}>
              <div style={{ marginBottom: 12 }}>
                <h6 style={{ margin: "0 0 4px" }}>Upload my own</h6>
                <p className="va-muted-125" style={{ margin: 0 }}>
                  Word, PDF or plain text. Add the rubric and your model answer if they are separate files, and a class list (CSV) if you have one. Everything is read in this browser and nothing is uploaded anywhere.
                </p>
              </div>
              <FileDrop
                onFiles={handleFiles}
                disabled={busy}
                heading="Drop your assignment here"
                text="Or use the buttons below."
                actions={
                  <button type="button" className="btn btn-secondary" onClick={() => setPasteOpen((o) => !o)} disabled={busy}>
                    Paste text instead
                  </button>
                }
              />
              <div className="va-muted-12" style={{ marginTop: 8 }}>Canvas import is not available yet.</div>
              {pasteOpen && (
                <div style={{ marginTop: 14 }}>
                  <Field label="Paste the assignment text">
                    <textarea
                      className="input va-textarea"
                      style={{ minHeight: 160, width: "100%" }}
                      value={pasteText}
                      onChange={(e) => setPasteText(e.target.value)}
                      placeholder="Paste the task, the rubric, and (if you have one) your model answer."
                    />
                  </Field>
                  <div className="va-btn-row" style={{ marginTop: 10 }}>
                    <BlueprintButton onClick={handlePaste} disabled={!pasteText.trim() || busy}>
                      Read text
                    </BlueprintButton>
                    <button type="button" className="btn btn-ghost" onClick={() => setPasteOpen(false)}>
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </Blueprint>
          ) : (
            <CollapsedChoice title="Upload my own" hint="Word, PDF or plain text, read in your browser." onOpen={() => setChoice("upload")} />
          )}
        </>
      )}

      {step && (
        <StepProgressBlock
          step={step}
          title={busy ? "Reading your assignment" : step.error ? "Reading stopped" : "Done"}
          onRetry={retry ? () => { setError(null); retry(); } : undefined}
        />
      )}

      {error && (
        <div style={{ color: RED, fontSize: 13 }} role="alert">
          {error}
        </div>
      )}

      {/* What we found: one card, one decision */}
      {draft && (
        <Blueprint style={{ padding: "22px 24px" }}>
          <div className="va-kicker" style={{ marginBottom: 4 }}>Here is what we found</div>
          <h3 style={{ margin: "0 0 4px", maxWidth: "32ch" }}>{draft.name}</h3>
          {(sampleNote || repairNote) && (
            <div className="va-muted-12" style={{ marginBottom: 12 }}>
              {sampleNote}
              {sampleNote && repairNote ? " · " : ""}
              {repairNote}
            </div>
          )}

          <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr)", gap: 16, marginTop: 12 }}>
            <div>
              <div className="va-heading-15" style={{ marginBottom: 4 }}>
                The skill it measures <Info term="construct" />
              </div>
              <p style={{ margin: 0, fontSize: 14.5, lineHeight: 1.6, maxWidth: "76ch" }}>{draft.construct}</p>
            </div>

            <div>
              <div className="va-heading-15" style={{ marginBottom: 6 }}>
                The rubric that will grade every version: {draft.rubric.length} criteria <Info term="rubric" />
              </div>
              <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 6 }}>
                {draft.rubric.map((c) => {
                  const st = anchorsStatus(c);
                  return (
                    <li key={c.id} style={{ display: "grid", gridTemplateColumns: "18px minmax(0,1fr) auto", gap: 10, alignItems: "baseline", fontSize: 14 }}>
                      <span style={{ color: st.color, fontFamily: "var(--font-heading)" }}>{st.ok ? "✓" : "!"}</span>
                      <span>
                        {c.name} <span className="text-muted">· {c.points} points</span>
                      </span>
                      <span style={{ color: st.color, fontSize: 12.5 }}>{st.text}</span>
                    </li>
                  );
                })}
              </ul>
              {missing.length > 0 && editingAnchors === null && (
                <div style={{ marginTop: 10, padding: "12px 14px", background: "var(--color-surface)", border: "1px solid var(--color-divider)", fontSize: 13.5, lineHeight: 1.55 }}>
                  <strong>{missing.length === 1 ? "One criterion" : `${missing.length} criteria`} {missing.length === 1 ? "has" : "have"} no level descriptions.</strong>{" "}
                  Level descriptions say what a 0, 1, 2 and 3 look like <Info term="anchors" />. We can draft them for you to read, or you can write them.
                  <div className="va-btn-row" style={{ marginTop: 10 }}>
                    <button type="button" className="btn btn-secondary" onClick={reviewDraftAnchors} disabled={draftingAnchors}>
                      {draftingAnchors ? "Drafting…" : "Draft them for me"}
                    </button>
                    <button type="button" className="btn btn-ghost" onClick={() => openAnchorEditor(missing[0])}>
                      I'll write them
                    </button>
                  </div>
                </div>
              )}
              {editingAnchors !== null && (
                <Blueprint style={{ padding: "14px 16px", background: "var(--color-surface)", marginTop: 10 }}>
                  <div className="va-heading-15" style={{ marginBottom: 8 }}>Level descriptions — {draft.rubric.find((c) => c.id === editingAnchors)?.name}</div>
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
                </Blueprint>
              )}
            </div>

            <div className="va-two" style={{ gap: 16 }}>
              <div>
                <div className="va-heading-15" style={{ marginBottom: 4 }}>
                  Your model answer <Info term="model-answer" />
                </div>
                <p style={{ margin: 0, fontSize: 13.5 }}>
                  {solutionWords ? (
                    <span style={{ color: GREEN }}>✓ Found · {solutionWords} words{draft.canonicalSolutionSource === "drafted" ? ", drafted for you to check" : ""}</span>
                  ) : (
                    <span style={{ color: AMBER }}>! Not found. We can draft one on the next step; it is needed to check that the rubric fits every version.</span>
                  )}
                </p>
              </div>
              <div>
                <div className="va-heading-15" style={{ marginBottom: 4 }}>
                  How many versions to make <Info term="version" />
                </div>
                <div className="va-row-flex" style={{ alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <input
                    id="versionCountLoad"
                    className="input"
                    type="number"
                    min={2}
                    max={200}
                    value={ws.versionCount ?? 3}
                    onChange={(e) => ws.setVersionCount(Number(e.target.value) || 2)}
                    style={{ width: 80 }}
                    aria-label="How many versions to make"
                  />
                  {[3, 5].map((k) => (
                    <button key={k} type="button" className={`btn ${(ws.versionCount ?? 3) === k ? "btn-secondary" : "btn-ghost"}`} onClick={() => ws.setVersionCount(k)}>{k}</button>
                  ))}
                  {rosterCount > 0 && (
                    <button type="button" className={`btn ${ws.versionCount === rosterCount ? "btn-secondary" : "btn-ghost"}`} onClick={() => ws.setVersionCount(rosterCount)}>
                      All {rosterCount} students
                    </button>
                  )}
                </div>
                <p className="text-muted" style={{ margin: "6px 0 0", fontSize: 12.5 }}>
                  {rosterCount ? `Start with a few to see what you get. Your class list has ${rosterCount} students; you can make one for each later.` : "No class list yet; you can add one later."}
                </p>
              </div>
            </div>
          </div>

          <div className="va-btn-row" style={{ marginTop: 20, alignItems: "center" }}>
            <BlueprintButton onClick={() => continueTo("/blueprint")} disabled={busy}>
              Looks right, continue
            </BlueprintButton>
            <button type="button" className="btn btn-secondary" onClick={() => continueTo("/blueprint?edit=1")} disabled={busy}>
              Fix something first
            </button>
            <button type="button" className="btn btn-ghost" onClick={startOver} disabled={busy} style={{ marginLeft: "auto" }}>
              Start over
            </button>
          </div>

          <details open={detailsOpen} onToggle={(e) => setDetailsOpen((e.target as HTMLDetailsElement).open)} style={{ marginTop: 18, borderTop: "1px solid var(--color-divider)", paddingTop: 12 }}>
            <summary className="va-kicker" style={{ cursor: "pointer" }}>Details: the files, the checks, and what will vary between students</summary>
            <div className="va-stack" style={{ gap: 16, marginTop: 12 }}>
              <div>
                <div className="va-heading-15" style={{ marginBottom: 6 }}>Files read</div>
                <table className="table">
                  <thead>
                    <tr>
                      <th>File</th>
                      <th>Recognised as</th>
                      <th>Size</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sources.length === 0 && (
                      <tr>
                        <td colSpan={4} className="text-muted">No files: this came from pasted text.</td>
                      </tr>
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
                {readSeconds != null && <div className="va-muted-12" style={{ marginTop: 4 }}>Read in {readSeconds} second{readSeconds === 1 ? "" : "s"}.</div>}
              </div>

              <div>
                <div className="va-heading-15" style={{ marginBottom: 6 }}>Checks</div>
                <div className="va-stack" style={{ gap: 6, fontSize: 13.5 }}>
                  {summary.map((it, i) => (
                    <div key={i} className="va-check">
                      <span className={it.warn ? "va-check-warn" : it.ok ? "va-check-ok" : "va-check-bad"}>{it.warn ? "!" : it.ok ? "✓" : "×"}</span>
                      <span>{it.text}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <div className="va-heading-15" style={{ marginBottom: 4 }}>
                  Edit the skill statement <Info term="construct" />
                </div>
                <textarea className="input va-textarea" style={{ minHeight: 72, width: "100%" }} value={draft.construct} onChange={(e) => patchDraft({ construct: e.target.value })} />
              </div>

              <div>
                <div className="va-heading-15" style={{ marginBottom: 4 }}>
                  What will vary between students <Info term="surface-dimension" />
                </div>
                <p className="va-muted-125" style={{ margin: "0 0 8px" }}>These details change from one student's version to the next. Turn one off if changing it would change the skill being tested.</p>
                <div className="va-tags">
                  {draft.surfaceDimensions.map((d) =>
                    d.locked ? (
                      <span key={d.key} className="tag tag-outline">{d.label} · stays the same</span>
                    ) : (
                      <span
                        key={d.key}
                        className="tag tag-accent is-toggle"
                        style={d.enabled ? undefined : { opacity: 0.45 }}
                        title={d.enabled ? "Click to keep this the same for everyone" : "Click to vary this"}
                        onClick={() => patchDraft({ surfaceDimensions: draft.surfaceDimensions.map((x) => (x.key === d.key ? { ...x, enabled: !x.enabled } : x)) })}
                      >
                        {d.label} · {d.note ?? `${d.values.length} options`}
                      </span>
                    ),
                  )}
                </div>
              </div>
            </div>
          </details>
        </Blueprint>
      )}
    </div>
  );
}
