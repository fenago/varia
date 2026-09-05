import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Blueprint, EmptyState, Stamp } from "@ui/components";
import { usePageTitle } from "@ui/shell/PageTitleContext";
import { recordCanonical, useWorkspace } from "@lib/store/workspace";
import { evidenceView } from "@lib/store/selectors";
import { hashEvidence } from "@lib/store/employer";
import { verifySignature } from "@lib/badges/keys";
import { summaryFromView, type VerifyBundle, type VerifySummary } from "@lib/badges/verifyBundle";
import { clearFragment, decodePackage, readFragmentParam } from "@lib/share";
import type { EvidenceRecord } from "@shared/types";

type Source = "workspace" | "bundle";

interface Outcome {
  hashOk: boolean;
  sigOk: boolean | null; // null = unsigned
  method: string;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

function gateOf(g: string): "pass" | "fail" | "advisory" {
  return g === "pass" ? "pass" : g === "fail" ? "fail" : "advisory";
}

export default function Verify() {
  const { recordId } = useParams<{ recordId: string }>();
  const ws = useWorkspace();
  const addVerification = useWorkspace((s) => s.addVerification);

  const [bundle, setBundle] = useState<VerifyBundle | null>(null);
  const [bundleError, setBundleError] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [org, setOrg] = useState("");
  const [recorded, setRecorded] = useState<string | null>(null);

  // 1. A bundle in the fragment wins (works in any browser).
  useEffect(() => {
    const enc = readFragmentParam("rec");
    if (!enc) return;
    decodePackage<VerifyBundle>(enc)
      .then((b) => {
        if (!b || b.version !== 1 || !b.record || typeof b.canonical !== "string") throw new Error("This link does not carry a VARIA evidence bundle.");
        setBundle(b);
        clearFragment();
      })
      .catch((e: unknown) => setBundleError(e instanceof Error ? e.message : String(e)));
  }, []);

  // 2. Otherwise the workspace record.
  const wsRecord: EvidenceRecord | null = useMemo(
    () => (bundle ? null : (ws.evidenceRecords.find((r) => r.id === recordId) ?? null)),
    [bundle, ws.evidenceRecords, recordId],
  );
  const wsView = useMemo(() => (wsRecord ? evidenceView(ws, wsRecord.variantId) : null), [ws, wsRecord]);

  const source: Source = bundle ? "bundle" : "workspace";
  const record = bundle?.record ?? wsRecord;
  const summary: VerifySummary | null = bundle?.summary ?? (wsView ? summaryFromView(wsView) : null);
  const canonical = bundle?.canonical ?? (wsRecord ? recordCanonical(ws, wsRecord) : null);
  const publicJwk = bundle ? bundle.publicJwk : ws.signingKey && record?.bridge?.signedWithKid === ws.signingKey.kid ? ws.signingKey.publicJwk : null;

  usePageTitle("Verify an evidence record", record ? record.id : "Verification");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!record || !canonical) {
        setOutcome(null);
        return;
      }
      const hashOk = hashEvidence(canonical) === record.hash;
      const sig = record.bridge?.signature ?? null;
      let sigOk: boolean | null = null;
      if (sig) sigOk = publicJwk ? await verifySignature(publicJwk, canonical, sig) : false;
      if (!cancelled) setOutcome({ hashOk, sigOk, method: sig ? "hash+signature" : "hash" });
    })();
    return () => {
      cancelled = true;
    };
  }, [record, canonical, publicJwk]);

  if (bundleError) {
    return <EmptyState heading="Could not read this link" text={bundleError} />;
  }
  if (!record) {
    return (
      <EmptyState heading="No evidence record to verify" text={recordId ? `Nothing in this browser is issued as ${recordId}. Ask the student for their share link, which carries the record itself.` : "Open a record's share link, or a /verify/VR-… address from a browser that holds the workspace."} />
    );
  }
  if (!summary || !canonical) {
    return <EmptyState heading="Record content unavailable" text="The record exists but the graded submission it covers is no longer in this workspace, so the hash cannot be recomputed." />;
  }

  const valid = outcome ? outcome.hashOk && outcome.sigOk !== false : null;
  const bridge = record.bridge;

  const recordVerification = () => {
    if (!outcome) return;
    const ev = addVerification({ recordId: record.id, byOrganisation: org.trim() || null, result: valid ? "valid" : "invalid", method: outcome.method });
    setRecorded(ev.at);
  };

  return (
    <div className="va-page" style={{ gap: 22 }}>
      <Blueprint style={{ padding: "24px 26px", display: "grid", gridTemplateColumns: "minmax(0,1fr) auto", gap: 18, alignItems: "center" }}>
        <div>
          <div className="va-kicker">Evidence record</div>
          <div style={{ fontFamily: "var(--font-heading)", fontSize: 30, lineHeight: 1.05, marginTop: 4 }}>{record.id}</div>
          <div className="text-muted" style={{ fontSize: 13, marginTop: 6 }}>
            Issued {formatDate(record.issuedAt)} by {summary.issuedBy}
          </div>
          <div className="text-muted" style={{ fontSize: 12.5, marginTop: 4 }}>
            {source === "bundle"
              ? "Loaded from the share link. The record, its content and the issuer's public key were supplied by the link itself, which is weaker than a public verify endpoint."
              : "Loaded from this browser's workspace. A public verify endpoint would fetch the record and the institution's published key instead."}
          </div>
        </div>
        <div style={{ textAlign: "right" }}>
          {outcome === null ? (
            <Stamp gate="watch">Checking…</Stamp>
          ) : valid ? (
            <Stamp gate="pass" title={`Hash recomputed and matched${outcome.sigOk ? "; signature verified" : ""}`}>
              Record verified
            </Stamp>
          ) : !outcome.hashOk ? (
            <Stamp gate="fail">Hash mismatch</Stamp>
          ) : (
            <Stamp gate="fail">Signature invalid</Stamp>
          )}
          <div className="text-muted" style={{ fontSize: 12, marginTop: 8 }}>
            {outcome?.sigOk === null ? "Unsigned · hash only" : outcome?.sigOk ? `Signed · ${bridge?.signedWithKid}` : publicJwk ? "Signature did not verify" : "Signed, but no public key available to check"}
          </div>
        </div>
      </Blueprint>

      <div className="va-split" style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)", gap: 22, alignItems: "start" }}>
        <Blueprint style={{ padding: "20px 22px" }}>
          <h6 style={{ margin: "0 0 10px" }}>Who and what</h6>
          <table className="table">
            <tbody>
              <tr>
                <td className="va-heading-15" style={{ width: "34%" }}>Learner</td>
                <td>
                  <span style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}>{bridge?.learnerId ?? "—"}</span>
                  <div className="text-muted" style={{ fontSize: 12 }}>Stable identifier. The name is not part of verification.</div>
                </td>
              </tr>
              <tr>
                <td className="va-heading-15">Course</td>
                <td>{summary.course}</td>
              </tr>
              <tr>
                <td className="va-heading-15">Institution</td>
                <td>{summary.institution}</td>
              </tr>
              <tr>
                <td className="va-heading-15">Assessment</td>
                <td>
                  {summary.blueprint}
                  <div className="text-muted" style={{ fontSize: 12.5 }}>{summary.construct}</div>
                </td>
              </tr>
              <tr>
                <td className="va-heading-15">Result</td>
                <td>{summary.total}</td>
              </tr>
            </tbody>
          </table>
        </Blueprint>

        <Blueprint style={{ padding: "20px 22px" }}>
          <h6 style={{ margin: "0 0 10px" }}>Rubric result</h6>
          <table className="table">
            <thead>
              <tr>
                <th>Criterion</th>
                <th style={{ width: 90 }}>Level</th>
                <th style={{ width: 70 }}>Points</th>
              </tr>
            </thead>
            <tbody>
              {summary.criterionScores.map((c) => (
                <tr key={c.name}>
                  <td>{c.name}</td>
                  <td>{c.level} / 3</td>
                  <td>{c.points}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Blueprint>
      </div>

      <div className="va-split" style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)", gap: 22, alignItems: "start" }}>
        <Blueprint style={{ padding: "20px 22px" }}>
          <h6 style={{ margin: "0 0 10px" }}>Employer validation</h6>
          {summary.validations.length ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {summary.validations.map((v) => (
                <div key={`${v.organisation}-${v.reviewedAt}`} style={{ display: "flex", gap: 8, alignItems: "baseline", flexWrap: "wrap", fontSize: 13.5 }}>
                  <Stamp gate="pass">Validated by {v.organisation}</Stamp>
                  <span className="text-muted" style={{ fontSize: 12.5 }}>
                    {v.reviewerName}, {v.reviewerRole} · {formatDate(v.reviewedAt)}
                    {v.attested ? " · attested: rubric reflects what we hire for" : ""}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <Stamp gate="watch">Not yet validated by an employer partner</Stamp>
          )}
        </Blueprint>

        <Blueprint style={{ padding: "20px 22px" }}>
          <h6 style={{ margin: "0 0 10px" }}>Integrity of the assessment set</h6>
          {summary.checks.length ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {summary.checks.map((c) => (
                <div key={c.property} style={{ display: "flex", gap: 8, alignItems: "baseline", fontSize: 13.5 }}>
                  <Stamp gate={gateOf(c.gate)}>{c.gate === "pass" ? "Pass" : c.gate === "fail" ? "Over threshold" : "Advisory"}</Stamp>
                  <span>{c.label}</span>
                  <span className="text-muted" style={{ fontSize: 12, marginLeft: "auto" }}>{c.metricLabel}</span>
                </div>
              ))}
              {summary.joint !== null && <div className="text-muted" style={{ fontSize: 12.5 }}>Composite J {summary.joint.toFixed(2)}</div>}
            </div>
          ) : (
            <div className="text-muted" style={{ fontSize: 13 }}>No integrity report attached.</div>
          )}
        </Blueprint>
      </div>

      <Blueprint style={{ padding: "20px 22px" }}>
        <h6 style={{ margin: "0 0 8px" }}>Record this verification</h6>
        <p className="text-muted" style={{ margin: "0 0 12px", fontSize: 13, maxWidth: "70ch" }}>
          Verifying is the observed form of adoption. Recording it here adds an event to the issuing workspace when you are in it; a public endpoint would record it for the institution. This verify link is the canonical public URL for the record: it is what the badge image, the credential and every share button point at.
        </p>
        <div className="va-btn-row" style={{ alignItems: "flex-end", gap: 12, flexWrap: "wrap" }}>
          <div className="field" style={{ minWidth: 280, margin: 0 }}>
            <label>Verifying as (organisation, optional)</label>
            <input className="input" value={org} onChange={(e) => setOrg(e.target.value)} placeholder="e.g. Bayfront Regional Bank" />
          </div>
          <button type="button" className="btn btn-primary" disabled={!outcome || !!recorded} onClick={recordVerification}>
            {recorded ? "Recorded" : "Record this verification"}
          </button>
          {recorded && <span className="text-muted" style={{ fontSize: 12.5 }}>Logged {formatDate(recorded)} on the audit trail.</span>}
        </div>
      </Blueprint>

      <Blueprint style={{ padding: "20px 22px" }}>
        <h6 style={{ margin: "0 0 6px" }}>How this was checked</h6>
        <div style={{ fontSize: 13, lineHeight: 1.6, maxWidth: "76ch" }}>
          <div>
            Hash <code style={{ fontSize: 12 }}>{record.hash}</code>
          </div>
          <div className="text-muted">
            The canonical content (learner, course, task, criterion scores, integrity checks, validation ids, issue date) was rebuilt and hashed with SHA-256, then compared to the hash the record carries.
            {bridge?.signature ? " The signature is an ES256 JWS over that same content, checked against the issuer's public key." : " This record is not signed; signing adds an issuer key to the check."}
            {bridge?.credentialId ? ` Credential id: ${bridge.credentialId}.` : ""}
          </div>
          {source === "workspace" && (
            <div className="text-muted" style={{ marginTop: 8 }}>
              Instructor view: <Link to={`/evidence/${record.variantId}`}>open the full evidence page</Link>.
            </div>
          )}
        </div>
      </Blueprint>
    </div>
  );
}
