import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Blueprint, DataTable, EmptyState, Pill, SegChoice, StatTile, type Column } from "@ui/components";
import { useWorkspace } from "@lib/store/workspace";
import { activeRun, evidenceForVariant, rosterRows, rosterStats, type RosterRow } from "@lib/store/selectors";
import { DEMO_DUE_LABEL, DEMO_RUN_ID } from "@lib/store/seed";
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

function statusCell(status: SubmissionStatus) {
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

  const rows = useMemo(() => (run ? rosterRows(ws, run.id) : []), [ws, run]);
  const stats = useMemo(() => (run ? rosterStats(ws, run.id) : null), [ws, run]);

  if (!run) {
    return (
      <EmptyState
        heading="No versions to release yet"
        text="Generate a set of versions first. Once the integrity report clears, release it and the roster appears here."
        actionLabel="Go to generation"
        onAction={() => navigate("/generate")}
      />
    );
  }

  if (!run.release) {
    const state =
      run.status === "complete" || run.status === "partial"
        ? "The set has been scored but not released."
        : `The run is ${run.status}.`;
    return (
      <EmptyState
        heading="Not released yet"
        text={`${state} Release it from the integrity report to assign one version to each student.`}
        actionLabel="Open the integrity report"
        onAction={() => navigate("/report")}
      />
    );
  }

  const filtered = rows.filter((r) => {
    if (filter === "all") return true;
    if (filter === "submitted") return r.status === "submitted" || r.status === "graded" || r.status === "appeal";
    if (filter === "graded") return r.status === "graded";
    return r.status === "appeal";
  });
  const visible = showAll ? filtered : filtered.slice(0, 8);

  const dueLabel = run.id === DEMO_RUN_ID ? DEMO_DUE_LABEL : "no due date set";

  const columns: Column<RosterRow>[] = [
    { key: "student", header: "Student", render: (r) => r.student?.name ?? <span className="text-muted">Unassigned</span> },
    { key: "version", header: "Version", render: (r) => r.variant.id },
    { key: "ds", header: "Domain / stakeholder", render: (r) => r.domainStakeholder },
    { key: "ease", header: "Reading ease", render: (r) => r.readingEase.toFixed(1) },
    { key: "status", header: "Status", render: (r) => statusCell(r.status) },
    { key: "score", header: "Score", render: (r) => r.scoreLabel },
    {
      key: "evidence",
      header: "Evidence",
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
              Issue
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

  return (
    <div className="va-page" style={{ gap: 22 }}>
      <div className="va-tiles">
        <StatTile kicker="Released" value={stats?.released ?? 0} sub="one version per student" />
        <StatTile kicker="Submitted" value={stats?.submitted ?? 0} sub={dueLabel} />
        <StatTile kicker="Graded" value={stats?.graded ?? 0} sub="same rubric throughout" />
        <StatTile
          kicker="Difficulty appeals"
          value={stats?.appeals ?? 0}
          sub={stats?.appealNote ?? "none open"}
          color={stats && stats.appeals > 0 ? "fail" : undefined}
        />
      </div>

      <Blueprint style={{ padding: "20px 22px" }}>
        <div className="va-row-flex" style={{ gap: 12, marginBottom: 10, flexWrap: "wrap" }}>
          <h6 style={{ margin: 0 }}>Who got which version</h6>
          <span className="va-muted-12">Click a row to open it with the rubric</span>
          <div style={{ marginLeft: "auto", display: "flex", gap: 8, alignItems: "center" }}>
            <SegChoice<Filter>
              name="roster-filter"
              value={filter}
              onChange={(v) => {
                setFilter(v);
                setShowAll(false);
              }}
              options={[
                { value: "all", label: "All" },
                { value: "submitted", label: "Submitted" },
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
    </div>
  );
}
