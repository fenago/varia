import { Route, Routes } from "react-router-dom";
import { Layout } from "./shell/Layout";
import { ReviewLayout } from "./shell/ReviewLayout";
import { PageTitleProvider } from "./shell/PageTitleContext";
import Start from "./pages/Start";
import Home from "./pages/Home";
import Summary from "./pages/Summary";
import Notes from "./pages/Notes";
import About from "./pages/About";
import Import from "./pages/Import";
import Blueprint from "./pages/Blueprint";
import Generate from "./pages/Generate";
import Report from "./pages/Report";
import Roster from "./pages/Roster";
import Grade from "./pages/Grade";
import Surface from "./pages/Surface";
import Console from "./pages/Console";
import Settings from "./pages/Settings";
import Employer from "./pages/Employer";
import Review from "./pages/Review";
import Evidence from "./pages/Evidence";
import Verify from "./pages/Verify";
import Share from "./pages/Share";
import For from "./pages/For";
import Portfolio from "./pages/Portfolio";
import Talent from "./pages/Talent";

export type PageKey =
  | "home"
  | "summary"
  | "start"
  | "notes"
  | "about"
  | "import"
  | "blueprint"
  | "generate"
  | "report"
  | "roster"
  | "grade"
  | "surface"
  | "console"
  | "settings"
  | "employer"
  | "review"
  | "evidence"
  | "verify"
  | "share"
  | "for"
  | "portfolio"
  | "talent";

/** Crumb + title per page, copied from the mockup's PAGES map. */
export const PAGES: Record<PageKey, { crumb: string; title: string; path: string }> = {
  home: { crumb: "Home", title: "Proof an employer can verify", path: "/" },
  summary: { crumb: "Orientation", title: "Executive summary", path: "/summary" },
  start: { crumb: "Orientation", title: "Getting started", path: "/start" },
  notes: { crumb: "Orientation", title: "Design notes and assumptions", path: "/notes" },
  about: { crumb: "Orientation", title: "About VARIA", path: "/about" },
  import: { crumb: "Instructor · step 0 of 5", title: "Load an assessment you already have", path: "/import" },
  blueprint: { crumb: "Instructor · step 1 of 5", title: "Assessment blueprint", path: "/blueprint" },
  generate: { crumb: "Instructor · step 2 of 5", title: "Generate student versions", path: "/generate" },
  report: { crumb: "Instructor · step 3 of 5", title: "Integrity report", path: "/report" },
  roster: { crumb: "Instructor · step 4 of 5", title: "Release and roster", path: "/roster" },
  grade: { crumb: "Instructor · step 5 of 5", title: "Grade with the rubric", path: "/grade" },
  surface: { crumb: "Oversight", title: "Strategy trade-off surface", path: "/surface" },
  console: { crumb: "Oversight", title: "Institution compliance console", path: "/console" },
  settings: { crumb: "Setup", title: "Your Claude key and models", path: "/settings" },
  employer: { crumb: "Oversight", title: "Employer validation", path: "/employer" },
  review: { crumb: "Employer review", title: "Validate an assessment", path: "/review" },
  evidence: { crumb: "Evidence record", title: "Evidence of demonstrated skill", path: "/evidence" },
  verify: { crumb: "Verification", title: "Verify an evidence record", path: "/verify" },
  share: { crumb: "Your record", title: "Share your evidence record", path: "/share" },
  for: { crumb: "Orientation", title: "Who VARIA is for", path: "/for" },
  portfolio: { crumb: "Portfolio", title: "Your verified work", path: "/portfolio" },
  talent: { crumb: "Talent view", title: "Candidates who did your work", path: "/talent" },
};

/** Resolve the page key for a pathname (so /grade/v-07 → "grade", /review/b1 → "review"). */
export function pageKeyForPath(pathname: string): PageKey {
  if (pathname === "/") return "home";
  if (pathname === "/start" || pathname.startsWith("/start/")) return "start";
  const seg = "/" + pathname.split("/").filter(Boolean)[0];
  const hit = (Object.keys(PAGES) as PageKey[]).find((k) => PAGES[k].path === seg);
  return hit ?? "home";
}

export function App() {
  return (
    <PageTitleProvider>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<Home />} />
          <Route path="/start" element={<Start />} />
          <Route path="/summary" element={<Summary />} />
          <Route path="/notes" element={<Notes />} />
          <Route path="/about" element={<About />} />
          <Route path="/import" element={<Import />} />
          <Route path="/blueprint" element={<Blueprint />} />
          <Route path="/generate" element={<Generate />} />
          <Route path="/report" element={<Report />} />
          <Route path="/roster" element={<Roster />} />
          <Route path="/grade/:variantId" element={<Grade />} />
          <Route path="/grade" element={<Grade />} />
          <Route path="/surface" element={<Surface />} />
          <Route path="/console" element={<Console />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/employer" element={<Employer />} />
          <Route path="/for" element={<For />} />
          <Route path="/for/:audience" element={<For />} />
          <Route path="*" element={<Home />} />
        </Route>
        <Route element={<ReviewLayout />}>
          <Route path="/review" element={<Review />} />
          <Route path="/review/:blueprintId" element={<Review />} />
          <Route path="/evidence/:variantId" element={<Evidence />} />
          <Route path="/evidence" element={<Evidence />} />
          <Route path="/verify/:recordId" element={<Verify />} />
          <Route path="/verify" element={<Verify />} />
          <Route path="/share/:recordId" element={<Share />} />
          <Route path="/portfolio" element={<Portfolio />} />
          <Route path="/portfolio/:learnerId" element={<Portfolio />} />
          <Route path="/talent" element={<Talent />} />
          <Route path="/talent/:partnerId" element={<Talent />} />
        </Route>
      </Routes>
    </PageTitleProvider>
  );
}
