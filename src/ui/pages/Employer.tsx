import { useEffect, useMemo, useState, type ChangeEvent, type FormEvent } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Blueprint, BlueprintButton, CopyField, DataTable, Field, Pill, Stamp, StatTile, type Column, type PillGate, type StatColor } from "@ui/components";
import { useWorkspace } from "@lib/store/workspace";
import { blueprintRowsForEmployer, employerStats, evidenceRows, type BlueprintValidationStatus, type EmployerBlueprintRow, type EvidenceRow } from "@lib/store/selectors";
import { decodePackage, downloadJson, readFragmentParam, readJsonFile, reviewLink } from "@lib/share";
import type { EmployerPartner, EmployerValidation, ReviewResult } from "@shared/types";

const RED = "#8d4a3c";
const GREEN = "#3d6b4d";

const STATUS: Record<BlueprintValidationStatus, { text: string; gate: PillGate }> = {
  validated: { text: "Validated", gate: "pass" },
  "changes-requested": { text: "Changes requested", gate: "watch" },
  declined: { text: "Declined", gate: "fail" },
  pending: { text: "Pending", gate: "watch" },
};

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

function pct(x: number): string {
  return `${Math.round(x * 100)}%`;
}

function satisfactionMean(v: EmployerValidation): number | null {
  const s = v.satisfaction;
  if (!s) return null;
  return Math.round(((s.realism + s.rubricFit + s.fairness + s.trust + s.adoptionIntent) / 5) * 10) / 10;
}

/** Accept a full result link, a bare `#result=…` fragment, or the raw encoded string. */
function extractResultToken(input: string): string | null {
  const t = input.trim();
  if (!t) return null;
  const hashIdx = t.indexOf("#");
  const frag = hashIdx >= 0 ? t.slice(hashIdx + 1) : t;
  const fromParams = new URLSearchParams(frag).get("result");
  if (fromParams) return fromParams;
  if (/^[du]:/.test(t)) return t;
  return null;
}

