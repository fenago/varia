/**
 * Share links for an issued credential. Pure URL builders; no network.
 */

export interface LinkedInAddToProfile {
  /** Certification name as it should appear on the profile */
  name: string;
  organizationName: string;
  issueYear: number;
  /** 1–12 */
  issueMonth: number;
  certUrl: string;
  certId: string;
}

const LINKEDIN_ADD = "https://www.linkedin.com/profile/add";

/** LinkedIn's Add-to-Profile deep link. LinkedIn asks the member to confirm before saving. */
export function linkedInAddToProfileUrl(p: LinkedInAddToProfile): string {
  const q = new URLSearchParams({
    startTask: "CERTIFICATION_NAME",
    name: p.name,
    organizationName: p.organizationName,
    issueYear: String(p.issueYear),
    issueMonth: String(p.issueMonth),
    certUrl: p.certUrl,
    certId: p.certId,
  });
  return `${LINKEDIN_ADD}?${q.toString()}`;
}

export function linkedInShareUrl(url: string): string {
  return `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}`;
}

export function xShareUrl(text: string, url: string): string {
  const q = new URLSearchParams({ text, url });
  return `https://twitter.com/intent/tweet?${q.toString()}`;
}

export function mailtoShare(subject: string, body: string): string {
  return `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

/** Copy text to the clipboard; resolves false when the clipboard is unavailable. */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* fall through */
  }
  return false;
}

/** Suggested post text for a credential. */
export function shareText(opts: { achievementName: string; issuer: string; endorsedBy: string[] }): string {
  const endorsed = opts.endorsedBy.length ? `, endorsed by ${opts.endorsedBy.join(" and ")}` : "";
  return `I earned a verified work-sample credential from ${opts.issuer} for "${opts.achievementName}"${endorsed}. Anyone can verify it:`;
}

export function issueYearMonth(iso: string): { issueYear: number; issueMonth: number } {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) {
    const now = new Date();
    return { issueYear: now.getFullYear(), issueMonth: now.getMonth() + 1 };
  }
  return { issueYear: d.getFullYear(), issueMonth: d.getMonth() + 1 };
}
