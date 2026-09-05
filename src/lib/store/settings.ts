import { create } from "zustand";
import { createJSONStorage, persist, type StateStorage } from "zustand/middleware";
import { DEFAULT_ADVANCED, type AdvancedRunOptions, type LlmProvider, type Mode, type ModelId, type Settings } from "@shared/types";
import { createProvider } from "@lib/llm";
import { DEFAULT_GENERATOR, DEFAULT_JUDGE } from "@shared/models";

const LS_KEY = "varia.settings";
const SESSION_KEY = "varia.session-key";

export interface SettingsState extends Settings {
  mode: Mode;
  setApiKey: (key: string | null, remember: boolean) => void;
  setWorkspaceId: (id: string | null) => void;
  setModels: (m: { generatorModel?: ModelId; judgeModel?: ModelId }) => void;
  setJudgeSamples: (n: number) => void;
  markVerified: (model: ModelId) => void;
  forgetKey: () => void;
  /** Wave 6c: per-workspace defaults for the Advanced panel on Generate */
  advancedDefaults: AdvancedRunOptions;
  setAdvanced: (patch: Partial<AdvancedRunOptions>) => void;
}

/** Clamp the Advanced options to their documented ranges. */
export function clampAdvanced(a: Partial<AdvancedRunOptions>, base: AdvancedRunOptions = DEFAULT_ADVANCED): AdvancedRunOptions {
  const num = (v: unknown, lo: number, hi: number, d: number) => {
    const n = typeof v === "number" && Number.isFinite(v) ? v : d;
    return Math.min(hi, Math.max(lo, n));
  };
  return {
    negativeAnchors: typeof a.negativeAnchors === "boolean" ? a.negativeAnchors : base.negativeAnchors,
    constructMap: typeof a.constructMap === "boolean" ? a.constructMap : base.constructMap,
    readabilityBand: Math.round(num(a.readabilityBand, 3, 15, base.readabilityBand)),
    outlierSigma: Math.round(num(a.outlierSigma, 0.5, 2, base.outlierSigma) * 10) / 10,
    outlierMinNamed: Math.round(num(a.outlierMinNamed, 1, 5, base.outlierMinNamed)),
    concurrencyGenerate: Math.round(num(a.concurrencyGenerate, 1, 8, base.concurrencyGenerate)),
    concurrencyJudge: Math.round(num(a.concurrencyJudge, 1, 8, base.concurrencyJudge)),
  };
}

/** Judge self-consistency samples: 3–9 everywhere (paper used 5). */
export function clampJudgeSamples(n: number): number {
  return Math.max(3, Math.min(9, Math.round(Number.isFinite(n) ? n : 5)));
}

const DEFAULTS: Settings = {
  apiKey: null,
  workspaceId: null,
  rememberKey: false,
  generatorModel: DEFAULT_GENERATOR,
  judgeModel: DEFAULT_JUDGE,
  judgeSamples: 5,
  keyVerifiedAt: null,
};

function modeOf(key: string | null | undefined): Mode {
  return key && key.trim().length > 0 ? "live" : "demo";
}

function safeGet(storage: Storage | undefined, key: string): string | null {
  try {
    return storage?.getItem(key) ?? null;
  } catch {
    return null;
  }
}
function safeSet(storage: Storage | undefined, key: string, value: string) {
  try {
    storage?.setItem(key, value);
  } catch {
    /* quota or private mode */
  }
}
function safeRemove(storage: Storage | undefined, key: string) {
  try {
    storage?.removeItem(key);
  } catch {
    /* ignore */
  }
}

const local = () => (typeof localStorage !== "undefined" ? localStorage : undefined);
const session = () => (typeof sessionStorage !== "undefined" ? sessionStorage : undefined);

/**
 * localStorage holds everything except the key when rememberKey is false; in
 * that case the key lives in sessionStorage and is merged back on read.
 */
const mergedStorage: StateStorage = {
  getItem: (name) => {
    const raw = safeGet(local(), name);
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw);
      const state = parsed?.state ?? {};
      if (!state.rememberKey) {
        const sk = safeGet(session(), SESSION_KEY);
        state.apiKey = sk && sk.length > 0 ? sk : null;
      }
      state.mode = modeOf(state.apiKey);
      parsed.state = state;
      return JSON.stringify(parsed);
    } catch {
      return raw;
    }
  },
  setItem: (name, value) => {
    try {
      const parsed = JSON.parse(value);
      const state = { ...(parsed?.state ?? {}) };
      if (state.rememberKey) {
        safeRemove(session(), SESSION_KEY);
      } else {
        if (state.apiKey) safeSet(session(), SESSION_KEY, state.apiKey);
        else safeRemove(session(), SESSION_KEY);
        state.apiKey = null;
      }
      parsed.state = state;
      safeSet(local(), name, JSON.stringify(parsed));
    } catch {
      safeSet(local(), name, value);
    }
  },
  removeItem: (name) => {
    safeRemove(local(), name);
    safeRemove(session(), SESSION_KEY);
  },
};

export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      ...DEFAULTS,
      mode: "demo",
      advancedDefaults: { ...DEFAULT_ADVANCED },
      setAdvanced: (patch) => set((st) => ({ advancedDefaults: clampAdvanced({ ...st.advancedDefaults, ...patch }, st.advancedDefaults) })),
      setApiKey: (key, remember) => {
        const clean = key ? key.trim() : null;
        set({
          apiKey: clean && clean.length > 0 ? clean : null,
          rememberKey: remember,
          mode: modeOf(clean),
          keyVerifiedAt: null,
        });
      },
      setModels: (m) =>
        set((s) => ({
          generatorModel: m.generatorModel ?? s.generatorModel,
          judgeModel: m.judgeModel ?? s.judgeModel,
        })),
      setJudgeSamples: (n) => set({ judgeSamples: clampJudgeSamples(n) }),
      setWorkspaceId: (id) => set({ workspaceId: id && id.trim().length ? id.trim() : null, keyVerifiedAt: null }),
      markVerified: (_model) => set({ keyVerifiedAt: new Date().toISOString() }),
      forgetKey: () => set({ apiKey: null, mode: "demo", keyVerifiedAt: null }),
    }),
    {
      name: LS_KEY,
      version: 1,
      storage: createJSONStorage(() => mergedStorage),
      partialize: (s) => ({
        apiKey: s.apiKey,
        rememberKey: s.rememberKey,
        generatorModel: s.generatorModel,
        judgeModel: s.judgeModel,
        judgeSamples: s.judgeSamples,
        keyVerifiedAt: s.keyVerifiedAt,
        advancedDefaults: s.advancedDefaults,
      }),
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<Settings> & { advancedDefaults?: Partial<AdvancedRunOptions> };
        return {
          ...current,
          ...p,
          judgeSamples: clampJudgeSamples(p.judgeSamples ?? current.judgeSamples),
          advancedDefaults: clampAdvanced(p.advancedDefaults ?? {}, current.advancedDefaults),
          mode: modeOf(p.apiKey ?? null),
        };
      },
    },
  ),
);

/** Non-hook read of the current settings. */
export function getSettings(): Settings & { mode: Mode } {
  const s = useSettings.getState();
  return {
    apiKey: s.apiKey,
    rememberKey: s.rememberKey,
    generatorModel: s.generatorModel,
    judgeModel: s.judgeModel,
    judgeSamples: s.judgeSamples,
    keyVerifiedAt: s.keyVerifiedAt,
    mode: s.mode,
  };
}

/** Live provider when a key is present, demo provider otherwise. */
export function getProvider(): LlmProvider {
  return createProvider(getSettings());
}
