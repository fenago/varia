import { useMemo, useState } from "react";
/* type-scale: applied */
import { Link, Navigate, useParams } from "react-router-dom";
import { Blueprint, CopyField, EmptyState, OutcomeStamps, SkillTags, Stamp, BadgePreview, badgeOptionsFor } from "@ui/components";
import { usePageTitle } from "@ui/shell/PageTitleContext";
import { useWorkspace } from "@lib/store/workspace";
import { credentialForRecord, learnersWithRecords, portfolioFor, type PortfolioItem } from "@lib/store/selectors";
import { downloadOpenBadge } from "@lib/badges/openBadges";
import type { OutcomeKind } from "@shared/types";

const PUBLIC = "__public__";

function formatDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

const STUDENT_OUTCOMES: { kind: OutcomeKind; label: string }[] = [
  { kind: "interviewed", label: "Interviewed" },
  { kind: "offered", label: "Offered" },
  { kind: "hired", label: "Hired" },
];

function WorkSampleCard({ item, learnerId }: { item: PortfolioItem; learnerId: string }) {
  const ws = useWorkspace();
  const { record, view, challenge, endorsements, outcomes, shares } = item;
  const bridge = record.bridge;
  const sample = bridge?.workSample;

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<"share" | "outcome" | null>(null);
  const [shareTarget, setShareTarget] = useState<string>(ws.employerPartners[0]?.organisation ?? "");
  const [customOrg, setCustomOrg] = useState("");
  const [shareLink, setShareLink] = useState<{ org: string | null; link: string } | null>(null);
  const [outcomeKind, setOutcomeKind] = useState<OutcomeKind>("interviewed");
  const [outcomeOrg, setOutcomeOrg] = useState(challenge?.organisation ?? "");
  const [outcomeNote, setOutcomeNote] = useState("");

  const partners = ws.employerPartners;
  const skills = sample?.skills ?? [];
  const endorsedBy = endorsements[0] ?? null;
  const activeShares = shares.filter((s) => !s.revokedAt);

  const toggleSubmission = async (included: boolean) => {
    setError(null);
    setSaving(true);
    try {
      await ws.setSubmissionIncluded(record.id, included);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  const share = () => {
    setError(null);
    const org = shareTarget === PUBLIC ? null : shareTarget === "__custom__" ? customOrg.trim() : shareTarget;
    if (shareTarget === "__custom__" && !org) {
      setError("Name the organisation you are sharing with.");
      return;
    }
    try {
      ws.createPortfolioShare(learnerId, [record.id], org);
      const partner = org ? partners.find((p) => p.organisation.toLowerCase() === org.toLowerCase()) : null;
      const path = partner ? `/talent/${partner.id}` : `/portfolio/${learnerId}`;
      setShareLink({ org, link: `${window.location.origin}${path}` });
      setOpen(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const logOutcome = () => {
    setError(null);
    if (!outcomeOrg.trim()) {
      setError("Name the organisation.");
      return;
    }
    try {
      ws.addOutcome({ recordId: record.id, kind: outcomeKind, organisation: outcomeOrg.trim(), by: "student", note: outcomeNote.trim() || undefined });
      setOutcomeNote("");
      setOpen(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <Blueprint className="va-worksample">
      {(() => {
        const cred = credentialForRecord(ws, record.id);
        const live = !!cred && !cred.revokedAt;
        return (
          <BadgePreview
            shape="square"
            state={live ? "issued" : "preview"}
            width="min(100%, 220px)"
            style={{ marginBottom: 12 }}
            caption={live ? undefined : "Preview: becomes a credential once an employer validates the rubric and endorses this work"}
            opts={badgeOptionsFor({ achievementName: view.blueprint.name, record, credential: live ? cred : null, endorsedBy: endorsements.filter((e) => e.meetsBar).map((e) => e.organisation), skills, learnerLabel: null })}
          />
        );
      })()}
      <div className="va-worksample-head">
        <div>
          <div className="va-worksample-title">{view.blueprint.name}</div>
          <div className="va-muted-12">
            {challenge ? `${challenge.organisation} · ${challenge.title}` : view.course.code} · {formatDate(record.issuedAt)}
          </div>
        </div>
        <span className="va-tags">
          {endorsedBy ? (
            <Stamp gate="pass" title={`${endorsedBy.reviewerName} · ${endorsedBy.score} / 5${endorsedBy.meetsBar ? " · meets their bar" : ""}`}>
              Endorsed by {endorsedBy.organisation}
            </Stamp>
          ) : null}
          <OutcomeStamps outcomes={outcomes} />
        </span>
      </div>

      <div className="va-worksample-body">
        <div className="va-row-flex" style={{ gap: 14, flexWrap: "wrap", alignItems: "baseline" }}>
          <span style={{ fontFamily: "var(--font-heading)", fontSize: 24, lineHeight: 1 }}>
            {view.grade ? `${view.grade.total} / ${view.grade.maxTotal}` : "—"}
          </span>
          <span className="va-muted-12">rubric result · {view.blueprint.rubric.length} criteria</span>
          <Stamp gate={bridge?.signature ? "pass" : "watch"} title={bridge?.signedWithKid ?? undefined}>
            {bridge?.signature ? "Signed" : "Unsigned"}
          </Stamp>
          <Stamp gate={sample?.submissionIncluded ? "pass" : "watch"}>{sample?.submissionIncluded ? "Submission included" : "Submission withheld"}</Stamp>
          {view.submission?.origin === "ai-sample" && (
            <Stamp gate="watch" title="Written by a model for the recorded demo; the grade is the model's suggestion">
              AI-written sample · {view.submission.sampleTier} tier
            </Stamp>
          )}
        </div>
        <div style={{ marginTop: 10 }}>
          <SkillTags skills={skills} />
        </div>
      </div>

      <div className="va-worksample-meta va-muted-12">
        <span>
          Record <span style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}>{record.id}</span>
        </span>
        <span>
          {activeShares.length === 0
            ? "not shared through this portfolio"
            : `shared with ${activeShares.map((s) => s.toOrganisation ?? "anyone with the link").join(", ")}`}
        </span>
      </div>

      <div className="va-worksample-actions">
        <label style={{ display: "inline-flex", gap: 8, alignItems: "center", fontSize: 15, cursor: "pointer" }}>
          <input type="checkbox" checked={!!sample?.submissionIncluded} disabled={saving} onChange={(e) => toggleSubmission(e.target.checked)} />
          <span>{saving ? "Saving…" : "Include my submission"}</span>
        </label>
        <button type="button" className="btn btn-secondary" onClick={() => setOpen(open === "share" ? null : "share")}>
          Share with an employer
        </button>
        <button type="button" className="btn btn-secondary" onClick={() => setOpen(open === "outcome" ? null : "outcome")}>
          Log an outcome
        </button>
        <button type="button" className="btn btn-secondary" onClick={() => downloadOpenBadge(view, record, ws.signingKey ?? null, { endorsements, outcomes })}>
          Download Open Badges 3.0
        </button>
        <Link className="btn btn-ghost" to={`/evidence/${record.variantId}`} style={{ textDecoration: "none" }}>
          Open record
        </Link>
        {(() => {
          const cred = credentialForRecord(ws, record.id);
          return cred && !cred.revokedAt ? (
            <>
              <Link className="btn btn-ghost" to={`/credential/${record.id}?as=learner`} style={{ textDecoration: "none" }}>
                View credential
              </Link>
              <Link className="btn btn-ghost" to={`/credential/${record.id}?as=learner#share`} style={{ textDecoration: "none" }}>
                Share the badge
              </Link>
              <Link className="btn btn-ghost" to={`/credential/${record.id}?as=learner#share`} style={{ textDecoration: "none" }}>
                Add to LinkedIn
              </Link>
            </>
          ) : null;
        })()}
      </div>

      {open === "share" && (
        <div className="va-surface-box" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div className="field" style={{ margin: 0 }}>
            <label>Share this sample with</label>
            <select className="input" value={shareTarget} onChange={(e) => setShareTarget(e.target.value)}>
              {partners.map((p) => (
                <option key={p.id} value={p.organisation}>
                  {p.organisation} · {p.sector}
                </option>
              ))}
              <option value="__custom__">Another organisation…</option>
              <option value={PUBLIC}>Anyone with the link (public)</option>
            </select>
          </div>
          {shareTarget === "__custom__" && (
            <div className="field" style={{ margin: 0 }}>
              <label>Organisation</label>
              <input className="input" value={customOrg} onChange={(e) => setCustomOrg(e.target.value)} placeholder="e.g. Harbor Logistics" />
            </div>
          )}
          <div className="va-muted-12">
            Sharing records your consent on the record. The employer sees your learner id, this task, your result and the checks on your assessment. Your
            submission text is included only if the box above is ticked.
          </div>
          <div className="va-btn-row">
            <button type="button" className="btn btn-primary" onClick={share}>
              Share
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => setOpen(null)}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {open === "outcome" && (
        <div className="va-surface-box" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div className="va-two" style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)", gap: 10 }}>
            <div className="field" style={{ margin: 0 }}>
              <label>What happened</label>
              <select className="input" value={outcomeKind} onChange={(e) => setOutcomeKind(e.target.value as OutcomeKind)}>
                {STUDENT_OUTCOMES.map((o) => (
                  <option key={o.kind} value={o.kind}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="field" style={{ margin: 0 }}>
              <label>Organisation</label>
              <input className="input" list={`orgs-${record.id}`} value={outcomeOrg} onChange={(e) => setOutcomeOrg(e.target.value)} />
              <datalist id={`orgs-${record.id}`}>
                {partners.map((p) => (
                  <option key={p.id} value={p.organisation} />
                ))}
              </datalist>
            </div>
          </div>
          <div className="field" style={{ margin: 0 }}>
            <label>
              Note <span className="text-muted">— optional, e.g. the role</span>
            </label>
            <input className="input" value={outcomeNote} onChange={(e) => setOutcomeNote(e.target.value)} />
          </div>
          <div className="va-btn-row">
            <button type="button" className="btn btn-primary" onClick={logOutcome}>
              Log it
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => setOpen(null)}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {shareLink && (
        <CopyField
          label={shareLink.org ? `Shared with ${shareLink.org}` : "Shared publicly"}
          value={shareLink.link}
          hint={shareLink.org ? "This opens the employer's talent view, where your sample now appears." : "Anyone with this link can see the samples you have shared publicly."}
        />
      )}

      {activeShares.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 15 }}>
          {activeShares.map((s) => (
            <div key={s.id} style={{ display: "flex", gap: 10, alignItems: "baseline", flexWrap: "wrap" }}>
              <Stamp gate="pass">Shared</Stamp>
              <span>{s.toOrganisation ?? "Anyone with the link"}</span>
              <span className="va-muted-12">{formatDate(s.createdAt)}</span>
              <button type="button" className="btn btn-ghost" style={{ marginLeft: "auto" }} onClick={() => ws.revokePortfolioShare(s.id)}>
                Revoke
              </button>
            </div>
          ))}
        </div>
      )}

      {error && <div style={{ color: "#8d4a3c", fontSize: 14 }}>{error}</div>}
    </Blueprint>
  );
}

export default function Portfolio() {
  const { learnerId } = useParams<{ learnerId: string }>();
  const ws = useWorkspace();
  const learners = useMemo(() => learnersWithRecords(ws), [ws]);
  const portfolio = useMemo(() => (learnerId ? portfolioFor(ws, learnerId) : null), [ws, learnerId]);

  usePageTitle("Your verified work", learnerId ? `Portfolio · ${learnerId}` : "Portfolio");

  if (!learnerId) {
    if (learners.length === 0) {
      return (
        <div className="va-stack" style={{ gap: 18 }}>
          <EmptyState heading="No verified work yet" text="A portfolio appears once a graded submission has been made into an evidence record. Grade a submission, then press “Make this a verified record” on the Grade page." />
          <Blueprint className="va-badge-side" style={{ padding: "18px 20px" }}>
            <BadgePreview
              shape="card"
              state="illustrative"
              opts={badgeOptionsFor({ achievementName: "Classifier audit for a lending risk committee", endorsedBy: ["Bayfront Regional Bank"], skills: ["Fairness analysis", "Robustness evaluation", "Documentation review", "Risk prioritisation"] })}
            />
            <div style={{ fontSize: 15, lineHeight: 1.55 }}>
              <div className="va-heading-16">What appears here</div>
              <span className="text-muted">Each graded piece of work becomes a badge like this: the skill, the result, the employer's endorsement, and a verify link. The student chooses who sees it, adds it to LinkedIn, or downloads the image.</span>
            </div>
          </Blueprint>
        </div>
      );
    }
    return <Navigate to={`/portfolio/${learners[0].learnerId}`} replace />;
  }

  if (!portfolio) {
    return (
      <EmptyState
        heading="No portfolio for this learner"
        text={`${learnerId} has no evidence records in this browser's workspace. Records are issued from the roster or grading page after a submission is graded.`}
      />
    );
  }

  const { student, course, skills, items } = portfolio;
  const endorsedCount = items.filter((i) => i.endorsements.length > 0).length;
  const outcomeCount = items.reduce((a, i) => a + i.outcomes.length, 0);

  return (
    <div className="va-page" style={{ gap: 22 }}>
      <Blueprint style={{ padding: "24px 26px" }}>
        <div className="va-kicker">Your portfolio</div>
        <div style={{ display: "flex", gap: 14, alignItems: "baseline", flexWrap: "wrap", marginTop: 4 }}>
          <div style={{ fontFamily: "var(--font-heading)", fontSize: 30, lineHeight: 1.05 }}>{student.name}</div>
          <span className="va-muted-12">
            learner id <span style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}>{learnerId}</span>
          </span>
        </div>
        <div style={{ fontSize: 17, marginTop: 6 }}>
          {course.code} · {course.term} · {course.title}
        </div>
        <div style={{ marginTop: 12 }}>
          <div className="va-kicker" style={{ marginBottom: 6 }}>
            Skills evidenced
          </div>
          {skills.length === 0 ? (
            <span className="va-muted-12">none yet</span>
          ) : (
            <span className="va-tags">
              {skills.map(({ skill, count }) => (
                <span key={skill.key} className="tag tag-outline" title={`${count} record${count === 1 ? "" : "s"}${skill.externalRef ? ` · ${skill.externalRef}` : ""}`}>
                  {skill.label}
                  {count > 1 ? ` ×${count}` : ""}
                </span>
              ))}
            </span>
          )}
        </div>
        <div className="va-muted-12" style={{ marginTop: 12 }}>
          {items.length} verified {items.length === 1 ? "record" : "records"} · {endorsedCount} endorsed · {outcomeCount} {outcomeCount === 1 ? "outcome" : "outcomes"} logged
        </div>
        <p className="text-muted" style={{ margin: "12px 0 0", fontSize: 15, maxWidth: "72ch", lineHeight: 1.55 }}>
          Every graded task becomes a work sample here, signed by your institution. You decide which employers see which samples and whether your
          submission travels with them. In a real deployment the student signs in; this page stands in for that.
        </p>
      </Blueprint>

      {items.map((item) => (
        <WorkSampleCard key={item.record.id} item={item} learnerId={learnerId} />
      ))}

      {learners.length > 1 && (
        <div className="va-muted-12">
          Other learners with records:{" "}
          {learners
            .filter((l) => l.learnerId !== learnerId)
            .map((l) => (
              <Link key={l.learnerId} to={`/portfolio/${l.learnerId}`} style={{ marginRight: 10 }}>
                {l.student.name}
              </Link>
            ))}
        </div>
      )}
    </div>
  );
}
