/**
 * Demo signing for evidence records. ECDSA P-256 (ES256) via WebCrypto.
 *
 * The signature format is a compact JWS (RFC 7515) with a base64url payload:
 *   base64url(header) . base64url(canonical) . base64url(r||s)
 * We chose the plain (non-detached) form so a single string is self-describing
 * and can be verified by any standard JWS library given the public JWK.
 *
 * The key is generated in the browser and stored in the workspace. It stands
 * in for an institution-held key; it proves the mechanism, not MDC's identity.
 */

import type { SigningKey } from "@shared/types";

const subtle = (): SubtleCrypto => {
  const c = globalThis.crypto;
  if (!c || !c.subtle) throw new Error("WebCrypto is not available in this environment.");
  return c.subtle;
};

const te = new TextEncoder();

export function b64url(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function b64urlDecode(s: string): Uint8Array<ArrayBuffer> {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (s.length % 4)) % 4);
  const bin = atob(b64);
  const out = new Uint8Array(new ArrayBuffer(bin.length));
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function b64urlText(s: string): string {
  return b64url(te.encode(s));
}

function randomHex(n: number): string {
  const bytes = new Uint8Array(n);
  globalThis.crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

const ALG: EcKeyImportParams = { name: "ECDSA", namedCurve: "P-256" };
const SIGN: EcdsaParams = { name: "ECDSA", hash: "SHA-256" };

/** Generate a fresh demo key pair (does not store it; the caller persists it). */
export async function generateSigningKey(issuerName = "Miami Dade College (demo key)"): Promise<SigningKey> {
  const pair = await subtle().generateKey(ALG, true, ["sign", "verify"]);
  const publicJwk = await subtle().exportKey("jwk", pair.publicKey);
  const privateJwk = await subtle().exportKey("jwk", pair.privateKey);
  return {
    kid: `mdc-demo-${randomHex(4)}`,
    alg: "ES256",
    publicJwk,
    privateJwk,
    createdAt: new Date().toISOString(),
    issuerName,
    demo: true,
  };
}

/**
 * Return the workspace's key, generating and storing one if absent.
 * `store` is the minimal surface of the workspace store so this stays testable.
 */
export async function ensureSigningKey(store: {
  signingKey?: SigningKey | null;
  setSigningKey: (key: SigningKey) => void;
}): Promise<SigningKey> {
  if (store.signingKey) return store.signingKey;
  const key = await generateSigningKey();
  store.setSigningKey(key);
  return key;
}

/** Sign a canonical string; returns a compact JWS (header.payload.signature). */
export async function signCanonical(key: SigningKey, canonical: string): Promise<string> {
  const priv = await subtle().importKey("jwk", key.privateJwk, ALG, false, ["sign"]);
  const header = b64urlText(JSON.stringify({ alg: "ES256", kid: key.kid, typ: "JWS" }));
  const payload = b64urlText(canonical);
  const sig = await subtle().sign(SIGN, priv, te.encode(`${header}.${payload}`));
  return `${header}.${payload}.${b64url(new Uint8Array(sig))}`;
}

/** Verify a compact JWS against the public JWK and the expected canonical payload. */
export async function verifySignature(publicJwk: JsonWebKey, canonical: string, jws: string): Promise<boolean> {
  try {
    const parts = jws.split(".");
    if (parts.length !== 3) return false;
    const [header, payload, sig] = parts;
    if (payload !== b64urlText(canonical)) return false;
    const pub = await subtle().importKey("jwk", publicJwk, ALG, false, ["verify"]);
    return await subtle().verify(SIGN, pub, b64urlDecode(sig), te.encode(`${header}.${payload}`));
  } catch {
    return false;
  }
}

/** Read the kid out of a compact JWS header without verifying. */
export function jwsKid(jws: string): string | null {
  try {
    const header = JSON.parse(new TextDecoder().decode(b64urlDecode(jws.split(".")[0])));
    return typeof header.kid === "string" ? header.kid : null;
  } catch {
    return null;
  }
}
