import { describe, it, expect, beforeEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import { useWorkspace } from "./workspace";
import { useSettings } from "./settings";
import { getFixture } from "./fixtures";
import { activeBlueprint } from "./selectors";
import { loadSample } from "./samples";
import type { LlmProvider } from "@shared/types";

const LENDING = "ml-lending-fairness-audit";

describe("recorded-first: samples never spend tokens unless asked", () => {
  beforeEach(() => {
    useWorkspace.getState().resetToDemo();
    useSettings.getState().setApiKey("sk-ant-test-key", false);
  });

  it("startRun on a sample blueprint replays the recorded run for free even with a key set", async () => {
    const ws = useWorkspace.getState();
    const bp = ws.blueprints.find((b) => b.sampleId === LENDING)!;
    expect(bp).toBeTruthy();
    ws.setActiveBlueprint(bp.id);
    expect(useSettings.getState().mode).toBe("live");
    const fixture = getFixture(LENDING)!;
    const runId = await useWorkspace.getState().startRun({
      threatProfile: "high-stakes",
      strategy: "structured-cot",
      n: 10,
      enabledDimensions: bp.surfaceDimensions.filter((d) => !d.locked).map((d) => d.key),
      generatorModel: "claude-opus-5",
      judgeModel: "claude-sonnet-5",
      judgeSamples: 5,
    });
    const run = useWorkspace.getState().runs.find((r) => r.id === runId)!;
    expect(run.mode).toBe("demo");
    expect(run.recordedFrom?.sampleId).toBe(LENDING);
    expect(run.usage?.costUsd ?? 0).toBe(0);
    expect(run.report).toBeTruthy();
    expect(Math.abs(run.report!.joint - fixture.run.report!.joint)).toBeLessThan(0.02);
  });

  it("an explicit live source is refused without a key, and an uploaded blueprint has no recorded source", async () => {
    useSettings.getState().forgetKey();
    const ws = useWorkspace.getState();
    const bp = ws.blueprints.find((b) => b.sampleId === LENDING)!;
    ws.setActiveBlueprint(bp.id);
    await expect(
      useWorkspace.getState().startRun({ source: "live", threatProfile: "high-stakes", strategy: "zero-shot", n: 3, enabledDimensions: ["domain"], generatorModel: "claude-opus-5", judgeModel: "claude-sonnet-5", judgeSamples: 3 }),
    ).rejects.toThrow(/Add your key/);
  });

  it("releasing a replayed run brings the recorded sample submissions with it", async () => {
    const ws = useWorkspace.getState();
    const bp = ws.blueprints.find((b) => b.sampleId === LENDING)!;
    ws.setActiveBlueprint(bp.id);
    const runId = await useWorkspace.getState().startRun({ threatProfile: "high-stakes", strategy: "structured-cot", n: 10, enabledDimensions: ["domain", "stakeholder"], generatorModel: "claude-opus-5", judgeModel: "claude-sonnet-5", judgeSamples: 5 });
    const before = useWorkspace.getState().submissions.filter((s) => s.runId === runId).length;
    expect(before).toBe(0);
    useWorkspace.getState().releaseAnyway(runId, "test");
    const after = useWorkspace.getState().submissions.filter((s) => s.runId === runId);
    expect(after.length).toBe(getFixture(LENDING)!.sampleSubmissions?.length ?? 0);
    expect(after.every((s) => s.origin === "ai-sample" && s.grade?.basis === "suggested")).toBe(true);
  });

  it("loadSample uses the recorded blueprint and never calls the live extractor unless forReal", async () => {
    const realFetch = globalThis.fetch;
    globalThis.fetch = (async (url: string) => {
      const path = "public" + String(url);
      return new Response(readFileSync(path, "utf8"), { status: 200 });
    }) as unknown as typeof fetch;
    const extract = vi.fn(async () => { throw new Error("SENTINEL: live extraction was called"); });
    const spy: LlmProvider = { mode: "live", verifyKey: async () => ({ ok: true, model: "x" }), extractBlueprint: extract, draftAnchors: async () => ["", "", "", ""], draftCanonicalSolution: async () => "", generateFewShotAnchors: async () => ({ positive: [], negative: [] }), generateVariant: async () => { throw new Error("no"); }, judgeVariant: async () => [] };
    const ws = useWorkspace.getState();
    const actions = { addPartner: ws.addPartner, addChallenge: ws.addChallenge, addSkill: ws.addSkill, setRoster: ws.setRoster, setCourse: ws.setCourse };
    try {
      const r = await loadSample(LENDING, { provider: spy, ws: useWorkspace.getState(), actions });
      expect(extract).not.toHaveBeenCalled();
      expect(r.extractedBy).toBe("recorded");
      expect(r.draft.sampleId).toBe(LENDING);
      expect(r.draft.recordedRunAvailable).toBe(true);
      await expect(loadSample(LENDING, { provider: spy, ws: useWorkspace.getState(), actions, forReal: true })).rejects.toThrow(/SENTINEL/);
      expect(extract).toHaveBeenCalledTimes(1);
    } finally {
      globalThis.fetch = realFetch;
    }
  });
});
