/**
 * Wave 6b — honest, visible progress.
 *
 * Pure helpers over `RunProgress`. The orchestrator calls `progressUpdate` at
 * every emit point; pages call `describeProgress` to render it. No React, no
 * store: this file is safe to import from the orchestrator and from tests.
 */
import type { RunProgress, RunStatus } from "@shared/types";

export type ProgressPatch = Partial<RunProgress> & {
  /** Set when an item (a variant generated, a judge batch, a regeneration) just finished. */
  itemJustFinished?: boolean;
  /** Append one non-fatal problem (a retry, one failed variant). */
  warning?: string;
  /** Override the clock (tests). Defaults to Date.now(). */
  now?: number;
};

const TERMINAL: RunStatus[] = ["complete", "partial", "failed", "cancelled"];

/** A rolling per-item duration estimate lives on the object under this key (not persisted as part of the type). */
interface Timing {
  /** ms at which the last item finished */
  lastItemAt: number;
  /** exponential moving average of ms per item within the current phase */
  emaMs: number | null;
  /** items counted in the current phase */
  itemsInPhase: number;
}

const timings = new WeakMap<object, Timing>();

function iso(ms: number): string {
  return new Date(ms).toISOString();
}

/**
 * Fold a patch into the previous progress, keeping the clocks, "now/last" text,
 * the rolling ETA and the warnings list honest.
 *
 * - `startedAt` is set once and never moves.
 * - `phaseStartedAt` resets whenever `phase` changes; the per-item timing resets with it.
 * - When `itemJustFinished` is true the observed time since the previous item
 *   updates an exponential moving average, and `etaSeconds` = remaining × average.
 * - `warnings` only ever grows (deduplicated, capped at 20).
 * - Terminal phases zero the ETA and clear `current`.
 */
export function progressUpdate(prev: RunProgress, patch: ProgressPatch): RunProgress {
  const now = patch.now ?? Date.now();
  const { itemJustFinished, warning, now: _n, ...fields } = patch;

  const phaseChanged = fields.phase !== undefined && fields.phase !== prev.phase;
  const next: RunProgress = {
    ...prev,
    ...fields,
    startedAt: prev.startedAt ?? fields.startedAt ?? iso(now),
    phaseStartedAt: phaseChanged ? iso(now) : (prev.phaseStartedAt ?? fields.phaseStartedAt ?? iso(now)),
  };

  // Timing bookkeeping is keyed on the previous object so a fresh object per emit still chains.
  const prevTiming = timings.get(prev);
  let timing: Timing = phaseChanged || !prevTiming
    ? { lastItemAt: now, emaMs: null, itemsInPhase: 0 }
    : { ...prevTiming };

  if (itemJustFinished) {
    const dt = Math.max(1, now - timing.lastItemAt);
    // Concurrency makes the first few intervals noisy; weight later ones more.
    const alpha = timing.itemsInPhase < 3 ? 0.6 : 0.3;
    timing.emaMs = timing.emaMs == null ? dt : alpha * dt + (1 - alpha) * timing.emaMs;
    timing.lastItemAt = now;
    timing.itemsInPhase += 1;
  }

  if (TERMINAL.includes(next.phase)) {
    next.etaSeconds = 0;
    next.current = undefined;
  } else if (timing.emaMs != null && next.total > 0) {
    const remaining = Math.max(0, next.total - next.done);
    next.etaSeconds = Math.round((remaining * timing.emaMs) / 1000);
  } else if (next.etaSeconds === undefined || phaseChanged) {
    next.etaSeconds = null; // estimating…
  }

  if (warning) {
    const list = [...(prev.warnings ?? [])];
    if (!list.includes(warning)) list.push(warning);
    next.warnings = list.slice(-20);
  } else if (fields.warnings === undefined) {
    next.warnings = prev.warnings;
  }

  timings.set(next, timing);
  return next;
}

/** Convenience: a fresh progress object for a run about to start. */
export function progressStart(total: number, phase: RunStatus = "queued", message = "Queued", now = Date.now()): RunProgress {
  const p: RunProgress = {
    phase,
    done: 0,
    total,
    message,
    startedAt: iso(now),
    phaseStartedAt: iso(now),
    etaSeconds: null,
    warnings: [],
  };
  timings.set(p, { lastItemAt: now, emaMs: null, itemsInPhase: 0 });
  return p;
}

export interface ProgressText {
  /** Barlow Condensed line: "Generating versions" */
  headline: string;
  /** One sentence of what is going on / what happened */
  detail: string;
  /** 0..100 */
  pct: number;
  /** "about 2 min left" | "under a minute" | "estimating…" | "" */
  eta: string;
  terminal: boolean;
  tone: "neutral" | "pass" | "watch" | "fail";
}

export function etaText(etaSeconds: number | null | undefined): string {
  if (etaSeconds == null) return "estimating…";
  if (etaSeconds <= 0) return "";
  if (etaSeconds < 60) return "under a minute";
  const m = Math.round(etaSeconds / 60);
  return m === 1 ? "about a minute left" : `about ${m} min left`;
}

export function formatElapsed(seconds: number): string {
  if (seconds < 60) return `${Math.max(0, Math.floor(seconds))}s`;
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}m ${s.toString().padStart(2, "0")}s`;
}

const HEADLINE: Record<RunStatus, (p: RunProgress) => string> = {
  queued: () => "Getting ready",
  generating: () => "Generating versions",
  judging: (p) => (p.message.match(/(\d+)\s*(?:samples|times)/) ? `Judging each version ${p.message.match(/(\d+)\s*(?:samples|times)/)![1]} times` : "Judging each version"),
  scoring: () => "Scoring the set",
  complete: () => "Complete",
  partial: (p) => (p.message.toLowerCase().includes("cancel") ? "Stopped, work kept" : "Finished part-way"),
  failed: () => "Failed",
  cancelled: () => "Cancelled",
};

/** Text for any progress object. Regeneration and resume are detected from the message. */
export function describeProgress(p: RunProgress): ProgressText {
  const pct = p.total > 0 ? Math.min(100, Math.round((p.done / p.total) * 100)) : 0;
  const terminal = TERMINAL.includes(p.phase);
  const msg = p.message ?? "";
  let headline = HEADLINE[p.phase](p);
  if (!terminal) {
    if (/regenerat/i.test(msg)) headline = `Regenerating ${(msg.match(/(\d+)\s+version/) ?? [])[1] ?? ""} version${/(\d+)\s+version/.test(msg) && msg.match(/(\d+)\s+version/)![1] !== "1" ? "s" : ""}`.replace("Regenerating  version", "Regenerating versions");
    else if (/resum/i.test(msg)) headline = `Resuming · ${headline.toLowerCase()}`;
  }
  const tone: ProgressText["tone"] = p.phase === "complete" ? "pass" : p.phase === "partial" || p.phase === "cancelled" ? "watch" : p.phase === "failed" ? "fail" : "neutral";
  const detail = terminal
    ? p.phase === "complete"
      ? `${p.done} of ${p.total} done. ${msg}`.trim()
      : p.phase === "failed"
        ? msg || "The run stopped with an error."
        : `${p.done} of ${p.total} done. ${msg}`.trim()
    : msg;
  return { headline, detail, pct, eta: terminal ? "" : etaText(p.etaSeconds), terminal, tone };
}
