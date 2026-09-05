import { useMemo, useState } from "react";
/* type-scale: applied */
import { Link, useParams } from "react-router-dom";
import { Blueprint, CopyField, EmptyState, Stamp } from "@ui/components";
import { usePageTitle } from "@ui/shell/PageTitleContext";
import { recordCanonical, useWorkspace } from "@lib/store/workspace";
import { evidenceView } from "@lib/store/selectors";
import { buildVerifyBundle } from "@lib/badges/verifyBundle";
import { downloadOpenBadge } from "@lib/badges/openBadges";
import { encodePackage } from "@lib/share";

function formatDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

export default function Share() {
  const { recordId } = useParams<{ recordId: string }>();
  const ws = useWorkspace();
  const addConsent = useWorkspace((s) => s.addConsent);
  const signEvidenceRecord = useWorkspace((s) => s.signEvidenceRecord);

  const record = useMemo(() => ws.evidenceRecords.find((r) => r.id === recordId) ?? null, [ws.evidenceRecords, recordId]);
  const view = useMemo(() => (record ? evidenceView(ws, record.variantId) : null), [ws, record]);

  const [org, setOrg] = useState("");
  const [email, setEmail] = useState("");
  const [note, setNote] = useState("");
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [link, setLink] = useState<string | null>(null);
  const [sharedWith, setSharedWith] = useState<string | null>(null);
  const [includeBusy, setIncludeBusy] = useState(false);

  usePageTitle("Share your evidence record", record ? record.id : "Your record");

  if (!record || !view) {
    return <EmptyState heading="No evidence record" text={recordId ? `${recordId} is not in this browser.` : "Open this page from an evidence record."} />;
  }

  const bridge = record.bridge;
  const consents = bridge?.consent ?? [];
  const active = consents.filter((c) => c.action === "shared").filter((c) => !consents.some((r) => r.action === "revoked" && r.toOrganisation === c.toOrganisation && r.at > c.at));

  const share = async () => {
    setError(null);
    if (!org.trim()) {
      setError("Name the organisation you are sharing with.");
      return;
    }
    if (!consent) {
      setError("Tick the consent box to share.");
      return;
    }
    setBusy(true);
    try {
      // Sign first so the bundle carries a verifiable signature, then record consent.
      const signed = record.bridge?.signature ? record : await signEvidenceRecord(record.id).catch(() => record);
      const canonical = recordCanonical(ws, signed);
      if (!canonical) throw new Error("The graded submission behind this record is missing, so the record cannot be shared.");
      addConsent(record.id, { action: "shared", toOrganisation: org.trim(), toEmail: email.trim() || null, note: note.trim() || null });
      const bundle = buildVerifyBundle(view, signed, canonical, useWorkspace.getState().signingKey ?? null);
      const enc = await encodePackage(bundle);
      setLink(`${location.origin}/verify/${record.id}#rec=${enc}`);
      setSharedWith(org.trim());
      setConsent(false);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const revoke = (toOrganisation: string | null) => {
    addConsent(record.id, { action: "revoked", toOrganisation, toEmail: null, note: null });
    if (sharedWith && toOrganisation === sharedWith) {
      setLink(null);
      setSharedWith(null);
    }
  };

  return (
    <div className="va-page" style={{ gap: 22 }}>
      <Blueprint style={{ padding: "24px 26px" }}>
        <div className="va-kicker">Your evidence record</div>
        <div style={{ display: "flex", gap: 14, alignItems: "baseline", flexWrap: "wrap", marginTop: 4 }}>
          <div style={{ fontFamily: "var(--font-heading)", fontSize: 30, lineHeight: 1.05 }}>{record.id}</div>
          <Stamp gate={bridge?.signature ? "pass" : "watch"}>{bridge?.signature ? `Signed · ${bridge.signedWithKid}` : "Unsigned until first share"}</Stamp>
        </div>
        <div style={{ fontSize: 17, marginTop: 8 }}>
          {view.student.name} · {view.course.code} · {view.course.term}
        </div>
        <div className="text-muted" style={{ fontSize: 15, marginTop: 4 }}>
          {view.blueprint.name} · {view.grade ? `${view.grade.total} / ${view.grade.maxTotal}` : "not graded"} · issued {formatDate(record.issuedAt)} · learner id{" "}
          <span style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}>{bridge?.learnerId}</span>
        </div>
        <p className="text-muted" style={{ margin: "12px 0 0", fontSize: 15, maxWidth: "72ch" }}>
          This record is yours. Your instructor issued it, but only you decide who sees it. Sharing creates a consent event on the record; you can revoke it here. In a real deployment the student signs in; this page stands in for that.
        </p>
      </Blueprint>

      <div className="va-split" style={{ display: "grid", gridTemplateColumns: "minmax(0,1.2fr) minmax(0,1fr)", gap: 22, alignItems: "start" }}>
        <Blueprint style={{ padding: "20px 22px" }}>
          <h6 style={{ margin: "0 0 12px" }}>Share with</h6>
          <label style={{ display: "flex", gap: 10, alignItems: "flex-start", fontSize: 15.5, cursor: "pointer", marginBottom: 14, paddingBottom: 12, borderBottom: "1px solid var(--color-divider)" }}>
            <input
              type="checkbox"
              checked={!!bridge?.workSample?.submissionIncluded}
              disabled={includeBusy}
              onChange={async (e) => {
                setError(null);
                setIncludeBusy(true);
                try {
                  await useWorkspace.getState().setSubmissionIncluded(record.id, e.target.checked);
                } catch (err) {
                  setError(err instanceof Error ? err.message : String(err));
                } finally {
                  setIncludeBusy(false);
                }
              }}
              style={{ marginTop: 3 }}
            />
            <span>
              {includeBusy ? "Saving…" : "Include my submission"}{" "}
              <span className="text-muted">— the work itself travels with the record, and the record's hash then covers it. Employers hire from work, not from a score.</span>
            </span>
          </label>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div className="field" style={{ margin: 0 }}>
              <label>Organisation</label>
              <input className="input" value={org} onChange={(e) => setOrg(e.target.value)} placeholder="e.g. Bayfront Regional Bank" />
            </div>
            <div className="field" style={{ margin: 0 }}>
              <label>
                Contact email <span className="text-muted">— optional</span>
              </label>
              <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@example.com" />
            </div>
            <div className="field" style={{ margin: 0 }}>
              <label>
                Note <span className="text-muted">— optional, e.g. the role you are applying for</span>
              </label>
              <input className="input" value={note} onChange={(e) => setNote(e.target.value)} />
            </div>
            <label style={{ display: "flex", gap: 10, alignItems: "flex-start", fontSize: 15.5, cursor: "pointer" }}>
              <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} style={{ marginTop: 3 }} />
              <span>I choose to share this record with this organisation. It includes my name, my course, the task I received, my rubric scores and the integrity checks on my assessment.</span>
            </label>
            {error && <div style={{ color: "#8d4a3c", fontSize: 15 }}>{error}</div>}
            <div className="va-btn-row">
              <button type="button" className="btn btn-primary" disabled={busy} onClick={share}>
                {busy ? "Preparing…" : "Share and get a verify link"}
              </button>
              <button type="button" className="btn btn-secondary" onClick={() => downloadOpenBadge(view, record, ws.signingKey ?? null)}>
                Download Open Badges 3.0
              </button>
            </div>
            <div className="text-muted" style={{ fontSize: 14 }}>Nothing is uploaded. The verify link carries the record itself; the Open Badges file is a W3C Verifiable Credential that wallets and employer systems can import.</div>
          </div>

          {link && (
            <div style={{ marginTop: 16, borderTop: "1px solid var(--color-divider)", paddingTop: 14 }}>
              <div style={{ fontSize: 15.5, marginBottom: 8 }}>
                Shared with <strong>{sharedWith}</strong>. Send them this link; it opens the verify page in any browser.
              </div>
              <CopyField label="Verify link" value={link} hint="Long on purpose: it carries the record, its content and the issuer's public key." />
            </div>
          )}
        </Blueprint>

        <Blueprint style={{ padding: "20px 22px" }}>
          <h6 style={{ margin: "0 0 12px" }}>Who you have shared with</h6>
          {consents.length === 0 ? (
            <div className="text-muted" style={{ fontSize: 15 }}>No one yet.</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10, fontSize: 15.5 }}>
              {[...consents].reverse().map((c) => {
                const stillActive = c.action === "shared" && active.some((a) => a.id === c.id);
                return (
                  <div key={c.id} style={{ display: "flex", gap: 10, alignItems: "baseline", flexWrap: "wrap" }}>
                    <Stamp gate={c.action === "shared" ? (stillActive ? "pass" : "advisory") : "fail"}>{c.action === "shared" ? "Shared" : "Revoked"}</Stamp>
                    <span>{c.toOrganisation ?? "—"}</span>
                    <span className="text-muted" style={{ fontSize: 14 }}>
                      {formatDate(c.at)}
                      {c.note ? ` · ${c.note}` : ""}
                    </span>
                    {stillActive && (
                      <button type="button" className="btn btn-ghost" style={{ marginLeft: "auto" }} onClick={() => revoke(c.toOrganisation)}>
                        Revoke
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
          <div className="text-muted" style={{ fontSize: 14, marginTop: 14 }}>
            Revoking records your decision on the audit trail. It cannot recall a link already sent; a public verify endpoint would honour revocation.
          </div>
          <div className="text-muted" style={{ fontSize: 14, marginTop: 8 }}>
            <Link to={`/evidence/${record.variantId}`}>Full evidence page</Link> · <Link to={`/verify/${record.id}`}>Verify page</Link>
            {bridge?.learnerId ? (
              <>
                {" "}
                · <Link to={`/portfolio/${bridge.learnerId}`}>Your portfolio</Link>
              </>
            ) : null}
          </div>
        </Blueprint>
      </div>
    </div>
  );
}
