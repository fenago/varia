/**
 * TF-IDF n-gram cosine (P1). Unigrams + bigrams, raw term frequency,
 * idf = ln((1+N)/(1+df)) + 1, L2-normalised. Paper §4.5 used this as the
 * local proxy for the embedding cosine; no embedding model in the browser.
 */
import { tokenize } from "./ngram";

function features(text: string): string[] {
  const toks = tokenize(text);
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
      const idf = Math.log((1 + N) / (1 + (df.get(f) ?? 0))) + 1;
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
