import { CREDENTIAL_STORY, ISSUER_NAME } from "@shared/credential-story";

export interface LinkedInCardMockProps {
  achievementName: string;
  credentialId: string;
  issued: string; // "Sep 2026"
  /** When false the entry is labelled as a preview of what will appear */
  issuedForReal?: boolean;
  className?: string;
}

/**
 * A deliberately mock "Licenses & certifications" entry: muted greys, no
 * platform branding, labelled as a mock. Shows what one click adds.
 */
export function LinkedInCardMock({ achievementName, credentialId, issued, issuedForReal = false, className }: LinkedInCardMockProps) {
  return (
    <div className={`va-limock ${className ?? ""}`} aria-label={CREDENTIAL_STORY.linkedinLabel}>
      <div className="va-limock-label">{CREDENTIAL_STORY.linkedinLabel}</div>
      <div className="va-limock-card">
        <div className="va-limock-head">Licenses &amp; certifications</div>
        <div className="va-limock-row">
          <div className="va-limock-logo" aria-hidden="true">
            <span>MDC</span>
          </div>
          <div className="va-limock-body">
            <div className="va-limock-title">{achievementName}</div>
            <div className="va-limock-sub">{ISSUER_NAME}</div>
            <div className="va-limock-meta">
              Issued {issued} · Credential ID {credentialId}
            </div>
            <span className="va-limock-chip">Show credential ↗</span>
          </div>
        </div>
      </div>
      {!issuedForReal && <div className="va-limock-note">Preview. The entry appears once the credential is issued and the student adds it.</div>}
    </div>
  );
}
