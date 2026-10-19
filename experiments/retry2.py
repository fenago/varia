#!/usr/bin/env python3
"""Final retry of the 3 remaining failures with bigger token budget and looser parser."""
import json
import os
import re
import sys
import time
from pathlib import Path

EXPERIMENT_DIR = Path(__file__).parent
sys.path.insert(0, str(EXPERIMENT_DIR))
from run_extras import build_prompt, reference_prompt, score_variants, OUTPUT_DIR, N_VARIANTS
import requests

API_KEY = os.environ["OPENROUTER_API_KEY"]
BASE_URL = "https://openrouter.ai/api/v1"
HEADERS = {"Authorization": f"Bearer {API_KEY}", "Content-Type": "application/json"}

FAILED = [
    # (model_key, model_id, strategy, blueprint_id, max_tokens, retries)
    ("gemini_3_1_pro", "google/gemini-3.1-pro-preview", "dpcg", "B2_data_pipeline_bias", 12000),
    ("gemini_3_1_pro", "google/gemini-3.1-pro-preview", "dpcg", "B3_model_failure_comms", 12000),
    ("llama_3_2_3b_inst", "meta-llama/llama-3.2-3b-instruct", "reference", "B2_data_pipeline_bias", 4000),
]


def loose_extract(text: str) -> list:
    """Very lenient JSON-array extraction. Accepts nested objects in 'deliverable'."""
    if not text:
        return []
    text = text.strip()
    if "```" in text:
        m = re.search(r"```(?:json|JSON)?\s*\n?(.*?)\n?```", text, re.DOTALL)
        if m:
            text = m.group(1).strip()
    # Find first balanced [...]
    start = text.find("[")
    if start < 0:
        return []
    depth = 0
    for i in range(start, len(text)):
        if text[i] == "[":
            depth += 1
        elif text[i] == "]":
            depth -= 1
            if depth == 0:
                candidate = text[start:i+1]
                try:
                    data = json.loads(candidate)
                    if isinstance(data, list):
                        # Normalize: ensure each item has at least scenario as a string
                        out = []
                        for item in data:
                            if not isinstance(item, dict):
                                continue
                            scen = item.get("scenario", "")
                            deliv = item.get("deliverable", "")
                            if isinstance(scen, dict):
                                scen = json.dumps(scen)
                            if isinstance(deliv, dict):
                                deliv = json.dumps(deliv)
                            out.append({
                                "id": str(item.get("id", "")),
                                "scenario": str(scen),
                                "deliverable": str(deliv),
                            })
                        return out
                except json.JSONDecodeError:
                    return []
    return []


def call(model_id: str, prompt: str, max_tokens: int) -> str | None:
    body = {
        "model": model_id,
        "messages": [{"role": "user", "content": prompt}],
        "max_tokens": max_tokens,
        "temperature": 0.7,
    }
    for attempt in range(3):
        try:
            r = requests.post(f"{BASE_URL}/chat/completions", headers=HEADERS, json=body, timeout=300)
            r.raise_for_status()
            d = r.json()
            content = d.get("choices", [{}])[0].get("message", {}).get("content")
            if content:
                return content
        except Exception as e:
            print(f"      attempt {attempt} failed: {e}")
            time.sleep(2 ** attempt)
    return None


def main():
    with open(EXPERIMENT_DIR / "blueprints.json") as f:
        blueprints = {b["id"]: b for b in json.load(f)}
    with open(OUTPUT_DIR / "results_extras.json") as f:
        all_results = json.load(f)

    for model_key, model_id, strategy, blueprint_id, max_toks in FAILED:
        bp = blueprints[blueprint_id]
        print(f"\n→ {model_key} | {strategy} | {blueprint_id} (max_tokens={max_toks})", flush=True)
        prompt = (build_prompt(bp, strategy, N_VARIANTS) if strategy != "reference"
                  else reference_prompt(bp, N_VARIANTS))
        t0 = time.time()
        raw = call(model_id, prompt, max_toks)
        elapsed = time.time() - t0
        if not raw:
            print("    No content returned")
            continue
        variants = loose_extract(raw)
        print(f"    extracted {len(variants)} variants in {elapsed:.1f}s")
        if len(variants) < 2:
            print(f"    raw[:300]: {raw[:300]!r}")
            continue
        scored = score_variants(bp, variants)
        new_record = {
            "blueprint_id": blueprint_id,
            "model": model_key,
            "strategy": strategy,
            "generation_seconds": elapsed,
            **scored,
        }
        for i, r in enumerate(all_results):
            if (r.get("model") == model_key and r.get("strategy") == strategy
                    and r.get("blueprint_id") == blueprint_id):
                all_results[i] = new_record
                break
        else:
            all_results.append(new_record)
        with open(OUTPUT_DIR / "results_extras.json", "w") as out:
            json.dump(all_results, out, indent=2)
        print(f"    saved: cosine={scored['surface_diversity_cosine']['mean']:.3f}, "
              f"judge={scored['construct_equivalence_judge'].get('score',-1):.3f}")

    successful = sum(1 for r in all_results if r.get("n_variants", 0) >= 2)
    print(f"\nFinal: {successful}/{len(all_results)} successful")


if __name__ == "__main__":
    main()
