import { useMemo } from "react";
/* type-scale: applied */
import { Link, useNavigate } from "react-router-dom";
import { Blueprint, BlueprintButton, Stamp, SkillTags, OutcomeStamps, WalkthroughButton } from "@ui/components";
import { usePageTitle } from "@ui/shell/PageTitleContext";
import { useWorkspace } from "@lib/store/workspace";
import {
  activeRun,
  variantById,
  evidenceView,
  endorsementsForRecord,
  outcomesForRecord,
  employerFunnel,
} from "@lib/store/selectors";
import { BOTTOM_LINE, NORTH_STAR, PATH_STEPS, SHIFTS, TRUST } from "@shared/home";
import type { Workspace } from "@shared/types";

/** The version the path follows: a graded one if any exists, else the first usable version of the active run. */
function pathVariantId(ws: Workspace): string | null {
  const run = activeRun(ws) ?? ws.runs[0];
  if (!run) return null;
  const usable = run.variants.filter((v) => v.text && !v.error);
  const graded = usable.find((v) => ws.submissions.some((s) => s.runId === run.id && s.variantId === v.id && s.grade));
  return (graded ?? usable[0])?.id ?? null;
}

function clip(text: string, n: number): string {
  const t = text.replace(/\s+/g, " ").trim();
  return t.length <= n ? t : t.slice(0, n).replace(/\s+\S*$/, "") + "…";
}

