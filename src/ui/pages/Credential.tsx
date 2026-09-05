import { useMemo, useState } from "react";
/* type-scale: applied */
import { Link, useParams, useSearchParams } from "react-router-dom";
import { Blueprint, BlueprintButton, CopyField, Dialog, EmptyState, SkillTags, Stamp, ShareCredential } from "@ui/components";
import { usePageTitle } from "@ui/shell/PageTitleContext";
import { useWorkspace } from "@lib/store/workspace";
import { credentialEligibility, credentialForRecord, endorsementsForRecord, evidenceView } from "@lib/store/selectors";
import { downloadJson } from "@lib/share";
import { MISSING } from "@lib/badges/credential";
import type { IssuedCredential } from "@shared/types";

function fmt(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

/** Where to go to fix each missing condition. */
function fixLink(missing: string, variantId: string, blueprintId: string): { to: string; label: string } {
  if (missing === MISSING.grade || missing === MISSING.suggested) return { to: `/grade/${variantId}`, label: "Grade it" };
  if (missing === MISSING.validation) return { to: `/review/${blueprintId}`, label: "Validate the blueprint" };
  if (missing === MISSING.endorsement) return { to: "/talent", label: "Endorse in the talent view" };
  return { to: `/evidence/${variantId}`, label: "Issue the record" };
}

export default function Credential() {
  const { recordId } = useParams<{ recordId?: string }>();
  const [params] = useSearchParams();
  const asLearner = params.get("as") === "learner";
  const ws = useWorkspace();

  const record = useMemo(() => (recordId ? ws.evidenceRecords.find((r) => r.id === recordId) ?? null : null), [ws, recordId]);
  const view = useMemo(() => (record ? evidenceView(ws, record.variantId) : null), [ws, record]);
  const cred = useMemo(() => (record ? credentialForRecord(ws, record.id) : null), [ws, record]);
  const elig = useMemo(() => (record ? credentialEligibility(ws, record.id) : { eligible: false, missing: [MISSING.record] }), [ws, record]);
  const endorsements = useMemo(() => (record ? endorsementsForRecord(ws, record.id).filter((e) => e.meetsBar) : []), [ws, record]);

  usePageTitle("Verified work sample credential", cred ? cred.id : record ? "Not yet issued" : "Credential");

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [reason, setReason] = useState("");

  if (!recordId || !record || !view) {
    return <EmptyState heading="No record" text="Open a credential from an evidence record, the talent view, or a student portfolio." actionLabel="Go to the roster" onAction={() => (window.location.href = "/roster")} />;
  }

  const issue = async () => {
    setBusy(true);
    setError(null);
    try {
      await ws.issueCredential(record.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const learnerId = record.bridge?.learnerId ?? "L-unknown";
  const holder = asLearner ? view.student.name : learnerId;
  const skills = record.bridge?.workSample?.skills ?? [];
  const link = typeof location !== "undefined" ? `${location.origin}/credential/${record.id}` : `/credential/${record.id}`;

  if (!cred) {
    return (
      <div className="va-page va-page-narrow" style={{ gap: 22 }}>
        <Blueprint style={{ padding: "22px 24px" }}>
          <div className="va-kicker">Credential</div>
          <h3 style={{ margin: "6px 0 8px" }}>{view.blueprint.name}</h3>
          <p style={{ margin: "0 0 12px", fontSize: 16, lineHeight: 1.6, maxWidth: "70ch" }}>
            A credential is issued only when three things are true: the instructor graded the work, an employer validated the blueprint's rubric, and an employer endorsed this sample as meeting their bar. It is an Open Badges 3.0 credential from {view.course.instructor.institution} with the employer's endorsement attached as its own credential.
          </p>
          {elig.eligible ? (
            <div className="va-btn-row">
              <BlueprintButton onClick={issue} disabled={busy}>{busy ? "Issuing…" : "Issue the credential"}</BlueprintButton>
              <span className="text-muted" style={{ fontSize: 14 }}>Signs with the workspace key and records an audit entry.</span>
            </div>
          ) : (
            <>
              <Stamp gate="watch">Not yet eligible</Stamp>
              <ul style={{ margin: "12px 0 0", paddingLeft: 18, display: "flex", flexDirection: "column", gap: 8, fontSize: 15.5 }}>
                {elig.missing.map((m) => {
                  const f = fixLink(m, record.variantId, view.blueprint.id);
                  return (
                    <li key={m}>
                      {m}. <Link to={f.to}>{f.label} →</Link>
                    </li>
                  );
                })}
              </ul>
              {elig.missing.includes(MISSING.suggested) && (
                <p className="text-muted" style={{ margin: "10px 0 0", fontSize: 14 }}>
                  AI-suggested grades never qualify. An instructor must save the grade.
                </p>
              )}
            </>
          )}
          {error && <p style={{ margin: "10px 0 0", color: "#8d4a3c", fontSize: 15 }}>{error}</p>}
        </Blueprint>
      </div>
    );
  }

  const revoked = !!cred.revokedAt;
  const ach = cred.achievementCredential as { id?: string; proof?: { description?: string } };

  return (
    <div className="va-page va-page-narrow" style={{ gap: 22 }}>
      <div className="va-print-header">{cred.id}</div>

      <Blueprint className="va-print-block va-dark" style={{ padding: "26px 28px" }}>
        <div className="va-row-flex" style={{ alignItems: "center", gap: 12 }}>
          <img src="/mdc-logo.png" alt="Miami Dade College" width={165} height={39} />
          <span style={{ marginLeft: "auto" }}>
            <Stamp gate={revoked ? "fail" : "pass"}>{revoked ? "Revoked" : "Valid"}</Stamp>
          </span>
        </div>
        <div className="va-kicker" style={{ marginTop: 16 }}>Verified work sample credential</div>
        <h3 style={{ margin: "6px 0 8px", color: "#fff", maxWidth: "34ch" }}>{view.blueprint.name}</h3>
        <p style={{ margin: 0, fontSize: 16, lineHeight: 1.6, color: "#d5e0ea", maxWidth: "72ch" }}>{view.blueprint.construct}</p>
        <div style={{ marginTop: 16, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12, fontSize: 15 }} className="va-split">
          <div><div className="va-kicker">Holder</div><div style={{ color: "#fff", fontFamily: asLearner ? undefined : "ui-monospace, monospace" }}>{holder}</div></div>
          <div><div className="va-kicker">Issued</div><div style={{ color: "#fff" }}>{fmt(cred.issuedAt)} · {cred.issuedBy}</div></div>
          <div><div className="va-kicker">Credential id</div><div style={{ color: "#fff", fontFamily: "ui-monospace, monospace" }}>{cred.id}</div></div>
          <div><div className="va-kicker">Course</div><div style={{ color: "#fff" }}>{view.course.code} · {view.course.term}</div></div>
        </div>
        {revoked && <p style={{ margin: "12px 0 0", color: "#f2c4b8", fontSize: 15 }}>Revoked {fmt(cred.revokedAt!)}: {cred.revocationReason}</p>}
      </Blueprint>

      <div className="va-split" style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)", gap: 20, alignItems: "start" }}>
        <Blueprint className="va-print-block" style={{ padding: "20px 22px" }}>
          <h6 style={{ margin: "0 0 10px" }}>Result on the rubric</h6>
          <table className="table">
            <tbody>
              {view.blueprint.rubric.map((c) => (
                <tr key={c.id}>
                  <td>{c.name}</td>
                  <td style={{ whiteSpace: "nowrap" }}>Level {view.grade?.scores[c.id] ?? 0} of 3</td>
                </tr>
              ))}
              <tr>
                <td style={{ fontFamily: "var(--font-heading)" }}>Total</td>
                <td style={{ whiteSpace: "nowrap", fontFamily: "var(--font-heading)" }}>{view.grade?.total ?? 0} / {view.grade?.maxTotal ?? 0}</td>
              </tr>
            </tbody>
          </table>
          <div style={{ marginTop: 12 }}>
            <div className="va-kicker" style={{ marginBottom: 6 }}>Skills evidenced</div>
            <SkillTags skills={skills} />
          </div>
        </Blueprint>

        <Blueprint className="va-print-block" style={{ padding: "20px 22px" }}>
          <h6 style={{ margin: "0 0 10px" }}>Employer endorsement{endorsements.length === 1 ? "" : "s"}</h6>
          {endorsements.map((e) => (
            <div key={e.id} style={{ borderTop: "1px solid var(--color-divider)", padding: "10px 0" }}>
              <div style={{ fontFamily: "var(--font-heading)", fontSize: 18 }}>{e.organisation}</div>
              <div className="text-muted" style={{ fontSize: 14 }}>{e.reviewerName}{e.reviewerEmail ? ` · ${e.reviewerEmail}` : ""} · {fmt(e.at)} · {e.score} / 5 · meets their bar</div>
              <p style={{ margin: "6px 0 0", fontSize: 15.5, lineHeight: 1.55 }}>{e.comment}</p>
            </div>
          ))}
          <div style={{ marginTop: 10 }}>
            <div className="va-kicker" style={{ marginBottom: 6 }}>Validated by</div>
            <div style={{ fontSize: 15 }}>{view.validations.filter((v) => v.status === "validated").map((v) => `${v.organisation} (${v.reviewerName}, ${v.reviewerRole})`).join("; ") || "—"}</div>
          </div>
        </Blueprint>
      </div>

      <Blueprint className="va-print-block" style={{ padding: "20px 22px" }}>
        <h6 style={{ margin: "0 0 8px" }}>How to verify</h6>
        <p style={{ margin: "0 0 10px", fontSize: 15.5, lineHeight: 1.6, maxWidth: "76ch" }}>
          This is an Open Badges 3.0 credential (a W3C Verifiable Credential) issued by {cred.issuedBy}, with one EndorsementCredential per employer endorsement. The achievement is signed with key {cred.signedWithKid}; the underlying evidence record verifies at the link below. {ach.proof?.description ?? ""}
        </p>
        <CopyField label="Verify link" value={typeof location !== "undefined" ? `${location.origin}/verify/${record.id}` : `/verify/${record.id}`} />
        <div style={{ marginTop: 8 }}>
          <CopyField label="Credential link" value={link} />
        </div>
        <p className="text-muted" style={{ margin: "10px 0 0", fontSize: 14 }}>
          Wallet import (Credly, Badgr, an Open Badges 3.0 wallet) needs the college's issuer profile published at {String(ach.id ?? "").split("/credential/")[0] || "the issuer id"}. Until then, the downloaded bundle verifies against the key embedded in the workspace.
        </p>
      </Blueprint>

      <div id="share">
        {revoked ? (
          <Blueprint className="va-no-print" style={{ padding: "16px 20px" }}>
            <h6 style={{ margin: "0 0 6px" }}>Share this credential</h6>
            <p className="text-muted" style={{ margin: 0, fontSize: 15 }}>This credential was revoked, so sharing is switched off. The verify page states the revocation and its reason.</p>
          </Blueprint>
        ) : (
          <ShareCredential
            credential={cred}
            achievementName={view.blueprint.name}
            endorsedBy={endorsements.map((e) => e.organisation)}
            skills={skills.map((k) => k.label)}
            verifyUrl={typeof location !== "undefined" ? `${location.origin}/verify/${record.id}` : `/verify/${record.id}`}
            credentialUrl={link}
            learnerLabel={asLearner ? view.student.name : null}
          />
        )}
      </div>

      <div className="va-btn-row va-no-print" style={{ flexWrap: "wrap", gap: 10 }}>
        <BlueprintButton onClick={() => downloadJson(cred.bundle, `${cred.id}-open-badges-3.0-bundle.json`)}>Download Open Badges 3.0 bundle</BlueprintButton>
        <button type="button" className="btn btn-secondary" onClick={() => downloadJson(cred.achievementCredential, `${cred.id}-achievement.json`)}>Achievement only</button>
        <button type="button" className="btn btn-secondary" onClick={() => window.print()}>Print</button>
        <Link className="btn btn-secondary" to={`/verify/${record.id}`} style={{ textDecoration: "none" }}>Verify page</Link>
        <Link className="btn btn-secondary" to={`/evidence/${record.variantId}`} style={{ textDecoration: "none" }}>Evidence record</Link>
        {!revoked && (
          <button type="button" className="btn btn-ghost" style={{ marginLeft: "auto" }} onClick={() => setConfirm(true)}>Revoke</button>
        )}
      </div>

      <Dialog
        open={confirm}
        title={`Revoke ${cred.id}?`}
        onClose={() => setConfirm(false)}
        actions={
          <>
            <button type="button" className="btn btn-secondary" onClick={() => setConfirm(false)}>Cancel</button>
            <button
              type="button"
              className="btn btn-primary"
              disabled={reason.trim().length < 3}
              onClick={() => {
                ws.revokeCredential(cred.id, reason.trim());
                setConfirm(false);
              }}
            >
              Revoke
            </button>
          </>
        }
      >
        <p style={{ margin: "0 0 8px", fontSize: 15.5 }}>Revocation is recorded in this workspace and shown on the verify page. The reason is required.</p>
        <input className="input" placeholder="Reason" value={reason} onChange={(e) => setReason(e.target.value)} />
      </Dialog>
    </div>
  );
}

export type { IssuedCredential };
