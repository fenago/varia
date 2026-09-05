/**
 * Badge images for sharing an issued credential on social platforms.
 * Drawn on an offscreen canvas in the Industry design language. The layout is
 * computed by a pure function so it can be unit-tested without a canvas.
 */

export interface BadgeOptions {
  achievementName: string;
  /** Shown only when the student chooses to share under their name */
  learnerLabel?: string | null;
  issuer: string;
  endorsedBy: string[];
  issuedAt: string;
  credentialId: string;
  verifyUrl: string;
  skills: string[];
}

export type BadgeShape = "card" | "square";

export interface TextBlock {
  kind: "kicker" | "headline" | "line" | "chip" | "small" | "mark";
  text: string;
  x: number;
  y: number;
  size: number;
  font: "heading" | "body";
  color: string;
  weight?: number;
  /** For chips: measured width incl. padding (estimated in layout, precise at draw) */
  width?: number;
  height?: number;
}

export interface BadgeLayout {
  width: number;
  height: number;
  background: string;
  blocks: TextBlock[];
}

const INK = "#1d2d3d";
const PAPER = "#f2f2f3";
const MUTED = "#8fa8bf";
const SOFT = "#d5e0ea";
const ACCENT = "#94bce3";

const SIZES: Record<BadgeShape, { width: number; height: number; pad: number; headline: number; kicker: number; line: number; chip: number; small: number }> = {
  card: { width: 1200, height: 630, pad: 64, headline: 56, kicker: 20, line: 26, chip: 20, small: 18 },
  square: { width: 1080, height: 1080, pad: 72, headline: 60, kicker: 22, line: 28, chip: 22, small: 19 },
};

/** Rough text width for layout decisions (canvas measures precisely at draw time). */
function estWidth(text: string, size: number, font: "heading" | "body"): number {
  const perChar = font === "heading" ? 0.46 : 0.52;
  return text.length * size * perChar;
}

/** Greedy word wrap on estimated widths. */
export function wrapText(text: string, size: number, font: "heading" | "body", maxWidth: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    const next = cur ? `${cur} ${w}` : w;
    if (estWidth(next, size, font) > maxWidth && cur) {
      lines.push(cur);
      cur = w;
    } else {
      cur = next;
    }
  }
  if (cur) lines.push(cur);
  return lines;
}

function fmtDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

/** Pure layout: where every piece of text goes. */
export function layoutBadge(opts: BadgeOptions, shape: BadgeShape = "card"): BadgeLayout {
  const s = SIZES[shape];
  const blocks: TextBlock[] = [];
  const innerW = s.width - s.pad * 2;
  let y = s.pad;

  // registration marks (drawn as "+" at the four corners of the inner frame)
  const m = 14;
  for (const [mx, my] of [
    [s.pad - m, s.pad - m],
    [s.width - s.pad + m, s.pad - m],
    [s.pad - m, s.height - s.pad + m],
    [s.width - s.pad + m, s.height - s.pad + m],
  ] as [number, number][]) {
    blocks.push({ kind: "mark", text: "+", x: mx, y: my, size: m, font: "body", color: MUTED });
  }

  blocks.push({ kind: "kicker", text: `VERIFIED WORK SAMPLE · ${opts.issuer.toUpperCase()}`, x: s.pad, y, size: s.kicker, font: "heading", color: MUTED });
  y += s.kicker + 22;

  const headlineLines = wrapText(opts.achievementName, s.headline, "heading", innerW).slice(0, shape === "card" ? 2 : 3);
  for (const line of headlineLines) {
    blocks.push({ kind: "headline", text: line, x: s.pad, y, size: s.headline, font: "heading", color: PAPER, weight: 600 });
    y += s.headline * 1.06;
  }
  y += 10;

  if (opts.learnerLabel) {
    blocks.push({ kind: "line", text: opts.learnerLabel, x: s.pad, y, size: s.line, font: "body", color: SOFT });
    y += s.line * 1.5;
  }

  const endorsed = opts.endorsedBy.filter(Boolean);
  if (endorsed.length) {
    const text = `Endorsed by ${endorsed.join(", ")}`;
    for (const line of wrapText(text, s.line, "body", innerW).slice(0, 2)) {
      blocks.push({ kind: "line", text: line, x: s.pad, y, size: s.line, font: "body", color: ACCENT });
      y += s.line * 1.4;
    }
  }
  y += 14;

  // skills as outline chips, wrapping
  let cx = s.pad;
  const chipH = s.chip * 2;
  const rowGap = 12;
  const maxChipRows = shape === "card" ? 2 : 4;
  let rows = 0;
  for (const skill of opts.skills) {
    const w = estWidth(skill, s.chip, "body") + s.chip * 1.4;
    if (cx + w > s.width - s.pad) {
      rows += 1;
      if (rows >= maxChipRows) break;
      cx = s.pad;
      y += chipH + rowGap;
    }
    blocks.push({ kind: "chip", text: skill, x: cx, y, size: s.chip, font: "body", color: SOFT, width: w, height: chipH });
    cx += w + 10;
  }
  if (opts.skills.length) y += chipH + 8;

  // footer: issued date, credential id, verify url (bottom-anchored)
  const footY = s.height - s.pad - s.small * 2.6;
  blocks.push({ kind: "small", text: `Issued ${fmtDate(opts.issuedAt)} · ${opts.credentialId}`, x: s.pad, y: footY, size: s.small, font: "body", color: MUTED });
  blocks.push({ kind: "small", text: opts.verifyUrl, x: s.pad, y: footY + s.small * 1.5, size: s.small, font: "body", color: SOFT });

  return { width: s.width, height: s.height, background: INK, blocks };
}

