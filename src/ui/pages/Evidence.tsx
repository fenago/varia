import { useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Blueprint, BlueprintButton, CopyField, Dialog, EmptyState, OutcomeStamps, SkillTags, Stamp } from "@ui/components";
import { usePageTitle } from "@ui/shell/PageTitleContext";
import { useWorkspace } from "@lib/store/workspace";
import { challengeById, credentialEligibility, credentialForRecord, endorsementsForRecord, evidenceView, outcomesForRecord, skillsForBlueprint } from "@lib/store/selectors";
import { downloadOpenBadge } from "@lib/badges/openBadges";
import { Link } from "react-router-dom";
import { PROPERTY_LABELS } from "@shared/thresholds";
import type { Check, EmployerValidation, Property } from "@shared/types";

const ORDER: Property[] = ["p1", "p2", "p3", "p4"];

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function paragraphs(text: string): string[] {
  return text
    .split(/\n{2,}|\n(?=\S)/)
    .map((p) => p.trim())
    .filter(Boolean);
}

function gateOf(check: Check): "pass" | "fail" | "advisory" {
  return check.gate;
}

function ValidationStamps({ validations }: { validations: EmployerValidation[] }) {
  if (validations.length === 0) {
    return (
      <div>
        <Stamp gate="watch">Not yet validated by an employer partner</Stamp>
        <p className="text-muted" style={{ margin: "10px 0 0", fontSize: 13, lineHeight: 1.55, maxWidth: "70ch" }}>
          Validation happens once at the assessment blueprint. When an employer partner signs off on the rubric and
          scenario bank, every version generated from that blueprint carries their validation, including this one.
        </p>
      </div>
    );
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {validations.map((v) => (
        <div key={v.id} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <div className="va-row-flex" style={{ gap: 8, flexWrap: "wrap" }}>
            <Stamp gate={v.status === "validated" ? "pass" : v.status === "declined" ? "fail" : "watch"}>
              {v.status === "validated" ? "Validated by" : v.status === "declined" ? "Declined by" : "Changes requested by"} {v.organisation}
            </Stamp>
            {v.attested && <Stamp gate="pass">Attested: rubric reflects what we hire for</Stamp>}
          </div>
          <div style={{ fontSize: 13.5 }}>
            {v.reviewerName}
            {v.reviewerRole ? <span className="text-muted"> · {v.reviewerRole}</span> : null}
            <span className="text-muted"> · {formatDate(v.reviewedAt)}</span>
          </div>
          {v.constructComment && (
            <div className="text-muted" style={{ fontSize: 12.5, lineHeight: 1.5, maxWidth: "70ch" }}>
              “{v.constructComment}”
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

export default function Evidence() {
  const { variantId = "" } = useParams();
  const ws = useWorkspace();
  const navigate = useNavigate();
  const view = useMemo(() => (variantId ? evidenceView(ws, variantId) : null), [ws, variantId]);

  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmRevoke, setConfirmRevoke] = useState(false);
  const [showSolution, setShowSolution] = useState(false);
  const [signing, setSigning] = useState(false);

  usePageTitle("Evidence of demonstrated skill", view?.record ? view.record.id : "Draft");

  if (!view) {
    return (
      <EmptyState
        heading="No evidence record here"
        text="This link does not match a version in this browser's workspace. Evidence records are issued from the roster or grading page after a submission has been graded."
        actionLabel="Open the roster"
        onAction={() => navigate("/roster")}
      />
    );
  }

  const { record, student, course, blueprint, variant, run, grade, report, validations } = view;
  const issued = !!record;
  const canIssue = !!grade && !issued;

  const total = grade ? grade.total : null;
  const maxTotal = grade ? grade.maxTotal : blueprint.rubric.reduce((a, c) => a + c.points, 0);

  const issue = async () => {
    setError(null);
    setBusy(true);
    try {
      await ws.issueEvidenceRecord(variant.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const sign = async () => {
    if (!record) return;
    setError(null);
    setSigning(true);
    try {
      await ws.signEvidenceRecord(record.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSigning(false);
    }
  };
  const bridge = record?.bridge ?? null;
  const sample = bridge?.workSample ?? null;
  const skills = sample?.skills ?? skillsForBlueprint(ws, blueprint);
  const challenge = challengeById(ws, sample?.challengeId);
  const endorsements = record ? endorsementsForRecord(ws, record.id) : [];
  const outcomes = record ? outcomesForRecord(ws, record.id) : [];

  const revoke = () => {
    if (!record) return;
    ws.revokeEvidenceRecord(record.id);
    setConfirmRevoke(false);
  };

  const recordUrl = typeof window !== "undefined" ? window.location.href : "";
  const surfaceTags = Object.entries(variant.surfaceAssignment ?? {}).filter(([, v]) => !!v);
  const checks = report ? ORDER.map((p) => report.checks[p]).filter(Boolean) : [];

  return (
    <div className="va-page va-page-narrow" style={{ gap: 22 }}>
      <div className="va-print-header">
        {record ? record.id : "Draft evidence record"} · {student.name} · {course.code} {course.term}
      </div>

      {/* Header block */}
      <Blueprint className="va-print-block" style={{ padding: "22px 24px" }}>
        <div className="va-row-flex" style={{ gap: 10, flexWrap: "wrap", marginBottom: 10 }}>
          {issued ? <Stamp gate="pass">Evidence record</Stamp> : <Stamp gate="watch">Not yet issued</Stamp>}
          {view.submission?.origin === "ai-sample" && (
            <Stamp gate="watch" title="The submission was written by a model for the recorded demo; the grade is the model's suggestion">
              AI-written sample · {view.submission.sampleTier} tier · suggested grade
            </Stamp>
          )}
          {issued && (
            <span style={{ fontFamily: "var(--font-heading)", fontSize: 20, letterSpacing: ".02em" }}>{record!.id}</span>
          )}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)", gap: "10px 24px", fontSize: 14 }}>
          <div>
            <div className="va-kicker" style={{ marginBottom: 2 }}>Student</div>
            <div style={{ fontFamily: "var(--font-heading)", fontSize: 19 }}>{student.name}</div>
          </div>
          <div>
            <div className="va-kicker" style={{ marginBottom: 2 }}>Course</div>
            <div>
              {course.code} · {course.term}
              <div className="text-muted" style={{ fontSize: 12.5 }}>{course.title}</div>
            </div>
          </div>
          <div>
            <div className="va-kicker" style={{ marginBottom: 2 }}>Issued</div>
            <div>
              {issued ? (
                <>
                  {formatDate(record!.issuedAt)}
                  <div className="text-muted" style={{ fontSize: 12.5 }}>{record!.issuedBy}</div>
                </>
              ) : (
                <span className="text-muted">Not issued yet</span>
              )}
            </div>
          </div>
          <div>
            <div className="va-kicker" style={{ marginBottom: 2 }}>Institution</div>
            <div>
              {course.instructor.institution}
              <div className="text-muted" style={{ fontSize: 12.5 }}>
                {course.instructor.name} · {course.instructor.role}
              </div>
            </div>
          </div>
        </div>
      </Blueprint>

      {/* Actions */}
      <div className="va-btn-row va-no-print" style={{ alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        {canIssue && (
          <BlueprintButton onClick={issue} disabled={busy}>
            {busy ? "Issuing…" : "Issue record"}
          </BlueprintButton>
        )}
        {!grade && (
          <span className="text-muted" style={{ fontSize: 12.5 }}>
            This submission has not been graded, so a record cannot be issued yet.
          </span>
        )}
        <button type="button" className="btn btn-secondary" onClick={() => window.print()}>
          Print / Save as PDF
        </button>
        {issued && (
          <button type="button" className="btn btn-secondary" onClick={() => downloadOpenBadge(view, record!, ws.signingKey ?? null, { endorsements, outcomes })}>
            Download Open Badges 3.0
          </button>
        )}
        {issued && !bridge?.signature && (
          <button type="button" className="btn btn-secondary" onClick={sign} disabled={signing}>
            {signing ? "Signing…" : "Sign record"}
          </button>
        )}
        {issued && (
          <>
            <Link className="btn btn-secondary" to={`/verify/${record!.id}`} style={{ textDecoration: "none" }}>
              Verify page
            </Link>
            <Link className="btn btn-secondary" to={`/share/${record!.id}`} style={{ textDecoration: "none" }}>
              Student share page
            </Link>
            {bridge?.learnerId && (
              <Link className="btn btn-secondary" to={`/portfolio/${bridge.learnerId}`} style={{ textDecoration: "none" }}>
                Portfolio
              </Link>
            )}
            {(() => {
              const cred = credentialForRecord(ws, record!.id);
              const elig = credentialEligibility(ws, record!.id);
              if (cred && !cred.revokedAt)
                return (
                  <Link className="btn btn-secondary" to={`/credential/${record!.id}`} style={{ textDecoration: "none" }}>
                    Credential {cred.id}
                  </Link>
                );
              return (
                <Link
                  className="btn btn-secondary"
                  to={`/credential/${record!.id}`}
                  style={{ textDecoration: "none", opacity: elig.eligible ? 1 : 0.6 }}
                  title={elig.eligible ? "Issue an Open Badges 3.0 credential with the employer's endorsement" : `Not yet eligible: ${elig.missing.join("; ")}`}
                >
                  {elig.eligible ? "Issue credential" : "Credential (not yet eligible)"}
                </Link>
              );
            })()}
          </>
        )}
        {issued && (
          <button type="button" className="btn btn-ghost" onClick={() => setConfirmRevoke(true)}>
            Revoke
          </button>
        )}
        {error && <span style={{ color: "#8d4a3c", fontSize: 12.5 }}>{error}</span>}
      </div>
      {issued && (
        <div className="va-no-print" style={{ display: "flex", gap: 10, alignItems: "baseline", flexWrap: "wrap", fontSize: 12.5 }}>
          <Stamp gate={bridge?.signature ? "pass" : "watch"}>{bridge?.signature ? `Signed · ${bridge.signedWithKid}` : "Unsigned"}</Stamp>
          <span className="text-muted">
            Learner id <span style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}>{bridge?.learnerId ?? "—"}</span>
            {bridge?.consent?.length ? ` · shared ${bridge.consent.filter((c) => c.action === "shared").length}×` : " · not yet shared by the student"}
          </span>
        </div>
      )}
      {issued && (
        <div className="va-no-print">
          <CopyField label="Record link" value={recordUrl} hint="Anyone with this browser's workspace can open it. To share outside, print or export." />
        </div>
      )}

      {/* What was assessed */}
      <Blueprint className="va-print-block" style={{ padding: "20px 22px" }}>
        <h6 style={{ margin: "0 0 6px" }}>What was assessed</h6>
        <div style={{ fontFamily: "var(--font-heading)", fontSize: 17, marginBottom: 6 }}>{blueprint.name}</div>
        <p style={{ margin: "0 0 10px", fontSize: 14, lineHeight: 1.6, maxWidth: "76ch" }}>{blueprint.construct}</p>
        {blueprint.constructDimensions?.length > 0 && (
          <div className="va-tags">
            {blueprint.constructDimensions.map((d) => (
              <span key={d} className="tag tag-outline">
                {d}
              </span>
            ))}
          </div>
        )}
      </Blueprint>

      {/* Task */}
      <Blueprint className="va-print-block" style={{ padding: "20px 22px" }}>
        <h6 style={{ margin: "0 0 10px" }}>The task this student received</h6>
        <div className="va-surface-box" style={{ fontSize: 14, lineHeight: 1.65 }}>
          {paragraphs(variant.text).map((p, i) => (
            <p key={i} style={{ margin: "0 0 10px" }}>
              {p}
            </p>
          ))}
        </div>
        {surfaceTags.length > 0 && (
          <div className="va-tags" style={{ marginTop: 10 }}>
            <span className="tag tag-neutral">{variant.id}</span>
            {surfaceTags.map(([k, v]) => (
              <span key={k} className="tag tag-accent" title={k}>
                {v}
              </span>
            ))}
          </div>
        )}
      </Blueprint>

      {/* Rubric and result */}
      <Blueprint className="va-print-block" style={{ padding: "20px 22px" }}>
        <div className="va-row-flex" style={{ marginBottom: 10, alignItems: "baseline", gap: 10 }}>
          <h6 style={{ margin: 0 }}>Rubric and result</h6>
          <span className="text-muted" style={{ fontSize: 12 }}>
            {blueprint.rubric.length} criteria · 4 levels · the same rubric for every version
          </span>
        </div>
        {grade ? (
          <table className="table">
            <thead>
              <tr>
                <th>Criterion</th>
                <th style={{ width: "14%" }}>Level</th>
                <th style={{ width: "16%" }}>Points</th>
              </tr>
            </thead>
            <tbody>
              {blueprint.rubric.map((c) => {
                const level = grade.scores[c.id];
                const earned = level == null ? null : Math.round((level / 3) * c.points * 100) / 100;
                return (
                  <tr key={c.id}>
                    <td>{c.name}</td>
                    <td>{level == null ? <span className="text-muted">—</span> : `${level} / 3`}</td>
                    <td>{earned == null ? <span className="text-muted">—</span> : `${earned} / ${c.points}`}</td>
                  </tr>
                );
              })}
              <tr>
                <td style={{ fontFamily: "var(--font-heading)", fontSize: 15 }}>Total</td>
                <td />
                <td style={{ fontFamily: "var(--font-heading)", fontSize: 15 }}>
                  {total} / {maxTotal}
                </td>
              </tr>
            </tbody>
          </table>
        ) : (
          <div>
            <Stamp gate="watch">Not graded</Stamp>
            <p className="text-muted" style={{ margin: "10px 0 0", fontSize: 13 }}>
              The rubric result appears here once the instructor has scored the submission.
            </p>
          </div>
        )}
        {grade && (
          <div className="text-muted" style={{ fontSize: 12, marginTop: 8 }}>
            Graded {formatDate(grade.gradedAt)} by {grade.by}
          </div>
        )}
      </Blueprint>

      {/* Skills evidenced */}
      <Blueprint className="va-print-block" style={{ padding: "20px 22px" }}>
        <div className="va-row-flex" style={{ marginBottom: 8, alignItems: "baseline", gap: 10 }}>
          <h6 style={{ margin: 0 }}>Skills evidenced</h6>
          {challenge && (
            <span className="text-muted" style={{ fontSize: 12 }}>
              on {challenge.organisation}'s challenge “{challenge.title}”
            </span>
          )}
        </div>
        {skills.length === 0 ? (
          <span className="text-muted" style={{ fontSize: 13 }}>No skills tagged on this blueprint's rubric yet.</span>
        ) : (
          <span className="va-tags">
            {skills.map((s) => (
              <span
                key={s.key}
                className="tag tag-outline"
                title={`${s.source === "taxonomy" ? "Taxonomy" : s.source === "employer" ? "Employer competency" : "Instructor"}${s.externalRef ? ` · ${s.externalRef}` : ""}`}
              >
                {s.label}
              </span>
            ))}
          </span>
        )}
        <p className="text-muted" style={{ margin: "10px 0 0", fontSize: 12.5, lineHeight: 1.5, maxWidth: "70ch" }}>
          Each rubric criterion maps to skills an employer recognises. They travel with the record as Open Badges alignments.
        </p>
      </Blueprint>

      {/* Work sample */}
      <Blueprint className="va-print-block" style={{ padding: "20px 22px" }}>
        <div className="va-row-flex" style={{ marginBottom: 8, alignItems: "baseline", gap: 10 }}>
          <h6 style={{ margin: 0 }}>Work sample</h6>
          {issued && <Stamp gate={sample?.submissionIncluded ? "pass" : "watch"}>{sample?.submissionIncluded ? "Included by the student" : "Withheld"}</Stamp>}
        </div>
        {sample?.submissionIncluded && sample.submissionText ? (
          <div className="va-surface-box" style={{ fontSize: 13.5, lineHeight: 1.65 }}>
            {paragraphs(sample.submissionText).map((p, i) => (
              <p key={i} style={{ margin: "0 0 10px" }}>
                {p}
              </p>
            ))}
          </div>
        ) : (
          <p className="text-muted" style={{ margin: 0, fontSize: 13, lineHeight: 1.55, maxWidth: "70ch" }}>
            The student has not included their submission. They can choose to from their portfolio or share page; the record's hash then covers it.
          </p>
        )}
      </Blueprint>

      {/* Employer validation */}
      <Blueprint className="va-print-block" style={{ padding: "20px 22px" }}>
        <h6 style={{ margin: "0 0 12px" }}>Employer validation</h6>
        <ValidationStamps validations={validations} />
      </Blueprint>

      {/* Employer endorsements */}
      <Blueprint className="va-print-block" style={{ padding: "20px 22px" }}>
        <h6 style={{ margin: "0 0 12px" }}>Employer endorsements</h6>
        {endorsements.length === 0 ? (
          <div>
            <Stamp gate="watch">Not yet endorsed</Stamp>
            <p className="text-muted" style={{ margin: "10px 0 0", fontSize: 13, lineHeight: 1.55, maxWidth: "70ch" }}>
              An employer who receives this sample can score it against their own bar from their talent view. That is a stronger signal than the rubric score.
            </p>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {endorsements.map((e) => (
              <div key={e.id} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <div className="va-row-flex" style={{ gap: 8, flexWrap: "wrap" }}>
                  <Stamp gate="pass">Endorsed by {e.organisation}</Stamp>
                  <Stamp gate={e.meetsBar ? "pass" : "watch"}>{e.meetsBar ? "Meets their hiring bar" : "Below their hiring bar"}</Stamp>
                  <span style={{ fontFamily: "var(--font-heading)", fontSize: 16 }}>{e.score} / 5</span>
                </div>
                <div style={{ fontSize: 13.5 }}>
                  {e.reviewerName}
                  {e.reviewerEmail ? <span className="text-muted"> · {e.reviewerEmail}</span> : null}
                  <span className="text-muted"> · {formatDate(e.at)}</span>
                </div>
                {e.comment && (
                  <div className="text-muted" style={{ fontSize: 12.5, lineHeight: 1.5, maxWidth: "70ch" }}>
                    “{e.comment}”
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </Blueprint>

      {/* Outcomes */}
      <Blueprint className="va-print-block" style={{ padding: "20px 22px" }}>
        <h6 style={{ margin: "0 0 12px" }}>Outcomes</h6>
        {outcomes.length === 0 ? (
          <p className="text-muted" style={{ margin: 0, fontSize: 13, lineHeight: 1.55, maxWidth: "70ch" }}>
            Nothing logged yet. Interviews, offers, hires and ramp time are recorded here by the student or the employer, where they happen.
          </p>
        ) : (
          <>
            <OutcomeStamps outcomes={outcomes} />
            <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 10, fontSize: 13.5 }}>
              {outcomes.map((o) => (
                <div key={o.id} style={{ display: "flex", gap: 10, alignItems: "baseline", flexWrap: "wrap" }}>
                  <span style={{ fontFamily: "var(--font-heading)", textTransform: "capitalize" }}>{o.kind}</span>
                  <span>{o.organisation}</span>
                  <span className="text-muted" style={{ fontSize: 12.5 }}>
                    {formatDate(o.at)} · logged by the {o.by}
                    {o.onboardingHours != null ? ` · ${o.onboardingHours} h to productive` : ""}
                    {o.note ? ` · ${o.note}` : ""}
                  </span>
                </div>
              ))}
            </div>
          </>
        )}
      </Blueprint>

      {/* Integrity */}
      <Blueprint className="va-print-block" style={{ padding: "20px 22px" }}>
        <h6 style={{ margin: "0 0 6px" }}>Integrity of the assessment set</h6>
        <p className="text-muted" style={{ margin: "0 0 12px", fontSize: 12.5, lineHeight: 1.5, maxWidth: "70ch" }}>
          This version was one of {run.n} generated from the same blueprint. The set was checked for surface diversity,
          construct equivalence, rubric stability and difficulty parity before release.
        </p>
        {report ? (
          <>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {checks.map((c) => (
                <div key={c.property} className="va-row-flex" style={{ gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                  <span style={{ fontFamily: "var(--font-heading)", fontSize: 15, minWidth: 190 }}>
                    {PROPERTY_LABELS[c.property].label}
                  </span>
                  <span className="text-muted" style={{ fontSize: 12 }} title={c.detail}>
                    {c.metricLabel}
                  </span>
                  <Stamp gate={gateOf(c)} className="" title={c.detail}>
                    {c.gate === "pass" ? "Pass" : c.gate === "advisory" ? "Advisory" : "Over threshold"}
                  </Stamp>
                </div>
              ))}
            </div>
            <div className="text-muted" style={{ fontSize: 12, marginTop: 10 }}>
              Composite J {report.joint.toFixed(2)} · thresholds v{report.thresholdsVersion}
              {run.release ? ` · released ${formatDate(run.release.releasedAt)}` : ""}
              {run.release?.overThreshold ? " · released over threshold with a recorded reason" : ""}
            </div>
          </>
        ) : (
          <Stamp gate="watch">No integrity report for this set</Stamp>
        )}
      </Blueprint>

      {/* Adapted model answer */}
      <Blueprint className="va-print-block" style={{ padding: "18px 22px" }}>
        <div className="va-row-flex" style={{ alignItems: "baseline", gap: 10 }}>
          <h6 style={{ margin: 0 }}>Adapted model answer</h6>
          <button type="button" className="btn btn-ghost va-no-print" style={{ marginLeft: "auto" }} onClick={() => setShowSolution((s) => !s)}>
            {showSolution ? "Hide" : "Show"}
          </button>
        </div>
        {showSolution ? (
          <div className="va-surface-box" style={{ marginTop: 10, fontSize: 13, lineHeight: 1.6 }}>
            {paragraphs(variant.adaptedSolution).map((p, i) => (
              <p key={i} style={{ margin: "0 0 8px" }}>
                {p}
              </p>
            ))}
          </div>
        ) : (
          <p className="text-muted" style={{ margin: "6px 0 0", fontSize: 12.5 }}>
            The instructor's canonical solution rewritten into this version's scenario. Collapsed by default; not printed unless shown.
          </p>
        )}
      </Blueprint>

      {/* Verification */}
      <Blueprint className="va-print-block" style={{ padding: "18px 22px" }}>
        <h6 style={{ margin: "0 0 6px" }}>How to verify</h6>
        {issued ? (
          <>
            <div className="va-surface-box" style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", fontSize: 12, wordBreak: "break-all" }}>
              {record!.hash}
            </div>
            <p className="text-muted" style={{ margin: "10px 0 0", fontSize: 12.5, lineHeight: 1.55, maxWidth: "76ch" }}>
              SHA-256 over the student, course, task text, criterion scores, integrity checks, employer validation ids and issue
              date. If any of those change, the hash changes. Recompute it from an exported workspace to confirm this record
              is unaltered.
            </p>
            <p className="text-muted" style={{ margin: "8px 0 0", fontSize: 12.5, lineHeight: 1.55, maxWidth: "76ch" }}>
              Credential id {bridge?.credentialId ?? "—"} · learner id {bridge?.learnerId ?? "—"} ·{" "}
              {bridge?.signature ? `signed with ${bridge.signedWithKid} (ES256, demo key generated in this browser)` : "not yet signed"}. The Open
              Badges 3.0 export carries the same content as a W3C Verifiable Credential; the verify page recomputes the hash and checks the
              signature.
            </p>
          </>
        ) : (
          <p className="text-muted" style={{ margin: 0, fontSize: 12.5, lineHeight: 1.55 }}>
            A verification hash is computed when the record is issued.
          </p>
        )}
      </Blueprint>

      <Dialog
        open={confirmRevoke}
        title="Revoke this evidence record?"
        onClose={() => setConfirmRevoke(false)}
        actions={
          <>
            <button type="button" className="btn btn-secondary" onClick={() => setConfirmRevoke(false)}>
              Keep it
            </button>
            <button type="button" className="btn btn-primary" onClick={revoke}>
              Revoke {record?.id}
            </button>
          </>
        }
      >
        <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.55 }}>
          The record id and hash will be removed from this workspace and logged on the audit trail. A new record can be issued
          later with a new id.
        </p>
      </Dialog>
    </div>
  );
}
