/**
 * Test helper: the recorded lending run as a workspace, with handy ids.
 * Tests must not assume any particular number of fixtures beyond this one.
 */
import type { Blueprint, Run, Variant, Workspace } from "@shared/types";
import { fixtureWorkspace, getFixture } from "./fixtures";
import { withBridgeDefaults } from "./employer";

export const LENDING = "ml-lending-fairness-audit";

export function lendingWorkspace(): Workspace {
  return withBridgeDefaults(fixtureWorkspace([LENDING], "2026-09-05T12:00:00.000Z"));
}

export function lendingIds(ws: Workspace = lendingWorkspace()) {
  const f = getFixture(LENDING);
  if (!f) throw new Error("The lending fixture is missing.");
  const run = ws.runs.find((r) => r.id === f.run.id) as Run;
  const bp = ws.blueprints.find((b) => b.id === f.blueprint.id) as Blueprint;
  // Usable versions with no submission yet (the recorded AI samples sit on the first few).
  const submitted = new Set(ws.submissions.filter((s) => s.runId === run.id).map((s) => s.variantId));
  const variants = run.variants.filter((v) => v.text && !v.error && !submitted.has(v.id)) as Variant[];
  const partner = ws.employerPartners[0];
  const challenge = ws.challenges?.[0];
  return { ws, run, bp, variants, v0: variants[0], v1: variants[1], partner, challenge, runId: run.id, bpId: bp.id };
}

/** The recorded lending blueprint on its own (for orchestrator/provider tests). */
export function lendingBlueprint(): Blueprint {
  const f = getFixture(LENDING);
  if (!f) throw new Error("The lending fixture is missing.");
  return f.blueprint;
}
