#!/usr/bin/env python3
"""Regenerate the 4 paper figures from the real summary.json so they match Tables 2/3."""
import json
from pathlib import Path

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np

EXP = Path(__file__).parent
DELIV = Path("/Users/ernestolee/ClaudeProjects/AI_Assessments/artifacts/rc-20260513-020742-4d3fe7/deliverables")
CHARTS = DELIV / "charts"
CHARTS.mkdir(exist_ok=True)

with open(EXP / "outputs" / "summary.json") as f:
    s = json.load(f)

# Display labels and ordered keys (matches Tables 2/3 order)
LABELS = {
    "frontier__no_cmap_cot": "No-cmap CoT\n(ablation)",
    "frontier__structured_cot": "Structured CoT",
    "frontier__zero_shot": "Zero-shot",
    "frontier__dpcg": "DPCG",
    "frontier__no_neg_fs": "No-neg-anchors FS\n(ablation)",
    "frontier__few_shot": "Few-shot",
    "reference__llama_3_2_3b_inst": "Llama 3.2 3B\n(reference)",
    "reference__gpt2_small": "GPT-2 small\n(reference)",
}
ORDER = list(LABELS.keys())
SHORT = {k: v.replace("\n", " ") for k, v in LABELS.items()}

rows = s["condition_rows"]

def colors_for(keys):
    return ["tab:blue" if k.startswith("frontier__") and "no_" not in k
            else "tab:orange" if "no_" in k
            else "tab:red" for k in keys]


# ---------- Fig 1: Main results (failure score) ----------
fig, ax = plt.subplots(figsize=(10, 4.5))
keys = [k for k in ORDER if k in rows]
labels = [LABELS[k] for k in keys]
fails = [rows[k]["failure_score"] for k in keys]
joints = [rows[k]["joint_score"] for k in keys]
bars = ax.bar(range(len(keys)), fails, color=colors_for(keys), edgecolor="black", linewidth=0.6)
ax.set_xticks(range(len(keys)))
ax.set_xticklabels(labels, rotation=0, fontsize=9)
ax.set_ylabel(r"Failure score $\mathcal{F} = 1 - \mathcal{J}$ (lower is better)")
ax.set_title("VARIA composite failure score — frontier vs. ablations vs. references")
ax.set_ylim(0, 0.65)
for b, f, j in zip(bars, fails, joints):
    ax.text(b.get_x() + b.get_width() / 2, b.get_height() + 0.01,
            f"$\\mathcal{{F}}$={f:.2f}\n$\\mathcal{{J}}$={j:.2f}", ha="center", fontsize=8)
ax.grid(axis="y", linestyle=":", alpha=0.5)
plt.tight_layout()
plt.savefig(CHARTS / "fig_main_results.png", dpi=200)
plt.close()
print("wrote fig_main_results.png")

# ---------- Fig 2: Four-property decomposition ----------
fig, axes = plt.subplots(1, 4, figsize=(14, 4))
metrics = [
    ("mean_cosine_similarity", "Cosine ($P_1$, lower is more diverse)", "lower"),
    ("mean_construct_equivalence", "Construct equivalence ($P_2$, higher is better)", "higher"),
    ("mean_4gram_overlap", "4-gram overlap ($P_1$, lower is more diverse)", "lower"),
    ("flesch_std_across_variants_mean", "Flesch $\\sigma$ ($P_4$, lower is tighter)", "lower"),
]
short_labels = ["No-cmap\nCoT", "Struct\nCoT", "Zero-\nshot", "DPCG", "No-neg\nFS", "Few-\nshot", "Llama\n3B", "GPT-2"]
for i, (mkey, title, direction) in enumerate(metrics):
    ax = axes[i]
    vals = [rows[k][mkey] for k in keys]
    bars = ax.bar(range(len(keys)), vals, color=colors_for(keys), edgecolor="black", linewidth=0.5)
    ax.set_xticks(range(len(keys)))
    ax.set_xticklabels(short_labels, fontsize=7, rotation=0)
    ax.set_title(title, fontsize=9)
    for b, v in zip(bars, vals):
        ax.text(b.get_x() + b.get_width()/2, b.get_height() + max(vals)*0.01,
                f"{v:.2f}", ha="center", fontsize=7)
    ax.grid(axis="y", linestyle=":", alpha=0.5)
plt.suptitle("Per-property decomposition (Table 3 visualised)")
plt.tight_layout(rect=[0, 0, 1, 0.96])
plt.savefig(CHARTS / "fig_four_properties.png", dpi=200)
plt.close()
print("wrote fig_four_properties.png")

