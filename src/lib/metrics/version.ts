/**
 * Metric definition version. Thresholds are set against a definition; a change
 * here starts a new threshold version rather than silently re-scoring.
 *  1 — TF-IDF uni/bigram cosine without stop-word removal
 *  2 — stop words removed before TF-IDF (matches the pilot as run)
 *  3 — lines shared by ≥ 60% of the set (≥ 4 words) stripped before P1 metrics
 *  4 — idf = ln((N+1)/df): terms every version shares are floored, not weighted 1
 */
export const METRICS_VERSION = 4;
