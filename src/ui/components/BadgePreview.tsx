import { useEffect, useMemo, useState } from "react";
import { renderBadge, type BadgeOptions, type BadgeShape } from "@lib/share/badgeImage";
import { CREDENTIAL_STORY, ISSUER_NAME } from "@shared/credential-story";
import type { EvidenceRecord, IssuedCredential, SkillTag } from "@shared/types";

export type BadgeState = "preview" | "issued" | "illustrative";

export interface BadgePreviewProps {
  opts: BadgeOptions;
  shape?: BadgeShape;
  state?: BadgeState;
  /** Optional caption under the image */
  caption?: string;
  /** CSS width of the frame (the image keeps its aspect) */
  width?: number | string;
  className?: string;
  style?: React.CSSProperties;
}

const SIZE = { card: { w: 1200, h: 630 }, square: { w: 1080, h: 1080 } } as const;

/** Draw a diagonal ribbon over a rendered badge so a preview can never pass as issued. */
async function withRibbon(blob: Blob, shape: BadgeShape, text: string): Promise<Blob> {
  const url = URL.createObjectURL(blob);
  try {
    const img = await new Promise<HTMLImageElement>((res, rej) => {
      const i = new Image();
      i.onload = () => res(i);
      i.onerror = () => rej(new Error("badge image failed to load"));
      i.src = url;
    });
    const { w, h } = SIZE[shape];
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    const ctx = c.getContext("2d");
    if (!ctx) return blob;
    ctx.drawImage(img, 0, 0, w, h);
    ctx.save();
    ctx.translate(w / 2, h / 2);
    ctx.rotate(-Math.atan2(h, w) * 0.55);
    const bandH = Math.round(h * 0.11);
    ctx.fillStyle = "rgba(242,242,243,0.92)";
    ctx.fillRect(-w, -bandH / 2, w * 2, bandH);
    ctx.fillStyle = "#8d4a3c";
    ctx.font = `600 ${Math.round(bandH * 0.5)}px "Barlow Condensed", "Arial Narrow", system-ui, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(text, 0, 2);
    ctx.restore();
    return await new Promise<Blob>((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error("encode failed"))), "image/png"));
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * A badge image rendered in the browser from real data. `preview` draws a
 * "not yet issued" ribbon into the pixels; `illustrative` adds a footer line;
 * `issued` is the clean badge. The blob URL is memoised and revoked on unmount.
 */
export function BadgePreview({ opts, shape = "card", state = "preview", caption, width = "100%", className, style }: BadgePreviewProps) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const key = useMemo(() => JSON.stringify([opts, shape, state]), [opts, shape, state]);

  useEffect(() => {
    let alive = true;
    let objectUrl: string | null = null;
    setUrl(null);
    setFailed(false);
    (async () => {
      try {
        let blob = await renderBadge(opts, shape);
        if (state === "preview") blob = await withRibbon(blob, shape, CREDENTIAL_STORY.previewRibbon);
        if (!alive) return;
        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
      } catch {
        if (alive) setFailed(true);
      }
    })();
    return () => {
      alive = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [key]);

  const { w, h } = SIZE[shape];
  const label =
    state === "issued" ? `Credential ${opts.credentialId}` : state === "preview" ? "Preview of the credential, not yet issued" : CREDENTIAL_STORY.illustrativeFooter;

  return (
    <figure className={`va-badge ${className ?? ""}`} style={{ width, margin: 0, ...style }}>
      <div className="va-badge-frame" style={{ aspectRatio: `${w} / ${h}` }}>
        {url ? (
          <img src={url} alt={label} width={w} height={h} className="va-badge-img" />
        ) : (
          <div className="va-badge-placeholder" aria-busy={!failed}>
            {failed ? "Badge image unavailable in this browser" : "Drawing the badge…"}
          </div>
        )}
      </div>
      {(caption || state === "illustrative") && (
        <figcaption className="va-badge-caption">{caption ?? CREDENTIAL_STORY.illustrativeFooter}</figcaption>
      )}
    </figure>
  );
}

/** Build badge options from a record and its context, safe when nothing is issued yet. */
export function badgeOptionsFor(input: {
  achievementName: string;
  record?: EvidenceRecord | null;
  credential?: IssuedCredential | null;
  endorsedBy?: string[];
  skills?: (SkillTag | string)[];
  learnerLabel?: string | null;
  issuedAt?: string | null;
}): BadgeOptions {
  const origin = typeof location !== "undefined" ? location.origin : "https://varia.cloud";
  const recordId = input.record?.id ?? "VR-0000-0000";
  return {
    achievementName: input.achievementName,
    learnerLabel: input.learnerLabel ?? null,
    issuer: ISSUER_NAME,
    endorsedBy: input.endorsedBy ?? [],
    issuedAt: input.credential?.issuedAt ?? input.issuedAt ?? input.record?.issuedAt ?? new Date().toISOString(),
    credentialId: input.credential?.id ?? "CR-pending",
    verifyUrl: `${origin}/verify/${recordId}`,
    skills: (input.skills ?? []).map((s) => (typeof s === "string" ? s : s.label)),
  };
}
