import { useMemo, useState } from "react";
/* type-scale: applied */
import { Link, Navigate, useParams } from "react-router-dom";
import { Blueprint, EmptyState, Funnel, OutcomeStamps, SegScale, SkillTags, Stamp, BadgePreview, badgeOptionsFor } from "@ui/components";
import { usePageTitle } from "@ui/shell/PageTitleContext";
import { useWorkspace } from "@lib/store/workspace";
import { CREDENTIAL_STORY } from "@shared/credential-story";
import { challengesForPartner, credentialEligibility, credentialForRecord, employerFunnel, partnerById, talentRows, type TalentRow } from "@lib/store/selectors";
import type { EmployerPartner, OutcomeKind } from "@shared/types";

function formatDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function paragraphs(text: string): string[] {
  return text
    .split(/\n{2,}|\n(?=\S)/)
    .map((p) => p.trim())
    .filter(Boolean);
}

const EMPLOYER_OUTCOMES: { kind: OutcomeKind; label: string }[] = [
  { kind: "interviewed", label: "Interviewed" },
  { kind: "offered", label: "Offered" },
  { kind: "hired", label: "Hired" },
  { kind: "ramped", label: "Ramped (productive)" },
];

const SHARED_VIA_TEXT = {
  consent: "shared with you directly by the learner",
  portfolio: "shared with you from the learner's portfolio",
  public: "shared publicly by the learner",
} as const;