# ---------- Fig 3: Diversity vs. construct equivalence scatter ----------
fig, ax = plt.subplots(figsize=(8, 6))
for k in keys:
    cos = rows[k]["mean_cosine_similarity"]
    eq = rows[k]["mean_construct_equivalence"]
    color = ("tab:blue" if k.startswith("frontier__") and "no_" not in k
             else "tab:orange" if "no_" in k
             else "tab:red")
    marker = "o" if k.startswith("frontier__") else "X"
    ax.scatter(cos, eq, s=180, c=color, marker=marker, edgecolor="black", linewidth=0.8, zorder=3)
    ax.annotate(SHORT[k], (cos, eq), xytext=(8, 6), textcoords="offset points", fontsize=8)
ax.set_xlabel("Pairwise cosine similarity (lower = more surface-distinct)")
ax.set_ylabel("Construct equivalence (judge, higher is better)")
ax.set_title("Surface diversity vs. construct equivalence — Pareto frontier")
ax.axhline(0.7, color="grey", linestyle=":", linewidth=0.5)
ax.text(0.42, 0.71, "$\\tau_{eq}$ illustrative threshold", fontsize=8, color="grey")
ax.set_xlim(-0.02, 0.6)
ax.set_ylim(0, 1.05)
ax.grid(linestyle=":", alpha=0.5)
plt.tight_layout()
plt.savefig(CHARTS / "fig_diversity_vs_construct.png", dpi=200)
plt.close()
print("wrote fig_diversity_vs_construct.png")

# ---------- Fig 4: Ablation comparison ----------
fig, ax = plt.subplots(figsize=(7, 4.5))
pairs = [
    ("Structured CoT", "frontier__structured_cot", "No-cmap CoT", "frontier__no_cmap_cot"),
    ("Few-shot", "frontier__few_shot", "No-neg-anchors FS", "frontier__no_neg_fs"),
]
metrics_labels = ["Construct eq.", "Cosine (1-)", "Flesch $\\sigma$ (norm)", "Joint $\\mathcal{J}$"]

x = np.arange(len(pairs) * len(metrics_labels))
parent_vals, ablation_vals, group_labels = [], [], []
for parent_label, parent_key, abl_label, abl_key in pairs:
    p = rows[parent_key]
    a = rows[abl_key]
    parent_vals += [
        p["mean_construct_equivalence"],
        1 - p["mean_cosine_similarity"],
        1 - min(p["flesch_std_across_variants_mean"] / 20, 1),
        p["joint_score"],
    ]
    ablation_vals += [
        a["mean_construct_equivalence"],
        1 - a["mean_cosine_similarity"],
        1 - min(a["flesch_std_across_variants_mean"] / 20, 1),
        a["joint_score"],
    ]
    group_labels += metrics_labels

width = 0.35
ax.bar(x - width/2, parent_vals, width, label="Parent (with component)", color="tab:blue", edgecolor="black", linewidth=0.5)
ax.bar(x + width/2, ablation_vals, width, label="Ablation (component removed)", color="tab:orange", edgecolor="black", linewidth=0.5)
for i, (p, a) in enumerate(zip(parent_vals, ablation_vals)):
    ax.text(x[i] - width/2, p + 0.01, f"{p:.2f}", ha="center", fontsize=7)
    ax.text(x[i] + width/2, a + 0.01, f"{a:.2f}", ha="center", fontsize=7)
ax.set_xticks(x)
ax.set_xticklabels(group_labels, fontsize=8, rotation=0)
ax.set_ylim(0, 1.1)
ax.set_ylabel("Score (all normalised so higher = better)")
ax.set_title("Ablation effects on the four AIAA dimensions")
# Group separators
ax.axvline(3.5, color="grey", linestyle="--", linewidth=0.5)
ax.text(1.5, 1.05, "Structured CoT vs No-cmap CoT", ha="center", fontsize=8)
ax.text(5.5, 1.05, "Few-shot vs No-neg-anchors FS", ha="center", fontsize=8)
ax.legend(loc="lower right", fontsize=8)
ax.grid(axis="y", linestyle=":", alpha=0.5)
plt.tight_layout()
plt.savefig(CHARTS / "fig_ablation.png", dpi=200)
plt.close()
print("wrote fig_ablation.png")

print("\nAll 4 figures regenerated from real summary.json.")
