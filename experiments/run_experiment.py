#!/usr/bin/env python3
"""
Variation-at-Scale Benchmark — Real experiment.

Generates N variants per (blueprint × model × strategy), computes metrics, saves results.
Runs OUTSIDE the AutoResearchClaw sandbox with full network/time budget.
"""
import json
import os
import re
import sys
import time
from itertools import combinations
from pathlib import Path

import numpy as np
import requests
import textstat
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity

API_KEY = os.environ.get("OPENROUTER_API_KEY", "")  # checked when a call is made
BASE_URL = "https://openrouter.ai/api/v1"
HEADERS = {
    "Authorization": f"Bearer {API_KEY}",
    "Content-Type": "application/json",
}

MODELS = {
    "claude_opus_4_7": "anthropic/claude-opus-4.7",
    "gpt_5_5": "openai/gpt-5.5",
    "gemini_3_1_pro": "google/gemini-3.1-pro-preview",
}

JUDGE_MODEL = "anthropic/claude-sonnet-4.6"

STRATEGIES = ["zero_shot", "few_shot", "structured_cot"]

N_VARIANTS = 10
EXPERIMENT_DIR = Path(__file__).parent
OUTPUT_DIR = EXPERIMENT_DIR / "outputs"
OUTPUT_DIR.mkdir(exist_ok=True)


def call_model(model_id: str, prompt: str, max_tokens: int = 4000, retries: int = 2) -> str:
    body = {
        "model": model_id,
        "messages": [{"role": "user", "content": prompt}],
        "max_tokens": max_tokens,
        "temperature": 0.7,
    }
    last_err = None
    for attempt in range(retries + 1):
        try:
            r = requests.post(f"{BASE_URL}/chat/completions", headers=HEADERS, json=body, timeout=180)
            r.raise_for_status()
            return r.json()["choices"][0]["message"]["content"]
        except Exception as e:
            last_err = e
            if attempt < retries:
                time.sleep(2 ** attempt)
    raise RuntimeError(f"Model {model_id} failed after {retries+1} attempts: {last_err}")


def build_prompt(blueprint: dict, strategy: str, n: int) -> str:
    bp_summary = (
        f"Title: {blueprint['title']}\n"
        f"Competencies measured: {', '.join(blueprint['competencies'])}\n"
        f"Canonical solution outline: {blueprint['canonical_solution']}"
    )
    base_instr = (
        f"Generate exactly {n} parallel variants of the assessment described below. Each variant must "
        f"measure the same competencies and be solvable using the same canonical reasoning, but use a "
        f"different surface context (different industry, different specific scenario, different stakeholder). "
        f"Variants must be SEMANTICALLY EQUIVALENT on the competencies measured but SURFACE-DISTINCT. "
        f"Return the variants as a JSON array of objects with keys: id, scenario, deliverable.\n\n"
        f"Assessment blueprint:\n{bp_summary}"
    )
    if strategy == "zero_shot":
        return base_instr + '\n\nReturn ONLY the JSON array. No prose, no markdown fences.'

    if strategy == "few_shot":
        anchors = (
            '\n\nHere are two anchor variants showing the expected style (different surface, same competencies):\n'
            '[\n'
            '  {"id": "anchor_1", "scenario": "A regional hospital chain deployed an AI triage tool. ED nurses report longer wait times for elderly patients despite the system flagging them as low-acuity. Audit and report to the Chief Medical Officer.", "deliverable": "Audit report + 3-page brief for non-clinical leadership"},\n'
            '  {"id": "anchor_2", "scenario": "A logistics company deployed an AI route-optimization system. Drivers in two specific depots report systematically longer routes despite identical conditions. Audit and report to the COO.", "deliverable": "Findings memo + decision recommendation"}\n'
            ']\n'
            'Now generate the new variants in the same style. Return ONLY the JSON array.'
        )
        return base_instr + anchors

    if strategy == "structured_cot":
        return (
            base_instr
            + "\n\nBefore generating, internally decompose the blueprint into: (a) the underlying competency "
            "structure that must be preserved, (b) the surface dimensions that can vary (industry, role, scale, "
            "specific harm pattern), and (c) the difficulty anchors that should remain constant. Then generate the variants. "
            'Return ONLY the JSON array. No prose, no markdown fences.'
        )
    raise ValueError(strategy)


def extract_json_array(text: str) -> list:
    text = text.strip()
    # Strip code fences if present
    if text.startswith("```"):
        text = re.sub(r"^```[a-zA-Z]*\n?", "", text)
        text = re.sub(r"\n?```$", "", text)
        text = text.strip()
    # Try direct parse
    try:
        data = json.loads(text)
        if isinstance(data, list):
            return data
        if isinstance(data, dict) and "variants" in data:
            return data["variants"]
    except json.JSONDecodeError:
        pass
    # Try to extract first JSON array via regex
    m = re.search(r"\[\s*\{.*?\}\s*\]", text, re.DOTALL)
    if m:
        try:
            return json.loads(m.group(0))
        except json.JSONDecodeError:
            pass
    return []