function fontStack(font: "heading" | "body", size: number, weight = 400): string {
  const family = font === "heading" ? '"Barlow Condensed", "Arial Narrow", "Helvetica Neue", Arial, sans-serif' : '"Barlow", "Helvetica Neue", Arial, sans-serif';
  return `${weight} ${size}px ${family}`;
}

async function fontsReady(): Promise<void> {
  try {
    const d = typeof document !== "undefined" ? document : null;
    if (d && "fonts" in d) {
      await Promise.race([(d as Document).fonts.ready, new Promise((r) => setTimeout(r, 1500))]);
    }
  } catch {
    /* fall back to system fonts */
  }
}

/** Draw a layout onto a canvas and return a PNG blob. Browser only. */
export async function renderBadge(opts: BadgeOptions, shape: BadgeShape = "card"): Promise<Blob> {
  if (typeof document === "undefined") throw new Error("Badge images render in the browser.");
  await fontsReady();
  const L = layoutBadge(opts, shape);
  const canvas = document.createElement("canvas");
  canvas.width = L.width;
  canvas.height = L.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas is not available in this browser.");

  ctx.fillStyle = L.background;
  ctx.fillRect(0, 0, L.width, L.height);

  // inner hairline frame
  const pad = SIZES[shape].pad;
  ctx.strokeStyle = "rgba(255,255,255,0.18)";
  ctx.lineWidth = 1;
  ctx.strokeRect(pad - 14, pad - 14, L.width - (pad - 14) * 2, L.height - (pad - 14) * 2);

  for (const b of L.blocks) {
    ctx.fillStyle = b.color;
    ctx.textBaseline = "top";
    if (b.kind === "mark") {
      ctx.strokeStyle = b.color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(b.x - b.size / 2, b.y);
      ctx.lineTo(b.x + b.size / 2, b.y);
      ctx.moveTo(b.x, b.y - b.size / 2);
      ctx.lineTo(b.x, b.y + b.size / 2);
      ctx.stroke();
      continue;
    }
    if (b.kind === "chip") {
      ctx.font = fontStack("body", b.size);
      const w = ctx.measureText(b.text).width + b.size * 1.4;
      const h = b.height ?? b.size * 2;
      ctx.strokeStyle = "rgba(255,255,255,0.45)";
      ctx.lineWidth = 1;
      ctx.strokeRect(b.x, b.y, w, h);
      ctx.fillStyle = b.color;
      ctx.fillText(b.text, b.x + b.size * 0.7, b.y + (h - b.size) / 2 - 1);
      continue;
    }
    if (b.kind === "kicker") {
      ctx.font = fontStack("heading", b.size, 600);
      // letter-spaced kicker
      let x = b.x;
      for (const ch of b.text) {
        ctx.fillText(ch, x, b.y);
        x += ctx.measureText(ch).width + b.size * 0.14;
      }
      continue;
    }
    ctx.font = fontStack(b.font, b.size, b.weight ?? 400);
    ctx.fillText(b.text, b.x, b.y);
  }

  return await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("Could not encode the badge image."))), "image/png");
  });
}

export function renderBadgePng(opts: BadgeOptions): Promise<Blob> {
  return renderBadge(opts, "card");
}

export function renderBadgeSquare(opts: BadgeOptions): Promise<Blob> {
  return renderBadge(opts, "square");
}
