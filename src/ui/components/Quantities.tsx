import { useMemo } from "react";
import { Link } from "react-router-dom";
import type { Blueprint, Quantity, QuantityPolicy } from "@shared/types";
import { evaluateFormula, formatQuantity, parseQuantities } from "@lib/quantities";
import { Info } from "./Info";

const RED = "#8d4a3c";
const GREEN = "#3d6b4d";
const AMBER = "#8a6d2f";

/** The blueprint's numbers, or the local parser's guess when the blueprint has none yet. */
export function useBlueprintQuantities(bp: Blueprint | null | undefined): { quantities: Quantity[]; fromParser: boolean } {
  return useMemo(() => {
    if (!bp) return { quantities: [], fromParser: false };
    if (bp.quantities) return { quantities: bp.quantities, fromParser: false };
    return { quantities: parseQuantities(bp.taskPrompt ?? ""), fromParser: true };
  }, [bp?.id, bp?.quantities, bp?.taskPrompt]);
}

/** Undefined means on: the instructor asked for numbers to change unless they switched it off. */
export function varyOn(bp: Blueprint | null | undefined): boolean {
  return bp?.varyQuantities !== false;
}

/** The numbers that will differ per student: everything not kept as written. */
export function changingQuantities(quantities: Quantity[]): Quantity[] {
  return quantities.filter((q) => q.policy !== "keep");
}

/** "0.91", "18%", "$12,000": the source's own rendering. */
export function asWritten(q: Quantity, value: number = q.value): string {
  return formatQuantity(q, value)[0] ?? String(value);
}

export function rangeText(q: Quantity): string {
  if (!q.range) return "";
  return `${asWritten(q, q.range.min)} to ${asWritten(q, q.range.max)}`;
}

export function policyWord(q: Quantity): string {
  if (q.policy === "keep") return "stays as written";
  if (q.policy === "derived") return q.formula ? `worked out: ${q.formula}` : "worked out from the others";
  return q.range ? `varies, ${rangeText(q)}` : "varies";
}

/** Try the formula against the other numbers' written values; a message the instructor can act on. */
export function formulaCheck(q: Quantity, all: Quantity[]): { ok: boolean; text: string } {
  if (q.policy !== "derived") return { ok: true, text: "" };
  if (!q.formula?.trim()) return { ok: false, text: "Write a formula over the other numbers' names." };
  const values: Record<string, number> = {};
  for (const other of all) if (other.id !== q.id) values[other.key] = other.value;
  try {
    const v = evaluateFormula(q.formula, values);
    return { ok: true, text: `With the figures as written this gives ${asWritten(q, v)}.` };
  } catch (e) {
    return { ok: false, text: (e as Error).message };
  }
}

export interface NumbersSwitchProps {
  on: boolean;
  onChange: (on: boolean) => void;
  disabled?: boolean;
  count: number;
  /** Extra sentence after the label, e.g. the recorded-run caveat */
  note?: string;
  id?: string;
}

/** The per-run switch, one line, with the count of figures that will differ. */
export function NumbersSwitch({ on, onChange, disabled, count, note, id = "varyQuantities" }: NumbersSwitchProps) {
  const k = count;
  const detail = k === 0 ? "no figures were found to vary" : on ? `${k} figure${k === 1 ? "" : "s"} will differ from student to student` : `every version keeps the original ${k} figure${k === 1 ? "" : "s"}`;
  return (
    <div className="va-switch-row">
      <label className="va-switch" htmlFor={id}>
        <input id={id} type="checkbox" role="switch" aria-checked={on} checked={on} disabled={disabled || k === 0} onChange={(e) => onChange(e.target.checked)} />
        <span className="va-switch-track" aria-hidden="true">
          <span className="va-switch-thumb" />
        </span>
        <span className="va-switch-label">Numbers change per student</span>
      </label>
      <span className="text-muted" style={{ fontSize: 14 }}>
        · {detail} <Info term="vary-numbers" />
        {note ? ` ${note}` : ""}
      </span>
    </div>
  );
}