def variant_text(v: dict) -> str:
    parts = []
    for k in ("scenario", "deliverable"):
        if k in v and v[k]:
            parts.append(str(v[k]))
    return " ".join(parts) if parts else json.dumps(v)


def pairwise_cosine_stats(texts: list[str]) -> dict:
    if len(texts) < 2:
        return {"mean": 0.0, "p95": 0.0, "max": 0.0, "n_pairs": 0}
    vec = TfidfVectorizer(stop_words="english", min_df=1, ngram_range=(1, 2))
    X = vec.fit_transform(texts)
    sim = cosine_similarity(X)
    iu = np.triu_indices(len(texts), k=1)
    pairs = sim[iu]
    return {
        "mean": float(pairs.mean()),
        "p95": float(np.percentile(pairs, 95)),
        "max": float(pairs.max()),
        "n_pairs": int(len(pairs)),
    }


def ngram_overlap_stats(texts: list[str], n: int = 4) -> dict:
    def ngrams(s, k):
        toks = re.findall(r"\w+", s.lower())
        return set(tuple(toks[i:i+k]) for i in range(len(toks)-k+1)) if len(toks) >= k else set()

    grams = [ngrams(t, n) for t in texts]
    overlaps = []
    for a, b in combinations(range(len(texts)), 2):
        ga, gb = grams[a], grams[b]
        if not ga or not gb:
            continue
        jacc = len(ga & gb) / len(ga | gb)
        overlaps.append(jacc)
    if not overlaps:
        return {"mean": 0.0, "p95": 0.0}
    return {
        "mean": float(np.mean(overlaps)),
        "p95": float(np.percentile(overlaps, 95)),
    }


def readability_stats(texts: list[str]) -> dict:
    if not texts:
        return {"flesch_mean": 0.0, "flesch_std": 0.0, "word_count_mean": 0.0, "word_count_std": 0.0}
    flesch = [textstat.flesch_reading_ease(t) for t in texts]
    wc = [len(re.findall(r"\w+", t)) for t in texts]
    return {
        "flesch_mean": float(np.mean(flesch)),
        "flesch_std": float(np.std(flesch)),
        "word_count_mean": float(np.mean(wc)),
        "word_count_std": float(np.std(wc)),
    }


def judge_construct_equivalence(blueprint: dict, variants: list[dict]) -> dict:
    if len(variants) < 2:
        return {"score": 0.0, "rationale": "Too few variants to judge."}
    sample = variants[:6]  # cap to keep judge token use down
    items = "\n\n".join(
        f"VARIANT {i+1}:\nScenario: {v.get('scenario','')}\nDeliverable: {v.get('deliverable','')}"
        for i, v in enumerate(sample)
    )
    judge_prompt = (
        "You are an assessment-design expert. Below is a blueprint defining the competencies an assessment "
        "must measure, and a set of LLM-generated variants of that assessment. Score how well the variants "
        "preserve CONSTRUCT EQUIVALENCE — i.e., whether they all measure the SAME underlying competencies "
        "at the SAME level of demand, despite differing surfaces.\n\n"
        "Score on a 0.0-1.0 scale where:\n"
        "  1.0 = variants are fully construct-equivalent (same competencies, same demand level)\n"
        "  0.7 = mostly equivalent with minor drift in one competency\n"
        "  0.4 = mixed; some variants drift toward different competencies\n"
        "  0.0 = variants measure substantially different things\n\n"
        f"BLUEPRINT:\nTitle: {blueprint['title']}\nCompetencies: {blueprint['competencies']}\n"
        f"Canonical solution: {blueprint['canonical_solution']}\n\n"
        f"VARIANTS:\n{items}\n\n"
        'Respond as JSON: {"score": <float 0-1>, "rationale": "<2-3 sentence justification>"}. '
        "Return only the JSON. No prose, no fences."
    )
    text = call_model(JUDGE_MODEL, judge_prompt, max_tokens=600)
    try:
        text = text.strip()
        if text.startswith("```"):
            text = re.sub(r"^```[a-zA-Z]*\n?", "", text)
            text = re.sub(r"\n?```$", "", text)
        obj = json.loads(text)
        return {"score": float(obj["score"]), "rationale": obj.get("rationale", "")}
    except Exception as e:
        return {"score": -1.0, "rationale": f"Judge parse failure: {e}; raw: {text[:200]}"}