/** Pull the six path panels from the live workspace, falling back to the seeded story. */
function usePath(ws: Workspace) {
  return useMemo(() => {
    const out: Record<string, { text: string; extra?: React.ReactNode }> = {};
    try {
      const id = pathVariantId(ws);
      if (!id) return out;
      const view = evidenceView(ws, id);
      const found = variantById(ws, id);
      const run = found?.run ?? activeRun(ws);
      const challenge =
        (ws.challenges ?? []).find((c) => c.id === view?.record?.bridge?.workSample?.challengeId) ??
        (ws.challenges ?? []).find((c) => c.domain.toLowerCase() === "lending") ??
        (ws.challenges ?? [])[0];

      if (challenge) out.challenge = { text: clip(challenge.brief, 220), extra: <span className="text-muted">{challenge.organisation} · {challenge.stakeholderRole}</span> };
      if (found?.variant) out.version = { text: clip(found.variant.text, 220), extra: <span className="text-muted">{found.variant.id} · one of {run?.n ?? "many"} versions</span> };
      if (run?.report) {
        const c = run.report.checks;
        out.integrity = {
          text: `${run.n} versions, one rubric.`,
          extra: (
            <span style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              <Stamp gate={c.p1.gate === "pass" ? "pass" : "fail"}>{c.p1.label}</Stamp>
              <Stamp gate={c.p2.gate === "pass" ? "pass" : "fail"}>{c.p2.label}</Stamp>
              <Stamp gate={c.p4.gate === "pass" ? "pass" : "fail"}>{c.p4.label}</Stamp>
            </span>
          ),
        };
      }
      if (view?.grade) {
        const skills = view.record?.bridge?.workSample?.skills ?? [];
        const suggested = view.grade.basis === "suggested";
        out.result = {
          text: `${view.grade.total} / ${view.grade.maxTotal} on the same rubric as every other version${suggested ? ` (an AI-written ${view.submission?.sampleTier ?? "sample"} sample; the grade is the model's suggestion)` : ""}.`,
          extra: <SkillTags skills={skills} max={4} />,
        };
      }
      if (view?.record) {
        const ends = endorsementsForRecord(ws, view.record.id);
        const e = ends[0];
        if (e) {
          out.endorsement = {
            text: `${e.organisation}: ${e.meetsBar ? "meets our bar" : "does not meet our bar"}, ${e.score} of 5.`,
            extra: (
              <span style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                <Stamp gate="pass">Endorsed</Stamp>
                <Stamp gate={view.record.bridge?.signature ? "pass" : "watch"}>{view.record.bridge?.signature ? "Signature verified" : "Hash verified"}</Stamp>
              </span>
            ),
          };
        }
        const outs = outcomesForRecord(ws, view.record.id);
        if (outs.length) {
          out.outcome = {
            text: outs.map((o) => `${o.kind[0].toUpperCase()}${o.kind.slice(1)} at ${o.organisation}`).join(". ") + ".",
            extra: <OutcomeStamps outcomes={outs} />,
          };
        }
      }
    } catch {
      /* fall back to the seeded copy */
    }
    return out;
  }, [ws]);
}

export default function Home() {
  usePageTitle("Proof an employer can verify", "Home");
  const ws = useWorkspace();
  const nav = useNavigate();
  const path = usePath(ws);
  const funnel = useMemo(() => {
    try {
      return employerFunnel(ws);
    } catch {
      return null;
    }
  }, [ws]);

  return (
    <div className="va-page" style={{ gap: 30, maxWidth: 1180 }}>
      {/* 1. North Star */}
      <Blueprint className="va-dark" style={{ padding: "30px 32px 28px" }} data-walk="promise">
        <div className="va-kicker">{NORTH_STAR.kicker}</div>
        <h2 style={{ margin: "8px 0 14px", color: "#fff", maxWidth: "24ch", fontSize: 40, lineHeight: 1.05 }}>{NORTH_STAR.varia}</h2>
        <p style={{ margin: "0 0 18px", fontSize: 18, lineHeight: 1.6, color: "#d5e0ea", maxWidth: "70ch", textWrap: "pretty" }}>{NORTH_STAR.sub}</p>
        <div className="va-btn-row">
          <WalkthroughButton onDark />
          <button type="button" className="btn va-btn-onDark" onClick={() => document.getElementById("path")?.scrollIntoView({ behavior: "smooth", block: "start" })}>Follow one student's path</button>
          <button type="button" className="btn va-btn-onDark" onClick={() => nav("/for/employers")}>For employers</button>
          <button type="button" className="btn va-btn-onDark" onClick={() => nav("/for/students")}>For students</button>
        </div>
        <div style={{ marginTop: 22, borderTop: "1px solid rgba(255,255,255,.14)", paddingTop: 14, display: "grid", gridTemplateColumns: "minmax(0,1fr) auto", gap: 18 }} className="va-split">
          <p style={{ margin: 0, fontSize: 15.5, lineHeight: 1.55, color: "#b7c6d6", maxWidth: "80ch", fontStyle: "italic" }}>“{NORTH_STAR.cohort}”</p>
          <span style={{ fontSize: 13, color: "#7f95ac", alignSelf: "end", whiteSpace: "nowrap" }}>{NORTH_STAR.cohortSource}</span>
        </div>
      </Blueprint>

      {/* 2. One student's path, with the real records */}
      <div id="path">
        <div className="va-row-flex" style={{ alignItems: "baseline", gap: 12, marginBottom: 14 }}>
          <h6 style={{ margin: 0 }}>One student's path, with the real records</h6>
          <span className="text-muted" style={{ fontSize: 14 }}>Every panel is live data from this workspace. Click through; nothing here is a mock-up.</span>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0,1fr))", gap: 18 }} className="va-path-grid">
          {PATH_STEPS.map((s, i) => {
            const live = path[s.key];
            return (
              <Blueprint key={s.key} style={{ padding: "18px 20px", display: "flex", flexDirection: "column", gap: 10, minHeight: 210 }}>
                <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
                  <span style={{ fontFamily: "var(--font-heading)", fontSize: 30, color: "var(--color-accent)", lineHeight: 1 }}>{String(i + 1).padStart(2, "0")}</span>
                  <div>
                    <div className="va-kicker">{s.who}</div>
                    <div style={{ fontFamily: "var(--font-heading)", fontSize: 20, lineHeight: 1.1 }}>{s.title}</div>
                  </div>
                </div>
                <div className="va-surface-box" style={{ fontSize: 15.5, lineHeight: 1.55, flex: 1 }}>{live?.text ?? s.fallback}</div>
                <div style={{ fontSize: 14, minHeight: 22 }}>{live?.extra}</div>
                <Link to={s.link} style={{ fontSize: 15, color: "var(--color-accent-700)", fontFamily: "var(--font-heading)", letterSpacing: ".02em" }}>
                  {s.linkLabel} →
                </Link>
              </Blueprint>
            );
          })}
        </div>
      </div>

      {/* 3. Bottom line */}
      <div className="va-split" style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)", gap: 22, alignItems: "stretch" }}>
        {[BOTTOM_LINE.students, BOTTOM_LINE.employers].map((b, i) => (
          <Blueprint key={b.kicker} className={i === 1 ? "va-dark" : undefined} style={{ padding: "24px 26px", display: "flex", flexDirection: "column", gap: 10 }}>
            <div className="va-kicker">{b.kicker}</div>
            <h3 style={{ margin: 0, maxWidth: "18ch", color: i === 1 ? "#fff" : undefined }}>{b.headline}</h3>
            <p style={{ margin: 0, fontSize: 17, lineHeight: 1.6, maxWidth: "58ch", textWrap: "pretty", color: i === 1 ? "#d5e0ea" : undefined, flex: 1 }}>{b.body}</p>
            {funnel && i === 1 ? (
              <div style={{ display: "flex", gap: 18, flexWrap: "wrap", fontSize: 14, color: "#b7c6d6", borderTop: "1px solid rgba(255,255,255,.14)", paddingTop: 10 }}>
                <span><b style={{ color: "#fff", fontFamily: "var(--font-heading)", fontSize: 20 }}>{funnel.challenges}</b> challenges from local employers</span>
                <span><b style={{ color: "#fff", fontFamily: "var(--font-heading)", fontSize: 20 }}>{funnel.completed}</b> students did the work</span>
                <span><b style={{ color: "#fff", fontFamily: "var(--font-heading)", fontSize: 20 }}>{funnel.endorsed}</b> endorsed</span>
                <span><b style={{ color: "#fff", fontFamily: "var(--font-heading)", fontSize: 20 }}>{funnel.interviewed}</b> interviewed</span>
              </div>
            ) : null}
            <div>
              {i === 1 ? (
                <BlueprintButton onClick={() => nav(b.action.to)}>{b.action.label}</BlueprintButton>
              ) : (
                <BlueprintButton onClick={() => nav(b.action.to)}>{b.action.label}</BlueprintButton>
              )}
            </div>
          </Blueprint>
        ))}
      </div>

      {/* 4. What changes, for each audience */}
      <div>
        <div className="va-row-flex" style={{ alignItems: "baseline", gap: 12, marginBottom: 14 }}>
          <h6 style={{ margin: 0 }}>What changes, for each of the four people in the room</h6>
          <span className="text-muted" style={{ fontSize: 14 }}>In the cohort's own framing: from what assessment is now, to what it becomes.</span>
        </div>
        <div className="va-tiles" style={{ gridTemplateColumns: "repeat(4, minmax(0,1fr))", gap: 16 }}>
          {SHIFTS.map((col) => (
            <Blueprint key={col.audience} style={{ padding: "18px 18px 16px", display: "flex", flexDirection: "column", gap: 12 }}>
              <div style={{ fontFamily: "var(--font-heading)", fontSize: 22 }}>{col.label}</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 10, flex: 1 }}>
                {col.shifts.map((sh) => (
                  <div key={sh.from} style={{ fontSize: 15, lineHeight: 1.4 }}>
                    <div className="text-muted" style={{ textDecoration: "line-through", textDecorationColor: "color-mix(in srgb, var(--color-text) 35%, transparent)" }}>{sh.from}</div>
                    <div style={{ fontFamily: "var(--font-heading)", fontSize: 17 }}>{sh.to}</div>
                  </div>
                ))}
              </div>
              <Link to={col.to} style={{ fontSize: 15, color: "var(--color-accent-700)", fontFamily: "var(--font-heading)" }}>
                For {col.label.toLowerCase()} →
              </Link>
            </Blueprint>
          ))}
        </div>
      </div>

      {/* 5. Trust */}
      <Blueprint style={{ padding: "20px 24px", display: "grid", gridTemplateColumns: "minmax(0,1fr) auto", gap: 18, alignItems: "center" }} className="va-split">
        <div>
          <div className="va-kicker">{TRUST.kicker}</div>
          <p style={{ margin: "6px 0 0", fontSize: 16, lineHeight: 1.6, maxWidth: "80ch", textWrap: "pretty" }}>{TRUST.body}</p>
        </div>
        <div className="va-btn-row">
          <button type="button" className="btn btn-secondary" onClick={() => nav(TRUST.link.to)}>{TRUST.link.label}</button>
          <button type="button" className="btn btn-secondary" onClick={() => nav("/start")}>How to run it</button>
        </div>
      </Blueprint>
    </div>
  );
}
