#!/usr/bin/env python3
"""Post-hoc robustness analyses on the VARIA pilot data (no API calls).

Closes, from the existing 60-cell results, the gaps flagged in review:
  1. Inferential statistics: exact paired sign-flip permutation tests on the
     9 matched (model, blueprint) cells shared by every pair of strategies,
     plus cell-level bootstrap CIs for condition-level joint scores and an
     exact permutation test for the frontier-vs-reference tier gap.
  2. Threshold instantiation: illustrative default tau values anchored to
     interpretable scale points, with per-condition cell pass rates.
  3. Sensitivity analysis: joint-score rankings under alternative Flesch
     normalizers and weight schemes (Kendall tau vs the headline ranking).
  4. Semantic-diversity check: all-mpnet-base-v2 embedding cosine on the
     stored 3-variant samples per cell, correlated with the TF-IDF cosine.

Writes outputs/gap_analysis.json and prints a summary.
"""
import itertools
import json
from pathlib import Path

import numpy as np

EXP = Path(__file__).parent
OUT = EXP / "outputs"

FRONTIER = {"claude_opus_4_7", "gpt_5_5", "gemini_3_1_pro"}
STRATS = ["zero_shot", "few_shot", "structured_cot", "dpcg", "no_cmap_cot", "no_neg_fs"]
REFS = ["llama_3_2_3b_inst", "gpt2_small"]

# Illustrative default thresholds, anchored to interpretable scale points
# (stated before inspection of pass rates): tau_eq = 0.7 is the judge scale's
# "mostly equivalent, minor drift" anchor; tau_flesch = 10 is half the
# wide-drift normalizer (~one reading band); tau_cos / tau_ov cap average
# pairwise lexical sharing at a quarter / 15% of mass.
TAU = {"cos": 0.25, "ov": 0.15, "eq": 0.70, "flesch": 10.0}


def joint(cos, eq, ov, fl):
    return 0.25 * (1 - cos) + 0.25 * eq + 0.25 * (1 - ov) + 0.25 * (1 - min(fl / 20.0, 1.0))


def load_cells():
    with open(OUT / "results.json") as f:
        rows = json.load(f)
    cells = []
    for r in rows:
        j = r["construct_equivalence_judge"]["score"]
        c = dict(
            model=r["model"], strategy=r["strategy"], bp=r["blueprint_id"],
            cos=r["surface_diversity_cosine"]["mean"],
            ov=r["ngram_overlap_4gram"]["mean"],
            eq=j,
            fl=r["readability"]["flesch_std"],
            texts=[" ".join(str(v.get(k, "")) for k in ("scenario", "deliverable")).strip()
                   for v in r.get("variants_sample", [])],
        )
        c["J"] = joint(c["cos"], c["eq"], c["ov"], c["fl"])
        cells.append(c)
    return cells


def exact_sign_flip_p(diffs):
    """Exact two-sided paired permutation test on mean of differences."""
    d = np.asarray(diffs, dtype=float)
    n = len(d)
    obs = abs(d.mean())
    count = 0
    for signs in itertools.product((1, -1), repeat=n):
        if abs((d * signs).mean()) >= obs - 1e-12:
            count += 1
    return count / (2 ** n)


def paired_contrast(cells, s1, s2, field):
    a = {(c["model"], c["bp"]): c[field] for c in cells if c["strategy"] == s1 and c["model"] in FRONTIER}
    b = {(c["model"], c["bp"]): c[field] for c in cells if c["strategy"] == s2 and c["model"] in FRONTIER}
    keys = sorted(set(a) & set(b))
    diffs = [a[k] - b[k] for k in keys]
    return {
        "contrast": f"{s1} - {s2}", "field": field, "n_pairs": len(keys),
        "mean_diff": float(np.mean(diffs)),
        "p_exact": exact_sign_flip_p(diffs),
    }


