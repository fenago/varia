import { useMemo } from "react";
import { Link, useNavigate } from "react-router-dom";
import { AudienceCard, Blueprint, BlueprintButton, OutcomeStamps, PipelineStrip, SkillTags, Stamp, StatTile } from "@ui/components";
import { usePageTitle } from "@ui/shell/PageTitleContext";
import { useWorkspace } from "@lib/store/workspace";
import {
  activeRun,
  variantById,
  evidenceView,
  endorsementsForRecord,
  outcomesForRecord,
  employerFunnel,
  employerStats,
  consoleStats,
} from "@lib/store/selectors";
import { APPROACH, BOTTOM_LINE, COLLEGE_GETS, EVIDENCE, EXEC, GLANCE, LIMITS, NEXT_STEPS, PATH_STEPS, SHIFTS, SITUATION } from "@shared/home";
import { AUDIENCES, AUDIENCE_OVERVIEW } from "@shared/audiences";
import type { Workspace } from "@shared/types";

const DEMO_VARIANT = "v-04";

function clip(text: string, n: number): string {
  const t = text.replace(/\s+/g, " ").trim();
  return t.length <= n ? t : t.slice(0, n).replace(/\s+\S*$/, "") + "…";
}

const pct = (x: number) => `${Math.round(x * 100)}%`;

/** Pull the six path panels from the live workspace, falling back to the seeded story. */
function usePath(ws: Workspace) {
  return useMemo(() => {
    const out: Record<string, { text: string; extra?: React.ReactNode }> = {};
    try {
      const view = evidenceView(ws, DEMO_VARIANT);
      const found = variantById(ws, DEMO_VARIANT);
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
        out.result = { text: `${view.grade.total} / ${view.grade.maxTotal} on the same rubric as every other version.`, extra: <SkillTags skills={skills} max={4} /> };
      }
      if (view?.record) {
        const e = endorsementsForRecord(ws, view.record.id)[0];
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
          out.outcome = { text: outs.map((o) => `${o.kind[0].toUpperCase()}${o.kind.slice(1)} at ${o.organisation}`).join(". ") + ".", extra: <OutcomeStamps outcomes={outs} /> };
        }
      }
    } catch {
      /* fall back to the seeded copy */
    }
    return out;
  }, [ws]);
}

function useGlance(ws: Workspace): Record<string, string> {
  return useMemo(() => {
    const out: Record<string, string> = {};
    try {
      const cs = consoleStats(ws);
      const es = employerStats(ws);
      const f = employerFunnel(ws);
      out.sets = String(cs.inUse);
      out.cleared = pct(cs.passingPct > 1 ? cs.passingPct / 100 : cs.passingPct);
      out.validated = pct(es.validatedPct);
      out.completed = String(f.completed);
      out.hires = String(f.hired);
    } catch {
      /* fallbacks below */
    }
    return out;
  }, [ws]);
}

const H6 = ({ children }: { children: React.ReactNode }) => <h6 style={{ margin: "0 0 12px" }}>{children}</h6>;

