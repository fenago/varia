import { useEffect, useState } from "react";
import type { IssuedCredential } from "@shared/types";
import { renderBadgePng, renderBadgeSquare, type BadgeOptions } from "@lib/share/badgeImage";
import { copyText, issueYearMonth, linkedInAddToProfileUrl, linkedInShareUrl, mailtoShare, shareText, xShareUrl } from "@lib/share/social";
import { Blueprint } from "./Blueprint";

export interface ShareCredentialProps {
  credential: IssuedCredential;
  achievementName: string;
  endorsedBy: string[];
  skills: string[];
  verifyUrl: string;
  /** Pass only when the learner is sharing under their own name */
  learnerLabel?: string | null;
  /** Human-readable credential page URL (defaults to the verify URL) */
  credentialUrl?: string;
}

function download(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export function ShareCredential({ credential, achievementName, endorsedBy, skills, verifyUrl, learnerLabel, credentialUrl }: ShareCredentialProps) {
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState<"card" | "square" | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const opts: BadgeOptions = {
    achievementName,
    learnerLabel: learnerLabel ?? null,
    issuer: credential.issuedBy,
    endorsedBy,
    issuedAt: credential.issuedAt,
    credentialId: credential.id,
    verifyUrl,
    skills,
  };

  useEffect(() => {
    let alive = true;
    let url: string | null = null;
    renderBadgePng(opts)
      .then((blob) => {
        if (!alive) return;
        url = URL.createObjectURL(blob);
        setPreview(url);
      })
      .catch((e: unknown) => alive && setError(e instanceof Error ? e.message : String(e)));
    return () => {
      alive = false;
      if (url) URL.revokeObjectURL(url);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [credential.id, achievementName, learnerLabel, endorsedBy.join("|"), skills.join("|")]);

  const saveImage = async (shape: "card" | "square") => {
    setBusy(shape);
    setError(null);
    try {
      const blob = shape === "card" ? await renderBadgePng(opts) : await renderBadgeSquare(opts);
      download(blob, `${credential.id}-${shape === "card" ? "1200x630" : "1080x1080"}.png`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  const { issueYear, issueMonth } = issueYearMonth(credential.issuedAt);
  const pageUrl = credentialUrl ?? verifyUrl;
  const addToProfile = linkedInAddToProfileUrl({
    name: `${achievementName} · verified work sample`,
    organizationName: credential.issuedBy,
    issueYear,
    issueMonth,
    certUrl: pageUrl,
    certId: credential.id,
  });
  const text = shareText({ achievementName, issuer: credential.issuedBy, endorsedBy });
  const open = (url: string) => window.open(url, "_blank", "noopener,noreferrer");

  return (
    <Blueprint className="va-no-print" style={{ padding: "20px 22px" }}>
      <h6 style={{ margin: "0 0 4px" }}>Share this credential</h6>
      <p className="text-muted" style={{ margin: "0 0 14px", fontSize: 12.5 }}>
        The image carries the proof; the verify link works anywhere.{learnerLabel ? " Shared under your name." : " Your name is not on the image; the credential id and learner id are."}
      </p>

      <div className="va-split" style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.3fr) minmax(0, 1fr)", gap: 18, alignItems: "start" }}>
        <div style={{ border: "1px solid var(--color-divider)", background: "var(--color-surface)", minHeight: 120, display: "flex", alignItems: "center", justifyContent: "center" }}>
          {preview ? (
            <img src={preview} alt={`Badge image for ${credential.id}`} style={{ display: "block", width: "100%", height: "auto" }} />
          ) : (
            <span className="text-muted" style={{ fontSize: 12.5, padding: 16 }}>{error ?? "Drawing the badge image…"}</span>
          )}
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <button type="button" className="btn btn-primary blueprint" disabled={busy !== null} onClick={() => saveImage("card")}>
            {busy === "card" ? "Rendering…" : "Download badge image (1200×630)"}
          </button>
          <button type="button" className="btn btn-secondary" disabled={busy !== null} onClick={() => saveImage("square")}>
            {busy === "square" ? "Rendering…" : "Download square image (1080×1080)"}
          </button>
          <button type="button" className="btn btn-secondary" onClick={() => open(addToProfile)} title="Opens LinkedIn with the certification details prefilled">
            Add to LinkedIn profile
          </button>
          <span className="text-muted" style={{ fontSize: 11.5, marginTop: -4 }}>LinkedIn will ask you to confirm before it saves.</span>
          <div className="va-btn-row" style={{ gap: 8, flexWrap: "wrap" }}>
            <button type="button" className="btn btn-secondary" onClick={() => open(linkedInShareUrl(verifyUrl))}>Share on LinkedIn</button>
            <button type="button" className="btn btn-secondary" onClick={() => open(xShareUrl(text, verifyUrl))}>Share on X</button>
            <a className="btn btn-secondary" href={mailtoShare(`${achievementName} · verified work sample`, `${text}\n${verifyUrl}`)} style={{ textDecoration: "none" }}>
              Email
            </a>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={async () => {
                const ok = await copyText(verifyUrl);
                setCopied(ok);
                setTimeout(() => setCopied(false), 2000);
              }}
            >
              {copied ? "Copied" : "Copy verify link"}
            </button>
          </div>
          {error && <span style={{ fontSize: 12.5, color: "#8d4a3c" }}>{error}</span>}
        </div>
      </div>

      <p className="text-muted" style={{ margin: "14px 0 0", fontSize: 12.5, maxWidth: "76ch" }}>
        Rich previews on social platforms need a public page per credential; that lands with the college-hosted record store. Until then the image carries the proof and the verify link works anywhere.
      </p>
    </Blueprint>
  );
}
