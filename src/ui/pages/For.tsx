import { Link, Navigate, useNavigate, useParams } from "react-router-dom";
/* type-scale: applied */
import { AudienceCard, Blueprint, BlueprintButton, PipelineStrip } from "@ui/components";
import { usePageTitle } from "@ui/shell/PageTitleContext";
import { AUDIENCES, AUDIENCE_OVERVIEW, type AudienceContent, type AudienceKey } from "@shared/audiences";

const KEYS = new Set<string>(AUDIENCES.map((a) => a.key));

export default function For() {
  const { audience } = useParams<{ audience?: string }>();
  if (audience && !KEYS.has(audience)) return <Navigate to="/for" replace />;
  if (audience) return <AudienceDetail a={AUDIENCES.find((x) => x.key === audience)!} />;
  return <Overview />;
}

function Overview() {
  usePageTitle("Who VARIA is for");
  const navigate = useNavigate();
  return (
    <div className="va-page va-page-narrow" style={{ gap: 30 }}>
      <Blueprint className="va-dark" style={{ padding: "26px 28px" }}>
        <div className="va-kicker">{AUDIENCE_OVERVIEW.kicker}</div>
        <h3 style={{ margin: "6px 0 10px", maxWidth: "26ch" }}>{AUDIENCE_OVERVIEW.title}</h3>
        <p style={{ margin: 0, maxWidth: "70ch", fontSize: 17, lineHeight: 1.6, textWrap: "pretty" }}>{AUDIENCE_OVERVIEW.lede}</p>
      </Blueprint>

      <div>
        <h6 style={{ margin: "0 0 14px" }}>One artifact, six steps</h6>
        <PipelineStrip steps={AUDIENCE_OVERVIEW.pipeline} />
        <Blueprint style={{ padding: "16px 20px", display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
          <div style={{ flex: 1, minWidth: 260 }}>
            <div className="va-kicker">For administrators</div>
            <div style={{ fontFamily: "var(--font-heading)", fontSize: 19, marginTop: 4 }}>The executive summary: why now, what VARIA does, what the college gets, the evidence, and what to do this term.</div>
          </div>
          <BlueprintButton onClick={() => navigate("/summary")}>Read the executive summary</BlueprintButton>
        </Blueprint>
      </div>

      <div>
        <h6 style={{ margin: "0 0 14px" }}>What each of them gets</h6>
        <div className="va-tiles" style={{ gap: 16 }}>
          {AUDIENCES.map((a) => (
            <AudienceCard key={a.key} label={a.label} promise={a.promise} quote={a.quote} to={`/for/${a.key}`} />
          ))}
        </div>
      </div>
    </div>
  );
}

function AudienceDetail({ a }: { a: AudienceContent }) {
  usePageTitle(a.label, "Orientation");
  const navigate = useNavigate();
  const others = AUDIENCES.filter((x) => x.key !== a.key);
  const noun = a.key as AudienceKey;

  return (
    <div className="va-page va-page-narrow" style={{ gap: 26 }}>
      <Blueprint className="va-dark" style={{ padding: "26px 28px" }}>
        <div className="va-kicker">For {noun}</div>
        <h3 style={{ margin: "6px 0 10px", maxWidth: "26ch" }}>{a.promise}</h3>
        <p style={{ margin: 0, maxWidth: "68ch", fontSize: 17, lineHeight: 1.6, textWrap: "pretty" }}>{a.lede}</p>
      </Blueprint>

      <div>
        <h6 style={{ margin: "0 0 14px" }}>What you get</h6>
        <div className="va-two">
          {a.gets.map((g) => (
            <Blueprint key={g.title} style={{ padding: "16px 18px 18px" }}>
              <div className="va-heading-16" style={{ marginBottom: 5 }}>{g.title}</div>
              <p className="text-muted" style={{ margin: 0, fontSize: 15.5, lineHeight: 1.55 }}>{g.body}</p>
              {g.see ? (
                <Link to={g.see.to} style={{ display: "inline-block", marginTop: 8, fontSize: 14, color: "var(--color-accent-700)", fontFamily: "var(--font-heading)" }}>
                  {g.see.label} →
                </Link>
              ) : null}
            </Blueprint>
          ))}
        </div>
      </div>

      <Blueprint style={{ padding: "20px 22px" }}>
        <h6 style={{ margin: "0 0 10px" }}>What it costs you</h6>
        <div className="va-surface-box" style={{ fontSize: 16, lineHeight: 1.6 }}>{a.costs}</div>
        <div className="va-btn-row" style={{ marginTop: 16 }}>
          <BlueprintButton onClick={() => navigate(a.action.to)}>{a.action.label}</BlueprintButton>
          <button type="button" className="btn btn-secondary" onClick={() => navigate(a.proof.to)}>{a.proof.label}</button>
        </div>
      </Blueprint>

      <div className="text-muted" style={{ fontSize: 14, display: "flex", gap: 14, flexWrap: "wrap", alignItems: "baseline" }}>
        <span className="va-kicker">Other audiences</span>
        {others.map((o) => (
          <Link key={o.key} to={`/for/${o.key}`} style={{ color: "var(--color-accent-700)" }}>
            {o.label}
          </Link>
        ))}
        <Link to="/for" style={{ color: "var(--color-accent-700)" }}>Overview</Link>
      </div>
    </div>
  );
}
