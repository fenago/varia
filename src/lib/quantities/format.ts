import type { Quantity } from "@shared/types";

/** Decimal places in the source rendering of a number ("0.91" → 2, "18" → 0, "1,300" → 0). */
export function decimalsOf(text: string): number {
  const m = /\.(\d+)/.exec(text.replace(/,/g, ""));
  return m ? m[1].length : 0;
}

function fixed(value: number, decimals: number): string {
  return (Math.round(value * 10 ** decimals) / 10 ** decimals).toFixed(decimals);
}

function withCommas(s: string): string {
  const [int, frac] = s.split(".");
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return frac !== undefined ? `${grouped}.${frac}` : grouped;
}

function trimZeros(s: string): string {
  return s.includes(".") ? s.replace(/0+$/, "").replace(/\.$/, "") : s;
}

/**
 * The acceptable textual renderings of a value, the way the source wrote it.
 * 0.35 (rate 0–1) → ["0.35", "35%", "35 percent", "35 per cent"]; 18 (%) → ["18%", "18 percent", "18"];
 * 12000 (money) → ["$12,000", "12,000", "12000", "12k"]; 2023 (date) → ["2023"].
 */
export function formatQuantity(q: Quantity, value: number): string[] {
  const decimals = q.range?.decimals ?? decimalsOf(String(q.value));
  const out = new Set<string>();
  const base = fixed(value, decimals);
  const trimmed = trimZeros(base);

  if (q.kind === "date") {
    out.add(String(Math.round(value)));
    return [...out];
  }

  if (q.unit === "%") {
    for (const s of [base, trimmed]) {
      out.add(`${s}%`);
      out.add(`${s} percent`);
      out.add(`${s} per cent`);
      out.add(`${s} percentage points`);
      out.add(`${s}-point`);
      out.add(s);
    }
    return [...out];
  }

  if ((q.kind === "rate" || q.kind === "score" || q.kind === "threshold") && value >= 0 && value <= 1) {
    out.add(base);
    out.add(trimmed);
    const pct = Math.round(value * 100 * 10 ** Math.max(0, decimals - 2)) / 10 ** Math.max(0, decimals - 2);
    const ps = trimZeros(fixed(pct, Math.max(0, decimals - 2)));
    out.add(`${ps}%`);
    out.add(`${ps} percent`);
    out.add(`${ps} per cent`);
    return [...out];
  }

  if (q.kind === "money" || q.unit === "$") {
    const plain = base;
    out.add(`$${withCommas(plain)}`);
    out.add(withCommas(plain));
    out.add(plain);
    out.add(`$${plain}`);
    if (value >= 1000 && value % 1000 === 0) out.add(`${value / 1000}k`);
    if (value >= 1_000_000 && value % 100_000 === 0) out.add(`${trimZeros(fixed(value / 1_000_000, 1))} million`);
    return [...out];
  }

  out.add(base);
  out.add(trimmed);
  out.add(withCommas(base));
  if (q.unit && q.unit !== "") out.add(`${trimmed} ${q.unit}`);
  if (Number.isInteger(value) && value >= 1000 && value % 1000 === 0) out.add(`${value / 1000}k`);
  if (q.kind === "measure") out.add(`${trimmed}-point`);
  return [...out];
}
