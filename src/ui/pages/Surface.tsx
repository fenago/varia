import { useMemo } from "react";
import { Blueprint } from "@ui/components";
import { useWorkspace } from "@lib/store/workspace";
import { PILOT_CONDITIONS, PILOT_META, RECOMMENDED_BY_COURSE_TYPE, type PilotCondition } from "@shared/pilot";

const RED = "#8d4a3c";
const ACCENT = "#5980a6";
const INK = "#1d1f20";

// Mockup geometry: viewBox 700×430, x = cosine 0–0.6 → 70–670, y = equivalence 0–1 → 380–30.
const X0 = 70;
const X1 = 670;
const Y0 = 380;
const Y1 = 30;
const xOf = (cosine: number) => X0 + (Math.min(Math.max(cosine, 0), 0.6) / 0.6) * (X1 - X0);
const yOf = (eq: number) => Y0 - Math.min(Math.max(eq, 0), 1) * (Y0 - Y1);

/** Non-dominated points: lower cosine and higher equivalence are both better. */
function paretoFrontier(points: PilotCondition[]): PilotCondition[] {
  const sorted = [...points].sort((a, b) => a.cosine - b.cosine || b.equivalence - a.equivalence);
  const out: PilotCondition[] = [];
  let bestEq = -Infinity;
  for (const p of sorted) {
    if (p.equivalence > bestEq) {
      out.push(p);
      bestEq = p.equivalence;
    }
  }
  return out;
}

