import { Route, Routes } from "react-router-dom";
import { Layout } from "./shell/Layout";
import { PageTitleProvider } from "./shell/PageTitleContext";
import Start from "./pages/Start";
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

export type PageKey =
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
  | "settings";

/** Crumb + title per page, copied from the mockup's PAGES map. */
export const PAGES: Record<PageKey, { crumb: string; title: string; path: string }> = {
  start: { crumb: "Orientation", title: "Getting started", path: "/" },
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
};

/** Resolve the page key for a pathname (so /grade/v-07 → "grade"). */
export function pageKeyForPath(pathname: string): PageKey {
  if (pathname === "/") return "start";
  const seg = "/" + pathname.split("/").filter(Boolean)[0];
  const hit = (Object.keys(PAGES) as PageKey[]).find((k) => PAGES[k].path === seg);
  return hit ?? "start";
}

export function App() {
  return (
    <PageTitleProvider>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<Start />} />
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
          <Route path="*" element={<Start />} />
        </Route>
      </Routes>
    </PageTitleProvider>
  );
}