export default function Employer() {
  const ws = useWorkspace();
  const navigate = useNavigate();
  const location = useLocation();

  const stats = useMemo(() => employerStats(ws), [ws]);
  const rows = useMemo(() => blueprintRowsForEmployer(ws), [ws]);
  const evidence = useMemo(() => evidenceRows(ws), [ws]);
  const history = useMemo(() => [...ws.employerValidations].sort((a, b) => b.reviewedAt.localeCompare(a.reviewedAt)), [ws.employerValidations]);
  const sectors = useMemo(() => {
    const fromBlueprints = ws.blueprints.flatMap((b) => b.surfaceDimensions.find((d) => d.key === "domain")?.values ?? []);
    const fromPartners = ws.employerPartners.map((p) => p.sector);
    return Array.from(new Set([...fromBlueprints, ...fromPartners].map((s) => s.trim()).filter(Boolean)));
  }, [ws.blueprints, ws.employerPartners]);

  // ---- add partner form ----
  const [showAdd, setShowAdd] = useState(false);
  const [org, setOrg] = useState("");
  const [sector, setSector] = useState("");
  const [otherSector, setOtherSector] = useState("");
  const [contactName, setContactName] = useState("");
  const [contactRole, setContactRole] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [addError, setAddError] = useState<string | null>(null);

  const submitPartner = (e: FormEvent) => {
    e.preventDefault();
    const finalSector = sector === "__other" ? otherSector.trim() : sector.trim();
    if (!org.trim() || !finalSector) {
      setAddError("Organisation and sector are required.");
      return;
    }
    try {
      ws.addPartner({
        organisation: org.trim(),
        sector: finalSector,
        contactName: contactName.trim() || undefined,
        contactRole: contactRole.trim() || undefined,
        contactEmail: contactEmail.trim() || undefined,
      });
      setOrg(""); setSector(""); setOtherSector(""); setContactName(""); setContactRole(""); setContactEmail("");
      setAddError(null);
      setShowAdd(false);
    } catch (err) {
      setAddError(err instanceof Error ? err.message : String(err));
    }
  };

  // ---- review links ----
  const [linkPartner, setLinkPartner] = useState<Record<string, string>>({});
  const [links, setLinks] = useState<Record<string, string>>({});
  const [linkError, setLinkError] = useState<string | null>(null);

  const copyLink = async (bpId: string) => {
    try {
      const partnerId = linkPartner[bpId] || null;
      const pkg = ws.buildReviewPackage(bpId, partnerId);
      const url = await reviewLink(pkg);
      setLinks((l) => ({ ...l, [bpId]: url }));
      setLinkError(null);
    } catch (err) {
      setLinkError(err instanceof Error ? err.message : String(err));
    }
  };

  const downloadPackage = (row: EmployerBlueprintRow) => {
    const partnerId = linkPartner[row.blueprint.id] || null;
    const pkg = ws.buildReviewPackage(row.blueprint.id, partnerId);
    const slug = row.blueprint.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
    downloadJson(pkg, `varia-review-${slug}`);
  };

  // ---- bring in a result ----
  const [resultText, setResultText] = useState("");
  const [applied, setApplied] = useState<EmployerValidation | null>(null);
  const [resultError, setResultError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const applyToken = async (token: string) => {
    setBusy(true);
    try {
      const result = await decodePackage<ReviewResult>(token);
      const v = ws.applyReviewResult(result);
      setApplied(v);
      setResultError(null);
      setResultText("");
    } catch (err) {
      setApplied(null);
      setResultError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const applyPasted = () => {
    const token = extractResultToken(resultText);
    if (!token) {
      setResultError("Paste the full result link, or the encoded string that starts with d: or u:.");
      return;
    }
    void applyToken(token);
  };

  const applyFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setBusy(true);
    try {
      const result = await readJsonFile<ReviewResult>(file);
      const v = ws.applyReviewResult(result);
      setApplied(v);
      setResultError(null);
    } catch (err) {
      setApplied(null);
      setResultError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  // Runs on mount and whenever only the hash changes (pasting a result link into
  // the address bar while already on this page does not remount it).
  useEffect(() => {
    const token = readFragmentParam("result");
    if (!token) return;
    // Clear the hash through the router so a later identical result link still registers as a change.
    navigate({ pathname: location.pathname, search: location.search }, { replace: true });
    void applyToken(token);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.hash]);

  // ---- columns ----
  const partnerColumns: Column<EmployerPartner>[] = [
    { key: "organisation", header: "Organisation", render: (p) => <span className="va-heading-15">{p.organisation}</span> },
    { key: "sector", header: "Sector" },
    {
      key: "contact",
      header: "Contact",
      render: (p) =>
        p.contactName ? (
          <span>
            {p.contactName}
            {p.contactRole ? <span className="text-muted"> · {p.contactRole}</span> : null}
            {p.contactEmail ? <span className="text-muted va-muted-12"> · {p.contactEmail}</span> : null}
          </span>
        ) : (
          <span className="text-muted">—</span>
        ),
    },
    {
      key: "adopted",
      header: "Adopted evidence records",
      render: (p) => (
        <label style={{ display: "inline-flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
          <input type="checkbox" checked={p.adoptedEvidenceRecords} onChange={(e) => ws.setPartnerAdopted(p.id, e.target.checked)} />
          <span className="va-muted-12">{p.adoptedEvidenceRecords ? `Adopted ${fmtDate(p.adoptedAt)}` : "Not yet"}</span>
        </label>
      ),
    },
    {
      key: "remove",
      header: "",
      width: "6%",
      align: "right",
      render: (p) => (
        <button type="button" className="btn btn-ghost" aria-label={`Remove ${p.organisation}`} onClick={() => ws.removePartner(p.id)}>
          ×
        </button>
      ),
    },
  ];

  const blueprintColumns: Column<EmployerBlueprintRow>[] = [
    {
      key: "name",
      header: "Blueprint",
      render: (r) => (
        <span>
          <span className="va-heading-15">{r.blueprint.name}</span>
          {r.blueprint.code ? <span className="text-muted va-muted-12"> · {r.blueprint.code}</span> : null}
        </span>
      ),
    },
    { key: "status", header: "Status", render: (r) => <Pill gate={STATUS[r.status].gate}>{STATUS[r.status].text}</Pill> },
    {
      key: "latest",
      header: "Latest review",
      render: (r) =>
        r.latest ? (
          <span>
            {r.latest.reviewerName}
            <span className="text-muted"> · {r.partnerName ?? r.latest.organisation} · {fmtDate(r.latest.reviewedAt)}</span>
          </span>
        ) : (
          <span className="text-muted">No employer review yet</span>
        ),
    },
    { key: "samples", header: "Samples", align: "right", render: (r) => String(r.sampleCount) },
    {
      key: "actions",
      header: "Actions",
      width: "38%",
      render: (r) => {
        const id = r.blueprint.id;
        return (
          <div className="va-stack" style={{ gap: 8 }}>
            <div className="va-btn-row" style={{ gap: 8 }}>
              <button type="button" className="btn btn-secondary" onClick={() => navigate(`/review/${id}${linkPartner[id] ? `?partner=${linkPartner[id]}` : ""}`)}>
                Review here
              </button>
              <select
                className="input"
                aria-label="Partner for the review link"
                value={linkPartner[id] ?? ""}
                onChange={(e) => setLinkPartner((m) => ({ ...m, [id]: e.target.value }))}
                style={{ width: "auto", minWidth: 150, padding: "4px 8px" }}
              >
                <option value="">No partner named</option>
                {ws.employerPartners.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.organisation}
                  </option>
                ))}
              </select>
              <button type="button" className="btn btn-secondary" onClick={() => void copyLink(id)}>
                Copy review link
              </button>
              <button type="button" className="btn btn-ghost" onClick={() => downloadPackage(r)}>
                Download package
              </button>
            </div>
            {links[id] ? (
              <CopyField label="Review link" value={links[id]} hint="The whole assessment travels inside the link. No student names are included." />
            ) : null}
          </div>
        );
      },
    },
  ];

  const evidenceColumns: Column<EvidenceRow>[] = [
    { key: "id", header: "Record", render: (r) => <span className="va-heading-15">{r.record.id}</span> },
    { key: "student", header: "Student", render: (r) => r.student?.name ?? r.record.studentId },
    { key: "blueprint", header: "Blueprint", render: (r) => r.blueprintName },
    { key: "issued", header: "Issued", render: (r) => fmtDate(r.issuedAt) },
    {
      key: "validations",
      header: "Employer stamps",
      render: (r) => (r.record.validationIds.length ? <Stamp gate="pass">{r.record.validationIds.length} validation{r.record.validationIds.length === 1 ? "" : "s"}</Stamp> : <span className="text-muted">None at issue</span>),
    },
    {
      key: "open",
      header: "",
      align: "right",
      render: (r) => (
        <a className="btn btn-secondary" href={`/evidence/${r.record.variantId}`} target="_blank" rel="noopener noreferrer" style={{ textDecoration: "none" }}>
          Open record
        </a>
      ),
    },
  ];

  const validatedColor: StatColor = stats.validatedPct >= stats.goals.validatedPct ? "pass" : "watch";
  const adoptedColor: StatColor = stats.adoptedPct >= stats.goals.adoptedPct ? "pass" : "watch";

  return (
    <div className="va-page">
      <p className="text-muted" style={{ margin: 0, maxWidth: "76ch", fontSize: 13.5, lineHeight: 1.6 }}>
        This page carries the three employer outcomes the AI Assessment Grant requires. Employers validate the blueprint once and every
        student's version inherits it. Partners who accept evidence records for hiring or promotion are counted as adopting the
        portable skill indicator. Each review ends with a five-question satisfaction survey.
      </p>

      <div className="va-tiles" style={{ gridTemplateColumns: "repeat(4, 1fr)" }}>
        <StatTile
          kicker="Validated by employer partners"
          value={pct(stats.validatedPct)}
          sub={`${stats.validated} of ${stats.blueprints} blueprints · goal ${pct(stats.goals.validatedPct)}`}
          color={validatedColor}
        />
        <StatTile
          kicker="Partners adopting evidence records"
          value={pct(stats.adoptedPct)}
          sub={`${stats.adopted} of ${stats.partners} partners · goal ${pct(stats.goals.adoptedPct)}`}
          color={adoptedColor}
        />
        <StatTile
          kicker="Adoption observed"
          value={pct(stats.observedAdoptedPct)}
          sub={`partners that verified a record · not a checkbox`}
          color={stats.observedAdoptedPct >= stats.goals.adoptedPct ? "pass" : "watch"}
        />
        <StatTile
          kicker="Employer satisfaction"
          value={stats.satisfactionMean == null ? "—" : `${stats.satisfactionMean.toFixed(1)} / ${stats.goals.satisfactionScale}`}
          sub={stats.responses === 0 ? "no survey responses yet" : `${stats.responses} response${stats.responses === 1 ? "" : "s"}`}
        />
      </div>

      <Blueprint style={{ padding: "20px 22px" }}>
        <div className="va-row-flex" style={{ marginBottom: 12 }}>
          <h6 style={{ margin: 0 }}>Employer partners</h6>
          <span className="text-muted va-muted-12">Tick the box once a partner has accepted an evidence record for hiring or promotion.</span>
          <button type="button" className="btn btn-ghost" style={{ marginLeft: "auto" }} onClick={() => setShowAdd((s) => !s)}>
            {showAdd ? "Cancel" : "+ Partner"}
          </button>
        </div>
        <DataTable columns={partnerColumns} rows={ws.employerPartners} rowKey={(p) => p.id} empty="No partners yet. Add the employers connected to this course." />
        {showAdd ? (
          <form onSubmit={submitPartner} className="va-surface-box" style={{ marginTop: 14 }}>
            <div className="va-two" style={{ gap: 14 }}>
              <Field label="Organisation">
                <input className="input" value={org} onChange={(e) => setOrg(e.target.value)} required />
              </Field>
              <Field label="Sector">
                <select className="input" value={sector} onChange={(e) => setSector(e.target.value)} required>
                  <option value="">Choose…</option>
                  {sectors.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                  <option value="__other">Other</option>
                </select>
              </Field>
              {sector === "__other" ? (
                <Field label="Other sector">
                  <input className="input" value={otherSector} onChange={(e) => setOtherSector(e.target.value)} />
                </Field>
              ) : null}
              <Field label="Contact name">
                <input className="input" value={contactName} onChange={(e) => setContactName(e.target.value)} />
              </Field>
              <Field label="Contact role">
                <input className="input" value={contactRole} onChange={(e) => setContactRole(e.target.value)} />
              </Field>
              <Field label="Contact email">
                <input className="input" type="email" value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} />
              </Field>
            </div>
            {addError ? <div style={{ color: RED, fontSize: 12.5, marginTop: 8 }}>{addError}</div> : null}
            <div className="va-btn-row" style={{ marginTop: 12 }}>
              <BlueprintButton type="submit">Add partner</BlueprintButton>
            </div>
          </form>
        ) : null}
      </Blueprint>

      <Blueprint style={{ padding: "20px 22px" }}>
        <div className="va-row-flex" style={{ marginBottom: 12 }}>
          <h6 style={{ margin: 0 }}>Blueprints and their validation</h6>
          <span className="text-muted va-muted-12">Review in this browser, or send a self-contained link that needs no account.</span>
        </div>
        <DataTable columns={blueprintColumns} rows={rows} rowKey={(r) => r.blueprint.id} empty="No blueprints yet. Load an assessment first." />
        {linkError ? <div style={{ color: RED, fontSize: 12.5, marginTop: 8 }}>{linkError}</div> : null}
      </Blueprint>

      <div className="va-two">
        <Blueprint style={{ padding: "20px 22px" }}>
          <h6 style={{ margin: "0 0 6px" }}>Bring in a result</h6>
          <p className="text-muted" style={{ margin: "0 0 12px", fontSize: 12.5, lineHeight: 1.5 }}>
            When a reviewer finishes from a link, they send back a result link or a JSON file. Paste or upload it here.
          </p>
          <textarea
            className="input va-textarea"
            style={{ minHeight: 84, fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", fontSize: 12 }}
            placeholder="Paste the result link here…"
            value={resultText}
            onChange={(e) => setResultText(e.target.value)}
            aria-label="Result link"
          />
          <div className="va-btn-row" style={{ marginTop: 10 }}>
            <BlueprintButton type="button" onClick={applyPasted} disabled={busy || !resultText.trim()}>
              Apply result
            </BlueprintButton>
            <label className="btn btn-secondary" style={{ cursor: "pointer" }}>
              Upload result file
              <input type="file" accept="application/json,.json" onChange={(e) => void applyFile(e)} style={{ display: "none" }} />
            </label>
          </div>
          {resultError ? <div style={{ color: RED, fontSize: 12.5, marginTop: 8 }}>{resultError}</div> : null}
          {applied ? (
            <div style={{ color: GREEN, fontSize: 13, marginTop: 8 }}>
              Applied: {applied.organisation} {applied.status === "validated" ? "validated" : applied.status === "changes-requested" ? "requested changes to" : "declined"}{" "}
              <strong>{applied.blueprintName}</strong>, reviewed by {applied.reviewerName} on {fmtDate(applied.reviewedAt)}.
            </div>
          ) : null}
        </Blueprint>

        <Blueprint style={{ padding: "20px 22px" }}>
          <h6 style={{ margin: "0 0 10px" }}>Validation history</h6>
          {history.length === 0 ? (
            <p className="text-muted" style={{ margin: 0, fontSize: 13 }}>
              No employer reviews recorded yet.
            </p>
          ) : (
            <div className="va-stack" style={{ gap: 12 }}>
              {history.map((v) => {
                const mean = satisfactionMean(v);
                return (
                  <div key={v.id} style={{ fontSize: 13, lineHeight: 1.5 }}>
                    <div className="va-row-flex" style={{ flexWrap: "wrap", gap: 8 }}>
                      <span className="va-heading-15">{v.organisation}</span>
                      <span className="text-muted">· {v.blueprintName}</span>
                      <Pill gate={STATUS[v.status].gate}>{STATUS[v.status].text}</Pill>
                      {v.attested ? <Stamp gate="pass">Attested</Stamp> : null}
                    </div>
                    <div className="text-muted va-muted-12">
                      {v.reviewerName}
                      {v.reviewerRole ? ` · ${v.reviewerRole}` : ""}
                      {v.reviewerEmail ? ` · ${v.reviewerEmail}` : ""} · {fmtDate(v.reviewedAt)}
                      {mean != null ? ` · satisfaction ${mean.toFixed(1)} / 5` : " · no survey"}
                      {v.source === "imported" ? " · imported" : ""}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Blueprint>
      </div>

      <Blueprint style={{ padding: "20px 22px" }}>
        <div className="va-row-flex" style={{ marginBottom: 12 }}>
          <h6 style={{ margin: 0 }}>Evidence records</h6>
          <span className="text-muted va-muted-12">The portable skill indicator: task, rubric, score, integrity report and employer stamps in one document.</span>
        </div>
        <DataTable columns={evidenceColumns} rows={evidence} rowKey={(r) => r.record.id} empty="No evidence records issued yet. Grade a submission, then issue one from the Grade page." />
      </Blueprint>
    </div>
  );
}
