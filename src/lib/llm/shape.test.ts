import { describe, expect, it } from "vitest";
import { modelSpec } from "@shared/models";
import { BUDGET_MIN_MAX_TOKENS, FALLBACK_BETA, HAIKU_BUDGET_TOKENS, effortFor, shapeRequest, type RequestKind } from "./shape";

const KINDS: RequestKind[] = ["generate", "judge", "extract", "short"];

function base(model: string, max_tokens = 16000) {
  return { model, max_tokens, system: "sys", messages: [{ role: "user", content: "hi" }] };
}

describe("shapeRequest · Fable (thinking always on)", () => {
  const spec = modelSpec("claude-fable-5-1")!;

  it("omits the thinking key entirely and sets effort by kind", () => {
    for (const kind of KINDS) {
      const req = shapeRequest(spec, kind, base(spec.id));
      expect("thinking" in req).toBe(false);
      expect(req.output_config?.effort).toBe(effortFor(kind));
    }
    expect(shapeRequest(spec, "generate", base(spec.id)).output_config?.effort).toBe("high");
    expect(shapeRequest(spec, "extract", base(spec.id)).output_config?.effort).toBe("high");
    expect(shapeRequest(spec, "judge", base(spec.id)).output_config?.effort).toBe("low");
    expect(shapeRequest(spec, "short", base(spec.id)).output_config?.effort).toBe("low");
  });

  it("opts into server-side fallbacks with the 2026-07-01 beta and the default chain", () => {
    const req = shapeRequest(spec, "generate", base(spec.id));
    expect(req.betas).toEqual([FALLBACK_BETA]);
    expect(FALLBACK_BETA).toBe("server-side-fallback-2026-07-01");
    expect(req.fallbacks).toBe("default");
  });

  it("applies the same rules to Fable 5", () => {
    const req = shapeRequest(modelSpec("claude-fable-5")!, "judge", base("claude-fable-5"));
    expect("thinking" in req).toBe(false);
    expect(req.fallbacks).toBe("default");
    expect(req.output_config?.effort).toBe("low");
  });
});

describe("shapeRequest · Opus and Sonnet (adaptive)", () => {
  it("Opus 5 gets adaptive thinking, effort, and the fallback fields", () => {
    const spec = modelSpec("claude-opus-5")!;
    const gen = shapeRequest(spec, "generate", base(spec.id));
    expect(gen.thinking).toEqual({ type: "adaptive" });
    expect(gen.output_config?.effort).toBe("high");
    expect(gen.betas).toEqual([FALLBACK_BETA]);
    expect(gen.fallbacks).toBe("default");
    expect(shapeRequest(spec, "judge", base(spec.id)).output_config?.effort).toBe("low");
  });

  it("Opus 4.x and Sonnet get adaptive thinking and no fallback fields", () => {
    for (const id of ["claude-opus-4-8", "claude-opus-4-7", "claude-opus-4-6", "claude-sonnet-5", "claude-sonnet-4-6"]) {
      const req = shapeRequest(modelSpec(id)!, "generate", base(id));
      expect(req.thinking).toEqual({ type: "adaptive" });
      expect(req.output_config?.effort).toBe("high");
      expect(req.betas).toBeUndefined();
      expect(req.fallbacks).toBeUndefined();
    }
  });
});

describe("shapeRequest · Haiku 4.5 (budget)", () => {
  const spec = modelSpec("claude-haiku-4-5")!;

  it("never sets effort", () => {
    for (const kind of KINDS) {
      const req = shapeRequest(spec, kind, base(spec.id));
      expect(req.output_config?.effort).toBeUndefined();
    }
  });

  it("uses budget thinking only when max_tokens leaves room", () => {
    const big = shapeRequest(spec, "generate", base(spec.id, 16000));
    expect(big.thinking).toEqual({ type: "enabled", budget_tokens: HAIKU_BUDGET_TOKENS });
    expect(HAIKU_BUDGET_TOKENS).toBeGreaterThanOrEqual(1024);
    expect(HAIKU_BUDGET_TOKENS).toBeLessThan(BUDGET_MIN_MAX_TOKENS);

    const small = shapeRequest(spec, "short", base(spec.id, 64));
    expect("thinking" in small).toBe(false);
    const edge = shapeRequest(spec, "judge", base(spec.id, BUDGET_MIN_MAX_TOKENS));
    expect("thinking" in edge).toBe(false);
  });

  it("drops an empty output_config rather than sending {}", () => {
    const req = shapeRequest(spec, "short", base(spec.id, 64));
    expect("output_config" in req).toBe(false);
    expect(req.betas).toBeUndefined();
  });
});

describe("shapeRequest · invariants for every model", () => {
  it("never sends sampling params, even if the caller passed them", () => {
    for (const id of ["claude-fable-5-1", "claude-opus-5", "claude-sonnet-4-6", "claude-haiku-4-5"]) {
      const req = shapeRequest(modelSpec(id)!, "generate", { ...base(id), temperature: 0.7, top_p: 0.9, top_k: 40 });
      expect("temperature" in req).toBe(false);
      expect("top_p" in req).toBe(false);
      expect("top_k" in req).toBe(false);
    }
  });

  it("preserves the caller's model, max_tokens, system, messages and existing output_config keys", () => {
    const format = { type: "json_schema", schema: {} };
    const req = shapeRequest(modelSpec("claude-opus-5")!, "judge", { ...base("claude-opus-5", 4000), output_config: { format } });
    expect(req.model).toBe("claude-opus-5");
    expect(req.max_tokens).toBe(4000);
    expect(req.system).toBe("sys");
    expect(req.messages).toEqual([{ role: "user", content: "hi" }]);
    expect(req.output_config).toEqual({ format, effort: "low" });
  });

  it("overrides a caller-supplied thinking or effort with the model's rule", () => {
    const fable = shapeRequest(modelSpec("claude-fable-5-1")!, "judge", {
      ...base("claude-fable-5-1"),
      thinking: { type: "adaptive" },
      output_config: { effort: "max" },
    });
    expect("thinking" in fable).toBe(false);
    expect(fable.output_config?.effort).toBe("low");
    const haiku = shapeRequest(modelSpec("claude-haiku-4-5")!, "judge", { ...base("claude-haiku-4-5", 64), output_config: { effort: "high" } });
    expect(haiku.output_config).toBeUndefined();
  });
});
