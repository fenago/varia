let counter = 0;

export function newId(prefix: string): string {
  const rand =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID().slice(0, 8)
      : Math.random().toString(36).slice(2, 10);
  counter += 1;
  return `${prefix}-${rand}${counter.toString(36)}`;
}

/** 0-based index → "v-01" */
export function variantId(index: number): string {
  return `v-${String(index + 1).padStart(2, "0")}`;
}

export function variantIndex(id: string): number {
  const n = Number(id.replace(/^v-/, ""));
  return Number.isFinite(n) ? n - 1 : -1;
}

export function nowIso(): string {
  return new Date().toISOString();
}