def run_one_condition(blueprint: dict, model_key: str, model_id: str, strategy: str) -> dict:
    print(f"  → {model_key} | {strategy} | {blueprint['id']}", flush=True)
    prompt = build_prompt(blueprint, strategy, N_VARIANTS)
    t0 = time.time()
    try:
        raw = call_model(model_id, prompt, max_tokens=6000)
    except Exception as e:
        return {
            "blueprint_id": blueprint["id"],
            "model": model_key,
            "strategy": strategy,
            "error": str(e),
            "n_variants": 0,
        }
    elapsed = time.time() - t0
    variants = extract_json_array(raw)
    texts = [variant_text(v) for v in variants if variant_text(v)]
    cos = pairwise_cosine_stats(texts)
    bleu = ngram_overlap_stats(texts, n=4)
    read = readability_stats(texts)
    judge = judge_construct_equivalence(blueprint, variants) if len(variants) >= 2 else {"score": -1.0, "rationale": "fewer than 2 variants"}
    return {
        "blueprint_id": blueprint["id"],
        "model": model_key,
        "strategy": strategy,
        "n_variants": len(variants),
        "generation_seconds": elapsed,
        "surface_diversity_cosine": cos,
        "ngram_overlap_4gram": bleu,
        "readability": read,
        "construct_equivalence_judge": judge,
        "variants_sample": variants[:3],  # keep a sample for the paper
    }


def main():
    with open(EXPERIMENT_DIR / "blueprints.json") as f:
        blueprints = [b for b in json.load(f) if not b.get("held_out")]  # pilot uses B1-B3 only

    print(f"Running variation-at-scale benchmark: {len(blueprints)} blueprints x {len(MODELS)} models x {len(STRATEGIES)} strategies x N={N_VARIANTS}", flush=True)
    print(f"Total conditions: {len(blueprints)*len(MODELS)*len(STRATEGIES)}", flush=True)

    results = []
    for bp in blueprints:
        print(f"\nBlueprint: {bp['id']} — {bp['title']}", flush=True)
        for model_key, model_id in MODELS.items():
            for strategy in STRATEGIES:
                r = run_one_condition(bp, model_key, model_id, strategy)
                results.append(r)
                # Save progress after each condition
                with open(OUTPUT_DIR / "results.json", "w") as out:
                    json.dump(results, out, indent=2)

    # Aggregate
    by_model_strategy = {}
    for r in results:
        if "error" in r or r["n_variants"] < 2:
            continue
        key = f"{r['model']}__{r['strategy']}"
        by_model_strategy.setdefault(key, []).append(r)

    summary = {}
    for key, rs in by_model_strategy.items():
        summary[key] = {
            "n_conditions": len(rs),
            "mean_cosine_similarity": float(np.mean([r["surface_diversity_cosine"]["mean"] for r in rs])),
            "p95_cosine_similarity": float(np.mean([r["surface_diversity_cosine"]["p95"] for r in rs])),
            "mean_4gram_overlap": float(np.mean([r["ngram_overlap_4gram"]["mean"] for r in rs])),
            "mean_construct_equivalence": float(np.mean([r["construct_equivalence_judge"]["score"] for r in rs if r["construct_equivalence_judge"]["score"] >= 0])),
            "flesch_std_across_variants_mean": float(np.mean([r["readability"]["flesch_std"] for r in rs])),
            "word_count_cv_mean": float(np.mean([r["readability"]["word_count_std"]/max(r["readability"]["word_count_mean"],1) for r in rs])),
        }

    out_summary = {
        "n_blueprints": len(blueprints),
        "n_variants_per_condition": N_VARIANTS,
        "models": list(MODELS.keys()),
        "strategies": STRATEGIES,
        "judge_model": JUDGE_MODEL,
        "n_total_conditions": len(results),
        "n_successful_conditions": sum(1 for r in results if r.get("n_variants", 0) >= 2),
        "by_model_strategy": summary,
    }

    # Primary metric: joint score = construct_equivalence * (1 - cosine_similarity)
    # Higher is better. Construct-equivalent AND surface-distinct.
    joint_scores = {}
    for key, s in summary.items():
        ce = s["mean_construct_equivalence"]
        diversity = 1.0 - s["mean_cosine_similarity"]
        joint_scores[key] = float(ce * diversity)
    out_summary["joint_score_by_model_strategy"] = joint_scores
    if joint_scores:
        best_key = max(joint_scores, key=joint_scores.get)
        out_summary["best_joint_score"] = joint_scores[best_key]
        out_summary["best_joint_score_condition"] = best_key
        out_summary["primary_metric"] = joint_scores[best_key]
    else:
        out_summary["primary_metric"] = 0.0

    with open(OUTPUT_DIR / "summary.json", "w") as out:
        json.dump(out_summary, out, indent=2)

    print("\n=== SUMMARY ===", flush=True)
    print(json.dumps(out_summary, indent=2), flush=True)


if __name__ == "__main__":
    main()
