#!/usr/bin/env python3
"""VARIA pre-registered follow-up harness.

Implements the protocol upgrades the pilot deferred:
  1. TRUE negative-anchor few-shot arm (few_shot_neg): two positive anchors
     plus two annotated negative anchors (paraphrastic copy; construct drift).
  2. Per-variant construct-equivalence scoring by a THREE-FAMILY judge panel
     (Anthropic, OpenAI, Google), median-aggregated — replacing the pilot's
     single set-level call by a single judge sharing a generator's family.
  3. Full P3 rubric-stability protocol: a fixed adapter model rewrites the
     canonical solution for each variant; each judge then applies the
     blueprint's 4-criterion rubric blind (variant + adapted solution only,
     generator identity withheld); P3 = cross-variant variance of the
     median rubric vector.
  4. Embedding-based semantic diversity (all-mpnet-base-v2) over the FULL
     variant set, alongside the pilot's TF-IDF cosine and 4-gram Jaccard.
  5. Multiple independent trials (default 3). Provider APIs are not
     seedable; trials are independent draws, analysed with the
     pre-registered mixed-effects model (blueprint as random effect).

Usage:  OPENROUTER_API_KEY=... python run_followup.py [--trials 3] [--strategies zero_shot,few_shot,few_shot_neg,structured_cot,dpcg]
Writes: outputs/results_followup_trial{t}.json

Blueprints: all entries in blueprints.json, including the held-out
distant-discipline blueprint B4_historical_argument.
"""
import argparse
import itertools
import json
import os
import re
import statistics
import time
from pathlib import Path

import numpy as np
import requests

from run_extras import (  # reuse pilot helpers for comparability
    extract_json_array, variant_text, pairwise_cosine_stats,
    ngram_overlap_stats, readability_stats,
)

API_KEY = os.environ["OPENROUTER_API_KEY"]
BASE_URL = "https://openrouter.ai/api/v1"
HEADERS = {"Authorization": f"Bearer {API_KEY}", "Content-Type": "application/json"}

MODELS = {
    "claude_opus_4_7": "anthropic/claude-opus-4.7",
    "gpt_5_5": "openai/gpt-5.5",
    "gemini_3_1_pro": "google/gemini-3.1-pro-preview",
}
# Cross-family judge panel; per-variant scores are median-aggregated across
# the panel, which bounds single-family bias.
JUDGES = {
    "anthropic": "anthropic/claude-sonnet-4.6",
    "openai": "openai/gpt-5.5",
    "google": "google/gemini-3.1-pro-preview",
}
# Fixed canonical-solution adapter, held constant across all generators so
# adaptation quality is not confounded with generator identity.
ADAPTER = "openai/gpt-5.5"

N_VARIANTS = 10
EXPERIMENT_DIR = Path(__file__).parent
OUTPUT_DIR = EXPERIMENT_DIR / "outputs"
OUTPUT_DIR.mkdir(exist_ok=True)

NEGATIVE_ANCHORS = (
    '\n\nHere are two NEGATIVE anchors — variants that FAIL the requirements. Do NOT produce '
    'variants like these:\n'
    '[\n'
    '  {"id": "anchor_neg_1", "scenario": "A regional hospital group deployed an AI triage tool. '
    'Emergency-department nurses observe longer waits for elderly patients even though the system '
    'labels them low-acuity. Audit and report to the Chief Medical Officer.", '
    '"deliverable": "Audit report + 3-page brief", '
    '"why_it_fails": "Paraphrastic copy: near-identical to the positive anchor, so students could share answers."},\n'
    '  {"id": "anchor_neg_2", "scenario": "Write a short essay on the history of artificial '
    'intelligence and its most famous milestones.", '
    '"deliverable": "5-paragraph essay", '
    '"why_it_fails": "Construct drift: measures recall of AI history, not the audited competencies."}\n'
    ']\n'
)


def call(model_id: str, prompt: str, max_tokens: int = 6000, retries: int = 2) -> str:
    body = {"model": model_id, "messages": [{"role": "user", "content": prompt}],
            "max_tokens": max_tokens, "temperature": 0.7}
    last = None
    for attempt in range(retries + 1):
        try:
            r = requests.post(f"{BASE_URL}/chat/completions", headers=HEADERS, json=body, timeout=180)
            r.raise_for_status()
            return r.json()["choices"][0]["message"]["content"]
        except Exception as e:
            last = e
            if attempt < retries:
                time.sleep(2 ** attempt)
    raise RuntimeError(f"{model_id} failed: {last}")


