/**
 * Open Badges 3.0 EndorsementCredential: a second organisation vouching for
 * an AchievementCredential. Issued in the employer's name. In this prototype it
 * is signed with the workspace's demo key; in production the employer signs.
 */

import type { Endorsement, SigningKey } from "@shared/types";
import { OB3_CONTEXT } from "./openBadges";

export interface EndorsementCredential {
  "@context": readonly string[];
  id: string;
  type: ["VerifiableCredential", "EndorsementCredential"];
  name: string;
  issuer: { id: string; type: "Profile"; name: string; description?: string };
  validFrom: string;
  credentialSubject: {
    id: string;
    type: "EndorsementSubject";
    endorsementComment: string;
  };
  proof?: {
    type: "DataIntegrityProof";
    cryptosuite: "ecdsa-jcs-2019";
    created: string;
    verificationMethod: string;
    proofPurpose: "assertionMethod";
    proofValue: string;
    description: string;
  };
}

export function endorsementIssuerId(origin: string, organisation: string): string {
  const slug = organisation.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
  return `${origin}/employer/${slug}`;
}

/** Build the unsigned EndorsementCredential for one qualifying endorsement. */
export function toEndorsementCredential(opts: {
  origin: string;
  achievementCredentialId: string;
  endorsement: Endorsement;
  credentialId: string; // the IssuedCredential id, for a stable endorsement id
  index: number;
}): EndorsementCredential {
  const e = opts.endorsement;
  const bar = e.meetsBar ? "meets our bar" : "does not meet our bar";
  const comment = `${e.comment.trim()}${e.comment.trim().endsWith(".") ? "" : "."} ${bar}; ${e.score} of 5. Reviewed by ${e.reviewerName}${e.reviewerEmail ? ` (${e.reviewerEmail})` : ""}.`;
  return {
    "@context": OB3_CONTEXT,
    id: `${opts.origin}/credential/${opts.credentialId}/endorsement/${opts.index + 1}`,
    type: ["VerifiableCredential", "EndorsementCredential"],
    name: `Endorsement by ${e.organisation}`,
    issuer: {
      id: endorsementIssuerId(opts.origin, e.organisation),
      type: "Profile",
      name: e.organisation,
      description: "Employer partner endorsement of a VARIA work sample.",
    },
    validFrom: e.at,
    credentialSubject: {
      id: opts.achievementCredentialId,
      type: "EndorsementSubject",
      endorsementComment: comment,
    },
  };
}

export function attachProof<T extends { proof?: unknown }>(
  doc: T,
  key: Pick<SigningKey, "kid" | "issuerName" | "demo">,
  origin: string,
  jws: string,
  created: string,
  signerNote: string,
): T {
  return {
    ...doc,
    proof: {
      type: "DataIntegrityProof",
      cryptosuite: "ecdsa-jcs-2019",
      created,
      verificationMethod: `${origin}#${key.kid}`,
      proofPurpose: "assertionMethod",
      proofValue: jws,
      description: key.demo
        ? `${signerNote} Signed with a browser-generated DEMO key (${key.issuerName}); this proves the mechanism, not the signer's identity.`
        : `${signerNote} Signed by ${key.issuerName}.`,
    },
  };
}