export interface QuantitiesTableProps {
  quantities: Quantity[];
  fromParser: boolean;
  /** When present, the table is editable. */
  onPatch?: (id: string, patch: Partial<Quantity>) => void;
  onRemove?: (id: string) => void;
}

const POLICY_OPTIONS: { value: QuantityPolicy; label: string }[] = [
  { value: "keep", label: "Stays as written" },
  { value: "vary", label: "Varies within a range" },
  { value: "derived", label: "Worked out from the others" },
];

/** Read-only or editable list of the assignment's numbers. */
export function QuantitiesTable({ quantities, fromParser, onPatch, onRemove }: QuantitiesTableProps) {
  const editable = !!onPatch;
  if (!quantities.length) {
    return <p className="text-muted" style={{ margin: 0, fontSize: 15.5 }}>No figures were found in this assignment, so every version reads the same numbers. Add one under Edit if we missed it.</p>;
  }
  return (
    <div style={{ overflowX: "auto" }}>
      <table className="table va-quantities">
        <thead>
          <tr>
            <th>Figure</th>
            <th style={{ width: editable ? 120 : 110 }}>As written</th>
            <th style={{ width: editable ? 320 : 260 }}>Per student</th>
            {editable && <th style={{ width: 36 }} />}
          </tr>
        </thead>
        <tbody>
          {quantities.map((q) => {
            const fc = formulaCheck(q, quantities);
            return (
              <tr key={q.id} data-quantity={q.key}>
                <td>
                  {editable ? (
                    <input className="input" style={{ width: "100%" }} defaultValue={q.label} key={`${q.id}-${q.label}`} aria-label="Figure name" onBlur={(e) => e.target.value.trim() !== q.label && onPatch!(q.id, { label: e.target.value.trim() || q.label })} />
                  ) : (
                    <span>{q.label}</span>
                  )}
                  {q.context && (
                    <div className="va-muted-12" style={{ marginTop: 2, lineHeight: 1.4, maxWidth: "52ch" }} title={q.context}>
                      “…{q.context.length > 90 ? q.context.slice(0, 90) + "…" : q.context}”
                    </div>
                  )}
                  {editable && (
                    <div className="va-muted-12" style={{ marginTop: 2 }}>name in formulas: <code>{q.key}</code></div>
                  )}
                </td>
                <td>
                  {editable ? (
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                      <input
                        className="input"
                        type="number"
                        step="any"
                        style={{ width: 88 }}
                        defaultValue={q.value}
                        key={`${q.id}-${q.value}`}
                        aria-label="Value as written"
                        onBlur={(e) => {
                          const v = Number(e.target.value);
                          if (Number.isFinite(v) && v !== q.value) onPatch!(q.id, { value: v });
                        }}
                      />
                      {q.unit ? <span className="text-muted">{q.unit}</span> : null}
                    </span>
                  ) : (
                    asWritten(q)
                  )}
                </td>
                <td>
                  {editable ? (
                    <div className="va-stack" style={{ gap: 6 }}>
                      <select className="input" value={q.policy} aria-label="What happens per student" onChange={(e) => {
                        const policy = e.target.value as QuantityPolicy;
                        const patch: Partial<Quantity> = { policy };
                        if (policy === "vary" && !q.range) patch.range = defaultRangeFor(q);
                        onPatch!(q.id, patch);
                      }}>
                        {POLICY_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                      </select>
                      {q.policy === "vary" && (
                        <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 14 }}>
                          from
                          <input className="input" type="number" step="any" style={{ width: 84 }} defaultValue={q.range?.min ?? q.value} key={`${q.id}-min-${q.range?.min}`} aria-label="Lowest value" onBlur={(e) => {
                            const v = Number(e.target.value);
                            if (Number.isFinite(v)) onPatch!(q.id, { range: { ...(q.range ?? defaultRangeFor(q)), min: v } });
                          }} />
                          to
                          <input className="input" type="number" step="any" style={{ width: 84 }} defaultValue={q.range?.max ?? q.value} key={`${q.id}-max-${q.range?.max}`} aria-label="Highest value" onBlur={(e) => {
                            const v = Number(e.target.value);
                            if (Number.isFinite(v)) onPatch!(q.id, { range: { ...(q.range ?? defaultRangeFor(q)), max: v } });
                          }} />
                          {q.range && q.range.min > q.range.max ? <span style={{ color: RED }}>lowest is above highest</span> : null}
                        </span>
                      )}
                      {q.policy === "derived" && (
                        <>
                          <input className="input" style={{ width: "100%" }} placeholder="e.g. north_rate - south_rate" defaultValue={q.formula ?? ""} key={`${q.id}-f-${q.formula}`} aria-label="Formula" onBlur={(e) => e.target.value.trim() !== (q.formula ?? "") && onPatch!(q.id, { formula: e.target.value.trim() })} />
                          <span style={{ fontSize: 13, color: fc.ok ? GREEN : AMBER }}>{fc.text}</span>
                        </>
                      )}
                    </div>
                  ) : (
                    <span style={{ color: q.policy === "keep" ? undefined : q.policy === "derived" && !fc.ok ? AMBER : GREEN }}>{policyWord(q)}</span>
                  )}
                </td>
                {editable && (
                  <td>
                    <button type="button" className="btn btn-ghost" style={{ padding: "2px 6px" }} onClick={() => onRemove?.(q.id)} title="Remove this figure" aria-label={`Remove ${q.label}`}>×</button>
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
      {fromParser && (
        <div className="va-muted-12" style={{ marginTop: 6 }}>
          Found by the local parser; confirm on edit. <Info term="quantities" />
        </div>
      )}
    </div>
  );
}

/** A ±25% band around the written value, at the value's own precision. */
export function defaultRangeFor(q: Quantity): NonNullable<Quantity["range"]> {
  const decimals = q.range?.decimals ?? (String(q.value).split(".")[1]?.length ?? 0);
  const r = (x: number) => Math.round(x * 10 ** decimals) / 10 ** decimals;
  const lo = r(q.value * 0.75);
  const hi = r(q.value * 1.25);
  const isRate = (q.kind === "rate" || q.kind === "score" || q.kind === "threshold") && q.value <= 1;
  return { min: Math.min(lo, hi), max: isRate ? Math.min(1, Math.max(lo, hi)) : Math.max(lo, hi), decimals };
}

export function newQuantity(existing: Quantity[]): Quantity {
  const n = existing.length + 1;
  let key = `figure_${n}`;
  let i = n;
  while (existing.some((q) => q.key === key)) key = `figure_${++i}`;
  return { id: `q-${Date.now().toString(36)}-${n}`, key, label: `Figure ${n}`, value: 0, kind: "other", policy: "keep" };
}

/** One-line summary for Generate's options panel: which figures change, and where to change that. */
export function QuantitiesSummary({ quantities, fromParser }: { quantities: Quantity[]; fromParser: boolean }) {
  const changing = changingQuantities(quantities);
  const kept = quantities.filter((q) => q.policy === "keep");
  return (
    <div className="va-stack" style={{ gap: 6, fontSize: 15 }}>
      {changing.length ? (
        <ul style={{ margin: 0, paddingLeft: 18, lineHeight: 1.6 }}>
          {changing.map((q) => (
            <li key={q.id}>
              {q.label}: {q.policy === "derived" ? (q.formula ? `worked out as ${q.formula}` : "worked out from the others") : `${asWritten(q)} as written, ${rangeText(q) || "range not set"} per student`}
            </li>
          ))}
        </ul>
      ) : (
        <span className="text-muted">No figure is set to vary.</span>
      )}
      {kept.length ? <span className="text-muted">Stays as written: {kept.map((q) => `${q.label} (${asWritten(q)})`).join(", ")}.</span> : null}
      <span className="va-muted-12">
        {fromParser ? "Found by the local parser. " : ""}
        Change which figures vary and their ranges on <Link to="/blueprint?edit=1">Check what we found</Link>.
      </span>
    </div>
  );
}