def parse_json_obj(text: str) -> dict:
    t = text.strip()
    if t.startswith("```"):
        t = re.sub(r"^```[a-zA-Z]*\n?", "", t)
        t = re.sub(r"\n?```$", "", t)
    try:
        return json.loads(t)
    except json.JSONDecodeError:
        m = re.search(r"\{.*\}", t, re.DOTALL)
        return json.loads(m.group(0)) if m else {}


def build_prompt(blueprint: dict, strategy: str, n: int) -> str:
    from run_extras import build_prompt as extras_prompt
    from run_experiment import build_prompt as core_prompt
    if strategy in ("zero_shot", "few_shot", "structured_cot"):
        return core_prompt(blueprint, strategy, n)
    if strategy in ("dpcg", "no_cmap_cot", "no_neg_fs"):
        return extras_prompt(blueprint, strategy, n)
    if strategy == "few_shot_neg":
        return core_prompt(blueprint, "few_shot", n) + NEGATIVE_ANCHORS + \
            "\nNow generate the new variants, avoiding both failure modes. Return ONLY the JSON array."
    raise ValueError(strategy)


def judge_variant(judge_id: str, blueprint: dict, v: dict) -> float:
    prompt = (
        "You are an assessment-design expert. Score how well ONE candidate variant preserves the "
        "construct of the blueprint below — whether it measures the SAME competencies at the SAME "
        "level of demand, despite a different surface.\n\n"
        "Scale: 1.0 fully construct-equivalent / 0.7 minor drift in one competency / "
        "0.4 mixed, partial drift / 0.0 measures different things.\n\n"
        f"BLUEPRINT:\nTitle: {blueprint['title']}\nCompetencies: {blueprint['competencies']}\n"
        f"Canonical solution: {blueprint['canonical_solution']}\n\n"
        f"VARIANT:\nScenario: {v.get('scenario', '')}\nDeliverable: {v.get('deliverable', '')}\n\n"
        'Respond as JSON: {"score": <float 0-1>}. Return only the JSON.'
    )
    obj = parse_json_obj(call(judge_id, prompt, max_tokens=200))
    return float(obj.get("score", -1.0))


def adapt_solution(blueprint: dict, v: dict) -> str:
    prompt = (
        "Adapt the canonical solution outline below so it solves the specific variant scenario, "
        "preserving the same reasoning structure and depth. Return the adapted outline as plain "
        "text, no preamble.\n\n"
        f"CANONICAL SOLUTION OUTLINE:\n{blueprint['canonical_solution']}\n\n"
        f"VARIANT SCENARIO:\n{v.get('scenario', '')}\nDELIVERABLE: {v.get('deliverable', '')}"
    )
    return call(ADAPTER, prompt, max_tokens=1200).strip()


def apply_rubric(judge_id: str, blueprint: dict, v: dict, solution: str) -> dict:
    criteria = list(blueprint["rubric"].keys())
    rub = json.dumps(blueprint["rubric"], indent=1)
    prompt = (
        "You are grading blind: you see one assessment task, one candidate solution, and an "
        "analytic rubric. Score the solution on EACH criterion from 1 to 4 using the level "
        "descriptors. Judge only what is present.\n\n"
        f"TASK:\nScenario: {v.get('scenario', '')}\nDeliverable: {v.get('deliverable', '')}\n\n"
        f"SOLUTION:\n{solution}\n\n"
        f"RUBRIC:\n{rub}\n\n"
        'Respond as JSON: {"scores": {"<criterion>": <int 1-4>, ...}}. Return only the JSON.'
    )
    obj = parse_json_obj(call(judge_id, prompt, max_tokens=400))
    raw = obj.get("scores", {})
    return {c: int(raw.get(c, -1)) for c in criteria}