function CandidateCard({ row, partner }: { row: TalentRow; partner: EmployerPartner }) {
  const ws = useWorkspace();
  const { learnerId, record, view, challenge, skills, total, endorsements, outcomes, sharedVia } = row;
  const sample = record.bridge?.workSample;
  const ownEndorsement = endorsements.find((e) => e.organisation.toLowerCase() === partner.organisation.toLowerCase()) ?? null;

  const [open, setOpen] = useState<"endorse" | "outcome" | null>(null);
  const [showSubmission, setShowSubmission] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [reviewerName, setReviewerName] = useState(partner.contactName ?? "");
  const [reviewerEmail, setReviewerEmail] = useState(partner.contactEmail ?? "");
  const [score, setScore] = useState<number | null>(null);
  const [meetsBar, setMeetsBar] = useState(false);
  const [comment, setComment] = useState("");

  const [outcomeKind, setOutcomeKind] = useState<OutcomeKind>("interviewed");
  const [hours, setHours] = useState<string>("");
  const [note, setNote] = useState("");

  const endorse = () => {
    setError(null);
    if (!reviewerName.trim()) {
      setError("Your name is needed so the endorsement has a signer.");
      return;
    }
    if (score == null) {
      setError("Pick a score from 1 to 5.");
      return;
    }
    try {
      ws.addEndorsement({
        recordId: record.id,
        partnerId: partner.id,
        organisation: partner.organisation,
        reviewerName: reviewerName.trim(),
        reviewerEmail: reviewerEmail.trim() || undefined,
        score,
        meetsBar,
        comment: comment.trim(),
      });
      setOpen(null);
      setComment("");
      setScore(null);
      setMeetsBar(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const logOutcome = () => {
    setError(null);
    const h = outcomeKind === "ramped" ? Number(hours) : NaN;
    if (outcomeKind === "ramped" && (!hours.trim() || Number.isNaN(h) || h < 0)) {
      setError("Enter the onboarding hours to productive.");
      return;
    }
    try {
      ws.addOutcome({
        recordId: record.id,
        kind: outcomeKind,
        organisation: partner.organisation,
        by: "employer",
        note: note.trim() || undefined,
        onboardingHours: outcomeKind === "ramped" ? h : undefined,
      });
      setOpen(null);
      setNote("");
      setHours("");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <Blueprint className="va-worksample">
      <div className="va-worksample-head">
        <div>
          <div className="va-worksample-title">
            <span style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", fontSize: 17 }}>{learnerId}</span>
            <span className="text-muted" style={{ fontFamily: "var(--font-body)", fontSize: 15, marginLeft: 10 }}>
              {view.course.code} · {view.course.term}
            </span>
          </div>
          <div className="va-muted-12">
            {view.blueprint.name}
            {challenge ? ` · ${challenge.title}` : ""} · issued {formatDate(record.issuedAt)}
          </div>
        </div>
        <span className="va-tags">
          {endorsements.map((e) => (
            <Stamp key={e.id} gate="pass" title={`${e.reviewerName} · ${e.score} / 5${e.meetsBar ? " · meets the bar" : ""}`}>
              Endorsed by {e.organisation}
            </Stamp>
          ))}
          <OutcomeStamps outcomes={outcomes} />
        </span>
      </div>

      <div className="va-worksample-body">
        <div className="va-row-flex" style={{ gap: 14, flexWrap: "wrap", alignItems: "baseline" }}>
          <span style={{ fontFamily: "var(--font-heading)", fontSize: 24, lineHeight: 1 }}>{total == null ? "—" : `${total} / ${view.grade?.maxTotal ?? ""}`}</span>
          <span className="va-muted-12">rubric result</span>
          <Stamp gate={record.bridge?.signature ? "pass" : "watch"}>{record.bridge?.signature ? "Signed" : "Unsigned"}</Stamp>
          <span className="va-muted-12">{SHARED_VIA_TEXT[sharedVia]}</span>
        </div>
        <div style={{ marginTop: 10 }}>
          <SkillTags skills={skills} />
        </div>
        <div style={{ marginTop: 12 }}>
          {sample?.submissionIncluded && sample.submissionText ? (
            <>
              <button type="button" className="btn btn-ghost" style={{ paddingLeft: 0 }} onClick={() => setShowSubmission((s) => !s)}>
                {showSubmission ? "Hide the work sample" : "Read the work sample"}
              </button>
              {showSubmission && (
                <div className="va-surface-box" style={{ marginTop: 8, fontSize: 15.5, lineHeight: 1.6 }}>
                  {paragraphs(sample.submissionText).map((p, i) => (
                    <p key={i} style={{ margin: "0 0 8px" }}>
                      {p}
                    </p>
                  ))}
                </div>
              )}
            </>
          ) : (
            <span className="va-muted-12">Submission not shared. The learner can include it from their portfolio.</span>
          )}
        </div>
      </div>

      {!ownEndorsement && (
        <div className="va-row-flex" style={{ gap: 14, alignItems: "center", margin: "10px 0 4px", flexWrap: "wrap" }} data-walk="endorse">
          <BadgePreview
            shape="square"
            state="preview"
            width={120}
            opts={badgeOptionsFor({ achievementName: view.blueprint.name, record, endorsedBy: [partner.organisation], skills })}
          />
          <div style={{ fontSize: 14, lineHeight: 1.5, maxWidth: "40ch" }}>
            <div className="va-heading-16">{CREDENTIAL_STORY.talentCaption}</div>
            <span className="text-muted">Endorse it and the student's credential carries {partner.organisation}'s name.</span>
          </div>
        </div>
      )}
      <div className="va-worksample-actions">
        {ownEndorsement ? (
          <span className="va-muted-12">
            You endorsed this sample on {formatDate(ownEndorsement.at)} · {ownEndorsement.score} / 5
          </span>
        ) : (
          <button type="button" className="btn btn-primary" onClick={() => setOpen(open === "endorse" ? null : "endorse")}>
            Endorse
          </button>
        )}
        <button type="button" className="btn btn-secondary" onClick={() => setOpen(open === "outcome" ? null : "outcome")}>
          Log outcome
        </button>
        <Link className="btn btn-secondary" to={`/verify/${record.id}`} style={{ textDecoration: "none" }}>
          Verify
        </Link>
        {(() => {
          const ws = useWorkspace.getState();
          const cred = credentialForRecord(ws, record.id);
          if (cred && !cred.revokedAt)
            return (
              <Link className="btn btn-ghost" to={`/credential/${record.id}`} style={{ textDecoration: "none" }}>
                Credential {cred.id}
              </Link>
            );
          return credentialEligibility(ws, record.id).eligible ? (
            <Link className="btn btn-ghost" to={`/credential/${record.id}`} style={{ textDecoration: "none" }}>
              Issue credential
            </Link>
          ) : null;
        })()}
        <Link className="btn btn-ghost" to={`/evidence/${record.variantId}`} style={{ textDecoration: "none" }}>
          Open record
        </Link>
      </div>

      {open === "endorse" && (
        <div className="va-surface-box" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div className="va-two" style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)", gap: 10 }}>
            <div className="field" style={{ margin: 0 }}>
              <label>Your name</label>
              <input className="input" value={reviewerName} onChange={(e) => setReviewerName(e.target.value)} />
            </div>
            <div className="field" style={{ margin: 0 }}>
              <label>Work email</label>
              <input className="input" type="email" value={reviewerEmail} onChange={(e) => setReviewerEmail(e.target.value)} placeholder={`you@${partner.organisation.toLowerCase().replace(/\s+/g, "")}.example`} />
            </div>
          </div>
          <div className="field" style={{ margin: 0 }}>
            <label>Against your own bar, 1 (well below) to 5 (ready to hire)</label>
            <SegScale name={`endorse-${record.id}`} value={score} onChange={setScore} options={[1, 2, 3, 4, 5]} />
          </div>
          <label style={{ display: "inline-flex", gap: 8, alignItems: "center", fontSize: 15.5, cursor: "pointer" }}>
            <input type="checkbox" checked={meetsBar} onChange={(e) => setMeetsBar(e.target.checked)} />
            <span>This work meets the bar we would set for a new hire</span>
          </label>
          <div className="field" style={{ margin: 0 }}>
            <label>Comment</label>
            <textarea className="input" style={{ minHeight: 64 }} value={comment} onChange={(e) => setComment(e.target.value)} placeholder="What stood out, what was missing" />
          </div>
          <div className="va-btn-row">
            <button type="button" className="btn btn-primary" onClick={endorse}>
              Save endorsement
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => setOpen(null)}>
              Cancel
            </button>
          </div>
          <div className="va-muted-12">Your endorsement is added to the learner's record and appears on their portfolio and Open Badges export.</div>
        </div>
      )}

      {open === "outcome" && (
        <div className="va-surface-box" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div className="va-two" style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)", gap: 10 }}>
            <div className="field" style={{ margin: 0 }}>
              <label>What happened</label>
              <select className="input" value={outcomeKind} onChange={(e) => setOutcomeKind(e.target.value as OutcomeKind)}>
                {EMPLOYER_OUTCOMES.map((o) => (
                  <option key={o.kind} value={o.kind}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
            {outcomeKind === "ramped" ? (
              <div className="field" style={{ margin: 0 }}>
                <label>Hours to productive</label>
                <input className="input" type="number" min={0} value={hours} onChange={(e) => setHours(e.target.value)} placeholder="e.g. 40" />
              </div>
            ) : (
              <div className="field" style={{ margin: 0 }}>
                <label>
                  Note <span className="text-muted">— optional, e.g. the role</span>
                </label>
                <input className="input" value={note} onChange={(e) => setNote(e.target.value)} />
              </div>
            )}
          </div>
          <div className="va-btn-row">
            <button type="button" className="btn btn-primary" onClick={logOutcome}>
              Log it
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => setOpen(null)}>
              Cancel
            </button>
          </div>
          <div className="va-muted-12">Logged as {partner.organisation}. Outcomes feed the employer funnel and the institution's placement numbers.</div>
        </div>
      )}

      {error && <div style={{ color: "#8d4a3c", fontSize: 14 }}>{error}</div>}
    </Blueprint>
  );
}

export default function Talent() {
  const { partnerId } = useParams<{ partnerId: string }>();
  const ws = useWorkspace();
  const partner = useMemo(() => (partnerId ? partnerById(ws, partnerId) : null), [ws, partnerId]);
  const challenges = useMemo(() => (partnerId ? challengesForPartner(ws, partnerId) : []), [ws, partnerId]);
  const rows = useMemo(() => (partnerId ? talentRows(ws, partnerId) : []), [ws, partnerId]);
  const funnel = useMemo(() => (partnerId ? employerFunnel(ws, partnerId) : null), [ws, partnerId]);

  usePageTitle("Candidates who did your work", partner ? partner.organisation : "Talent view");

  if (!partnerId) {
    const first = ws.employerPartners[0];
    if (!first) return <EmptyState heading="No employer partners yet" text="Add a partner on the Employer validation page to open a talent view." />;
    return <Navigate to={`/talent/${first.id}`} replace />;
  }

  if (!partner) {
    return <EmptyState heading="Unknown employer partner" text={`${partnerId} is not a partner in this browser's workspace.`} />;
  }

  const activeChallenges = challenges.filter((c) => c.status === "active");

  return (
    <div className="va-page" style={{ gap: 22 }}>
      <Blueprint style={{ padding: "24px 26px" }}>
        <div className="va-kicker">Talent view</div>
        <div style={{ display: "flex", gap: 14, alignItems: "baseline", flexWrap: "wrap", marginTop: 4 }}>
          <div style={{ fontFamily: "var(--font-heading)", fontSize: 30, lineHeight: 1.05 }}>{partner.organisation}</div>
          <span className="tag tag-neutral">{partner.sector}</span>
          {partner.adoptedEvidenceRecords && <Stamp gate="pass">Accepts evidence records</Stamp>}
        </div>
        {(partner.contactName || partner.contactEmail) && (
          <div className="va-muted-12" style={{ marginTop: 6 }}>
            {partner.contactName}
            {partner.contactRole ? ` · ${partner.contactRole}` : ""}
            {partner.contactEmail ? ` · ${partner.contactEmail}` : ""}
          </div>
        )}
        <p className="text-muted" style={{ margin: "12px 0 0", fontSize: 15, maxWidth: "72ch", lineHeight: 1.55 }}>
          Learners below completed a version of your challenge and chose to share it with you. You see a learner id, never a name, plus the task, the
          result, the skills evidenced, and the signed record. Endorse the ones that meet your bar and tell us what happened next.
        </p>
      </Blueprint>

      {activeChallenges.length > 0 && (
        <div>
          <div className="va-kicker" style={{ marginBottom: 8 }}>
            Your challenges
          </div>
          <div style={{ display: "grid", gridTemplateColumns: `repeat(${Math.min(activeChallenges.length, 3)}, minmax(0, 1fr))`, gap: 16 }} className="va-split">
            {activeChallenges.map((c) => (
              <Blueprint key={c.id} style={{ padding: "14px 16px" }}>
                <div style={{ fontFamily: "var(--font-heading)", fontSize: 18 }}>{c.title}</div>
                <div className="va-muted-12" style={{ margin: "4px 0 8px" }}>
                  {c.domain} · {c.stakeholderRole}
                </div>
                <SkillTags skills={c.skillKeys.map((k) => ws.skills?.find((s) => s.key === k) ?? k)} max={4} />
              </Blueprint>
            ))}
          </div>
        </div>
      )}

      {funnel && (
        <Funnel
          steps={[
            { label: "Challenges contributed", value: funnel.challenges },
            { label: "Students who completed one", value: funnel.completed },
            { label: "Work samples shared with you", value: funnel.shared },
            { label: "Endorsed", value: funnel.endorsed },
            { label: "Interviewed", value: funnel.interviewed },
            { label: "Hired", value: funnel.hired },
          ]}
        />
      )}

      <div data-walk="candidates" style={{ display: "flex", flexDirection: "column", gap: 18 }}>
        {rows.length === 0 ? (
          <EmptyState
            heading={`No learner has shared a sample with ${partner.organisation} yet`}
            text="Samples appear here only when a learner chooses to share them, from their portfolio or their record's share page. That consent is recorded on the record and can be revoked by the learner."
          />
        ) : (
          rows.map((row) => <CandidateCard key={row.record.id} row={row} partner={partner} />)
        )}
      </div>

      {ws.employerPartners.length > 1 && (
        <div className="va-muted-12">
          Other partners:{" "}
          {ws.employerPartners
            .filter((p) => p.id !== partner.id)
            .map((p) => (
              <Link key={p.id} to={`/talent/${p.id}`} style={{ marginRight: 10 }}>
                {p.organisation}
              </Link>
            ))}
        </div>
      )}
    </div>
  );
}
