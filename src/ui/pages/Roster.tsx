import { useMemo, useRef, useState } from "react";
/* type-scale: applied */
import { useNavigate } from "react-router-dom";
import { Blueprint, BlueprintButton, CopyField, DataTable, EmptyState, Pill, SegChoice, StatTile, type Column } from "@ui/components";
import { Info } from "@ui/components/Info";
import { StepIntro } from "@ui/components/StepIntro";
import { Verdict } from "@ui/components/Verdict";
import { useWorkspace } from "@lib/store/workspace";
import { activeRun, evidenceForVariant, rosterRows, rosterStats, submissionImportPreview, unassignedVariantOptions, type RosterRow, type SubmissionImportRow } from "@lib/store/selectors";
import { allTaskLinksCsv, buildTaskPackage, buildVersionsZip, downloadBlob, readSubmissionText, taskLink, SUBMISSION_ACCEPT } from "@lib/release";
import type { SubmissionStatus } from "@shared/types";

type Filter = "all" | "submitted" | "graded" | "appeals";
const SEL_KEY = "varia.roster.selected";

function readSel(): string | null {
  try {
    return sessionStorage.getItem(SEL_KEY);
  } catch {
    return null;
  }
}

function statusCell(status: SubmissionStatus, origin?: "student" | "ai-sample", tier?: string) {
  if (origin === "ai-sample") {
    return (
      <span className="tag tag-outline" title={`Written by a model at the ${tier ?? ""} tier for the recorded demo, not by a student. The grade shown is a suggestion.`}>
        AI-written sample{tier ? ` · ${tier}` : ""} <Info term="ai-sample" />
      </span>
    );
  }
  switch (status) {
    case "graded":
      return <span className="tag tag-neutral">Graded</span>;
    case "submitted":
      return <span className="tag tag-accent">Submitted</span>;
    case "appeal":
      return <Pill gate="fail">Appeal</Pill>;
    default:
      return <span className="tag tag-neutral">Not started</span>;
  }
}

