import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Blueprint, DataTable, Pill, SegChoice, StatTile, type Column, type PillGate } from "@ui/components";
import { useWorkspace } from "@lib/store/workspace";
import { auditNewestFirst, consoleRows, consoleStats, currentThresholds, employerStats, outcomeStats, strategyLabel } from "@lib/store/selectors";
import { THRESHOLD_ATTRIBUTION } from "@lib/store/seed";
import { metricsVersionLabel } from "@shared/thresholds";
import { PROPERTY_LABELS } from "@shared/thresholds";
import type { InstitutionSet, InstitutionSetStatus, Property } from "@shared/types";

type Filter = "all" | "flagged" | "awaiting";
const RED = "#8d4a3c";

const STATUS: Record<InstitutionSetStatus, { text: string; gate: PillGate }> = {
  cleared: { text: "Cleared", gate: "pass" },
  "over-threshold": { text: "Over threshold", gate: "fail" },
  "awaiting-sign-off": { text: "Awaiting sign-off", gate: "watch" },
  blocked: { text: "Blocked", gate: "fail" },
};

const FAILING_LABEL: Record<Property, string> = {
  p1: "Diversity",
  p2: "Construct equivalence",
  p3: "Rubric stability",
  p4: "Difficulty parity",
};

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function formatAudit(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${d.getDate()} ${MONTHS[d.getMonth()]}, ${hh}:${mm}`;
}

type NumericKey = "p1Cosine" | "p2Equivalence" | "p4FleschSigma";

export default function Console() {
  const ws = useWorkspace();
  const navigate = useNavigate();
  const [filter, setFilter] = useState<Filter>("all");
  const [showAll, setShowAll] = useState(false);
  const [editing, setEditing] = useState<NumericKey | null>(null);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);

  const stats = useMemo(() => consoleStats(ws), [ws]);
  const emp = useMemo(() => employerStats(ws), [ws]);
  const outc = useMemo(() => outcomeStats(ws), [ws]);
  const rows = useMemo(() => consoleRows(ws), [ws]);
  const audit = useMemo(() => auditNewestFirst(ws), [ws]);
  const thresholds = currentThresholds(ws);

  const filtered = rows.filter((r) => {
    if (filter === "all") return true;
    if (filter === "flagged") return r.status === "over-threshold" || r.status === "blocked";
    return r.status === "awaiting-sign-off";
  });

  const columns: Column<InstitutionSet>[] = [
    { key: "course", header: "Course · assessment", render: (r) => `${r.course} · ${r.assessment}` },
    { key: "instructor", header: "Instructor" },
    { key: "n", header: "N", render: (r) => r.n },
    { key: "strategy", header: "Strategy", render: (r) => strategyLabel(r.strategy) },
    { key: "joint", header: "J", render: (r) => r.joint.toFixed(2) },
    {
      key: "failing",
      header: "Failing check",
      render: (r) => (r.failingChecks.length ? r.failingChecks.map((p) => FAILING_LABEL[p]).join(" · ") : "—"),
    },
    { key: "status", header: "Status", render: (r) => <Pill gate={STATUS[r.status].gate}>{STATUS[r.status].text}</Pill> },
  ];

  const thresholdRows: { property: Property; label: string; key: NumericKey | null; display: string }[] = [
    { property: "p1", label: "Surface diversity (cosine)", key: "p1Cosine", display: `≤ ${thresholds.p1Cosine.toFixed(2)}` },
    { property: "p2", label: "Construct equivalence", key: "p2Equivalence", display: `≥ ${thresholds.p2Equivalence.toFixed(2)}` },
    { property: "p3", label: "Rubric stability", key: null, display: "Advisory — proxy metric" },
    { property: "p4", label: "Difficulty parity (σ Flesch)", key: "p4FleschSigma", display: `≤ ${thresholds.p4FleschSigma.toFixed(1)}` },
  ];

  /** Mockup attribution, unless a later version changed this property — then whoever set that version. */
  const setByFor = (key: NumericKey | null, property: Property): string => {
    if (!key) return THRESHOLD_ATTRIBUTION[property];
    // Versions 1–2 are the seeded institution history; anything later was set from this console.
    const versions = ws.thresholds;
    for (let i = versions.length - 1; i > 0; i--) {
      if (versions[i].version > 2 && versions[i][key] !== versions[i - 1][key]) return versions[i].setBy;
    }
    return THRESHOLD_ATTRIBUTION[property];
  };

  const beginEdit = (key: NumericKey) => {
    setError(null);
    setEditing(key);
    setDraft(String(thresholds[key]));
  };

  const saveEdit = () => {
    if (!editing) return;
    const v = Number(draft);
    if (!Number.isFinite(v) || v < 0) {
      setError("Enter a non-negative number.");
      return;
    }
    if (editing === "p2Equivalence" && v > 1) {
      setError("Construct equivalence is on a 0–1 scale.");
      return;
    }
    try {
      ws.setThreshold({ [editing]: v }, "Assessment office");
      setEditing(null);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <div className="va-page" style={{ gap: 22 }}>
      <div className="va-tiles">
        <StatTile kicker="Variant sets in use" value={stats.inUse} sub={`across ${stats.courses} courses, ${stats.departments} departments`} />
        <StatTile kicker="Passing all four" value={stats.passingAll} sub={`${stats.passingPct}% of released sets`} color="pass" />
        <StatTile kicker="Released over threshold" value={stats.overThreshold} sub="each with a recorded reason" color="fail" />
        <StatTile kicker="Unreviewed > 14 days" value={stats.unreviewed} sub="needs a specialist sign-off" color="watch" />
      </div>

      <div>
        <div className="va-row-flex" style={{ alignItems: "baseline", gap: 12, marginBottom: 10 }}>
          <div className="va-kicker">Employer outcomes</div>
          <Link to="/employer" className="va-muted-12" style={{ marginLeft: "auto" }}>
            Manage on Employer validation →
          </Link>
        </div>
        <div className="va-tiles" style={{ gridTemplateColumns: "repeat(4, 1fr)" }}>
          <StatTile
            kicker="Validated by employer partners"
            value={`${Math.round(emp.validatedPct * 100)}%`}
            sub={`${emp.validated} of ${emp.blueprints} blueprints · goal ${Math.round(emp.goals.validatedPct * 100)}%`}
            color={emp.validatedPct >= emp.goals.validatedPct ? "pass" : "watch"}
          />
          <StatTile
            kicker="Partners adopting evidence records"
            value={`${Math.round(emp.adoptedPct * 100)}%`}
            sub={`${emp.adopted} of ${emp.partners} partners · goal ${Math.round(emp.goals.adoptedPct * 100)}%`}
            color={emp.adoptedPct >= emp.goals.adoptedPct ? "pass" : "watch"}
          />
          <StatTile
            kicker="Employer satisfaction"
            value={emp.satisfactionMean == null ? "—" : `${emp.satisfactionMean.toFixed(1)} / ${emp.goals.satisfactionScale}`}
            sub={emp.responses ? `${emp.responses} survey ${emp.responses === 1 ? "response" : "responses"}` : "no responses yet"}
            color={emp.satisfactionMean != null && emp.satisfactionMean >= 4 ? "pass" : "watch"}
          />
          <StatTile
            kicker="Hires logged"
            value={emp.hires}
            sub={emp.hires === 0 ? "none yet · logged by employers or students" : `learner${emp.hires === 1 ? "" : "s"} hired on a shared sample`}
            color={emp.hires > 0 ? "pass" : "watch"}
          />
        </div>
        <div className="va-muted-12" style={{ marginTop: 8 }}>
          Outcomes logged: {outc.interviewed} interviewed · {outc.offered} offered · {outc.hired} hired
          {outc.ramped > 0 ? ` · ${outc.ramped} ramped` : ""}
          {outc.meanOnboardingHours != null ? ` · mean ${outc.meanOnboardingHours} h to productive` : " · no ramp time reported yet"}
        </div>
      </div>

      <Blueprint style={{ padding: "20px 22px" }}>
        <div className="va-row-flex" style={{ gap: 12, marginBottom: 12 }}>
          <h6 style={{ margin: 0 }}>Released variant sets</h6>
          <SegChoice<Filter>
            name="console-filter"
            value={filter}
            onChange={setFilter}
            style={{ marginLeft: "auto" }}
            options={[
              { value: "all", label: "All" },
              { value: "flagged", label: "Flagged" },
              { value: "awaiting", label: "Awaiting sign-off" },
            ]}
          />
        </div>
        <DataTable<InstitutionSet>
          columns={columns}
          rows={showAll ? filtered : filtered.slice(0, 8)}
          rowKey={(r) => r.id}
          onRowClick={(r) => {
            if (r.runId) navigate("/report");
          }}
          empty="No released sets match this filter."
        />
        <div className="va-muted-12" style={{ marginTop: 10, display: "flex", alignItems: "baseline", gap: 12 }}>
          <span>
            Showing {showAll ? filtered.length : Math.min(8, filtered.length)} of {filtered.length}. Rows from this course open their integrity report.
          </span>
          {filtered.length > 8 && (
            <button type="button" className="btn btn-ghost" style={{ marginLeft: "auto" }} onClick={() => setShowAll((s) => !s)}>
              {showAll ? "Show fewer" : "Show all"}
            </button>
          )}
        </div>
      </Blueprint>

      <div className="va-two">
        <Blueprint style={{ padding: "20px 22px" }}>
          <h6 style={{ margin: "0 0 6px" }}>Institution thresholds</h6>
          <div className="va-muted-12" style={{ marginBottom: 10 }}>
            Set against {metricsVersionLabel(currentThresholds(ws).metricsVersion)}. A change of metric definition starts a new threshold version; released sets are never re-scored.
          </div>
          <div className="va-row-flex" style={{ gap: 10, marginBottom: 12, fontSize: 13.5 }}>
            <span>Over-threshold release</span>
            <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={currentThresholds(ws).allowOverThresholdRelease !== false}
                onChange={(e) => ws.setThreshold({ allowOverThresholdRelease: e.target.checked }, "Assessment office")}
              />
              {currentThresholds(ws).allowOverThresholdRelease !== false ? "allowed with a recorded reason" : "blocked by policy"}
            </label>
          </div>
          <table className="table">
            <thead>
              <tr>
                <th>Check</th>
                <th>Threshold</th>
                <th>Set by</th>
                <th style={{ width: 72 }} />
              </tr>
            </thead>
            <tbody>
              {thresholdRows.map((r) => {
                const isEditing = editing !== null && editing === r.key;
                return (
                  <tr key={r.property}>
                    <td title={PROPERTY_LABELS[r.property].tooltip}>{r.label}</td>
                    <td>
                      {isEditing ? (
                        <input
                          className="input"
                          type="number"
                          step={r.key === "p4FleschSigma" ? 0.5 : 0.01}
                          min={0}
                          value={draft}
                          onChange={(e) => setDraft(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") saveEdit();
                            if (e.key === "Escape") setEditing(null);
                          }}
                          style={{ width: 96 }}
                          autoFocus
                        />
                      ) : (
                        r.display
                      )}
                    </td>
                    <td>{setByFor(r.key, r.property)}</td>
                    <td style={{ textAlign: "right" }}>
                      {r.key &&
                        (isEditing ? (
                          <span className="va-btn-row" style={{ gap: 4, justifyContent: "flex-end" }}>
                            <button type="button" className="btn btn-ghost" onClick={saveEdit}>
                              Save
                            </button>
                            <button type="button" className="btn btn-ghost" onClick={() => setEditing(null)}>
                              Cancel
                            </button>
                          </span>
                        ) : (
                          <button type="button" className="btn btn-ghost" onClick={() => beginEdit(r.key!)}>
                            Edit
                          </button>
                        ))}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {error && (
            <div style={{ marginTop: 8, fontSize: 12.5, color: RED }}>
              {error}
            </div>
          )}
          <p className="va-muted-12" style={{ margin: "12px 0 0" }}>
            Thresholds are pre-registered per the benchmark protocol and versioned; changing one does not retroactively re-clear released sets.
          </p>
          <div className="va-muted-115" style={{ marginTop: 6 }}>
            Version {thresholds.version} · set {formatAudit(thresholds.setAt)} · {thresholds.setBy}
          </div>
        </Blueprint>

        <Blueprint style={{ padding: "20px 22px" }}>
          <h6 style={{ margin: "0 0 12px" }}>Audit trail</h6>
          <div className="va-stack" style={{ gap: 13, fontSize: 13, lineHeight: 1.5 }}>
            {audit.length === 0 && <span className="text-muted">Nothing recorded yet.</span>}
            {audit.slice(0, 12).map((e) => (
              <div key={e.id}>
                <div>{e.text}</div>
                <div className="va-muted-115">
                  {formatAudit(e.at)} · {e.actor}
                </div>
              </div>
            ))}
            {audit.length > 12 && <div className="va-muted-115">{audit.length - 12} older events not shown.</div>}
          </div>
        </Blueprint>
      </div>
    </div>
  );
}
