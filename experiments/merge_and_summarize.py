#!/usr/bin/env python3
"""Merge results.json (original 27) + results_extras.json (33 new) = 60 total conditions.
Regenerate summary.json with the structure the paper expects: per-condition rows
(averaged across blueprints AND frontier models for strategy conditions; averaged across
blueprints for reference conditions)."""
import json
from pathlib import Path
import numpy as np

EXP_DIR = Path(__file__).parent
OUT = EXP_DIR / "outputs"

with open(OUT / "results.json") as f:
    base = json.load(f)
with open(OUT / "results_extras.json") as f:
    extras = json.load(f)

all_results = base + extras
print(f"Loaded base={len(base)}, extras={len(extras)}, total={len(all_results)}")

successful = [r for r in all_results if r.get("n_variants", 0) >= 2]
print(f"Successful conditions (n_variants>=2): {len(successful)}")

# Save merged results to a separate file so the raw per-run outputs are preserved
with open(OUT / "results_merged.json", "w") as f:
    json.dump(all_results, f, indent=2)
print("Wrote results_merged.json")

# Helpers
def cell_metrics(records):
    """Compute aggregated metrics across a group of (blueprint, model)-cells."""
    if not records:
        return None
    cos = [r["surface_diversity_cosine"]["mean"] for r in records]
    cos_p95 = [r["surface_diversity_cosine"]["p95"] for r in records]
    bleu = [r["ngram_overlap_4gram"]["mean"] for r in records]
    judge = [r["construct_equivalence_judge"]["score"] for r in records
             if r["construct_equivalence_judge"]["score"] >= 0]
    flesch_std = [r["readability"]["flesch_std"] for r in records]
    wc_cv = [r["readability"]["word_count_std"] / max(r["readability"]["word_count_mean"], 1)
             for r in records]
    return {
        "n_cells": len(records),
        "mean_cosine_similarity": float(np.mean(cos)),
        "p95_cosine_similarity": float(np.mean(cos_p95)),
        "mean_4gram_overlap": float(np.mean(bleu)),
        "mean_construct_equivalence": float(np.mean(judge)) if judge else -1.0,
        "flesch_std_across_variants_mean": float(np.mean(flesch_std)),
        "word_count_cv_mean": float(np.mean(wc_cv)),
    }


def joint_score(m):
    """J = w1*(1-cosine) + w2*construct_eq + w3*(1-bleu) + w4*(1-flesch_normalized)
    where flesch_normalized = min(flesch_std/20, 1) — 20 grade-band points is a wide drift."""
    if m["mean_construct_equivalence"] < 0:
        return 0.0
    cos = m["mean_cosine_similarity"]
    eq = m["mean_construct_equivalence"]
    bleu = m["mean_4gram_overlap"]
    flesch_norm = min(m["flesch_std_across_variants_mean"] / 20.0, 1.0)
    j = 0.25 * (1 - cos) + 0.25 * eq + 0.25 * (1 - bleu) + 0.25 * (1 - flesch_norm)
    return float(j)


FRONTIER_MODELS = {"claude_opus_4_7", "gpt_5_5", "gemini_3_1_pro"}
STRATEGY_CONDITIONS = ["zero_shot", "few_shot", "structured_cot", "dpcg", "no_cmap_cot", "no_neg_fs"]
REFERENCE_MODELS = ["llama_3_2_3b_inst", "gpt2_small"]


def group_by_strategy(strategy):
    """Average across blueprints and the 3 frontier models for a given strategy."""
    return [r for r in successful
            if r.get("strategy") == strategy
            and r.get("model") in FRONTIER_MODELS]


def group_by_reference(model):
    return [r for r in successful if r.get("model") == model]


# Build per-condition summary (the "8 conditions" the paper reports)
condition_rows = {}

for strat in STRATEGY_CONDITIONS:
    recs = group_by_strategy(strat)
    if recs:
        m = cell_metrics(recs)
        m["joint_score"] = joint_score(m)
        m["failure_score"] = 1.0 - m["joint_score"]
        condition_rows[f"frontier__{strat}"] = m

for ref in REFERENCE_MODELS:
    recs = group_by_reference(ref)
    if recs:
        m = cell_metrics(recs)
        m["joint_score"] = joint_score(m)
        m["failure_score"] = 1.0 - m["joint_score"]
        condition_rows[f"reference__{ref}"] = m

# Also keep the original per-(model, strategy) detailed breakdown for transparency
detailed_by_model_strategy = {}
for r in successful:
    if r.get("strategy") in {"reference"}:
        continue
    key = f"{r['model']}__{r['strategy']}"
    detailed_by_model_strategy.setdefault(key, []).append(r)

per_model_strategy = {}
for key, recs in detailed_by_model_strategy.items():
    m = cell_metrics(recs)
    m["joint_score"] = joint_score(m)
    per_model_strategy[key] = m

summary = {
    "n_blueprints": 3,
    "n_variants_per_condition": 10,
    "n_total_conditions": len(all_results),
    "n_successful_conditions": len(successful),
    "frontier_models": sorted(FRONTIER_MODELS),
    "strategies": STRATEGY_CONDITIONS,
    "reference_models": REFERENCE_MODELS,
    "judge_model": "anthropic/claude-sonnet-4.6",
    "condition_rows": condition_rows,
    "per_model_strategy": per_model_strategy,
}

# Pick primary metric = best frontier joint score
frontier_joints = {k: v["joint_score"] for k, v in condition_rows.items()
                   if k.startswith("frontier__")}
if frontier_joints:
    best = max(frontier_joints, key=frontier_joints.get)
    summary["best_joint_score_condition"] = best
    summary["best_joint_score"] = frontier_joints[best]
    summary["primary_metric"] = frontier_joints[best]
else:
    summary["primary_metric"] = 0.0

with open(OUT / "summary.json", "w") as f:
    json.dump(summary, f, indent=2)
print("Wrote summary.json")

# Pretty print the conditions table
print("\n=== Condition rows (paper Table 2/3) ===")
print(f"{'Condition':<40} {'cosine':>8} {'4gram':>8} {'construct':>10} {'flesch_sd':>10} {'joint':>8}")
for k, m in condition_rows.items():
    print(f"{k:<40} {m['mean_cosine_similarity']:>8.3f} {m['mean_4gram_overlap']:>8.3f} "
          f"{m['mean_construct_equivalence']:>10.3f} {m['flesch_std_across_variants_mean']:>10.3f} "
          f"{m['joint_score']:>8.3f}")
print(f"\nBest joint: {summary.get('best_joint_score', 0):.4f} "
      f"({summary.get('best_joint_score_condition', 'n/a')})")
