#!/usr/bin/env python3
"""Retry the 4 conditions that failed JSON extraction in run_extras.py."""
import json
import os
import re
import sys
import time
from pathlib import Path

# Reuse run_extras helpers
EXPERIMENT_DIR = Path(__file__).parent
sys.path.insert(0, str(EXPERIMENT_DIR))
from run_extras import (
    build_prompt,
    reference_prompt,
    score_variants,
    call_openrouter,
    OUTPUT_DIR,
    N_VARIANTS,
)

FAILED = [
    ("gemini_3_1_pro", "google/gemini-3.1-pro-preview", "dpcg", "B2_data_pipeline_bias"),
    ("gemini_3_1_pro", "google/gemini-3.1-pro-preview", "dpcg", "B3_model_failure_comms"),
    ("llama_3_2_3b_inst", "meta-llama/llama-3.2-3b-instruct", "reference", "B1_ai_audit"),
    ("llama_3_2_3b_inst", "meta-llama/llama-3.2-3b-instruct", "reference", "B2_data_pipeline_bias"),
]


def lenient_extract_json_array(text: str) -> list:
    """Try harder to find a JSON array in the model output."""
    if not text:
        return []
    text = text.strip()
    # Strip fences
    if "```" in text:
        # Take content between first pair of triple-backticks
        m = re.search(r"```(?:json|JSON)?\s*\n?(.*?)\n?```", text, re.DOTALL)
        if m:
            text = m.group(1).strip()
    # Try direct parse
    try:
        d = json.loads(text)
        if isinstance(d, list):
            return d
        if isinstance(d, dict):
            for k in ("variants", "items", "data", "results"):
                if k in d and isinstance(d[k], list):
                    return d[k]
    except json.JSONDecodeError:
        pass
    # Find first JSON array via brace-matching
    start = text.find("[")
    if start >= 0:
        depth = 0
        for i in range(start, len(text)):
            if text[i] == "[":
                depth += 1
            elif text[i] == "]":
                depth -= 1
                if depth == 0:
                    candidate = text[start:i+1]
                    try:
                        d = json.loads(candidate)
                        if isinstance(d, list):
                            return d
                    except json.JSONDecodeError:
                        break
    # As last resort, regex-find {...} objects and wrap as a list
    objects = []
    obj_pattern = re.compile(r"\{[^{}]*?\}", re.DOTALL)
    for m in obj_pattern.finditer(text):
        try:
            o = json.loads(m.group(0))
            if isinstance(o, dict) and "scenario" in o:
                objects.append(o)
        except json.JSONDecodeError:
            continue
    return objects


def main():
    with open(EXPERIMENT_DIR / "blueprints.json") as f:
        blueprints = {b["id"]: b for b in json.load(f)}

    # Load existing results to update in place
    with open(OUTPUT_DIR / "results_extras.json") as f:
        all_results = json.load(f)

    print(f"Retrying {len(FAILED)} failed conditions with lenient JSON parser")

    for model_key, model_id, strategy, blueprint_id in FAILED:
        bp = blueprints[blueprint_id]
        print(f"  → {model_key} | {strategy} | {blueprint_id}", flush=True)
        if strategy == "reference":
            prompt = reference_prompt(bp, N_VARIANTS)
        else:
            prompt = build_prompt(bp, strategy, N_VARIANTS)
        t0 = time.time()
        try:
            raw = call_openrouter(model_id, prompt, max_tokens=6000)
        except Exception as e:
            print(f"    FAIL: {e}")
            continue
        elapsed = time.time() - t0
        variants = lenient_extract_json_array(raw)
        print(f"    extracted {len(variants)} variants in {elapsed:.1f}s; raw[:200]: {raw[:200]!r}")
        if len(variants) < 2:
            print(f"    still failed; keeping prior record")
            continue
        scored = score_variants(bp, variants)
        new_record = {
            "blueprint_id": blueprint_id,
            "model": model_key,
            "strategy": strategy,
            "generation_seconds": elapsed,
            **scored,
        }
        # Replace the failed record in all_results
        replaced = False
        for i, r in enumerate(all_results):
            if (r.get("model") == model_key and r.get("strategy") == strategy
                    and r.get("blueprint_id") == blueprint_id):
                all_results[i] = new_record
                replaced = True
                break
        if not replaced:
            all_results.append(new_record)
        with open(OUTPUT_DIR / "results_extras.json", "w") as out:
            json.dump(all_results, out, indent=2)
        print(f"    saved: cosine={scored['surface_diversity_cosine']['mean']:.3f}, "
              f"judge={scored['construct_equivalence_judge'].get('score',-1):.3f}")

    successful = sum(1 for r in all_results if r.get("n_variants", 0) >= 2)
    print(f"\nFinal: {successful}/{len(all_results)} successful")


if __name__ == "__main__":
    main()
