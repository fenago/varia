#!/usr/bin/env python3
"""
Variation-at-Scale Benchmark — extras runner.

Adds the conditions missing from the original run:
  Strategies (run on the 3 frontier models):
    - dpcg              (dimension-preserving constrained generation)
    - no_cmap_cot       (structured CoT WITHOUT construct-map step — ablation)
    - no_neg_fs         (few-shot WITHOUT negative anchors — ablation)
  Reference models (own row, zero-shot only):
    - gpt2_small        (local Hugging Face GPT-2 124M — format-failure floor)
    - llama_3_2_3b_inst (OpenRouter meta-llama/llama-3.2-3b-instruct — small open instruct floor)

Writes results to outputs/results_extras.json and a merged outputs/results.json.
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

FRONTIER_MODELS = {
    "claude_opus_4_7": "anthropic/claude-opus-4.7",
    "gpt_5_5": "openai/gpt-5.5",
    "gemini_3_1_pro": "google/gemini-3.1-pro-preview",
}

REFERENCE_MODELS = {
    "llama_3_2_3b_inst": "meta-llama/llama-3.2-3b-instruct",
}

JUDGE_MODEL = "anthropic/claude-sonnet-4.6"
NEW_STRATEGIES = ["dpcg", "no_cmap_cot", "no_neg_fs"]

N_VARIANTS = 10
EXPERIMENT_DIR = Path(__file__).parent
OUTPUT_DIR = EXPERIMENT_DIR / "outputs"
OUTPUT_DIR.mkdir(exist_ok=True)


def call_openrouter(model_id: str, prompt: str, max_tokens: int = 6000, retries: int = 2) -> str:
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
    raise RuntimeError(f"Model {model_id} failed: {last_err}")


def build_prompt(blueprint: dict, strategy: str, n: int) -> str:
    bp_summary = (
        f"Title: {blueprint['title']}\n"
        f"Competencies measured: {', '.join(blueprint['competencies'])}\n"
        f"Canonical solution outline: {blueprint['canonical_solution']}"
    )
    base = (
        f"Generate exactly {n} parallel variants of the assessment described below. Each variant must "
        f"measure the same competencies and be solvable using the same canonical reasoning, but use a "
        f"different surface context. Variants must be SEMANTICALLY EQUIVALENT on the competencies "
        f"measured but SURFACE-DISTINCT. Return the variants as a JSON array of objects with keys: "
        f"id, scenario, deliverable.\n\nAssessment blueprint:\n{bp_summary}"
    )

    if strategy == "dpcg":
        return (
            base
            + "\n\nUse a dimension-preserving constrained-generation procedure. Before drafting any "
            "variant, enumerate the surface dimensions you will vary across the set: "
            "(D1) industry/domain, (D2) jargon register, (D3) reading level, (D4) stakeholder role. "
            "Assign a different (D1,D2,D3,D4) combination to each variant so the set spans the "
            "dimension space. Hold these parity constraints constant across variants: target "
            "Flesch-Kincaid grade band 11-13, scenario length 80-140 words, exactly one quantified "
            "metric per scenario, exactly one specific deliverable per variant. Return ONLY the JSON "
            "array. No prose, no markdown fences."
        )

    if strategy == "no_cmap_cot":
        return (
            base
            + "\n\nUse a chain-of-thought generation procedure. Briefly think step-by-step about how "
            "to phrase each variant in a different surface context, then generate the variants. "
            "Do NOT explicitly decompose the construct, do NOT enumerate the competencies — just "
            "rewrite each variant with different surface details. Return ONLY the JSON array."
        )

    if strategy == "no_neg_fs":
        anchors = (
            '\n\nHere are two POSITIVE anchor variants showing the expected style (different surface, '
            'same competencies):\n'
            '[\n'
            '  {"id": "anchor_pos_1", "scenario": "A regional hospital chain deployed an AI triage tool. ED nurses report longer wait times for elderly patients despite the system flagging them as low-acuity. Audit and report to the Chief Medical Officer.", "deliverable": "Audit report + 3-page brief for non-clinical leadership"},\n'
            '  {"id": "anchor_pos_2", "scenario": "A logistics company deployed an AI route-optimization system. Drivers in two specific depots report systematically longer routes despite identical conditions. Audit and report to the COO.", "deliverable": "Findings memo + decision recommendation"}\n'
            ']\n'
            'Now generate the new variants in the same style. Return ONLY the JSON array.'
        )
        return base + anchors

    raise ValueError(strategy)


def reference_prompt(blueprint: dict, n: int) -> str:
    """Plain instruction prompt for reference (non-strategy-specific) baselines."""
    bp_summary = (
        f"Title: {blueprint['title']}\n"
        f"Competencies measured: {', '.join(blueprint['competencies'])}\n"
        f"Canonical solution outline: {blueprint['canonical_solution']}"
    )
    return (
        f"Generate {n} parallel variants of this assessment. Each variant should measure the same "
        f"underlying competencies but use a different surface context. Return as a JSON array with "
        f"keys: id, scenario, deliverable.\n\n{bp_summary}\n\nReturn ONLY the JSON array."
    )


def gpt2_generate_variants(blueprint: dict, n: int) -> list[dict]:
    """Run GPT-2 small locally via Hugging Face. GPT-2 is not instruction-tuned and not chat-formatted,
    so we use it as a prefix-prompted continuation model. Produces n separate generations.
    """
    from transformers import GPT2LMHeadModel, GPT2Tokenizer
    import torch

    device = "mps" if torch.backends.mps.is_available() else "cpu"
    tok = GPT2Tokenizer.from_pretrained("gpt2")
    tok.pad_token = tok.eos_token
    model = GPT2LMHeadModel.from_pretrained("gpt2").to(device)
    model.eval()

    prefix = (
        f"Assessment task ({blueprint['title']}): {blueprint['canonical_solution'][:200]}\n\n"
        f"New scenario variant: "
    )

    variants = []
    for i in range(n):
        inputs = tok(prefix, return_tensors="pt").to(device)
        with torch.no_grad():
            out = model.generate(
                **inputs,
                max_new_tokens=180,
                do_sample=True,
                top_p=0.95,
                temperature=0.9,
                pad_token_id=tok.eos_token_id,
            )
        text = tok.decode(out[0], skip_special_tokens=True)
        # Strip prefix
        scenario = text[len(prefix):].strip()
        # Clean up — take first paragraph
        scenario = scenario.split("\n\n")[0].strip()
        variants.append({
            "id": f"gpt2_v{i}",
            "scenario": scenario,
            "deliverable": "(unspecified)",
        })
    return variants


def extract_json_array(text: str) -> list:
    text = text.strip()
    if text.startswith("```"):
        text = re.sub(r"^```[a-zA-Z]*\n?", "", text)
        text = re.sub(r"\n?```$", "", text)
        text = text.strip()
    try:
        data = json.loads(text)
        if isinstance(data, list):
            return data
        if isinstance(data, dict) and "variants" in data:
            return data["variants"]
    except json.JSONDecodeError:
        pass
    m = re.search(r"\[\s*\{.*?\}\s*\]", text, re.DOTALL)
    if m:
        try:
            return json.loads(m.group(0))
        except json.JSONDecodeError:
            pass
    return []


def variant_text(v: dict) -> str:
    parts = [str(v[k]) for k in ("scenario", "deliverable") if k in v and v[k]]
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
        overlaps.append(len(ga & gb) / len(ga | gb))
    if not overlaps:
        return {"mean": 0.0, "p95": 0.0}
    return {"mean": float(np.mean(overlaps)), "p95": float(np.percentile(overlaps, 95))}


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
    sample = variants[:6]
    items = "\n\n".join(
        f"VARIANT {i+1}:\nScenario: {v.get('scenario','')}\nDeliverable: {v.get('deliverable','')}"
        for i, v in enumerate(sample)
    )
    judge_prompt = (
        "You are an assessment-design expert. Below is a blueprint defining the competencies an "
        "assessment must measure, and a set of LLM-generated variants of that assessment. Score how "
        "well the variants preserve CONSTRUCT EQUIVALENCE — i.e., whether they all measure the SAME "
        "underlying competencies at the SAME level of demand, despite differing surfaces.\n\n"
        "Score on a 0.0-1.0 scale where:\n"
        "  1.0 = variants are fully construct-equivalent\n"
        "  0.7 = mostly equivalent with minor drift\n"
        "  0.4 = mixed; some variants drift toward different competencies\n"
        "  0.0 = variants measure substantially different things\n\n"
        f"BLUEPRINT:\nTitle: {blueprint['title']}\nCompetencies: {blueprint['competencies']}\n"
        f"Canonical solution: {blueprint['canonical_solution']}\n\n"
        f"VARIANTS:\n{items}\n\n"
        'Respond as JSON: {"score": <float 0-1>, "rationale": "<2-3 sentence justification>"}. '
        "Return only the JSON. No prose, no fences."
    )
    text = call_openrouter(JUDGE_MODEL, judge_prompt, max_tokens=600)
    try:
        t = text.strip()
        if t.startswith("```"):
            t = re.sub(r"^```[a-zA-Z]*\n?", "", t)
            t = re.sub(r"\n?```$", "", t)
        obj = json.loads(t)
        return {"score": float(obj["score"]), "rationale": obj.get("rationale", "")}
    except Exception as e:
        return {"score": -1.0, "rationale": f"Judge parse failure: {e}; raw: {text[:200]}"}


def score_variants(blueprint: dict, variants: list[dict]) -> dict:
    texts = [variant_text(v) for v in variants if variant_text(v)]
    return {
        "n_variants": len(variants),
        "surface_diversity_cosine": pairwise_cosine_stats(texts),
        "ngram_overlap_4gram": ngram_overlap_stats(texts, 4),
        "readability": readability_stats(texts),
        "construct_equivalence_judge": (
            judge_construct_equivalence(blueprint, variants) if len(variants) >= 2
            else {"score": -1.0, "rationale": "fewer than 2 variants"}
        ),
        "variants_sample": variants[:3],
    }


def run_strategy_condition(blueprint: dict, model_key: str, model_id: str, strategy: str) -> dict:
    print(f"  → {model_key} | {strategy} | {blueprint['id']}", flush=True)
    prompt = build_prompt(blueprint, strategy, N_VARIANTS)
    t0 = time.time()
    try:
        raw = call_openrouter(model_id, prompt, max_tokens=6000)
    except Exception as e:
        return {"blueprint_id": blueprint["id"], "model": model_key, "strategy": strategy, "error": str(e), "n_variants": 0}
    elapsed = time.time() - t0
    variants = extract_json_array(raw)
    scored = score_variants(blueprint, variants)
    return {
        "blueprint_id": blueprint["id"],
        "model": model_key,
        "strategy": strategy,
        "generation_seconds": elapsed,
        **scored,
    }


def run_reference_openrouter(blueprint: dict, model_key: str, model_id: str) -> dict:
    print(f"  → {model_key} | reference | {blueprint['id']}", flush=True)
    prompt = reference_prompt(blueprint, N_VARIANTS)
    t0 = time.time()
    try:
        raw = call_openrouter(model_id, prompt, max_tokens=4000)
    except Exception as e:
        return {"blueprint_id": blueprint["id"], "model": model_key, "strategy": "reference", "error": str(e), "n_variants": 0}
    elapsed = time.time() - t0
    variants = extract_json_array(raw)
    scored = score_variants(blueprint, variants)
    return {
        "blueprint_id": blueprint["id"],
        "model": model_key,
        "strategy": "reference",
        "generation_seconds": elapsed,
        **scored,
    }


def run_gpt2_reference(blueprint: dict) -> dict:
    print(f"  → gpt2_small | reference | {blueprint['id']} (local HF)", flush=True)
    t0 = time.time()
    try:
        variants = gpt2_generate_variants(blueprint, N_VARIANTS)
    except Exception as e:
        return {"blueprint_id": blueprint["id"], "model": "gpt2_small", "strategy": "reference", "error": str(e), "n_variants": 0}
    elapsed = time.time() - t0
    scored = score_variants(blueprint, variants)
    return {
        "blueprint_id": blueprint["id"],
        "model": "gpt2_small",
        "strategy": "reference",
        "generation_seconds": elapsed,
        **scored,
    }


def main():
    with open(EXPERIMENT_DIR / "blueprints.json") as f:
        blueprints = [b for b in json.load(f) if not b.get("held_out")]  # pilot uses B1-B3 only

    print(f"Extras run: {len(blueprints)} blueprints × ({len(FRONTIER_MODELS)} frontier × {len(NEW_STRATEGIES)} new strategies + {len(REFERENCE_MODELS)} openrouter ref + 1 gpt2)", flush=True)

    results = []

    # 1) New strategies on frontier models
    for bp in blueprints:
        print(f"\n[strategies] Blueprint: {bp['id']}", flush=True)
        for model_key, model_id in FRONTIER_MODELS.items():
            for strategy in NEW_STRATEGIES:
                r = run_strategy_condition(bp, model_key, model_id, strategy)
                results.append(r)
                with open(OUTPUT_DIR / "results_extras.json", "w") as out:
                    json.dump(results, out, indent=2)

    # 2) OpenRouter reference (Llama 3.2 3B Instruct)
    for bp in blueprints:
        print(f"\n[reference openrouter] Blueprint: {bp['id']}", flush=True)
        for model_key, model_id in REFERENCE_MODELS.items():
            r = run_reference_openrouter(bp, model_key, model_id)
            results.append(r)
            with open(OUTPUT_DIR / "results_extras.json", "w") as out:
                json.dump(results, out, indent=2)

    # 3) GPT-2 small reference (local)
    for bp in blueprints:
        print(f"\n[reference gpt2] Blueprint: {bp['id']}", flush=True)
        r = run_gpt2_reference(bp)
        results.append(r)
        with open(OUTPUT_DIR / "results_extras.json", "w") as out:
            json.dump(results, out, indent=2)

    print("\nExtras run complete.", flush=True)
    print(f"  total new conditions: {len(results)}", flush=True)
    print(f"  successful: {sum(1 for r in results if r.get('n_variants', 0) >= 2)}", flush=True)


if __name__ == "__main__":
    main()
