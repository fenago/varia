/**
 * Readability (P4) and per-variant lexical metrics. Heuristic English only.
 *
 * Flesch reading ease = 206.835 − 1.015·(words/sentences) − 84.6·(syllables/words).
 * Not clamped: real texts can score below 0 or above 100.
 */

const WORD_RE = /[A-Za-z0-9]+(?:['’][A-Za-z]+)?/g;

/** Word tokens: runs of letters/digits, with an optional apostrophe suffix ("don't"). */
function words(text: string): string[] {
  return text.match(WORD_RE) ?? [];
}

export function countWords(text: string): number {
  return words(text).length;
}

/**
 * Sentences = segments ending in `.`, `!` or `?` (followed by whitespace or end)
 * that contain at least one letter. "1." list markers therefore do not count.
 * Always at least 1.
 */
export function countSentences(text: string): number {
  const segments = text.split(/[.!?]+(?:\s+|$)/);
  let n = 0;
  for (const seg of segments) if (/[A-Za-z]/.test(seg)) n++;
  return Math.max(1, n);
}

/**
 * Heuristic syllable count for one English word.
 *  - words of ≤3 letters → 1
 *  - leading "y" is a consonant
 *  - trailing "-le" after a consonant is a syllable (table, simple); other silent
 *    trailing "e" is dropped (make, whale)
 *  - trailing "-ed" is silent unless preceded by t/d (walked=1, audited=3)
 *  - trailing "-es" is silent unless preceded by s/x/z/h (makes=1, classes=2)
 *  - then count vowel groups; minimum 1
 */
export function countSyllables(word: string): number {
  let w = word.toLowerCase().replace(/[^a-z]/g, "");
  if (w.length === 0) return 1;
  if (w.length <= 3) return 1;

  if (/[^aeiouy]le$/.test(w)) {
    // keep: "-le" forms its own syllable
  } else if (/[^aeiouytd]ed$/.test(w)) {
    w = w.slice(0, -2);
  } else if (/[^aeiouysxzh]es$/.test(w)) {
    w = w.slice(0, -2);
  } else if (/[^aeiouy]e$/.test(w)) {
    w = w.slice(0, -1);
  }
  w = w.replace(/^y/, "");

  const groups = w.match(/[aeiouy]+/g);
  return Math.max(1, groups ? groups.length : 0);
}

/** Flesch reading ease. 0 for text with no words. */
export function fleschReadingEase(text: string): number {
  const ws = words(text);
  if (ws.length === 0) return 0;
  const sentences = countSentences(text);
  let syllables = 0;
  for (const w of ws) syllables += countSyllables(w);
  return 206.835 - 1.015 * (ws.length / sentences) - 84.6 * (syllables / ws.length);
}

/** Type-token ratio over lowercase alphabetic tokens, 0..1. 0 for empty text. */
export function typeTokenRatio(text: string): number {
  const tokens = text.toLowerCase().match(/[a-z]+/g) ?? [];
  if (tokens.length === 0) return 0;
  return new Set(tokens).size / tokens.length;
}

const STEP_LINE_RE = /^(?:\d+[.)]\s*|[-•*]\s+|(?:step|finding)\b)/i;

/**
 * Number of lines that look like a step: "1." / "1)" numbering, "-" "•" "*"
 * bullets, or lines starting with "Step" / "Finding" (markdown "#"/"**" prefixes
 * are ignored). 0 when none.
 */
export function stepCount(text: string): number {
  let n = 0;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim().replace(/^#+\s*/, "").replace(/^[*_]{2}/, "");
    if (line.length > 0 && STEP_LINE_RE.test(line)) n++;
  }
  return n;
}
