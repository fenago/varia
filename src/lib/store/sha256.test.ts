import { describe, expect, it } from "vitest";
import { sha256Hex } from "./sha256";
import { canonicalJson, hashEvidence } from "./employer";

describe("sha256", () => {
  it("matches the FIPS test vectors", () => {
    expect(sha256Hex("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
    expect(sha256Hex("")).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
    expect(sha256Hex("abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq")).toBe(
      "248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1",
    );
  });

  it("handles multi-block and non-ASCII input", () => {
    const long = "a".repeat(1000);
    expect(sha256Hex(long)).toBe("41edece42d63e8d9bf515a9ba6932e1c20cbc9f5a5d134645adb5db1b9737ea3");
    expect(sha256Hex("héllo · wörld")).toHaveLength(64);
  });

  it("canonical JSON sorts keys so equivalent objects hash identically", () => {
    const a = canonicalJson({ b: 1, a: { d: [1, 2], c: "x" } });
    const b = canonicalJson({ a: { c: "x", d: [1, 2] }, b: 1 });
    expect(a).toBe(b);
    expect(hashEvidence(a)).toMatch(/^[0-9a-f]{64}$/);
  });
});
