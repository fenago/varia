import Papa from "papaparse";
import type { Roster, Student } from "@shared/types";

const NAME_KEYS = ["name", "student", "student name", "full name", "studentname", "fullname"];
const LAST_KEYS = ["last", "last name", "lastname", "surname", "family name"];
const FIRST_KEYS = ["first", "first name", "firstname", "given name"];
const EMAIL_KEYS = ["email", "e-mail", "email address"];
const ID_KEYS = ["id", "student id", "studentid", "sid"];

function findKey(headers: string[], candidates: string[]): string | null {
  const lower = headers.map((h) => h.trim().toLowerCase());
  for (const c of candidates) {
    const i = lower.indexOf(c);
    if (i >= 0) return headers[i];
  }
  return null;
}

function initial(s: string): string {
  const t = s.trim();
  return t ? `${t[0].toUpperCase()}.` : "";
}

/** "Rosa Alvarez" or "Alvarez, Rosa" → "Alvarez, R." */
export function toRosterName(full: string): string {
  const t = full.trim().replace(/\s+/g, " ");
  if (!t) return "";
  if (t.includes(",")) {
    const [last, first = ""] = t.split(",");
    return `${last.trim()}, ${initial(first)}`.trim().replace(/,\s*$/, "");
  }
  const parts = t.split(" ");
  if (parts.length === 1) return parts[0];
  const last = parts[parts.length - 1];
  return `${last}, ${initial(parts[0])}`;
}

function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

export function parseRosterCsv(text: string, fileName = "roster.csv", courseId = "dat4100"): Roster {
  const result = Papa.parse<Record<string, string>>(text, { header: true, skipEmptyLines: true });
  const headers = result.meta.fields ?? [];
  const nameKey = findKey(headers, NAME_KEYS);
  const lastKey = findKey(headers, LAST_KEYS);
  const firstKey = findKey(headers, FIRST_KEYS);
  const emailKey = findKey(headers, EMAIL_KEYS);
  const idKey = findKey(headers, ID_KEYS);

  const students: Student[] = [];
  const seen = new Set<string>();
  for (const row of result.data) {
    let name = "";
    if (nameKey && row[nameKey]) name = toRosterName(row[nameKey]);
    else if (lastKey && row[lastKey]) name = `${row[lastKey].trim()}, ${initial(row[firstKey ?? ""] ?? "")}`.replace(/,\s*$/, "");
    else if (headers.length === 1 && row[headers[0]]) name = toRosterName(row[headers[0]]);
    if (!name) continue;
    const email = emailKey ? row[emailKey]?.trim() || undefined : undefined;
    const rawId = idKey ? row[idKey]?.trim() : "";
    let id = rawId ? `s-${slug(rawId)}` : `s-${slug(name)}`;
    let k = 2;
    while (seen.has(id)) id = `s-${slug(name)}-${k++}`;
    seen.add(id);
    students.push({ id, name, email });
  }
  students.sort((a, b) => a.name.localeCompare(b.name));
  return { courseId, students, source: fileName };
}