def bootstrap_ci(vals, iters=10000, seed=7):
    rng = np.random.default_rng(seed)
    v = np.asarray(vals, dtype=float)
    means = rng.choice(v, size=(iters, len(v)), replace=True).mean(axis=1)
    return [float(np.percentile(means, 2.5)), float(np.percentile(means, 97.5))]


def two_sample_perm_p(x, y):
    """Exact two-sided permutation test on difference of means (small n)."""
    x, y = list(map(float, x)), list(map(float, y))
    pooled = x + y
    n = len(x)
    obs = abs(np.mean(x) - np.mean(y))
    count, total = 0, 0
    for idx in itertools.combinations(range(len(pooled)), n):
        total += 1
        xs = [pooled[i] for i in idx]
        ys = [pooled[i] for i in range(len(pooled)) if i not in idx]
        if abs(np.mean(xs) - np.mean(ys)) >= obs - 1e-12:
            count += 1
    return count / total


def kendall_tau(rank_a, rank_b):
    n = len(rank_a)
    conc = disc = 0
    for i in range(n):
        for j in range(i + 1, n):
            s = (rank_a[i] - rank_a[j]) * (rank_b[i] - rank_b[j])
            if s > 0:
                conc += 1
            elif s < 0:
                disc += 1
    return (conc - disc) / (n * (n - 1) / 2)


def condition_cells(cells, name):
    if name in REFS:
        return [c for c in cells if c["model"] == name]
    return [c for c in cells if c["strategy"] == name and c["model"] in FRONTIER]


