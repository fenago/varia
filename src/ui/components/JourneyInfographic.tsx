import { useRef, useState } from "react";
import { Link } from "react-router-dom";

/**
 * The VARIA journey in one picture. Seven illustrated stations joined by a drawn
 * line: an employer's problem → one assignment → a version per student → four
 * checks → the work, graded → a verified record → endorsed and shared.
 *
 * Wide screens render one SVG (crisp at any width, printable, rasterisable);
 * narrow screens render the same stations as a vertical timeline in HTML so
 * every label stays readable at 360px.
 */

export interface JourneyStation {
  n: number;
  title: string;
  /** Plain sentence, pre-split into lines for the SVG (≤ 30 chars each) */
  lines: string[];
  /** Why it matters, in accent, pre-split (≤ 30 chars each) */
  why: string[];
}

export const JOURNEY_STATIONS: JourneyStation[] = [
  { n: 1, title: "Real problem", lines: ["An employer brings a problem", "they actually have."], why: ["Work that means something", "outside the classroom."] },
  { n: 2, title: "One assignment", lines: ["It becomes an assignment with", "a rubric and a model answer."], why: ["One rubric for everyone."] },
  { n: 3, title: "Own version", lines: ["Every student gets their own", "version of the same task."], why: ["Copying is useless.", "No one is watched."] },
  { n: 4, title: "Four checks", lines: ["Different enough · same skill", "one rubric · equally hard."], why: ["Fair before anyone", "sees a version."] },
  { n: 5, title: "Real work", lines: ["Students do the work.", "One rubric grades it all."], why: ["Grades mean the same thing", "across the class."] },
  { n: 6, title: "Verified record", lines: ["The grade becomes a signed", "record with proof it was fair."], why: ["The student owns it."] },
  { n: 7, title: "Endorsed, shared", lines: ["The employer endorses it.", "The student shares it."], why: ["Hire from the work,", "not the transcript."] },
];

export const JOURNEY_CAPTION = "Nothing is proctored · Nothing is invented · The student owns the record";

const ACCENT = "#5980a6";
const ACCENT_DEEP = "#416180";
const INK = "#1d1f20";
const MUTED = "#5d5d60";
const PAPER = "#f2f2f3";
const HEADING = "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif";
const BODY = "'Barlow', Arial, Helvetica, sans-serif";

