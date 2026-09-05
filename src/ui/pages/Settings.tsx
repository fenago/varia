import { useRef, useState } from "react";
import { Blueprint, BlueprintButton, Dialog, Field, Pill, SegChoice } from "@ui/components";
import { useSettings, getProvider } from "@lib/store/settings";
import { useWorkspace } from "@lib/store/workspace";
import { fixturesAreReal, listFixtures } from "@lib/store/fixtures";
import { LlmError } from "@lib/llm";
import { GENERATOR_MODELS, JUDGE_MODELS } from "@shared/types";
import { PRESET_ORDER, RUN_PRESETS, modelCaveat, modelOptionText, modelsByFamily, presetDescription, type ModelRole, type RunPreset } from "@shared/models";

const RED = "#8d4a3c";
const WORKSPACE_KEY = "varia.workspace.v1";
const SETTINGS_KEY = "varia.settings";
const SESSION_KEY = "varia.session-key";

function downloadText(name: string, text: string, type: string) {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

function modelLabel(id: string): string {
  return [...GENERATOR_MODELS, ...JUDGE_MODELS].find((m) => m.id === id)?.label ?? id;
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

type Verify = { state: "idle" } | { state: "busy" } | { state: "ok"; model: string; at: string } | { state: "bad"; text: string };

export default function Settings() {
  const s = useSettings();
  const ws = useWorkspace();

  const [keyDraft, setKeyDraft] = useState(s.apiKey ?? "");
  const [show, setShow] = useState(false);
  const [remember, setRemember] = useState(s.rememberKey);
  const [verify, setVerify] = useState<Verify>(
    s.keyVerifiedAt && s.apiKey ? { state: "ok", model: modelLabel(s.judgeModel), at: s.keyVerifiedAt } : { state: "idle" },
  );
  const [saved, setSaved] = useState<string | null>(null);
  const fixtures = listFixtures();
  const [confirm, setConfirm] = useState<"forget" | "reset" | null | "fixtures">(null);
  const [wsError, setWsError] = useState<string | null>(null);
  const importRef = useRef<HTMLInputElement>(null);

  const dirty = keyDraft.trim() !== (s.apiKey ?? "") || remember !== s.rememberKey;

  const saveKey = () => {
    const k = keyDraft.trim();
    s.setApiKey(k.length ? k : null, remember);
    setSaved(k.length ? `Key saved to ${remember ? "this device" : "this tab"}.` : "Key cleared.");
    setVerify({ state: "idle" });
    setTimeout(() => setSaved(null), 2500);
  };

  const verifyKey = async () => {
    if (dirty) saveKey();
    setVerify({ state: "busy" });
    try {
      const res = await getProvider().verifyKey();
      s.markVerified(res.model);
      setVerify({ state: "ok", model: modelLabel(res.model), at: new Date().toISOString() });
    } catch (e) {
      if (e instanceof LlmError) {
        if (e.kind === "auth") setVerify({ state: "bad", text: "Key rejected by Anthropic" });
        else if (e.kind === "network") setVerify({ state: "bad", text: "Could not reach Anthropic" });
        else if (e.kind === "rate") setVerify({ state: "bad", text: "Anthropic is rate-limiting this key right now — try again in a minute" });
        else setVerify({ state: "bad", text: e.message || "Verification failed" });
      } else {
        const msg = e instanceof Error ? e.message : String(e);
        setVerify({ state: "bad", text: msg === "No key" ? "Paste a key first" : msg });
      }
    }
  };

  const forget = () => {
    s.forgetKey();
    setKeyDraft("");
    setVerify({ state: "idle" });
    setConfirm(null);
  };

  const exportWorkspace = () => {
    try {
      downloadText(`varia-workspace-${new Date().toISOString().slice(0, 10)}.json`, ws.exportJson(), "application/json");
    } catch (e) {
      setWsError(e instanceof Error ? e.message : String(e));
    }
  };

  const importWorkspace = async (file: File | undefined) => {
    if (!file) return;
    try {
      ws.importJson(await file.text());
      setWsError(null);
    } catch (e) {
      setWsError(`Could not import: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      if (importRef.current) importRef.current.value = "";
    }
  };

  const live = s.mode === "live";

  return (
    <div className="va-page va-page-narrow" style={{ gap: 22 }}>
      <Blueprint style={{ padding: "20px 22px" }}>
        <div className="va-row-flex" style={{ marginBottom: 4 }}>
          <h6 style={{ margin: 0 }}>Your Claude key</h6>
          <span style={{ marginLeft: "auto" }}>
            {live ? <Pill gate="pass">Live mode</Pill> : <Pill gate="watch">Demo mode</Pill>}
          </span>
        </div>
        <p className="va-muted-125" style={{ margin: "0 0 14px", lineHeight: 1.55 }}>
          {live
            ? "Generation, judging and extraction run against Anthropic with the key below."
            : "Every page works on a seeded course. Paste a key to generate, judge and extract for real."}
        </p>
        <p style={{ margin: "0 0 14px", fontSize: 13.5, lineHeight: 1.6, maxWidth: "70ch" }}>
          The key stays in this browser. It is sent only to <span className="va-mono">api.anthropic.com</span>, directly from this page, by the
          official Anthropic SDK — never to any server of ours, because there is none. No key is bundled with the app and none is read from the
          environment.
        </p>

        <Field label="Anthropic API key" htmlFor="apiKey" hint="Starts with sk-ant-. Create one in the Anthropic Console.">
          <div style={{ display: "flex", gap: 8 }}>
            <input
              id="apiKey"
              className="input va-key-input"
              type={show ? "text" : "password"}
              autoComplete="off"
              spellCheck={false}
              value={keyDraft}
              onChange={(e) => setKeyDraft(e.target.value)}
              placeholder="sk-ant-…"
              style={{ flex: 1 }}
            />
            <button type="button" className="btn btn-secondary" onClick={() => setShow((v) => !v)}>
              {show ? "Hide" : "Show"}
            </button>
          </div>
        </Field>

        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13.5, margin: "10px 0 14px", cursor: "pointer" }}>
          <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
          Remember on this device
          <span className="va-muted-115">— otherwise the key is forgotten when this tab closes</span>
        </label>

        <Field label="Workspace ID" hint="Only needed if Anthropic says your key is not scoped to a workspace. Find it in the Anthropic Console under Settings → Workspaces; it starts with wrkspc_.">
          <input
            className="input"
            type="text"
            placeholder="wrkspc_…"
            defaultValue={s.workspaceId ?? ""}
            onBlur={(e) => s.setWorkspaceId(e.target.value)}
            spellCheck={false}
            autoComplete="off"
          />
        </Field>

        <div className="va-btn-row">
          <BlueprintButton onClick={saveKey} disabled={!dirty && keyDraft.trim().length === 0}>
            Save key
          </BlueprintButton>
          <button type="button" className="btn btn-secondary" onClick={verifyKey} disabled={verify.state === "busy" || keyDraft.trim().length === 0}>
            {verify.state === "busy" ? "Verifying…" : "Verify key"}
          </button>
          <button type="button" className="btn btn-ghost" onClick={() => setConfirm("forget")} disabled={!s.apiKey}>
            Forget key
          </button>
          <span style={{ marginLeft: "auto" }}>
            {verify.state === "ok" && (
              <Pill gate="pass">
                Verified with {verify.model} · {formatTime(verify.at)}
              </Pill>
            )}
            {verify.state === "bad" && <Pill gate="fail">{verify.text}</Pill>}
          </span>
        </div>
        {saved && (
          <div className="va-muted-12" style={{ marginTop: 8 }}>
            {saved}
          </div>
        )}
      </Blueprint>

      <Blueprint style={{ padding: "20px 22px" }}>
        <h6 style={{ margin: "0 0 4px" }}>Models</h6>
        <p className="va-muted-125" style={{ margin: "0 0 14px" }}>
          The generator writes the versions and extracts blueprints on Import; the judge scores construct equivalence and is held fixed across a run.
        </p>
        <div style={{ marginBottom: 14 }}>
          <div className="va-muted-12" style={{ marginBottom: 6 }}>Preset</div>
          <SegChoice<RunPreset>
            name="settings-preset"
            value={s.preset}
            onChange={(id) => s.setPreset(id)}
            options={PRESET_ORDER.map((id) => ({ value: id, label: id === "custom" ? "Custom" : RUN_PRESETS[id].label }))}
          />
          <div className="va-muted-12" style={{ marginTop: 6, lineHeight: 1.5 }}>
            {presetDescription(s.preset, { generator: s.generatorModel, judge: s.judgeModel, judgeSamples: s.judgeSamples, strategy: "structured-cot" })}
          </div>
        </div>
        <div className="va-two" style={{ gap: 16 }}>
          <Field label="Generator" htmlFor="genModel">
            <select id="genModel" className="input" value={s.generatorModel} onChange={(e) => s.setModels({ generatorModel: e.target.value })}>
              <ModelOptions role="generator" />
            </select>
            <ModelCaveat id={s.generatorModel} />
          </Field>
          <Field label="Judge (held fixed)" htmlFor="judgeModel">
            <select id="judgeModel" className="input" value={s.judgeModel} onChange={(e) => s.setModels({ judgeModel: e.target.value })}>
              <ModelOptions role="judge" />
            </select>
            <ModelCaveat id={s.judgeModel} />
          </Field>
        </div>
        <Field label="Judge samples per version (default for new runs)" htmlFor="judgeSamples" hint="Self-consistency: independent judge calls whose median is taken. The pilot used 5. You can change it per run on Generate.">
          <input
            id="judgeSamples"
            className="input"
            type="number"
            min={3}
            max={9}
            step={1}
            value={s.judgeSamples}
            onChange={(e) => {
              const n = Math.round(Number(e.target.value));
              if (n >= 3 && n <= 9) s.setJudgeSamples(n);
            }}
            style={{ width: 96 }}
          />
        </Field>
      </Blueprint>

      <Blueprint style={{ padding: "20px 22px" }}>
        <h6 style={{ margin: "0 0 4px" }}>Workspace</h6>
        <p className="va-muted-125" style={{ margin: "0 0 14px" }}>
          Everything — blueprints, runs, versions, grades, thresholds, audit trail — lives in this browser's local storage. There is no database.
        </p>
        <div className="va-btn-row">
          <button type="button" className="btn btn-secondary" onClick={exportWorkspace}>
            Export workspace
          </button>
          <button type="button" className="btn btn-secondary" onClick={() => importRef.current?.click()}>
            Import workspace
          </button>
          <input
            ref={importRef}
            type="file"
            accept="application/json,.json"
            hidden
            onChange={(e) => void importWorkspace(e.target.files?.[0])}
          />
          <button type="button" className="btn btn-ghost" onClick={() => setConfirm("reset")}>
            Reset to the recorded runs
          </button>
          <button type="button" className="btn btn-secondary" onClick={() => setConfirm("fixtures")} disabled={fixtures.length === 0}>
            Load recorded sample runs
          </button>
        </div>
        {fixtures.length > 0 && (
          <div className="va-muted-12" style={{ marginTop: 8, lineHeight: 1.5 }}>
            {fixtures.length} recorded run{fixtures.length === 1 ? "" : "s"}:{" "}
            {fixtures.map((f) => `${f.organisation} (${f.variants} versions, ${f.recordedWith === "live" ? `${f.models.generator}, J ${f.joint?.toFixed(2) ?? "—"}` : "dry run · not real output"})`).join("; ")}.
            {fixturesAreReal() ? "" : " Dry-run fixtures come from the demo provider and are placeholders until the recorder is run with a real key."}
          </div>
        )}
        {wsError && (
          <div style={{ marginTop: 8, fontSize: 12.5, color: RED }}>
            {wsError}
          </div>
        )}
        <div className="va-muted-12" style={{ marginTop: 12, lineHeight: 1.6 }}>
          {ws.blueprints.length} blueprint{ws.blueprints.length === 1 ? "" : "s"} · {ws.runs.length} run{ws.runs.length === 1 ? "" : "s"} ·{" "}
          {ws.submissions.length} submission{ws.submissions.length === 1 ? "" : "s"} · {ws.audit.length} audit events
          <br />
          Storage keys: <span className="va-mono">{WORKSPACE_KEY}</span>, <span className="va-mono">{SETTINGS_KEY}</span>
          {!s.rememberKey && (
            <>
              , <span className="va-mono">{SESSION_KEY}</span> (session)
            </>
          )}
        </div>
      </Blueprint>

      <Dialog
        open={confirm === "forget"}
        title="Forget this key?"
        onClose={() => setConfirm(null)}
        actions={
          <>
            <button type="button" className="btn btn-secondary" onClick={() => setConfirm(null)}>
              Cancel
            </button>
            <BlueprintButton onClick={forget}>Forget key</BlueprintButton>
          </>
        }
      >
        <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.55 }}>
          The key is removed from this browser and the app returns to demo mode. Your blueprints and runs are kept.
        </p>
      </Dialog>

      <Dialog
        open={confirm === "reset"}
        title="Reset to the recorded runs?"
        onClose={() => setConfirm(null)}
        actions={
          <>
            <button type="button" className="btn btn-secondary" onClick={() => setConfirm(null)}>
              Cancel
            </button>
            <BlueprintButton
              onClick={() => {
                try {
                  ws.resetToDemo();
                  setWsError(null);
                } catch (e) {
                  setWsError(e instanceof Error ? e.message : String(e));
                }
                setConfirm(null);
              }}
            >
              Reset workspace
            </BlueprintButton>
          </>
        }
      >
        <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.55 }}>
          This replaces every blueprint, run, grade and audit event with the seeded DAT 4100 course. Export first if you want to keep anything. Your
          key and model choices are not affected.
        </p>
      </Dialog>
      <Dialog
        open={confirm === "fixtures"}
        title="Load recorded sample runs?"
        onClose={() => setConfirm(null)}
        actions={
          <>
            <button type="button" className="btn btn-secondary" onClick={() => setConfirm(null)}>
              Cancel
            </button>
            <BlueprintButton
              onClick={() => {
                try {
                  ws.loadFixtures();
                  setWsError(null);
                } catch (e) {
                  setWsError(e instanceof Error ? e.message : String(e));
                }
                setConfirm(null);
              }}
            >
              Load recorded runs
            </BlueprintButton>
          </>
        }
      >
        <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.55 }}>
          This replaces the workspace with the recorded sample runs: real blueprints, rosters, versions and integrity reports produced by the
          pipeline. Nothing is invented. {fixturesAreReal() ? "" : "The current recordings are dry runs from the demo provider and are labelled as not real output."} Export first if you want to keep anything.
        </p>
      </Dialog>
    </div>
  );
}