def main():
    cells = load_cells()
    conditions = STRATS + REFS
    report = {}

    # ---- 1a. Bootstrap CIs on condition-level joint score
    cis = {}
    for cond in conditions:
        vals = [c["J"] for c in condition_cells(cells, cond)]
        cis[cond] = {"mean": float(np.mean(vals)), "n_cells": len(vals),
                     "ci95": bootstrap_ci(vals)}
    report["joint_score_ci"] = cis

    # ---- 1b. Exact paired contrasts on frontier cells (9 matched pairs)
    contrasts = [
        ("structured_cot", "zero_shot", "J"),
        ("structured_cot", "zero_shot", "eq"),
        ("zero_shot", "few_shot", "eq"),
        ("dpcg", "zero_shot", "cos"),
        ("dpcg", "zero_shot", "fl"),
        ("structured_cot", "no_cmap_cot", "eq"),
        ("structured_cot", "no_cmap_cot", "J"),
        ("few_shot", "no_neg_fs", "eq"),
        ("few_shot", "no_neg_fs", "J"),
        ("few_shot", "zero_shot", "cos"),
        ("few_shot", "zero_shot", "fl"),
        ("no_neg_fs", "zero_shot", "fl"),
    ]
    report["paired_contrasts"] = [paired_contrast(cells, *c) for c in contrasts]

    # ---- 1c. Tier gap: weakest frontier strategy vs each reference
    weakest = min(STRATS, key=lambda s: np.mean([c["J"] for c in condition_cells(cells, s)]))
    fw = [c["J"] for c in condition_cells(cells, weakest)]
    tier = {"weakest_frontier_strategy": weakest}
    for ref in REFS:
        rv = [c["J"] for c in condition_cells(cells, ref)]
        tier[ref] = {"gap": float(np.mean(fw) - np.mean(rv)),
                     "p_exact": two_sample_perm_p(fw, rv)}
    report["tier_gap"] = tier

    # ---- 2. Threshold gating
    gate = {}
    for cond in conditions:
        cc = condition_cells(cells, cond)
        p1 = [c["cos"] <= TAU["cos"] and c["ov"] <= TAU["ov"] for c in cc]
        p2 = [c["eq"] >= TAU["eq"] for c in cc]
        p4 = [c["fl"] <= TAU["flesch"] for c in cc]
        allp = [a and b and d for a, b, d in zip(p1, p2, p4)]
        gate[cond] = {"P1_pass": f"{sum(p1)}/{len(cc)}", "P2_pass": f"{sum(p2)}/{len(cc)}",
                      "P4_pass": f"{sum(p4)}/{len(cc)}", "all_pass": f"{sum(allp)}/{len(cc)}"}
    report["threshold_gate"] = {"tau": TAU, "pass_rates": gate}

    # ---- 3. Sensitivity of the condition ranking
    def rank_conditions(div, weights):
        means = {}
        for cond in conditions:
            cc = condition_cells(cells, cond)
            js = [weights[0] * (1 - c["cos"]) + weights[1] * c["eq"] +
                  weights[2] * (1 - c["ov"]) + weights[3] * (1 - min(c["fl"] / div, 1.0))
                  for c in cc]
            means[cond] = np.mean(js)
        order = sorted(conditions, key=lambda k: -means[k])
        return [order.index(c) for c in conditions], order

    base_rank, base_order = rank_conditions(20.0, (0.25, 0.25, 0.25, 0.25))
    schemes = {
        "flesch_div_10": (10.0, (0.25, 0.25, 0.25, 0.25)),
        "flesch_div_30": (30.0, (0.25, 0.25, 0.25, 0.25)),
        "equivalence_heavy": (20.0, (1 / 6, 1 / 2, 1 / 6, 1 / 6)),
        "diversity_collapsed": (20.0, (1 / 6, 1 / 3, 1 / 6, 1 / 3)),
    }
    sens = {"headline_order": base_order}
    for name, (div, w) in schemes.items():
        r, order = rank_conditions(div, w)
        refs_last = all(order.index(x) >= len(conditions) - 2 for x in REFS)
        sens[name] = {"kendall_tau_vs_headline": round(kendall_tau(base_rank, r), 3),
                      "order": order, "references_remain_bottom_two": refs_last}
    report["ranking_sensitivity"] = sens

    # ---- 4. Embedding-based semantic diversity on stored variant samples
    from sentence_transformers import SentenceTransformer
    model = SentenceTransformer("all-mpnet-base-v2")
    emb_cell = []
    for c in cells:
        t = [x for x in c["texts"] if x]
        if len(t) < 2:
            c["emb_cos"] = None
            continue
        E = model.encode(t, normalize_embeddings=True)
        sims = [float(E[i] @ E[j]) for i, j in itertools.combinations(range(len(t)), 2)]
        c["emb_cos"] = float(np.mean(sims))
        emb_cell.append((c["cos"], c["emb_cos"], c["model"], c["strategy"], c["bp"]))
    tf = np.array([e[0] for e in emb_cell])
    em = np.array([e[1] for e in emb_cell])
    from scipy.stats import pearsonr, spearmanr
    pr, pp = pearsonr(tf, em)
    sr, sp = spearmanr(tf, em)
    emb_cond = {}
    for cond in conditions:
        vals = [c["emb_cos"] for c in condition_cells(cells, cond) if c["emb_cos"] is not None]
        emb_cond[cond] = {"mean_embedding_cosine": float(np.mean(vals)), "n_cells": len(vals)}
    # evasion check: frontier cells lexically diverse but semantically similar
    evasive = [dict(model=m, strategy=s, bp=b, tfidf_cos=round(t, 3), emb_cos=round(e, 3))
               for t, e, m, s, b in emb_cell if m in FRONTIER and t < 0.15 and e > 0.75]
    report["embedding_diversity"] = {
        "note": "computed on the stored first-3-variant sample per cell (3 pairs/cell)",
        "pearson_r_vs_tfidf": [round(pr, 3), float(pp)],
        "spearman_r_vs_tfidf": [round(sr, 3), float(sp)],
        "per_condition": emb_cond,
        "frontier_cells_lexically_diverse_but_semantically_similar": evasive,
    }

    with open(OUT / "gap_analysis.json", "w") as f:
        json.dump(report, f, indent=2)
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