/** Icons drawn in a 64×64 box, stroke 1.5, currentColor. */
function Icon({ n }: { n: number }) {
  const s = { fill: "none", stroke: "currentColor", strokeWidth: 1.5, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  switch (n) {
    case 1: // building + brief
      return (
        <g {...s}>
          <rect x="8" y="18" width="26" height="38" />
          <path d="M8 26h26M14 33h4M22 33h4M14 41h4M22 41h4M14 49h4M22 49h4M18 18v-6h6v6" />
          <rect x="34" y="28" width="22" height="28" fill={PAPER} />
          <path d="M39 36h12M39 42h12M39 48h8" />
        </g>
      );
    case 2: // document + checklist
      return (
        <g {...s}>
          <path d="M14 8h24l10 10v38H14z" fill={PAPER} />
          <path d="M38 8v10h10" />
          <path d="M20 26h18M20 33h18M20 40h12" />
          <rect x="34" y="38" width="20" height="20" fill={PAPER} />
          <path d="M38 44l3 3 5-6M38 52l3 3 5-6" />
        </g>
      );
    case 3: // one sheet fanning into many
      return (
        <g {...s}>
          <path d="M12 46l6-30h26l-6 30z" fill={ACCENT} fillOpacity="0.12" />
          <path d="M20 50l4-30h26l-4 30z" fill={ACCENT} fillOpacity="0.24" />
          <path d="M28 54l2-30h26l-2 30z" fill={PAPER} />
          <path d="M34 32h14M34 38h14M34 44h10" />
        </g>
      );
    case 4: // four seals
      return (
        <g {...s}>
          {[
            [18, 18],
            [46, 18],
            [18, 46],
            [46, 46],
          ].map(([cx, cy], i) => (
            <g key={i}>
              <circle cx={cx} cy={cy} r="11" fill={PAPER} />
              <circle cx={cx} cy={cy} r="7.5" strokeDasharray="1.5 2" />
              <path d={`M${cx - 4} ${cy}l3 3 5-6`} />
            </g>
          ))}
        </g>
      );
    case 5: // hand + rubric grid
      return (
        <g {...s}>
          <path d="M8 40c0-6 3-9 7-9h3V19a3 3 0 0 1 6 0v10h2V15a3 3 0 0 1 6 0v14h2V19a3 3 0 0 1 6 0v18c0 9-6 15-15 15S8 49 8 40z" fill={PAPER} />
          <rect x="40" y="10" width="18" height="18" fill={PAPER} />
          <path d="M40 16h18M40 22h18M46 10v18M52 10v18" />
          <path d="M42 13l1.5 1.5 2.5-3" />
        </g>
      );
    case 6: // document with seal + hash line
      return (
        <g {...s}>
          <path d="M14 8h24l10 10v38H14z" fill={PAPER} />
          <path d="M38 8v10h10" />
          <path d="M20 26h18M20 33h18" />
          <path d="M20 41h4M27 41h4M34 41h4" strokeDasharray="1 2" />
          <circle cx="42" cy="48" r="9" fill={PAPER} />
          <circle cx="42" cy="48" r="6" strokeDasharray="1.5 2" />
          <path d="M39 48l2 2 4-5" />
        </g>
      );
    case 7: // badge with ribbon + profile card + share arrow
    default:
      return (
        <g {...s}>
          <path d="M14 46l4 12 4-4 4 4 4-12" />
          <circle cx="22" cy="30" r="12" fill={PAPER} />
          <circle cx="22" cy="30" r="8" strokeDasharray="1.5 2" />
          <path d="M18 30l3 3 5-6" />
          <rect x="38" y="20" width="20" height="26" fill={PAPER} />
          <circle cx="45" cy="28" r="3" />
          <path d="M40 36h16M40 41h12" />
          <path d="M48 10l8 0 0 8M56 10l-9 9" />
        </g>
      );
  }
}

/** The wide layout as one SVG (also the download and print artwork). */
export function JourneySvg({ id = "va-jg-svg", title = "VARIA, in one picture", className }: { id?: string; title?: string; className?: string }) {
  const W = 1400;
  const H = 500;
  const step = 190;
  const x0 = 105;
  const iconY = 132;
  return (
    <svg id={id} className={className} viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label={`${title}: the seven steps of the VARIA journey`} style={{ display: "block", height: "auto", maxWidth: "100%", background: PAPER }}>
      <defs>
        <marker id="va-jg-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse">
          <path d="M0 0L10 5 0 10z" fill={ACCENT} />
        </marker>
      </defs>
      <rect x="0" y="0" width={W} height={H} fill={PAPER} />
      {/* frame with corner marks */}
      <rect x="20.5" y="20.5" width={W - 41} height={H - 41} fill="none" stroke={INK} strokeOpacity="0.16" />
      {[
        [20, 20],
        [W - 20, 20],
        [20, H - 20],
        [W - 20, H - 20],
      ].map(([x, y], i) => (
        <g key={i} stroke={INK} strokeOpacity="0.55">
          <line x1={x - 6} y1={y} x2={x + 6} y2={y} />
          <line x1={x} y1={y - 6} x2={x} y2={y + 6} />
        </g>
      ))}
      <text x="48" y="58" fontFamily={HEADING} fontSize="11" letterSpacing="2" fill={MUTED}>
        THE JOURNEY, IN ONE PICTURE
      </text>
      <text x="48" y="90" fontFamily={HEADING} fontSize="30" fontWeight="600" fill={INK}>
        From an employer's problem to a record a student can share
      </text>

      {JOURNEY_STATIONS.map((st, i) => {
        const cx = x0 + i * step;
        return (
          <g key={st.n}>
            {i < JOURNEY_STATIONS.length - 1 && (
              <line x1={cx + 52} y1={iconY + 40} x2={cx + step - 52} y2={iconY + 40} stroke={ACCENT} strokeWidth="1.5" markerEnd="url(#va-jg-arrow)" />
            )}
            {/* station frame */}
            <rect x={cx - 44} y={iconY - 4} width="88" height="88" fill="none" stroke={INK} strokeOpacity="0.16" />
            <g transform={`translate(${cx - 32} ${iconY + 8})`} color={ACCENT_DEEP}>
              <Icon n={st.n} />
            </g>
            <circle cx={cx - 44} cy={iconY - 4} r="12" fill={ACCENT} />
            <text x={cx - 44} y={iconY} textAnchor="middle" fontFamily={HEADING} fontSize="13" fontWeight="600" fill="#fff">
              {st.n}
            </text>
            <text x={cx} y={iconY + 122} textAnchor="middle" fontFamily={HEADING} fontSize="22" fontWeight="600" fill={INK}>
              {st.title}
            </text>
            {st.lines.map((l, j) => (
              <text key={j} x={cx} y={iconY + 148 + j * 19} textAnchor="middle" fontFamily={BODY} fontSize="13.5" fill={INK}>
                {l}
              </text>
            ))}
            {st.why.map((l, j) => (
              <text key={j} x={cx} y={iconY + 200 + j * 18} textAnchor="middle" fontFamily={HEADING} fontSize="14.5" fontWeight="600" fill={ACCENT_DEEP}>
                {l}
              </text>
            ))}
          </g>
        );
      })}

      <line x1="48" y1={H - 80} x2={W - 48} y2={H - 80} stroke={INK} strokeOpacity="0.16" />
      <text x={W / 2} y={H - 48} textAnchor="middle" fontFamily={HEADING} fontSize="15" letterSpacing="1.5" fill={MUTED}>
        {JOURNEY_CAPTION.toUpperCase()}
      </text>
    </svg>
  );
}

/** Narrow layout: the same stations as a vertical timeline in HTML. */
function JourneyList() {
  return (
    <ol className="va-jg-list" aria-label="The seven steps of the VARIA journey">
      {JOURNEY_STATIONS.map((st) => (
        <li key={st.n} className="va-jg-item">
          <div className="va-jg-icon" aria-hidden="true">
            <svg viewBox="0 0 64 64" width="56" height="56" color={ACCENT_DEEP}>
              <Icon n={st.n} />
            </svg>
            <span className="va-jg-num">{st.n}</span>
          </div>
          <div className="va-jg-text">
            <div className="va-jg-title">{st.title}</div>
            <p className="va-jg-line">{st.lines.join(" ")}</p>
            <p className="va-jg-why">{st.why.join(" ")}</p>
          </div>
        </li>
      ))}
      <li className="va-jg-caption">{JOURNEY_CAPTION}</li>
    </ol>
  );
}

export interface JourneyInfographicProps {
  /** Embedded on another page: shows a "See it full size" link instead of the download/print row */
  compact?: boolean;
  className?: string;
}

async function downloadPng(svg: SVGSVGElement, filename: string): Promise<void> {
  const xml = new XMLSerializer().serializeToString(svg);
  const blob = new Blob([xml], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  try {
    const img = new Image();
    img.decoding = "async";
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("Could not render the image."));
      img.src = url;
    });
    const scale = 2400 / 1400;
    const canvas = document.createElement("canvas");
    canvas.width = 2400;
    canvas.height = Math.round(500 * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas is not available in this browser.");
    ctx.fillStyle = PAPER;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const png: Blob | null = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
    if (!png) throw new Error("Could not encode the image.");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(png);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function JourneyInfographic({ compact = false, className }: JourneyInfographicProps) {
  const wrap = useRef<HTMLDivElement>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const onDownload = async () => {
    const svg = wrap.current?.querySelector("svg.va-jg-art") as SVGSVGElement | null;
    if (!svg) return;
    setBusy(true);
    setErr(null);
    try {
      await downloadPng(svg, "varia-journey.png");
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div ref={wrap} className={`va-jg${compact ? " is-compact" : ""}${className ? ` ${className}` : ""}`}>
      <div className="va-jg-svg">
        <div className="va-jg-art-wrap">
          {/* the on-screen SVG carries a class so the download finds the visible artwork */}
          <JourneySvgArt />
        </div>
      </div>
      <JourneyList />
      {compact ? (
        <div className="va-jg-actions va-no-print">
          <Link to="/journey" className="va-jg-link">
            See it full size, download or print →
          </Link>
        </div>
      ) : (
        <div className="va-jg-actions va-no-print">
          <button type="button" className="btn btn-primary" onClick={onDownload} disabled={busy}>
            {busy ? "Rendering…" : "Download as image"}
          </button>
          <button type="button" className="btn btn-secondary" onClick={() => window.print()}>
            Print
          </button>
          <span className="text-muted" style={{ fontSize: 14 }}>The image is 2400 pixels wide, ready for a slide or a post.</span>
          {err && <span style={{ color: "#8d4a3c", fontSize: 14 }}>{err}</span>}
        </div>
      )}
    </div>
  );
}

function JourneySvgArt() {
  return (
    <div className="va-jg-art-inner">
      <JourneySvg className="va-jg-art" />
    </div>
  );
}