def embedding_cosine_stats(texts):
    from sentence_transformers import SentenceTransformer
    if not hasattr(embedding_cosine_stats, "_m"):
        embedding_cosine_stats._m = SentenceTransformer("all-mpnet-base-v2")
    if len(texts) < 2:
        return {"mean": 0.0, "p95": 0.0}
    E = embedding_cosine_stats._m.encode(texts, normalize_embeddings=True)
    sims = [float(E[i] @ E[j]) for i, j in itertools.combinations(range(len(texts)), 2)]
    return {"mean": float(np.mean(sims)), "p95": float(np.percentile(sims, 95))}


def run_cell(blueprint, model_key, model_id, strategy):
    print(f"  → {model_key} | {strategy} | {blueprint['id']}", flush=True)
    raw = call(model_id, build_prompt(blueprint, strategy, N_VARIANTS))
    variants = extract_json_array(raw)[:N_VARIANTS]
    texts = [variant_text(v) for v in variants if variant_text(v)]

    # Per-variant cross-family judging (median over panel per variant)
    per_variant = []
    for v in variants:
        panel = {}
        for fam, jid in JUDGES.items():
            try:
                panel[fam] = judge_variant(jid, blueprint, v)
            except Exception as e:
                panel[fam] = -1.0
        valid = [s for s in panel.values() if s >= 0]
        per_variant.append({"panel": panel,
                            "median": statistics.median(valid) if valid else -1.0})
    eq_scores = [pv["median"] for pv in per_variant if pv["median"] >= 0]

    # P3: adapt canonical solution per variant, blind rubric application
    rubric_rows = []
    for v in variants:
        try:
            sol = adapt_solution(blueprint, v)
            per_judge = {fam: apply_rubric(jid, blueprint, v, sol)
                         for fam, jid in JUDGES.items()}
            criteria = list(blueprint["rubric"].keys())
            med = {c: statistics.median([pj[c] for pj in per_judge.values() if pj[c] > 0] or [-1])
                   for c in criteria}
            rubric_rows.append({"per_judge": per_judge, "median": med})
        except Exception as e:
            rubric_rows.append({"error": str(e)})
    med_vecs = [list(r["median"].values()) for r in rubric_rows
                if "median" in r and all(x > 0 for x in r["median"].values())]
    p3_var = (float(np.mean(np.var(np.array(med_vecs), axis=0))) if len(med_vecs) >= 2 else None)

    return {
        "blueprint_id": blueprint["id"], "model": model_key, "strategy": strategy,
        "n_variants": len(variants),
        "surface_diversity_cosine": pairwise_cosine_stats(texts),
        "surface_diversity_embedding": embedding_cosine_stats(texts),
        "ngram_overlap_4gram": ngram_overlap_stats(texts, n=4),
        "readability": readability_stats(texts),
        "construct_equivalence_per_variant": per_variant,
        "construct_equivalence_mean": float(np.mean(eq_scores)) if eq_scores else -1.0,
        "construct_equivalence_min": float(np.min(eq_scores)) if eq_scores else -1.0,
        "rubric_stability": {"per_variant": rubric_rows, "mean_criterion_variance": p3_var},
        "variants": variants,  # full sets retained for re-analysis
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--trials", type=int, default=3)
    ap.add_argument("--strategies", default="zero_shot,few_shot,few_shot_neg,structured_cot,dpcg")
    ap.add_argument("--blueprints", default="all", help="'all' or comma-separated ids")
    args = ap.parse_args()

    with open(EXPERIMENT_DIR / "blueprints.json") as f:
        blueprints = json.load(f)
    if args.blueprints != "all":
        keep = set(args.blueprints.split(","))
        blueprints = [b for b in blueprints if b["id"] in keep]
    strategies = args.strategies.split(",")

    for t in range(1, args.trials + 1):
        out_path = OUTPUT_DIR / f"results_followup_trial{t}.json"
        results = json.load(open(out_path)) if out_path.exists() else []
        done = {(r["blueprint_id"], r["model"], r["strategy"]) for r in results}
        for bp in blueprints:
            for mk, mid in MODELS.items():
                for s in strategies:
                    if (bp["id"], mk, s) in done:
                        continue
                    try:
                        results.append(run_cell(bp, mk, mid, s))
                    except Exception as e:
                        results.append({"blueprint_id": bp["id"], "model": mk,
                                        "strategy": s, "error": str(e)})
                    with open(out_path, "w") as f:
                        json.dump(results, f, indent=2)
        print(f"Trial {t} complete → {out_path}")


if __name__ == "__main__":
    main()
