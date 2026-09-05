import { beforeEach, describe, expect, it } from "vitest";
import { RUN_PRESETS } from "@shared/models";
import { useSettings } from "./settings";

describe("settings presets (wave 6d)", () => {
  beforeEach(() => {
    useSettings.getState().setPreset("high-stakes");
  });

  it("defaults to high-stakes with its models and samples", () => {
    const s = useSettings.getState();
    expect(s.preset).toBe("high-stakes");
    expect(s.generatorModel).toBe("claude-opus-5");
    expect(s.judgeModel).toBe("claude-sonnet-5");
    expect(s.judgeSamples).toBe(5);
  });

  it("choosing formative sets generator, judge and samples", () => {
    useSettings.getState().setPreset("formative");
    const s = useSettings.getState();
    expect(s.preset).toBe("formative");
    expect(s.generatorModel).toBe(RUN_PRESETS.formative.generator);
    expect(s.judgeModel).toBe(RUN_PRESETS.formative.judge);
    expect(s.judgeSamples).toBe(3);
  });

  it("editing the generator, the judge or the samples flips to custom; a no-op edit does not", () => {
    useSettings.getState().setModels({ generatorModel: "claude-opus-5" });
    expect(useSettings.getState().preset).toBe("high-stakes");
    useSettings.getState().setModels({ generatorModel: "claude-opus-4-8" });
    expect(useSettings.getState().preset).toBe("custom");

    useSettings.getState().setPreset("high-stakes");
    useSettings.getState().setModels({ judgeModel: "claude-haiku-4-5" });
    expect(useSettings.getState().preset).toBe("custom");

    useSettings.getState().setPreset("high-stakes");
    useSettings.getState().setJudgeSamples(5);
    expect(useSettings.getState().preset).toBe("high-stakes");
    useSettings.getState().setJudgeSamples(7);
    expect(useSettings.getState().preset).toBe("custom");
  });

  it("choosing custom keeps the current values", () => {
    useSettings.getState().setModels({ generatorModel: "claude-opus-4-8" });
    useSettings.getState().setPreset("custom");
    const s = useSettings.getState();
    expect(s.preset).toBe("custom");
    expect(s.generatorModel).toBe("claude-opus-4-8");
  });
});
