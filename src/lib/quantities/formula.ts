/**
 * Safe arithmetic evaluator for derived quantities. Numbers, identifiers,
 * + - * / parentheses, unary minus, round(x, d), min(...), max(...), abs(x).
 * No eval, no Function: a hand-written tokenizer and recursive-descent parser.
 */

type Tok =
  | { t: "num"; v: number }
  | { t: "id"; v: string }
  | { t: "op"; v: string }
  | { t: "lp" }
  | { t: "rp" }
  | { t: "comma" };

const FUNCS: Record<string, (args: number[]) => number> = {
  round: (a) => {
    if (a.length < 1 || a.length > 2) throw new Error("round() takes one or two arguments");
    const d = a[1] ?? 0;
    const f = 10 ** d;
    return Math.round(a[0] * f) / f;
  },
  min: (a) => {
    if (!a.length) throw new Error("min() needs at least one argument");
    return Math.min(...a);
  },
  max: (a) => {
    if (!a.length) throw new Error("max() needs at least one argument");
    return Math.max(...a);
  },
  abs: (a) => {
    if (a.length !== 1) throw new Error("abs() takes one argument");
    return Math.abs(a[0]);
  },
};

function tokenize(src: string): Tok[] {
  const out: Tok[] = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (c === " " || c === "\t" || c === "\n") {
      i++;
      continue;
    }
    if (/[0-9.]/.test(c)) {
      const m = /^\d*\.?\d+(?:e[+-]?\d+)?|^\d+\.?/i.exec(src.slice(i));
      if (!m) throw new Error(`Bad number at ${i}`);
      out.push({ t: "num", v: Number(m[0]) });
      i += m[0].length;
      continue;
    }
    if (/[A-Za-z_]/.test(c)) {
      const m = /^[A-Za-z_][A-Za-z0-9_]*/.exec(src.slice(i))!;
      out.push({ t: "id", v: m[0] });
      i += m[0].length;
      continue;
    }
    if ("+-*/".includes(c)) {
      out.push({ t: "op", v: c });
      i++;
      continue;
    }
    if (c === "(") {
      out.push({ t: "lp" });
      i++;
      continue;
    }
    if (c === ")") {
      out.push({ t: "rp" });
      i++;
      continue;
    }
    if (c === ",") {
      out.push({ t: "comma" });
      i++;
      continue;
    }
    throw new Error(`Unexpected character "${c}" in formula`);
  }
  return out;
}

/** Evaluate `formula` with `values` as the identifier table. Throws on unknown identifiers or bad syntax. */
export function evaluateFormula(formula: string, values: Record<string, number>): number {
  const toks = tokenize(formula);
  let p = 0;
  const peek = () => toks[p];
  const next = () => toks[p++];

  function expr(): number {
    let v = term();
    for (;;) {
      const t = peek();
      if (t && t.t === "op" && (t.v === "+" || t.v === "-")) {
        next();
        const r = term();
        v = t.v === "+" ? v + r : v - r;
      } else return v;
    }
  }
  function term(): number {
    let v = unary();
    for (;;) {
      const t = peek();
      if (t && t.t === "op" && (t.v === "*" || t.v === "/")) {
        next();
        const r = unary();
        if (t.v === "/") {
          if (r === 0) throw new Error("Division by zero in formula");
          v = v / r;
        } else v = v * r;
      } else return v;
    }
  }
  function unary(): number {
    const t = peek();
    if (t && t.t === "op" && t.v === "-") {
      next();
      return -unary();
    }
    if (t && t.t === "op" && t.v === "+") {
      next();
      return unary();
    }
    return primary();
  }
  function primary(): number {
    const t = next();
    if (!t) throw new Error("Unexpected end of formula");
    if (t.t === "num") return t.v;
    if (t.t === "lp") {
      const v = expr();
      const r = next();
      if (!r || r.t !== "rp") throw new Error("Missing closing parenthesis");
      return v;
    }
    if (t.t === "id") {
      const n = peek();
      if (n && n.t === "lp") {
        next();
        const fn = FUNCS[t.v];
        if (!fn) throw new Error(`Unknown function "${t.v}"`);
        const args: number[] = [];
        if (peek() && peek().t !== "rp") {
          args.push(expr());
          while (peek() && peek().t === "comma") {
            next();
            args.push(expr());
          }
        }
        const r = next();
        if (!r || r.t !== "rp") throw new Error(`Missing closing parenthesis after ${t.v}(`);
        return fn(args);
      }
      if (!(t.v in values)) throw new Error(`Unknown identifier "${t.v}" in formula`);
      const v = values[t.v];
      if (typeof v !== "number" || Number.isNaN(v)) throw new Error(`Identifier "${t.v}" has no numeric value`);
      return v;
    }
    throw new Error("Unexpected token in formula");
  }

  const v = expr();
  if (p !== toks.length) throw new Error("Unexpected trailing input in formula");
  if (!Number.isFinite(v)) throw new Error("Formula did not produce a finite number");
  return v;
}

/** Identifiers referenced by a formula (for dependency ordering). */
export function formulaIdentifiers(formula: string): string[] {
  const ids = new Set<string>();
  for (const t of tokenize(formula)) if (t.t === "id" && !(t.v in FUNCS)) ids.add(t.v);
  return [...ids];
}
