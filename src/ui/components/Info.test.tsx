import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { Info, Term } from "./Info";

describe("Info / Term", () => {
  it("renders nothing for an unknown slug", () => {
    const html = renderToStaticMarkup(<MemoryRouter><Info term="no-such-term" /></MemoryRouter>);
    expect(html).toBe("");
    const html2 = renderToStaticMarkup(<MemoryRouter><Term term="no-such-term">plain</Term></MemoryRouter>);
    expect(html2).toBe("plain");
  });
  it("renders an accessible button for a known slug", () => {
    const html = renderToStaticMarkup(<MemoryRouter><Info term="cosine" /></MemoryRouter>);
    expect(html).toContain('aria-label="What is word similarity?"');
    const html2 = renderToStaticMarkup(<MemoryRouter><Term term="p1">Versions look different</Term></MemoryRouter>);
    expect(html2).toContain("va-term");
    expect(html2).toContain("Versions look different");
  });
});