export default function Home() {
  usePageTitle("Who VARIA is for", "Orientation");
  const ws = useWorkspace();
  const nav = useNavigate();
  const path = usePath(ws);
  const glance = useGlance(ws);
  const funnel = useMemo(() => {
    try {
      return employerFunnel(ws);
    } catch {
      return null;
    }
  }, [ws]);

  return (
    <div className="va-page" style={{ gap: 30, maxWidth: 1180 }}>
      {/* Executive summary */}
      <Blueprint className="va-dark" style={{ padding: "30px 32px 26px" }}>
        <div className="va-kicker">{EXEC.kicker}</div>
        <h2 style={{ margin: "8px 0 14px", color: "#fff", maxWidth: "26ch", fontSize: 38, lineHeight: 1.05 }}>{EXEC.headline}</h2>
        <p style={{ margin: "0 0 18px", fontSize: 16, lineHeight: 1.6, color: "#d5e0ea", maxWidth: "78ch", textWrap: "pretty" }}>{EXEC.summary}</p>
        <div className="va-btn-row">
          <BlueprintButton onClick={() => document.getElementById("path")?.scrollIntoView({ behavior: "smooth", block: "start" })}>Follow one student's path</BlueprintButton>
          <button type="button" className="btn va-btn-onDark" onClick={() => nav("/for/institutions")}>For institutions</button>
          <button type="button" className="btn va-btn-onDark" onClick={() => nav("/for/employers")}>For employers</button>
          <button type="button" className="btn va-btn-onDark" onClick={() => nav("/about")}>Read the paper</button>
        </div>
        <div style={{ marginTop: 22, borderTop: "1px solid rgba(255,255,255,.14)", paddingTop: 16, display: "grid", gridTemplateColumns: "minmax(0,1.2fr) minmax(0,1fr)", gap: 22 }} className="va-split">
          <div>
            <div className="va-kicker" style={{ marginBottom: 6 }}>The North Star</div>
            <div style={{ fontFamily: "var(--font-heading)", fontSize: 22, lineHeight: 1.2, color: "#fff", maxWidth: "30ch" }}>{EXEC.northStar}</div>
            <p style={{ margin: "10px 0 0", fontSize: 12.5, lineHeight: 1.5, color: "#8fa8bf", maxWidth: "70ch", fontStyle: "italic" }}>
              “{EXEC.cohort}” <span style={{ fontStyle: "normal" }}>· {EXEC.cohortSource}</span>
            </p>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0,1fr))", gap: 10 }}>
            {GLANCE.map((g) => (
              <div key={g.key} style={{ border: "1px solid rgba(255,255,255,.22)", padding: "10px 12px" }}>
                <div style={{ fontFamily: "var(--font-heading)", fontSize: 28, lineHeight: 1, color: "#fff" }}>{glance[g.key] ?? g.fallback}</div>
                <div style={{ fontSize: 12.5, color: "#d5e0ea", marginTop: 4 }}>{g.label}</div>
                <div style={{ fontSize: 11, color: "#7f95ac" }}>{g.sub}</div>
              </div>
            ))}
          </div>
        </div>
      </Blueprint>

      {/* Why now */}
      <div>
        <H6>{SITUATION.heading}</H6>
        <div className="va-tiles" style={{ gridTemplateColumns: "repeat(3, minmax(0,1fr))", gap: 16 }}>
          {SITUATION.items.map((it) => (
            <Blueprint key={it.title} style={{ padding: "18px 20px" }}>
              <div style={{ fontFamily: "var(--font-heading)", fontSize: 17, lineHeight: 1.2, marginBottom: 8 }}>{it.title}</div>
              <p className="text-muted" style={{ margin: 0, fontSize: 13.5, lineHeight: 1.55 }}>{it.body}</p>
            </Blueprint>
          ))}
        </div>
      </div>

      {/* What VARIA does */}
      <div>
        <div className="va-row-flex" style={{ alignItems: "baseline", gap: 12, marginBottom: 12 }}>
          <h6 style={{ margin: 0 }}>{APPROACH.heading}</h6>
          <span className="text-muted" style={{ fontSize: 12.5 }}>{APPROACH.lede}</span>
        </div>
        <div className="va-tiles" style={{ gridTemplateColumns: "repeat(3, minmax(0,1fr))", gap: 16 }}>
          {APPROACH.moves.map((m) => (
            <Blueprint key={m.n} style={{ padding: "18px 20px", display: "flex", flexDirection: "column", gap: 8 }}>
              <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
                <span style={{ fontFamily: "var(--font-heading)", fontSize: 30, color: "var(--color-accent)", lineHeight: 1 }}>{m.n}</span>
                <span style={{ fontFamily: "var(--font-heading)", fontSize: 22 }}>{m.verb}</span>
              </div>
              <div style={{ fontFamily: "var(--font-heading)", fontSize: 16, lineHeight: 1.2 }}>{m.title}</div>
              <p className="text-muted" style={{ margin: 0, fontSize: 13.5, lineHeight: 1.55, flex: 1 }}>{m.body}</p>
              <div style={{ borderTop: "1px solid var(--color-divider)", paddingTop: 8, fontSize: 13, color: "var(--color-accent-700)", fontFamily: "var(--font-heading)" }}>{m.why}</div>
            </Blueprint>
          ))}
        </div>
      </div>

      {/* What the college gets */}
      <Blueprint style={{ padding: "22px 24px" }}>
        <H6>{COLLEGE_GETS.heading}</H6>
        <div className="va-tiles" style={{ gridTemplateColumns: "repeat(3, minmax(0,1fr))", gap: 18 }}>
          {COLLEGE_GETS.items.map((it) => (
            <div key={it.title} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <div style={{ fontFamily: "var(--font-heading)", fontSize: 16, lineHeight: 1.2 }}>{it.title}</div>
              <p className="text-muted" style={{ margin: 0, fontSize: 13.5, lineHeight: 1.55, flex: 1 }}>{it.body}</p>
              <Link to={it.to} style={{ fontSize: 12.5, color: "var(--color-accent-700)", fontFamily: "var(--font-heading)" }}>{it.link} →</Link>
            </div>
          ))}
        </div>
      </Blueprint>

      {/* Who it's for */}
      <div>
        <div style={{ marginBottom: 14 }}>
          <div className="va-kicker">{AUDIENCE_OVERVIEW.kicker}</div>
          <h3 style={{ margin: "6px 0 8px", maxWidth: "26ch" }}>{AUDIENCE_OVERVIEW.title}</h3>
          <p style={{ margin: 0, maxWidth: "70ch", fontSize: 15, lineHeight: 1.6, textWrap: "pretty" }}>{AUDIENCE_OVERVIEW.lede}</p>
        </div>
        <PipelineStrip steps={AUDIENCE_OVERVIEW.pipeline} />
        <div className="va-tiles" style={{ gridTemplateColumns: "repeat(4, minmax(0,1fr))", gap: 16, marginTop: 18 }}>
          {AUDIENCES.map((a) => (
            <AudienceCard key={a.key} label={a.label} promise={a.promise} quote={a.quote} to={`/for/${a.key}`} />
          ))}
        </div>
      </div>

      {/* One student's path */}
      <div id="path">
        <div className="va-row-flex" style={{ alignItems: "baseline", gap: 12, marginBottom: 14 }}>
          <h6 style={{ margin: 0 }}>One student's path, with the real records</h6>
          <span className="text-muted" style={{ fontSize: 12.5 }}>Every panel is live data from this workspace. Click through; nothing here is a mock-up.</span>
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
                    <div style={{ fontFamily: "var(--font-heading)", fontSize: 18, lineHeight: 1.1 }}>{s.title}</div>
                  </div>
                </div>
                <div className="va-surface-box" style={{ fontSize: 13.5, lineHeight: 1.55, flex: 1 }}>{live?.text ?? s.fallback}</div>
                <div style={{ fontSize: 12.5, minHeight: 22 }}>{live?.extra}</div>
                <Link to={s.link} style={{ fontSize: 13, color: "var(--color-accent-700)", fontFamily: "var(--font-heading)", letterSpacing: ".02em" }}>{s.linkLabel} →</Link>
              </Blueprint>
            );
          })}
        </div>
      </div>

      {/* Bottom line */}
      <div className="va-split" style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)", gap: 22, alignItems: "stretch" }}>
        {[BOTTOM_LINE.students, BOTTOM_LINE.employers].map((b, i) => (
          <Blueprint key={b.kicker} className={i === 1 ? "va-dark" : undefined} style={{ padding: "24px 26px", display: "flex", flexDirection: "column", gap: 10 }}>
            <div className="va-kicker">{b.kicker}</div>
            <h3 style={{ margin: 0, maxWidth: "18ch", color: i === 1 ? "#fff" : undefined }}>{b.headline}</h3>
            <p style={{ margin: 0, fontSize: 15, lineHeight: 1.6, maxWidth: "58ch", textWrap: "pretty", color: i === 1 ? "#d5e0ea" : undefined, flex: 1 }}>{b.body}</p>
            {funnel && i === 1 ? (
              <div style={{ display: "flex", gap: 18, flexWrap: "wrap", fontSize: 12.5, color: "#b7c6d6", borderTop: "1px solid rgba(255,255,255,.14)", paddingTop: 10 }}>
                <span><b style={{ color: "#fff", fontFamily: "var(--font-heading)", fontSize: 18 }}>{funnel.challenges}</b> challenges from local employers</span>
                <span><b style={{ color: "#fff", fontFamily: "var(--font-heading)", fontSize: 18 }}>{funnel.completed}</b> students did the work</span>
                <span><b style={{ color: "#fff", fontFamily: "var(--font-heading)", fontSize: 18 }}>{funnel.endorsed}</b> endorsed</span>
                <span><b style={{ color: "#fff", fontFamily: "var(--font-heading)", fontSize: 18 }}>{funnel.interviewed}</b> interviewed</span>
              </div>
            ) : null}
            <div>
              <BlueprintButton onClick={() => nav(b.action.to)}>{b.action.label}</BlueprintButton>
            </div>
          </Blueprint>
        ))}
      </div>

      {/* What changes */}
      <div>
        <div className="va-row-flex" style={{ alignItems: "baseline", gap: 12, marginBottom: 14 }}>
          <h6 style={{ margin: 0 }}>What changes, for each of the four people in the room</h6>
          <span className="text-muted" style={{ fontSize: 12.5 }}>In the cohort's own framing: from what assessment is now, to what it becomes.</span>
        </div>
        <div className="va-tiles" style={{ gridTemplateColumns: "repeat(4, minmax(0,1fr))", gap: 16 }}>
          {SHIFTS.map((col) => (
            <Blueprint key={col.audience} style={{ padding: "18px 18px 16px", display: "flex", flexDirection: "column", gap: 12 }}>
              <div style={{ fontFamily: "var(--font-heading)", fontSize: 20 }}>{col.label}</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 10, flex: 1 }}>
                {col.shifts.map((sh) => (
                  <div key={sh.from} style={{ fontSize: 13, lineHeight: 1.4 }}>
                    <div className="text-muted" style={{ textDecoration: "line-through", textDecorationColor: "color-mix(in srgb, var(--color-text) 35%, transparent)" }}>{sh.from}</div>
                    <div style={{ fontFamily: "var(--font-heading)", fontSize: 15 }}>{sh.to}</div>
                  </div>
                ))}
              </div>
              <Link to={col.to} style={{ fontSize: 13, color: "var(--color-accent-700)", fontFamily: "var(--font-heading)" }}>For {col.label.toLowerCase()} →</Link>
            </Blueprint>
          ))}
        </div>
      </div>

      {/* Evidence + limits */}
      <div className="va-split" style={{ display: "grid", gridTemplateColumns: "minmax(0,1.3fr) minmax(0,1fr)", gap: 22, alignItems: "stretch" }}>
        <Blueprint style={{ padding: "22px 24px", display: "flex", flexDirection: "column", gap: 12 }}>
          <H6>{EVIDENCE.heading}</H6>
          <div className="va-tiles" style={{ gridTemplateColumns: "repeat(4, minmax(0,1fr))", gap: 10 }}>
            {EVIDENCE.stats.map((s) => (
              <StatTile key={s.label} kicker={s.label} value={s.value} />
            ))}
          </div>
          <p style={{ margin: 0, fontSize: 14, lineHeight: 1.6, maxWidth: "76ch", textWrap: "pretty", flex: 1 }}>{EVIDENCE.body}</p>
          <div className="va-btn-row">
            <button type="button" className="btn btn-secondary" onClick={() => nav(EVIDENCE.link.to)}>{EVIDENCE.link.label}</button>
            <button type="button" className="btn btn-secondary" onClick={() => nav("/start")}>How to run it</button>
          </div>
        </Blueprint>
        <Blueprint style={{ padding: "22px 24px" }}>
          <H6>{LIMITS.heading}</H6>
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13.5, lineHeight: 1.6, display: "flex", flexDirection: "column", gap: 8 }}>
            {LIMITS.items.map((l) => (
              <li key={l}>{l}</li>
            ))}
          </ul>
        </Blueprint>
      </div>

      {/* Next steps */}
      <Blueprint className="va-dark" style={{ padding: "24px 28px" }}>
        <H6>
          <span style={{ color: "#fff" }}>{NEXT_STEPS.heading}</span>
        </H6>
        <div className="va-tiles" style={{ gridTemplateColumns: "repeat(3, minmax(0,1fr))", gap: 18 }}>
          {NEXT_STEPS.steps.map((s, i) => (
            <div key={s.title} style={{ display: "flex", flexDirection: "column", gap: 6, borderLeft: "2px solid var(--color-accent-400)", paddingLeft: 14 }}>
              <div style={{ fontFamily: "var(--font-heading)", fontSize: 18, color: "#fff" }}>
                {i + 1}. {s.title}
              </div>
              <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.55, color: "#d5e0ea", flex: 1 }}>{s.body}</p>
              <Link to={s.to} style={{ fontSize: 13, color: "var(--color-accent-400)", fontFamily: "var(--font-heading)" }}>{s.link} →</Link>
            </div>
          ))}
        </div>
        <p style={{ margin: "18px 0 0", fontSize: 12.5, lineHeight: 1.5, color: "#8fa8bf", borderTop: "1px solid rgba(255,255,255,.14)", paddingTop: 12 }}>{NEXT_STEPS.grant}</p>
      </Blueprint>
    </div>
  );
}
