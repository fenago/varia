import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
/* type-scale: applied */
import { useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { Blueprint, BlueprintButton, ChipEditor, CopyField, Field, FileDrop, LikertRow, Stamp, type PillGate } from "@ui/components";
import { usePageTitle } from "@ui/shell/PageTitleContext";
import { getWorkspace, useWorkspace } from "@lib/store/workspace";
import { decodePackage, downloadJson, readFragmentParam, readJsonFile, resultLink } from "@lib/share";
import { SATISFACTION_QUESTIONS } from "@shared/thresholds";
import type { EmployerSatisfaction, EmployerValidation, Property, ReviewPackage, ReviewResult, ScenarioEdit, ValidationStatus } from "@shared/types";

const RED = "#8d4a3c";

type Origin = "workspace" | "link" | "file";
type SurveyKey = (typeof SATISFACTION_QUESTIONS)[number]["key"];

const STATUS_OPTIONS: { value: ValidationStatus; title: string; description: string }[] = [
  { value: "validated", title: "Validated", description: "This assessment reflects real work and the rubric reflects what we hire or promote for." },
  { value: "changes-requested", title: "Changes requested", description: "Close, but the comments above need to be addressed before we would rely on it." },
  { value: "declined", title: "Declined", description: "This does not reflect our work or our hiring criteria." },
];

const GATE_PILL: Record<"pass" | "fail" | "advisory", PillGate> = { pass: "pass", fail: "fail", advisory: "advisory" };
const PROPERTY_ORDER: Property[] = ["p1", "p2", "p3", "p4"];

function scenarioDiff(pkg: ReviewPackage, edited: Record<string, string[]>): ScenarioEdit[] {
  const edits: ScenarioEdit[] = [];
  for (const dim of pkg.blueprint.surfaceDimensions) {
    if (dim.locked) continue;
    const before = dim.values;
    const after = edited[dim.key] ?? before;
    const lowerBefore = new Set(before.map((v) => v.toLowerCase()));
    const lowerAfter = new Set(after.map((v) => v.toLowerCase()));
    const added = after.filter((v) => !lowerBefore.has(v.toLowerCase()));
    const removed = before.filter((v) => !lowerAfter.has(v.toLowerCase()));
    if (added.length || removed.length) edits.push({ dimensionKey: dim.key, added, removed });
  }
  return edits;
}

const CONSUMER_DOMAINS = ["gmail.com", "googlemail.com", "yahoo.com", "outlook.com", "hotmail.com", "live.com", "icloud.com", "me.com", "aol.com"];
function isPlausibleEmail(v: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.trim());
}
function isConsumerMailbox(v: string): boolean {
  const domain = v.trim().toLowerCase().split("@")[1] ?? "";
  return CONSUMER_DOMAINS.includes(domain);
}

function fmtDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