function csvEscape(v: string | number): string {
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function downloadText(name: string, text: string, type = "text/csv") {
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

export default function Roster() {
  const ws = useWorkspace();
  const navigate = useNavigate();
  const run = activeRun(ws);
  const [filter, setFilter] = useState<Filter>("all");
  const [showAll, setShowAll] = useState(false);
  const [selected, setSelected] = useState<string | null>(() => readSel());
  const [linkFor, setLinkFor] = useState<{ variantId: string; link: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ rows: SubmissionImportRow[]; files: File[]; overrides: Record<string, string> } | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const rows = useMemo(() => (run ? rosterRows(ws, run.id) : []), [ws, run]);
  const stats = useMemo(() => (run ? rosterStats(ws, run.id) : null), [ws, run]);

  const intro = (
    <StepIntro
      step={5}
      title="Release to students"
      what="Each student gets their own version through a private link or a downloaded document. No two students get the same task."
      doThis="Send the links or download the documents. When work comes back, import it here."
      next="Grade every submission with the one rubric."
      learn={["student-link", "submission", "roster"]}
    />
  );

  if (!run) {
    return (
      <div className="va-page" style={{ gap: 22 }}>
        {intro}
        <EmptyState
          heading="Nothing to release yet"
          text="Make the versions first. Once they pass the checks and you release them, every student's version appears here."
          actionLabel="Go to Make the versions"
          onAction={() => navigate("/generate")}
        />
      </div>
    );
  }

  if (!run.release) {
    const state =
      run.status === "complete" || run.status === "partial"
        ? "The versions have been checked but not released yet."
        : `The versions are still being made (${run.status}).`;
    return (
      <div className="va-page" style={{ gap: 22 }}>
        {intro}
        <Verdict
          tone="watch"
          stamp="Not released"
          headline="Nothing released yet"
          body={`${state} Release them from the previous step and each student gets one version.`}
          action={{ label: "Go to Check the versions", onClick: () => navigate("/report") }}
        />
      </div>
    );
  }

  const filtered = rows.filter((r) => {
    if (filter === "all") return true;
    if (filter === "submitted") return r.status === "submitted" || r.status === "graded" || r.status === "appeal";
    if (filter === "graded") return r.status === "graded";
    return r.status === "appeal";
  });
  const visible = showAll ? filtered : filtered.slice(0, 8);

  const dueLabel = "no due date set";

  const columns: Column<RosterRow>[] = [
    { key: "student", header: "Student", render: (r) => r.student?.name ?? <span className="text-muted">Unassigned</span> },
    { key: "version", header: "Version", render: (r) => r.variant.id },
    { key: "ds", header: "Setting", render: (r) => r.domainStakeholder },
    { key: "ease", header: <>Reading ease <Info term="flesch" /></>, render: (r) => r.readingEase.toFixed(1) },
    { key: "status", header: "Status", render: (r) => statusCell(r.status, r.submission?.origin, r.submission?.sampleTier) },
    { key: "score", header: "Score", render: (r) => r.scoreLabel },
    {
      key: "evidence",
      header: <>Record <Info term="evidence-record" /></>,
      render: (r) => {
        const rec = evidenceForVariant(ws, r.variant.id);
        if (rec) {
          return (
            <a href={`/evidence/${r.variant.id}`} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}>
              {rec.id}
            </a>
          );
        }
        if (r.status === "graded") {
          return (
            <a href={`/evidence/${r.variant.id}`} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}>
              Create record
            </a>
          );
        }
        return <span className="text-muted">—</span>;
      },
    },
  ];

  const open = (r: RosterRow) => {
    setSelected(r.variant.id);
    try {
      sessionStorage.setItem(SEL_KEY, r.variant.id);
    } catch {
      /* ignore */
    }
    navigate(`/grade/${r.variant.id}`);
  };

  const exportCsv = () => {
    const header = ["student", "version", "domain_stakeholder", "reading_ease", "status", "score", "evidence_record"];
    const lines = filtered.map((r) =>
      [
        r.student?.name ?? "",
        r.variant.id,
        r.domainStakeholder,
        r.readingEase,
        r.status,
        r.scoreLabel,
        evidenceForVariant(ws, r.variant.id)?.id ?? "",
      ]
        .map(csvEscape)
        .join(","),
    );
    downloadText(`${run.blueprintName.replace(/\s+/g, "_")}_roster.csv`, [header.join(","), ...lines].join("\n"));
  };

  const copyLink = async (variantId: string) => {
    setError(null);
    const pkg = buildTaskPackage(ws, variantId, run.id);
    if (!pkg) return;
    const link = await taskLink(pkg);
    setLinkFor({ variantId, link });
    try {
      await navigator.clipboard.writeText(link);
      setNotice(`Link for ${variantId} copied.`);
    } catch {
      setNotice(`Link for ${variantId} shown below.`);
    }
  };

  const copyAllLinks = async () => {
    setBusy("links");
    setError(null);
    try {
      const { csv, count } = await allTaskLinksCsv(ws, run.id);
      try {
        await navigator.clipboard.writeText(csv);
      } catch {
        /* download still happens */
      }
      downloadText(`${run.blueprintName.replace(/\s+/g, "_")}_student_links.csv`, csv);
      setNotice(`${count} student links copied and downloaded as CSV.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  const downloadVersions = async (format: "docx" | "md") => {
    setBusy(format);
    setError(null);
    try {
      const out = await buildVersionsZip(ws, run.id, format);
      downloadBlob(out.blob, out.filename);
      setNotice(`${out.count} versions packaged as ${format === "docx" ? "Word documents" : "Markdown files"}.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  const chooseFiles = (files: File[]) => {
    if (!files.length) return;
    setError(null);
    setPreview({ rows: submissionImportPreview(ws, run.id, files.map((f) => f.name)), files, overrides: {} });
  };

  const confirmImport = async () => {
    if (!preview) return;
    setBusy("import");
    setError(null);
    try {
      const items: { variantId: string; text: string; sourceFile: string }[] = [];
      for (let i = 0; i < preview.rows.length; i++) {
        const row = preview.rows[i];
        const variantId = preview.overrides[row.fileName] ?? row.variantId;
        if (!variantId) continue;
        const text = await readSubmissionText(preview.files[i]);
        if (!text) continue;
        items.push({ variantId, text, sourceFile: row.fileName });
      }
      const done = ws.importSubmissions(items, run.id);
      setNotice(`${done.length} submission${done.length === 1 ? "" : "s"} imported.`);
      setPreview(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  const variantOptions = unassignedVariantOptions(ws, run.id);

  return (
    <div className="va-page" style={{ gap: 22 }}>
      {intro}

      <div className="va-tiles">
        <StatTile kicker="Students with a version" value={stats?.released ?? 0} sub="one version each, nobody shares" />
        <StatTile kicker="Work handed in" value={stats?.submitted ?? 0} sub={dueLabel} />
        <StatTile kicker="Graded" value={stats?.graded ?? 0} sub="with the one rubric" />
        <StatTile
          kicker="Difficulty appeals"
          value={stats?.appeals ?? 0}
          sub={stats?.appealNote ?? "none open"}
          color={stats && stats.appeals > 0 ? "fail" : undefined}
        />
      </div>

      <div className="va-split" style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)", gap: 22, alignItems: "start" }}>
        <Blueprint style={{ padding: "20px 22px" }}>
          <div className="va-row-flex" style={{ gap: 8, alignItems: "baseline", marginBottom: 4 }}>
            <h6 style={{ margin: 0 }}>Send the versions</h6>
            <Info term="student-link" />
          </div>
          <p className="va-muted-125" style={{ margin: "0 0 12px", lineHeight: 1.55 }}>
            Two ways, pick either. <strong>Copy all student links</strong> gives you one private link per student to paste into your LMS or an email; each link opens only that student's task. <strong>Download all as Word documents</strong> gives you one file per student to hand out however you like. Nothing is stored on a server.
          </p>
          <div className="va-btn-row" style={{ flexWrap: "wrap" }}>
            <BlueprintButton onClick={copyAllLinks} disabled={busy !== null} data-walk="student-links">{busy === "links" ? "Preparing…" : "Copy all student links"}</BlueprintButton>
            <button type="button" className="btn btn-secondary" disabled={busy !== null} onClick={() => downloadVersions("docx")}>
              {busy === "docx" ? "Packaging…" : "Download all as Word documents"}
            </button>
            <button type="button" className="btn btn-ghost" disabled={busy !== null} onClick={() => downloadVersions("md")}>
              {busy === "md" ? "Packaging…" : "Plain text instead"}
            </button>
          </div>
          <div className="va-muted-12" style={{ marginTop: 10 }}>One student at a time: click a name below to get their link, then open it or copy it.</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
            {rows.slice(0, showAll ? rows.length : 12).map((r) => (
              <button key={r.variant.id} type="button" className="btn btn-ghost" style={{ padding: "2px 8px", fontSize: 14 }} onClick={() => copyLink(r.variant.id)}>
                {r.student?.name ?? r.variant.id} · {r.variant.id}
              </button>
            ))}
            {!showAll && rows.length > 12 && <span className="va-muted-12" style={{ alignSelf: "center" }}>+{rows.length - 12} more (Show all below)</span>}
          </div>
          {linkFor && (
            <div style={{ marginTop: 10, display: "grid", gridTemplateColumns: "minmax(0,1fr) auto", gap: 10, alignItems: "end" }} className="va-split">
              <CopyField label={`Student link · ${linkFor.variantId}`} value={linkFor.link} />
              <a className="btn btn-primary blueprint" href={linkFor.link} target="_blank" rel="noopener noreferrer" style={{ textDecoration: "none", whiteSpace: "nowrap" }} data-walk="open-task">
                Open this student's version
              </a>
            </div>
          )}
        </Blueprint>

        <Blueprint style={{ padding: "20px 22px" }}>
          <div className="va-row-flex" style={{ gap: 8, alignItems: "baseline", marginBottom: 4 }}>
            <h6 style={{ margin: 0 }}>Bring work back</h6>
            <Info term="submission" />
          </div>
          <p className="va-muted-125" style={{ margin: "0 0 12px", lineHeight: 1.55 }}>
            When students hand in their work, choose the files here, one file per student. Name each file with the student's surname or their version number (for example <code>Alvarez.docx</code> or <code>v-04.pdf</code>) and it is matched automatically. Word, PDF, plain text or Markdown. Anything unmatched you can assign by hand.
          </p>
          <input
            ref={fileInput}
            type="file"
            multiple
            accept={SUBMISSION_ACCEPT}
            style={{ display: "none" }}
            data-testid="submissions-input"
            onChange={(e) => {
              chooseFiles(Array.from(e.target.files ?? []));
              e.target.value = "";
            }}
          />
          <BlueprintButton onClick={() => fileInput.current?.click()} disabled={busy !== null}>Import submissions</BlueprintButton>
          {preview && (
            <div style={{ marginTop: 12 }}>
              <table className="table">
                <thead>
                  <tr>
                    <th>File</th>
                    <th>Matched to</th>
                    <th>How</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.rows.map((r) => {
                    const chosen = preview.overrides[r.fileName] ?? r.variantId ?? "";
                    return (
                      <tr key={r.fileName}>
                        <td style={{ fontSize: 14 }}>{r.fileName}</td>
                        <td>
                          <select
                            className="input"
                            value={chosen}
                            onChange={(e) => setPreview((p) => (p ? { ...p, overrides: { ...p.overrides, [r.fileName]: e.target.value } } : p))}
                          >
                            <option value="">— skip —</option>
                            {variantOptions.map((o) => (
                              <option key={o.variantId} value={o.variantId}>{o.label}</option>
                            ))}
                          </select>
                        </td>
                        <td className="va-muted-12">
                          {r.reason === "ambiguous" ? `more than one student matches: ${(r.candidates ?? []).join(", ")}` : r.reason === "unmatched" ? "no match, pick a student" : `matched by ${r.reason}`}
                          {r.alreadySubmitted ? " · replaces what is there" : ""}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <div className="va-btn-row" style={{ marginTop: 10 }}>
                <BlueprintButton onClick={confirmImport} disabled={busy !== null}>{busy === "import" ? "Reading files…" : "Import matched files"}</BlueprintButton>
                <button type="button" className="btn btn-ghost" onClick={() => setPreview(null)}>Cancel</button>
              </div>
            </div>
          )}
        </Blueprint>
      </div>

      <Blueprint style={{ padding: "20px 22px" }}>
        <div className="va-row-flex" style={{ gap: 12, marginBottom: 10, flexWrap: "wrap" }}>
          <h6 style={{ margin: 0 }}>Who has which version</h6>
          <span className="va-muted-12">Click a student to grade their work</span>
          <div style={{ marginLeft: "auto", display: "flex", gap: 8, alignItems: "center" }}>
            <SegChoice<Filter>
              name="roster-filter"
              value={filter}
              onChange={(v) => {
                setFilter(v);
                setShowAll(false);
              }}
              options={[
                { value: "all", label: "Everyone" },
                { value: "submitted", label: "Handed in" },
                { value: "graded", label: "Graded" },
                { value: "appeals", label: "Appeals" },
              ]}
            />
            <button type="button" className="btn btn-secondary" onClick={exportCsv}>
              Export
            </button>
          </div>
        </div>
        <DataTable<RosterRow>
          columns={columns}
          rows={visible}
          rowKey={(r) => r.variant.id}
          onRowClick={open}
          selectedKey={selected}
          empty="No students match this filter."
        />
        <div className="va-row-flex" style={{ marginTop: 10 }}>
          <span className="va-muted-12">
            Showing {visible.length} of {filtered.length}
            {filter !== "all" ? ` (${rows.length} total)` : ""}
          </span>
          {filtered.length > 8 && (
            <button type="button" className="btn btn-ghost" style={{ marginLeft: "auto" }} onClick={() => setShowAll((s) => !s)}>
              {showAll ? "Show fewer" : "Show all"}
            </button>
          )}
        </div>
      </Blueprint>

      {(notice || error) && (
        <div style={{ fontSize: 14, color: error ? "#8d4a3c" : undefined }} className={error ? undefined : "text-muted"}>
          {error ?? notice}
        </div>
      )}
    </div>
  );
}
