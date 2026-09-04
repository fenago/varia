import { useEffect, useMemo, useState, type ChangeEvent, type FormEvent } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Blueprint, BlueprintButton, CopyField, DataTable, Field, Funnel, Pill, SkillTags, Stamp, StatTile, type Column, type PillGate, type StatColor } from "@ui/components";
import { Link } from "react-router-dom";
import { useWorkspace } from "@lib/store/workspace";
import { activeBlueprint, blueprintRowsForEmployer, employerFunnel, employerStats, evidenceRows, skillByKey, type BlueprintValidationStatus, type EmployerBlueprintRow, type EvidenceRow } from "@lib/store/selectors";
import { decodePackage, downloadJson, readFragmentParam, readJsonFile, reviewLink } from "@lib/share";
import type { EmployerChallenge, EmployerPartner, EmployerValidation, ReviewResult } from "@shared/types";

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

  // ---- challenges ----
  const funnel = useMemo(() => employerFunnel(ws), [ws]);
  const active = activeBlueprint(ws);
  const challenges = useMemo(() => [...(ws.challenges ?? [])].sort((a, b) => b.contributedAt.localeCompare(a.contributedAt)), [ws.challenges]);
  const skills = ws.skills ?? [];
  const [showChallenge, setShowChallenge] = useState(false);
  const [cPartner, setCPartner] = useState("");
  const [cTitle, setCTitle] = useState("");
  const [cBrief, setCBrief] = useState("");
  const [cDomain, setCDomain] = useState("");
  const [cRole, setCRole] = useState("");
  const [cDeliverable, setCDeliverable] = useState("");
  const [cSkills, setCSkills] = useState<string[]>([]);
  const [newSkill, setNewSkill] = useState("");
  const [cError, setCError] = useState<string | null>(null);
  const [cNotice, setCNotice] = useState<string | null>(null);

  const toggleSkill = (key: string) => setCSkills((ks) => (ks.includes(key) ? ks.filter((k) => k !== key) : [...ks, key]));
  const addNewSkill = () => {
    const label = newSkill.trim();
    if (!label) return;
    const tag = ws.addSkill({ label, source: "employer" });
    setCSkills((ks) => (ks.includes(tag.key) ? ks : [...ks, tag.key]));
    setNewSkill("");
  };
  const submitChallenge = (e: FormEvent) => {
    e.preventDefault();
    const partner = ws.employerPartners.find((p) => p.id === cPartner);
    if (!partner) { setCError("Choose the employer partner contributing this challenge."); return; }
    if (!cTitle.trim() || !cBrief.trim() || !cDomain.trim() || !cRole.trim()) { setCError("Title, brief, domain and stakeholder role are required."); return; }
    try {
      const ch = ws.addChallenge({
        partnerId: partner.id,
        title: cTitle.trim(),
        brief: cBrief.trim(),
        domain: cDomain.trim(),
        stakeholderRole: cRole.trim(),
        deliverable: cDeliverable.trim() || "As described in the brief",
        skillKeys: cSkills,
        contributedBy: partner.contactName?.trim() || "Employer partner",
      });
      setCNotice(`Challenge "${ch.title}" contributed by ${ch.organisation}.`);
      setCTitle(""); setCBrief(""); setCDomain(""); setCRole(""); setCDeliverable(""); setCSkills([]); setCPartner("");
      setCError(null);
      setShowChallenge(false);
    } catch (err) {
      setCError(err instanceof Error ? err.message : String(err));
    }
  };
  const useInActive = (ch: EmployerChallenge) => {
    if (!active) return;
    try {
      ws.linkChallengeToBlueprint(ch.id, active.id);
      setCNotice(`"${ch.title}" now feeds the scenario bank of ${active.name}.`);
      setCError(null);
    } catch (err) {
      setCError(err instanceof Error ? err.message : String(err));
    }
  };
  const blueprintName = (id: string) => ws.blueprints.find((b) => b.id === id)?.name ?? id;

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

  const challengeColumns: Column<EmployerChallenge>[] = [
    { key: "title", header: "Challenge", render: (c) => <span className="va-heading-15">{c.title}</span> },
    { key: "org", header: "Organisation", render: (c) => c.organisation },
    { key: "domain", header: "Domain · stakeholder", render: (c) => `${c.domain} · ${c.stakeholderRole}` },
    { key: "skills", header: "Skills", render: (c) => <SkillTags skills={c.skillKeys.map((k) => skillByKey(ws, k) ?? k)} max={3} /> },
    { key: "bps", header: "Used in", render: (c) => (c.blueprintIds.length ? c.blueprintIds.map(blueprintName).join(", ") : <span className="text-muted">—</span>) },
    { key: "status", header: "Status", render: (c) => <Pill gate={c.status === "active" ? "pass" : "watch"}>{c.status === "active" ? "Active" : "Retired"}</Pill> },
    {
      key: "actions",
      header: "",
      align: "right",
      render: (c) => {
        const linked = !!active && c.blueprintIds.includes(active.id);
        return (
          <span className="va-btn-row" style={{ justifyContent: "flex-end", gap: 6 }}>
            <button
              type="button"
              className="btn btn-secondary"
              disabled={!active || linked || c.status !== "active"}
              title={!active ? "No active blueprint" : linked ? `Already used in ${active.name}` : `Add this challenge's domain, stakeholder and scenario to ${active.name}`}
              onClick={() => useInActive(c)}
            >
              {linked ? "In use" : "Use in blueprint"}
            </button>
            {c.status === "active" && (
              <button type="button" className="btn btn-ghost" onClick={() => ws.retireChallenge(c.id)}>Retire</button>
            )}
          </span>
        );
      },
    },
  ];

  return (
    <div className="va-page">
      <div>
        <div className="va-row-flex" style={{ alignItems: "baseline", marginBottom: 10 }}>
          <p style={{ margin: 0, fontSize: 15, lineHeight: 1.5 }}>From an employer's problem to a hire, in six measurable steps.</p>
          <Link to="/talent" style={{ marginLeft: "auto", fontSize: 13, color: "var(--color-accent-700)" }}>Open a talent view →</Link>
        </div>
        <Funnel
          steps={[
            { label: "Challenges contributed", value: funnel.challenges },
            { label: "Students who completed one", value: funnel.completed },
            { label: "Work samples shared", value: funnel.shared },
            { label: "Endorsed", value: funnel.endorsed },
            { label: "Interviewed", value: funnel.interviewed },
            { label: "Hired", value: funnel.hired },
          ]}
        />
      </div>

      <Blueprint style={{ padding: "20px 22px" }}>
        <div className="va-row-flex" style={{ marginBottom: 6 }}>
          <h6 style={{ margin: 0 }}>Challenges</h6>
          <span className="text-muted" style={{ fontSize: 12 }}>One real problem from an employer becomes a different version for every student.</span>
          <button type="button" className="btn btn-secondary" style={{ marginLeft: "auto" }} onClick={() => setShowChallenge((v) => !v)}>
            {showChallenge ? "Close" : "Contribute a challenge"}
          </button>
        </div>
        {cNotice && <div style={{ fontSize: 12.5, color: GREEN, margin: "6px 0" }}>{cNotice}</div>}
        {cError && <div style={{ fontSize: 12.5, color: RED, margin: "6px 0" }}>{cError}</div>}
        {showChallenge && (
          <form onSubmit={submitChallenge} style={{ margin: "12px 0 16px", display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)", gap: 12 }} className="va-split">
            <Field label="Employer partner">
              <select className="input" value={cPartner} onChange={(e: ChangeEvent<HTMLSelectElement>) => setCPartner(e.target.value)} required>
                <option value="">Choose a partner…</option>
                {ws.employerPartners.map((p) => (
                  <option key={p.id} value={p.id}>{p.organisation} · {p.sector}</option>
                ))}
              </select>
            </Field>
            <Field label="Title">
              <input className="input" value={cTitle} onChange={(e) => setCTitle(e.target.value)} placeholder="Audit our loan-default classifier" required />
            </Field>
            <div style={{ gridColumn: "1 / -1" }}>
              <Field label="The brief, in your words">
                <textarea className="input" style={{ minHeight: 96 }} value={cBrief} onChange={(e) => setCBrief(e.target.value)} placeholder="Describe the problem the way you would brief a new hire" required />
              </Field>
            </div>
            <Field label="Domain">
              <input className="input" value={cDomain} onChange={(e) => setCDomain(e.target.value)} placeholder="Lending" list="va-domains" required />
              <datalist id="va-domains">{sectors.map((sct) => <option key={sct} value={sct} />)}</datalist>
            </Field>
            <Field label="Stakeholder role">
              <input className="input" value={cRole} onChange={(e) => setCRole(e.target.value)} placeholder="Risk officer" required />
            </Field>
            <div style={{ gridColumn: "1 / -1" }}>
              <Field label="What you would want back">
                <input className="input" value={cDeliverable} onChange={(e) => setCDeliverable(e.target.value)} placeholder="A structured audit with prioritised recommendations" />
              </Field>
            </div>
            <div style={{ gridColumn: "1 / -1" }}>
              <div className="va-kicker" style={{ marginBottom: 6 }}>Skills this exercises</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "6px 14px", fontSize: 13.5 }}>
                {skills.map((sk) => (
                  <label key={sk.key} style={{ display: "inline-flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
                    <input type="checkbox" checked={cSkills.includes(sk.key)} onChange={() => toggleSkill(sk.key)} />
                    {sk.label}
                  </label>
                ))}
              </div>
              <div className="va-btn-row" style={{ marginTop: 8, alignItems: "center" }}>
                <input className="input" style={{ maxWidth: 280 }} value={newSkill} onChange={(e) => setNewSkill(e.target.value)} placeholder="Add a skill your organisation names" onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addNewSkill(); } }} />
                <button type="button" className="btn btn-secondary" onClick={addNewSkill} disabled={!newSkill.trim()}>Add a skill</button>
              </div>
            </div>
            <div style={{ gridColumn: "1 / -1" }} className="va-btn-row">
              <BlueprintButton type="submit">Contribute challenge</BlueprintButton>
              <span className="text-muted" style={{ fontSize: 12 }}>Stored in this browser; nothing is sent anywhere.</span>
            </div>
          </form>
        )}
        <DataTable<EmployerChallenge> columns={challengeColumns} rows={challenges} rowKey={(c) => c.id} empty="No challenges yet. Contribute the first one." />
      </Blueprint>

      <p className="text-muted" style={{ margin: 0, maxWidth: "76ch", fontSize: 13.5, lineHeight: 1.6 }}>
        This page carries the three employer outcomes the AI Assessment Grant requires. Employers validate the blueprint once and every
        student's version inherits it. Partners who accept evidence records for hiring or promotion are counted as adopting the
        portable skill indicator. Each review ends with a five-question satisfaction survey.
      </p>

      <div className="va-tiles" style={{ gridTemplateColumns: "repeat(5, 1fr)" }}>
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
        <StatTile
          kicker="Hires logged"
          value={String(stats.hires)}
          sub="from outcome events on records"
          color={stats.hires > 0 ? "pass" : undefined}
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