export default function Review() {
  const { blueprintId } = useParams<{ blueprintId: string }>();
  const [search] = useSearchParams();
  const navigate = useNavigate();
  const location = useLocation();
  const recordValidation = useWorkspace((s) => s.recordValidation);
  const hasPkg = useRef(false);

  const [pkg, setPkg] = useState<ReviewPackage | null>(null);
  const [origin, setOrigin] = useState<Origin>("link");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [resolving, setResolving] = useState(true);

  // ---- resolve the package ----
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setResolving(true);
      setLoadError(null);
      try {
        if (blueprintId) {
          const partnerId = search.get("partner") || null;
          const built = getWorkspace().buildReviewPackage(blueprintId, partnerId);
          if (!cancelled) {
            setPkg(built);
            hasPkg.current = true;
            setOrigin("workspace");
          }
          return;
        }
        const token = readFragmentParam("pkg");
        if (token) {
          const decoded = await decodePackage<ReviewPackage>(token);
          if (!decoded || decoded.version !== 1 || !decoded.blueprint) throw new Error("This link does not contain a VARIA review package.");
          // Clear the hash through the router so its location state changes too
          // (history.replaceState alone leaves the router's hash stale, and a later
          // identical link would not re-trigger this effect).
          navigate({ pathname: location.pathname, search: location.search }, { replace: true });
          if (!cancelled) {
            resetForm();
            setPkg(decoded);
            hasPkg.current = true;
            setOrigin("link");
          }
          return;
        }
        // No token: only clear when nothing is loaded (clearFragment() re-runs this effect).
        if (!cancelled && !hasPkg.current) setPkg(null);
      } catch (err) {
        if (!cancelled) setLoadError(err instanceof Error ? err.message : String(err));
      } finally {
        if (!cancelled) setResolving(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [blueprintId, search, location.hash]);

  const onPackageFile = async (files: File[]) => {
    const file = files[0];
    if (!file) return;
    try {
      const decoded = await readJsonFile<ReviewPackage>(file);
      if (!decoded || decoded.version !== 1 || !decoded.blueprint) throw new Error("That file is not a VARIA review package.");
      resetForm();
      setPkg(decoded);
      hasPkg.current = true;
      setOrigin("file");
      setLoadError(null);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : String(err));
    }
  };

  const orgFromPackage = pkg?.partner?.organisation ?? "";
  usePageTitle("Validate an assessment", orgFromPackage ? `Reviewing for ${orgFromPackage}` : "Employer review");

  // ---- form state ----
  const [constructComment, setConstructComment] = useState("");
  const [criteriaComments, setCriteriaComments] = useState<Record<string, string>>({});
  const [scenario, setScenario] = useState<Record<string, string[]>>({});
  const [openAnswers, setOpenAnswers] = useState<Record<string, boolean>>({});
  const [reviewerName, setReviewerName] = useState("");
  const [reviewerRole, setReviewerRole] = useState("");
  const [reviewerEmail, setReviewerEmail] = useState("");
  const [organisation, setOrganisation] = useState("");
  const [status, setStatus] = useState<ValidationStatus | null>(null);
  const [attested, setAttested] = useState(false);
  const [survey, setSurvey] = useState<Partial<Record<SurveyKey, number>>>({});
  const [surveyComment, setSurveyComment] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState<{ result: ReviewResult; link: string } | null>(null);

  function resetForm() {
    setConstructComment("");
    setCriteriaComments({});
    setOpenAnswers({});
    setReviewerName("");
    setReviewerRole("");
    setReviewerEmail("");
    setOrganisation("");
    setStatus(null);
    setAttested(false);
    setSurvey({});
    setSurveyComment("");
    setFormError(null);
    setDone(null);
  }

  useEffect(() => {
    if (!pkg) return;
    const init: Record<string, string[]> = {};
    for (const d of pkg.blueprint.surfaceDimensions) if (!d.locked) init[d.key] = [...d.values];
    setScenario(init);
    if (pkg.partner?.organisation) setOrganisation(pkg.partner.organisation);
  }, [pkg]);

  const unlockedDims = useMemo(() => pkg?.blueprint.surfaceDimensions.filter((d) => !d.locked) ?? [], [pkg]);
  const lockedDims = useMemo(() => pkg?.blueprint.surfaceDimensions.filter((d) => d.locked) ?? [], [pkg]);
  const surveyComplete = SATISFACTION_QUESTIONS.every((q) => typeof survey[q.key] === "number");

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!pkg) return;
    if (!reviewerName.trim() || !organisation.trim()) {
      setFormError("Your name and organisation are required.");
      return;
    }
    if (!isPlausibleEmail(reviewerEmail)) {
      setFormError("Enter your work email so this validation has a real signer.");
      return;
    }
    if (!status) {
      setFormError("Choose Validated, Changes requested, or Declined.");
      return;
    }
    if (status === "validated" && !attested) {
      setFormError("To validate, tick the attestation that the rubric reflects what you hire or promote for.");
      return;
    }
    setFormError(null);
    setSubmitting(true);
    try {
      const satisfaction: EmployerSatisfaction | null = surveyComplete
        ? {
            realism: survey.realism as number,
            rubricFit: survey.rubricFit as number,
            fairness: survey.fairness as number,
            trust: survey.trust as number,
            adoptionIntent: survey.adoptionIntent as number,
            comment: surveyComment.trim(),
            submittedAt: new Date().toISOString(),
          }
        : null;
      const validation: Omit<EmployerValidation, "id" | "source"> = {
        blueprintId: pkg.blueprint.id,
        blueprintName: pkg.blueprint.name,
        partnerId: pkg.partner?.id ?? null,
        organisation: organisation.trim(),
        reviewerName: reviewerName.trim(),
        reviewerRole: reviewerRole.trim(),
        reviewerEmail: reviewerEmail.trim(),
        reviewedAt: new Date().toISOString(),
        status,
        attested,
        criteriaComments: Object.fromEntries(Object.entries(criteriaComments).filter(([, v]) => v.trim()).map(([k, v]) => [k, v.trim()])),
        constructComment: constructComment.trim(),
        scenarioEdits: scenarioDiff(pkg, scenario),
        sampleVariantIds: pkg.sampleVariants.map((v) => v.id),
        satisfaction,
      };
      if (origin === "workspace") {
        recordValidation(validation, "workspace");
        navigate("/employer");
        return;
      }
      const result: ReviewResult = { version: 1, packageIssuedAt: pkg.issuedAt, validation };
      const link = await resultLink(result);
      setDone({ result, link });
      window.scrollTo({ top: 0 });
    } catch (err) {
      setFormError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  };

  // ---- render: loading / no package ----
  if (resolving) {
    return (
      <p className="text-muted" style={{ margin: 0 }}>
        Opening the review package…
      </p>
    );
  }

  if (!pkg) {
    return (
      <div className="va-page" style={{ gap: 18 }}>
        <p style={{ margin: 0, maxWidth: "66ch", fontSize: 17, lineHeight: 1.6 }}>
          An instructor sends you a review link or a package file. Open the link, or drop the file here. Nothing you do on this page is
          uploaded anywhere.
        </p>
        <FileDrop
          onFiles={(files) => void onPackageFile(files)}
          heading="Drop the review package here"
          text="A .json file the instructor exported from VARIA."
          accept=".json,application/json"
          browseLabel="Choose package file"
        />
        {loadError ? <div style={{ color: RED, fontSize: 15 }}>{loadError}</div> : null}
      </div>
    );
  }

  // ---- render: done (link/file origin) ----
  if (done) {
    const slug = pkg.blueprint.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
    return (
      <div className="va-page" style={{ gap: 18 }}>
        <Blueprint style={{ padding: "22px 24px" }}>
          <div className="va-row-flex" style={{ marginBottom: 8, flexWrap: "wrap" }}>
            <h6 style={{ margin: 0 }}>Thank you. Your review is ready to send back.</h6>
            <Stamp gate={done.result.validation.status === "validated" ? "pass" : done.result.validation.status === "declined" ? "fail" : "watch"}>
              {STATUS_OPTIONS.find((s) => s.value === done.result.validation.status)?.title}
            </Stamp>
          </div>
          <p style={{ margin: "0 0 14px", fontSize: 16, lineHeight: 1.6, maxWidth: "70ch" }}>
            Send this link or file back to the instructor. Your review is inside it; nothing was uploaded anywhere.
          </p>
          <CopyField label="Result link" value={done.link} hint="Paste it into an email or message to the instructor." />
          <div className="va-btn-row" style={{ marginTop: 10 }}>
            <button type="button" className="btn btn-secondary" onClick={() => downloadJson(done.result, `varia-review-result-${slug}`)}>
              Download result
            </button>
          </div>
        </Blueprint>
      </div>
    );
  }

  // ---- render: the review ----
  const bp = pkg.blueprint;
  const checks = pkg.report ? PROPERTY_ORDER.map((p) => pkg.report!.checks[p]).filter(Boolean) : [];

  return (
    <form className="va-page" style={{ gap: 22 }} onSubmit={(e) => void submit(e)}>
      <Blueprint className="va-dark" style={{ padding: "22px 24px" }}>
        <div className="va-kicker">{pkg.course.code} · {pkg.course.term} · {pkg.course.instructor.institution}</div>
        <h3 style={{ margin: "6px 0 8px", maxWidth: "34ch" }}>{bp.name}</h3>
        <p style={{ margin: 0, fontSize: 16, lineHeight: 1.6, color: "#d5e0ea", maxWidth: "70ch" }}>
          Issued by {pkg.issuedBy} on {fmtDate(pkg.issuedAt)}. You are asked whether this assessment reflects real work in your
          organisation and whether its rubric reflects what you hire or promote for. Your edits to the scenario bank become the
          scenarios students receive.
        </p>
      </Blueprint>

      {loadError ? <div style={{ color: RED, fontSize: 15 }}>{loadError}</div> : null}

      <Blueprint style={{ padding: "20px 22px" }}>
        <h6 style={{ margin: "0 0 6px" }}>What this assessment measures</h6>
        <p className="text-muted" style={{ margin: "0 0 10px", fontSize: 14 }}>
          This is the one thing held constant across every student's version.
        </p>
        <div className="va-surface-box" style={{ fontSize: 16, lineHeight: 1.6 }}>
          {bp.construct}
        </div>
        {bp.constructDimensions.length ? (
          <div className="va-tags" style={{ marginTop: 10 }}>
            {bp.constructDimensions.map((d) => (
              <span key={d} className="tag tag-outline">
                {d}
              </span>
            ))}
          </div>
        ) : null}
        <Field label="Your comment" hint="— optional" style={{ marginTop: 12 }}>
          <textarea className="input va-textarea" style={{ minHeight: 64 }} value={constructComment} onChange={(e) => setConstructComment(e.target.value)} />
        </Field>
      </Blueprint>

      <Blueprint style={{ padding: "20px 22px" }}>
        <h6 style={{ margin: "0 0 6px" }}>The rubric</h6>
        <p className="text-muted" style={{ margin: "0 0 14px", fontSize: 14 }}>
          {bp.rubric.length} criteria, each scored 0–3. The same rubric grades every version. Say where it does or does not match what
          you look for.
        </p>
        <div className="va-stack" style={{ gap: 16 }}>
          {bp.rubric.map((c) => (
            <div key={c.id} style={{ borderTop: "1px solid var(--color-divider)", paddingTop: 12 }}>
              <div className="va-row-flex" style={{ flexWrap: "wrap" }}>
                <span className="va-heading-15">{c.name}</span>
                <span className="text-muted va-muted-12">
                  {c.points} points · {Math.round(c.weight * 100)}%
                </span>
              </div>
              {c.anchors ? (
                <ol start={0} style={{ margin: "8px 0 0", paddingLeft: 22, fontSize: 15, lineHeight: 1.5, color: "var(--color-neutral-700)" }}>
                  {c.anchors.map((a, i) => (
                    <li key={i} value={i}>
                      {a}
                    </li>
                  ))}
                </ol>
              ) : (
                <div className="text-muted va-muted-12" style={{ marginTop: 6 }}>
                  No level descriptions yet.
                </div>
              )}
              <Field label="Your comment" hint="— optional" style={{ marginTop: 10 }}>
                <textarea
                  className="input va-textarea"
                  style={{ minHeight: 52 }}
                  value={criteriaComments[c.id] ?? ""}
                  onChange={(e) => setCriteriaComments((m) => ({ ...m, [c.id]: e.target.value }))}
                />
              </Field>
            </div>
          ))}
        </div>
      </Blueprint>

      <Blueprint style={{ padding: "20px 22px" }}>
        <h6 style={{ margin: "0 0 6px" }}>The scenario bank</h6>
        <p className="text-muted" style={{ margin: "0 0 14px", fontSize: 14, maxWidth: "70ch" }}>
          Every student gets a different combination of these. Add the settings, roles and situations your organisation actually
          faces, and remove any that do not ring true.
        </p>
        <div className="va-stack" style={{ gap: 16 }}>
          {unlockedDims.map((d) => (
            <div key={d.key}>
              <div className="va-row-flex" style={{ marginBottom: 6 }}>
                <span className="va-heading-15">{d.label}</span>
                {d.note ? <span className="text-muted va-muted-12">{d.note}</span> : null}
              </div>
              <ChipEditor label={d.label} values={scenario[d.key] ?? d.values} onChange={(vals) => setScenario((s) => ({ ...s, [d.key]: vals }))} placeholder={`Add a ${d.label.toLowerCase()}`} />
            </div>
          ))}
          {lockedDims.length ? (
            <div className="va-tags">
              {lockedDims.map((d) => (
                <span key={d.key} className="tag tag-outline">
                  {d.label} · held constant
                </span>
              ))}
            </div>
          ) : null}
        </div>
      </Blueprint>

      <Blueprint style={{ padding: "20px 22px" }}>
        <h6 style={{ margin: "0 0 6px" }}>Sample versions</h6>
        <p className="text-muted" style={{ margin: "0 0 14px", fontSize: 14 }}>
          {pkg.sampleVariants.length
            ? `${pkg.sampleVariants.length} of the versions students receive. Would you accept any of these as a work sample?`
            : "No versions have been generated for this assessment yet, so there are no samples to show. The construct, rubric and scenario bank above are what every version will be built from."}
        </p>
        <div className="va-stack" style={{ gap: 14 }}>
          {pkg.sampleVariants.map((v) => (
            <div key={v.id} className="va-quote">
              <div className="va-row-flex" style={{ flexWrap: "wrap", marginBottom: 6 }}>
                <span className="tag tag-accent">{v.id}</span>
                {Object.entries(v.surfaceAssignment).map(([k, val]) => (
                  <span key={k} className="tag tag-outline">
                    {val}
                  </span>
                ))}
              </div>
              <div style={{ fontSize: 15.5, lineHeight: 1.55, whiteSpace: "pre-wrap" }}>{v.text}</div>
              <button type="button" className="btn btn-ghost" style={{ marginTop: 8 }} onClick={() => setOpenAnswers((o) => ({ ...o, [v.id]: !o[v.id] }))}>
                {openAnswers[v.id] ? "Hide the model answer" : "Show the model answer for this version"}
              </button>
              {openAnswers[v.id] ? (
                <div className="va-surface-box" style={{ marginTop: 8, fontSize: 15, lineHeight: 1.55, whiteSpace: "pre-wrap" }}>
                  {v.adaptedSolution}
                </div>
              ) : null}
            </div>
          ))}
        </div>
      </Blueprint>

      {checks.length ? (
        <Blueprint style={{ padding: "20px 22px" }}>
          <h6 style={{ margin: "0 0 6px" }}>Integrity of the version set</h6>
          <p className="text-muted" style={{ margin: "0 0 12px", fontSize: 14, maxWidth: "70ch" }}>
            Before release, the set is checked so that no two students can share answers and every student is measured on the same
            skill at the same difficulty.
          </p>
          <div className="va-tags">
            {checks.map((c) => (
              <Stamp key={c.property} gate={GATE_PILL[c.gate]} title={c.detail}>
                {c.label} · {c.gate === "pass" ? "pass" : c.gate === "advisory" ? "advisory" : "over threshold"}
              </Stamp>
            ))}
          </div>
        </Blueprint>
      ) : null}

      <Blueprint style={{ padding: "20px 22px" }}>
        <h6 style={{ margin: "0 0 12px" }}>Sign off</h6>
        <div className="va-two" style={{ gap: 14 }}>
          <Field label="Your name">
            <input className="input" value={reviewerName} onChange={(e) => setReviewerName(e.target.value)} required />
          </Field>
          <Field label="Your role">
            <input className="input" value={reviewerRole} onChange={(e) => setReviewerRole(e.target.value)} />
          </Field>
          <Field label="Organisation">
            <input className="input" value={organisation} onChange={(e) => setOrganisation(e.target.value)} required />
          </Field>
          <Field label="Work email" hint="— required; this is who signs the validation">
            <input className="input" type="email" value={reviewerEmail} onChange={(e) => setReviewerEmail(e.target.value)} required />
          </Field>
        </div>
        {reviewerEmail.trim() && isConsumerMailbox(reviewerEmail) ? (
          <div style={{ color: "#8a6d2f", fontSize: 14, marginTop: -4, marginBottom: 8 }}>
            Use your work address at {organisation.trim() || "your organisation"} so this validation has a real signer.
          </div>
        ) : null}
        <div className="va-stack" style={{ gap: 10, marginTop: 6 }}>
          {STATUS_OPTIONS.map((o) => (
            <Blueprint
              key={o.value}
              as="label"
              style={{ display: "flex", gap: 14, padding: "12px 14px", cursor: "pointer", background: status === o.value ? "var(--color-accent-100)" : undefined }}
            >
              <span className="radio" style={{ pointerEvents: "none" }}>
                <input type="radio" name="status" checked={status === o.value} onChange={() => setStatus(o.value)} />
                <span className="dot" />
              </span>
              <span>
                <span style={{ fontFamily: "var(--font-heading)", fontSize: 18, display: "block" }}>{o.title}</span>
                <span className="text-muted" style={{ fontSize: 15 }}>
                  {o.description}
                </span>
              </span>
            </Blueprint>
          ))}
        </div>
        <label style={{ display: "flex", gap: 10, alignItems: "flex-start", marginTop: 14, fontSize: 16, cursor: "pointer" }}>
          <input type="checkbox" checked={attested} onChange={(e) => setAttested(e.target.checked)} style={{ marginTop: 3 }} />
          <span>
            This rubric reflects what we hire or promote for.
            <span className="text-muted va-muted-12"> Required to validate.</span>
          </span>
        </label>
      </Blueprint>

      <Blueprint style={{ padding: "20px 22px" }}>
        <h6 style={{ margin: "0 0 6px" }}>Five quick questions</h6>
        <p className="text-muted" style={{ margin: "0 0 10px", fontSize: 14 }}>
          Optional, but it is how the programme measures employer satisfaction. 1 is disagree, 5 is agree.
        </p>
        {SATISFACTION_QUESTIONS.map((q) => (
          <LikertRow key={q.key} name={`sat-${q.key}`} label={q.text} value={survey[q.key] ?? null} onChange={(v) => setSurvey((s) => ({ ...s, [q.key]: v }))} />
        ))}
        <Field label="Anything else" hint="— optional" style={{ marginTop: 12 }}>
          <textarea className="input va-textarea" style={{ minHeight: 64 }} value={surveyComment} onChange={(e) => setSurveyComment(e.target.value)} />
        </Field>
        {!surveyComplete && Object.keys(survey).length > 0 ? (
          <div className="text-muted va-muted-12" style={{ marginTop: 6 }}>
            Answer all five for the survey to count; otherwise it is left out.
          </div>
        ) : null}
      </Blueprint>

      <div className="va-stack" style={{ gap: 8 }}>
        {formError ? <div style={{ color: RED, fontSize: 15 }}>{formError}</div> : null}
        <div className="va-btn-row">
          <BlueprintButton type="submit" disabled={submitting}>
            {origin === "workspace" ? "Record this review" : "Finish review"}
          </BlueprintButton>
          {origin === "workspace" ? (
            <button type="button" className="btn btn-secondary" onClick={() => navigate("/employer")}>
              Cancel
            </button>
          ) : null}
        </div>
        <div className="text-muted va-muted-12">
          Nothing on this page is uploaded anywhere.{" "}
          {origin === "workspace" ? "The review is saved in this browser's workspace." : "You will get a link or file to send back to the instructor."}
        </div>
      </div>
    </form>
  );
}
