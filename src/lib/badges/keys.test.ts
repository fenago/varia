import { describe, expect, it } from "vitest";
import { generateSigningKey, jwsKid, signCanonical, verifySignature } from "./keys";

describe("demo signing key", () => {
  it("signs and verifies a canonical payload, and rejects tampering", async () => {
    const key = await generateSigningKey();
    expect(key.kid).toMatch(/^mdc-demo-[0-9a-f]{8}$/);
    expect(key.alg).toBe("ES256");
    expect(key.demo).toBe(true);
    const canonical = JSON.stringify({ a: 1, b: "two" });
    const jws = await signCanonical(key, canonical);
    expect(jws.split(".")).toHaveLength(3);
    expect(jwsKid(jws)).toBe(key.kid);
    expect(await verifySignature(key.publicJwk, canonical, jws)).toBe(true);
    expect(await verifySignature(key.publicJwk, canonical.replace("two", "three"), jws)).toBe(false);
    const other = await generateSigningKey();
    expect(await verifySignature(other.publicJwk, canonical, jws)).toBe(false);
    expect(await verifySignature(key.publicJwk, canonical, "not.a.jws")).toBe(false);
  });
});
