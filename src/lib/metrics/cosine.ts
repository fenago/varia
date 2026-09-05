/**
 * TF-IDF n-gram cosine (P1). Stop words removed, then unigrams + bigrams,
 * raw term frequency, idf = ln((N+1)/df) (metric v4, set-wide terms floored), L2-normalised. Paper §4.5
 * used TF-IDF n-gram cosine as the local proxy for the embedding cosine; no
 * embedding model in the browser. Metric definition v4 (see METRICS_VERSION).
 */
import { tokenize } from "./ngram";

/**
 * Standard English stop words, removed before TF-IDF (metric definition v2).
 * The pilot removed stop words (author's walkthrough); leaving them in inflates
 * similarity between any two English texts and makes τdiv stricter than it looks.
 */
export const STOP_WORDS: ReadonlySet<string> = new Set([
  "a","an","the","and","or","but","if","then","than","so","as","of","at","by","for","from","in","into","on","onto","to","with","without","about","over","under","between","through","during","before","after","above","below","up","down","out","off","again","further","once",
  "is","am","are","was","were","be","been","being","have","has","had","having","do","does","did","doing","will","would","shall","should","can","could","may","might","must",
  "i","me","my","mine","myself","we","us","our","ours","ourselves","you","your","yours","yourself","yourselves","he","him","his","himself","she","her","hers","herself","it","its","itself","they","them","their","theirs","themselves",
  "this","that","these","those","what","which","who","whom","whose","where","when","why","how","all","any","both","each","few","more","most","other","some","such","no","nor","not","only","own","same","too","very","s","t","just","also","here","there","now",
]);

/** Tokens with stop words removed. */
export function contentTokens(text: string): string[] {
  return tokenize(text).filter((t) => !STOP_WORDS.has(t));
}

function features(text: string): string[] {
  const toks = contentTokens(text);
  const out: string[] = [...toks];
  for (let i = 0; i + 1 < toks.length; i++) out.push(toks[i] + " " + toks[i + 1]);
  return out;
}

/** One L2-normalised TF-IDF vector per text, as feature → weight maps. */
export function tfidfVectors(texts: string[]): Map<string, number>[] {
  const N = texts.length;
  const tfs = texts.map((t) => {
    const tf = new Map<string, number>();
    for (const f of features(t)) tf.set(f, (tf.get(f) ?? 0) + 1);
    return tf;
  });
  const df = new Map<string, number>();
  for (const tf of tfs) for (const f of tf.keys()) df.set(f, (df.get(f) ?? 0) + 1);

  return tfs.map((tf) => {
    const vec = new Map<string, number>();
    let ss = 0;
    for (const [f, count] of tf) {
      // Metric v4: idf = ln((N+1)/df). A term every version shares (df = N) keeps a small
      // floor, ln((N+1)/N), instead of the standard smoothed weight of 1, so the construct's
      // own vocabulary ("sessions", "false positive rate") barely counts while identical or
      // near-identical sets still score ~1. On the five recorded runs this puts cosine at
      // 0.04–0.07, inside the paper's frontier band; the smoothed form gave 0.13–0.33.
      const idf = Math.log((N + 1) / Math.max(1, df.get(f) ?? 1));
      const w = count * idf;
      vec.set(f, w);
      ss += w * w;
    }
    const norm = Math.sqrt(ss);
    if (norm > 0) for (const [f, w] of vec) vec.set(f, w / norm);
    return vec;
  });
}

/** Cosine similarity between two sparse vectors. 0 if either has zero norm. */
export function cosine(a: Map<string, number>, b: Map<string, number>): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  const [small, large] = a.size <= b.size ? [a, b] : [b, a];
  for (const [f, w] of small) {
    const v = large.get(f);
    if (v !== undefined) dot += w * v;
  }
  for (const w of a.values()) na += w * w;
  for (const w of b.values()) nb += w * w;
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

/** Mean cosine over all unordered pairs of texts. 0 if fewer than 2. */
export function pairwiseCosineMean(texts: string[]): number {
  if (texts.length < 2) return 0;
  const vecs = tfidfVectors(texts);
  let sum = 0;
  let pairs = 0;
  for (let i = 0; i < vecs.length; i++) {
    for (let j = i + 1; j < vecs.length; j++) {
      sum += cosine(vecs[i], vecs[j]);
      pairs++;
    }
  }
  return pairs === 0 ? 0 : sum / pairs;
}