function shortName(s: string, max = 22): string {
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

export default function Surface() {
  const ws = useWorkspace();

  const legend = useMemo(
    () => PILOT_CONDITIONS.filter((c) => c.legend !== null).sort((a, b) => (a.legend ?? 0) - (b.legend ?? 0)),
    [],
  );
  const references = useMemo(() => PILOT_CONDITIONS.filter((c) => c.kind === "reference"), []);
  const frontier = useMemo(() => paretoFrontier(legend), [legend]);

  const localRuns = useMemo(
    () => ws.runs.filter((r) => r.report && (r.status === "complete" || r.status === "partial")),
    [ws.runs],
  );

  return (
    <div className="va-page">
      <p style={{ maxWidth: "70ch", fontSize: 15, lineHeight: 1.6, textWrap: "pretty", margin: 0 }}>
        Every strategy trades surface diversity against construct equivalence. Pick where this course should sit; the numbers are from the
        VARIA pilot, {PILOT_META.variants} variants across {PILOT_META.cells} condition cells.
      </p>

      <div className="va-split" style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) 360px", gap: 24, alignItems: "start" }}>
        <Blueprint style={{ padding: "20px 22px" }}>
          <h6 style={{ margin: "0 0 12px" }}>Diversity against equivalence</h6>
          <svg viewBox="0 0 700 430" style={{ width: "100%", height: "auto", display: "block" }} role="img" aria-label="Pairwise cosine against construct equivalence for every pilot condition">
            <g className="va-ax">
              <line x1={X0} y1={Y0} x2={X1} y2={Y0} />
              <line x1={X0} y1={Y1} x2={X0} y2={Y0} />
            </g>
            <g stroke="var(--color-divider)" strokeDasharray="3 4">
              {[0.25, 0.5, 0.75, 1].map((v) => (
                <line key={v} x1={X0} y1={yOf(v)} x2={X1} y2={yOf(v)} />
              ))}
            </g>
            <g fill={INK} opacity=".55" fontFamily="Barlow" fontSize="11" textAnchor="end">
              {[0, 0.25, 0.5, 0.75, 1].map((v) => (
                <text key={v} x={62} y={yOf(v) + 4}>
                  {v.toFixed(2).replace(/\.?0+$/, (m) => (m === ".00" ? ".0" : m.replace(/0+$/, "")))}
                </text>
              ))}
            </g>
            <g fill={INK} opacity=".55" fontFamily="Barlow" fontSize="11" textAnchor="middle">
              {[0, 0.2, 0.4, 0.6].map((v) => (
                <text key={v} x={xOf(v)} y={402}>
                  {v.toFixed(2)}
                </text>
              ))}
            </g>
            <text x={370} y={422} fontFamily="Barlow Condensed" fontSize="13" textAnchor="middle" fill={INK}>
              Pairwise cosine — left is more diverse
            </text>
            <text x={20} y={205} fontFamily="Barlow Condensed" fontSize="13" textAnchor="middle" fill={INK} transform="rotate(-90 20 205)">
              Construct equivalence
            </text>

            {frontier.length > 1 && (
              <polyline
                points={frontier.map((p) => `${xOf(p.cosine).toFixed(1)},${yOf(p.equivalence).toFixed(1)}`).join(" ")}
                fill="none"
                stroke={ACCENT}
                strokeWidth="1"
                strokeDasharray="5 4"
              />
            )}

            {legend.map((c) => {
              const cx = xOf(c.cosine);
              const cy = yOf(c.equivalence);
              const filled = c.kind === "frontier";
              return (
                <g key={c.key}>
                  <title>{`${c.legend} — ${c.name} · cosine ${c.cosine.toFixed(3)} · equivalence ${c.equivalence.toFixed(3)} · J ${c.joint.toFixed(3)}`}</title>
                  <circle cx={cx} cy={cy} r={8} fill={filled ? ACCENT : "none"} stroke={ACCENT} strokeWidth={filled ? 0 : 1.4} />
                  <text x={cx} y={cy + 4} fill={filled ? "#fff" : ACCENT} fontFamily="Barlow" fontSize="10" textAnchor="middle" fontWeight="700">
                    {c.legend}
                  </text>
                </g>
              );
            })}

            {references.map((c, i) => {
              const cx = xOf(c.cosine);
              const cy = yOf(c.equivalence);
              const anchorRight = cx > 500;
              return (
                <g key={c.key}>
                  <title>{`${c.name} · cosine ${c.cosine.toFixed(3)} · equivalence ${c.equivalence.toFixed(3)}`}</title>
                  <circle cx={cx} cy={cy} r={6} fill={RED} />
                  <text
                    x={anchorRight ? cx : cx + 14}
                    y={anchorRight ? cy + 21 : cy + 4}
                    fontFamily="Barlow"
                    fontSize="11.5"
                    fill={RED}
                    textAnchor={anchorRight ? "middle" : "start"}
                  >
                    {c.chartNote ?? c.name}
                  </text>
                  {i === 0 && null}
                </g>
              );
            })}

            {localRuns.map((r, i) => {
              const rep = r.report!;
              const cx = xOf(rep.cosineMean);
              const cy = yOf(rep.equivalenceMean);
              return (
                <g key={r.id}>
                  <title>{`${r.blueprintName} · this course · cosine ${rep.cosineMean.toFixed(3)} · equivalence ${rep.equivalenceMean.toFixed(3)} · J ${rep.joint.toFixed(2)}`}</title>
                  <rect x={cx - 6} y={cy - 6} width={12} height={12} fill="none" stroke={ACCENT} strokeWidth="1.6" />
                  <text x={cx + 11} y={cy - 8 + (i % 2) * 20} fontFamily="Barlow" fontSize="10.5" fill={INK}>
                    {shortName(r.blueprintName)}
                  </text>
                </g>
              );
            })}

            <g fontFamily="Barlow" fontSize="11.5" fill={INK}>
              {legend.map((c, i) => (
                <text key={c.key} x={300} y={70 + i * 18}>
                  {c.legend} — {c.name.replace("Structured chain-of-thought", "Structured CoT")} · J {c.joint.toFixed(3)}
                </text>
              ))}
            </g>
            {localRuns.length > 0 && (
              <g fontFamily="Barlow" fontSize="11.5" fill={INK}>
                <rect x={300} y={70 + legend.length * 18 + 2} width={9} height={9} fill="none" stroke={ACCENT} strokeWidth="1.4" />
                <text x={315} y={70 + legend.length * 18 + 10}>
                  This course's runs
                </text>
              </g>
            )}
            <text x={666} y={374} fontFamily="Barlow Condensed" fontSize="12" fill={ACCENT} textAnchor="end">
              Dashed line: Pareto frontier
            </text>
          </svg>
        </Blueprint>

        <div className="va-stack" style={{ gap: 18 }}>
          <Blueprint style={{ padding: "18px 20px" }}>
            <h6 style={{ margin: "0 0 12px" }}>Recommended by course type</h6>
            <div className="va-stack" style={{ gap: 14, fontSize: 13.5, lineHeight: 1.5 }}>
              {RECOMMENDED_BY_COURSE_TYPE.map((r) => (
                <div key={r.title}>
                  <div className="va-heading-15">{r.title}</div>
                  <div className="text-muted">{r.body}</div>
                </div>
              ))}
            </div>
          </Blueprint>
          <Blueprint style={{ padding: "18px 20px" }}>
            <h6 style={{ margin: "0 0 8px" }}>Read with care</h6>
            <p className="card-body" style={{ margin: 0 }}>
              Equivalence scores above 0.95 sit at the ceiling of a five-point judge scale, so differences among the top strategies are at the
              instrument's resolution limit. The gap to the non-frontier references is not.
            </p>
          </Blueprint>
        </div>
      </div>

      <Blueprint style={{ padding: "20px 22px" }}>
        <h6 style={{ margin: "0 0 10px" }}>Full condition table</h6>
        <table className="table">
          <thead>
            <tr>
              <th>Condition</th>
              <th>Joint J ↑</th>
              <th>Cosine ↓</th>
              <th>Construct eq. ↑</th>
              <th>4-gram ↓</th>
              <th>σ Flesch ↓</th>
            </tr>
          </thead>
          <tbody>
            {PILOT_CONDITIONS.map((c) => (
              <tr key={c.key}>
                <td>
                  {c.name}
                  {c.kind !== "frontier" && <span className="text-muted"> ({c.kind})</span>}
                </td>
                <td>{c.joint.toFixed(3)}</td>
                <td>{c.cosine.toFixed(3)}</td>
                <td>{c.equivalence.toFixed(3)}</td>
                <td>{c.ngram.toFixed(3)}</td>
                <td>{c.fleschSigma.toFixed(2)}</td>
              </tr>
            ))}
            {localRuns.map((r) => (
              <tr key={r.id}>
                <td>
                  {r.blueprintName} <span className="text-muted">(this course · {r.strategy})</span>
                </td>
                <td>{r.report!.joint.toFixed(3)}</td>
                <td>{r.report!.cosineMean.toFixed(3)}</td>
                <td>{r.report!.equivalenceMean.toFixed(3)}</td>
                <td>{r.report!.ngramOverlapMean.toFixed(3)}</td>
                <td>{r.report!.fleschSigma.toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="va-muted-12" style={{ margin: "12px 0 0" }}>
          Pilot: {PILOT_META.frontierModels.join(", ")}; judge {PILOT_META.judge}, {PILOT_META.judgeSamples} samples; N = {PILOT_META.nPerCell} per
          cell; seed {PILOT_META.seed}.
        </p>
      </Blueprint>
    </div>
  );
}
