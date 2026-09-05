import { describe, expect, it } from "vitest";
import { issueYearMonth, linkedInAddToProfileUrl, linkedInShareUrl, mailtoShare, shareText, xShareUrl } from "./social";

describe("social share links", () => {
  it("builds LinkedIn's Add-to-Profile URL with every field encoded", () => {
    const u = new URL(
      linkedInAddToProfileUrl({
        name: "Classifier Audit for Lender · verified work sample",
        organizationName: "Miami Dade College",
        issueYear: 2026,
        issueMonth: 9,
        certUrl: "https://varia.cloud/credential/VR-2026-0001?as=learner",
        certId: "CR-2026-0001",
      }),
    );
    expect(u.origin + u.pathname).toBe("https://www.linkedin.com/profile/add");
    expect(u.searchParams.get("startTask")).toBe("CERTIFICATION_NAME");
    expect(u.searchParams.get("name")).toBe("Classifier Audit for Lender · verified work sample");
    expect(u.searchParams.get("organizationName")).toBe("Miami Dade College");
    expect(u.searchParams.get("issueYear")).toBe("2026");
    expect(u.searchParams.get("issueMonth")).toBe("9");
    expect(u.searchParams.get("certUrl")).toBe("https://varia.cloud/credential/VR-2026-0001?as=learner");
    expect(u.searchParams.get("certId")).toBe("CR-2026-0001");
    expect(u.href).not.toContain(" ");
  });

  it("encodes share intents", () => {
    expect(linkedInShareUrl("https://varia.cloud/verify/VR-1?x=1")).toBe("https://www.linkedin.com/sharing/share-offsite/?url=https%3A%2F%2Fvaria.cloud%2Fverify%2FVR-1%3Fx%3D1");
    const x = new URL(xShareUrl("Hello & goodbye", "https://varia.cloud/verify/VR-1"));
    expect(x.searchParams.get("text")).toBe("Hello & goodbye");
    expect(x.searchParams.get("url")).toBe("https://varia.cloud/verify/VR-1");
    const m = mailtoShare("My credential", "Line 1\nLine 2 & more");
    expect(m.startsWith("mailto:?subject=My%20credential&body=")).toBe(true);
    expect(decodeURIComponent(m.split("&body=")[1])).toBe("Line 1\nLine 2 & more");
  });

  it("writes honest share text and derives issue month", () => {
    const t = shareText({ achievementName: "Classifier Audit", issuer: "Miami Dade College", endorsedBy: ["Bayfront Regional Bank"] });
    expect(t).toContain("endorsed by Bayfront Regional Bank");
    expect(t).toContain("verify");
    expect(issueYearMonth("2026-09-05T12:00:00Z")).toEqual({ issueYear: 2026, issueMonth: 9 });
    const now = issueYearMonth("not a date");
    expect(now.issueMonth).toBeGreaterThanOrEqual(1);
  });
});
