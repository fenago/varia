import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Workspace } from "@shared/types";
import { WALKTHROUGH, WALK_SAMPLE_ID, type WalkStop } from "@shared/walkthrough";
import { activeRun, rosterRows } from "./selectors";

export interface WalkthroughState {
  active: boolean;
  stepIndex: number;
  sampleId: string;
  startedAt: string | null;
  start: (sampleId?: string) => void;
  next: () => void;
  back: () => void;
  goTo: (i: number) => void;
  exit: () => void;
}

export const useWalkthrough = create<WalkthroughState>()(
  persist(
    (set, get) => ({
      active: false,
      stepIndex: 0,
      sampleId: WALK_SAMPLE_ID,
      startedAt: null,
      start: (sampleId) => set({ active: true, stepIndex: 0, sampleId: sampleId ?? WALK_SAMPLE_ID, startedAt: new Date().toISOString() }),
      next: () => set({ stepIndex: Math.min(WALKTHROUGH.length - 1, get().stepIndex + 1) }),
      back: () => set({ stepIndex: Math.max(0, get().stepIndex - 1) }),
      goTo: (i) => set({ stepIndex: Math.max(0, Math.min(WALKTHROUGH.length - 1, i)) }),
      exit: () => set({ active: false, stepIndex: 0, startedAt: null }),
    }),
    { name: "varia.walkthrough" },
  ),
);

export function currentStop(i: number): WalkStop {
  return WALKTHROUGH[Math.max(0, Math.min(WALKTHROUGH.length - 1, i))];
}

/** The most recent run for the walkthrough's blueprint, else the active run. */
function walkRun(ws: Workspace, sampleId: string) {
  const bp = ws.blueprints.find((b) => (b as { sampleId?: string | null }).sampleId === sampleId) ?? null;
  const runs = bp ? ws.runs.filter((r) => r.blueprintId === bp.id) : [];
  return runs[runs.length - 1] ?? activeRun(ws);
}

/** Resolve a stop's route against the workspace. Never throws; falls back to a sensible page. */
export function resolveRoute(stop: WalkStop, ws: Workspace, sampleId: string): string {
  const r = stop.route;
  if (r.kind === "path") return r.path;
  const run = walkRun(ws, sampleId);
  if (r.kind === "report") return "/report";
  if (r.kind === "grade") {
    if (run) {
      const rows = rosterRows(ws, run.id);
      const withWork = rows.find((x) => x.submission && x.submission.text) ?? rows[0];
      if (withWork) return `/grade/${withWork.variant.id}`;
    }
    return "/grade";
  }
  if (r.kind === "evidence") {
    if (run) {
      const rows = rosterRows(ws, run.id);
      const graded = rows.find((x) => x.submission?.grade) ?? rows.find((x) => x.submission?.text) ?? rows[0];
      if (graded) return `/evidence/${graded.variant.id}`;
    }
    return "/evidence";
  }
  if (r.kind === "talent") {
    const partner = ws.employerPartners.find((p) => /bayfront/i.test(p.organisation)) ?? ws.employerPartners[0];
    return partner ? `/talent/${partner.id}` : "/talent";
  }
  return "/";
}

/** True when `pathname` is where the stop lives (route prefix match for id-bearing routes). */
export function onStopRoute(stop: WalkStop, ws: Workspace, sampleId: string, pathname: string): boolean {
  const want = resolveRoute(stop, ws, sampleId);
  if (stop.route.kind === "path") return pathname === want || pathname === want + "/";
  const base = want.split("/").slice(0, 2).join("/");
  return pathname.startsWith(base);
}
