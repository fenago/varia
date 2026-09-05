import type { Roster, Run, Student } from "@shared/types";

export interface MatchResult {
  /** The uploaded file's name */
  fileName: string;
  studentId: string | null;
  variantId: string | null;
  /** How the match was made, or why it failed */
  reason: "email" | "surname" | "variant" | "ambiguous" | "unmatched";
  /** Surname candidates when ambiguous */
  candidates?: string[];
}

function stem(name: string): string {
  return name.replace(/\.[^.]+$/, "").toLowerCase();
}

function surnameOf(student: Student): string {
  return student.name.split(",")[0].trim().toLowerCase();
}

/**
 * Match uploaded submission files to students on a released run, in order:
 * roster email in the filename, a unique surname, then a `v-NN` variant id.
 */
export function matchSubmissionFiles(fileNames: string[], roster: Roster, run: Run): MatchResult[] {
  const byStudent = new Map<string, string>(); // studentId -> variantId
  for (const v of run.variants) if (v.studentId) byStudent.set(v.studentId, v.id);
  const students = roster.students.filter((s) => byStudent.has(s.id));

  return fileNames.map((fileName) => {
    const s = stem(fileName);
    const compact = s.replace(/[^a-z0-9@._-]/g, "");

    // 1. email
    const byEmail = students.find((st) => st.email && (s.includes(st.email.toLowerCase()) || compact.includes(st.email.toLowerCase().split("@")[0] + "@")));
    if (byEmail) return { fileName, studentId: byEmail.id, variantId: byStudent.get(byEmail.id) ?? null, reason: "email" };
    const localPart = students.find((st) => st.email && new RegExp(`(^|[^a-z0-9])${escapeRe(st.email.toLowerCase().split("@")[0])}([^a-z0-9]|$)`).test(s));
    if (localPart) return { fileName, studentId: localPart.id, variantId: byStudent.get(localPart.id) ?? null, reason: "email" };

    // 2. unique surname as a whole word
    const hits = students.filter((st) => {
      const sn = surnameOf(st);
      return sn.length >= 2 && new RegExp(`(^|[^a-z])${escapeRe(sn)}([^a-z]|$)`).test(s);
    });
    if (hits.length === 1) return { fileName, studentId: hits[0].id, variantId: byStudent.get(hits[0].id) ?? null, reason: "surname" };

    // 3. v-NN
    const m = s.match(/\bv[-_]?(\d{2})\b/);
    if (m) {
      const vid = `v-${m[1]}`;
      const v = run.variants.find((x) => x.id === vid);
      if (v) return { fileName, studentId: v.studentId, variantId: v.id, reason: "variant" };
    }

    if (hits.length > 1) return { fileName, studentId: null, variantId: null, reason: "ambiguous", candidates: hits.map((h) => h.name) };
    return { fileName, studentId: null, variantId: null, reason: "unmatched" };
  });
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
