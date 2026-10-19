#!/usr/bin/env python3
"""VARIA live demo — generate parallel assessment variants for any discipline.

Built for stage demos: pick a stored blueprint or name ANY topic in one line,
and the tool drafts the blueprint (competencies, 4x4 rubric, canonical
solution), generates N surface-distinct / construct-equivalent variants with
Claude Sonnet 5.5, prints them cleanly, and shows quick diversity and
difficulty-parity stats computed locally.

Usage:
  OPENROUTER_API_KEY=... python demo_variants.py --list
  python demo_variants.py --blueprint B1_ai_audit
  python demo_variants.py --preset prealgebra
  python demo_variants.py --topic "11th-grade chemistry: stoichiometry lab report" --n 5
  python demo_variants.py --preset student-teaching --save   # keep the drafted blueprint as a stored preset

Generated blueprints saved with --save are marked demo/held_out, so the
research pilot and follow-up scripts never pick them up.
"""
import argparse
import json
import os
import re
import sys
import time
from pathlib import Path

import numpy as np
import requests

from run_extras import (
    extract_json_array, variant_text, pairwise_cosine_stats,
    ngram_overlap_stats, readability_stats,
)

MODEL = "anthropic/claude-sonnet-5.5"  # demo generator (verified on OpenRouter)
BASE_URL = "https://openrouter.ai/api/v1"
EXPERIMENT_DIR = Path(__file__).parent

# One-line demo presets spanning disciplines; the model drafts the full
# blueprint from the line at demo time. Add your own freely.
PRESET_TOPICS = {
    "prealgebra": "8th-grade pre-algebra: translate a real-world situation into a two-step linear equation, solve it showing each step, and check the answer against the situation",
    "student-teaching": "teacher-education practicum: after an observed lesson, the student teacher writes a structured reflection connecting specific classroom moments to pedagogical choices, evidence of student learning, and a concrete plan for the next lesson",
    "nursing-handoff": "nursing program: compose an SBAR handoff for a patient whose condition changed during the shift, prioritizing what the oncoming nurse must know and act on",
    "cashflow-memo": "intro business course: read a small company's simple monthly figures and write a one-page memo to the owner recommending and justifying one cash-flow decision",
}


def call(prompt: str, max_tokens: int = 6000, retries: int = 2) -> str:
    key = os.environ.get("OPENROUTER_API_KEY")
    if not key:
        sys.exit("Set OPENROUTER_API_KEY to run the demo (generation is live).")
    headers = {"Authorization": f"Bearer {key}", "Content-Type": "application/json"}
    body = {"model": MODEL, "messages": [{"role": "user", "content": prompt}],
            "max_tokens": max_tokens, "temperature": 0.7}
    last = None
    for attempt in range(retries + 1):
        try:
            r = requests.post(f"{BASE_URL}/chat/completions", headers=headers, json=body, timeout=180)
            r.raise_for_status()
            return r.json()["choices"][0]["message"]["content"]
        except Exception as e:
            last = e
            if attempt < retries:
                time.sleep(2 ** attempt)
    raise SystemExit(f"Model call failed: {last}")


def parse_json_obj(text: str) -> dict:
    t = text.strip()
    if t.startswith("```"):
        t = re.sub(r"^```[a-zA-Z]*\n?", "", t)
        t = re.sub(r"\n?```$", "", t)
    try:
        return json.loads(t)
    except json.JSONDecodeError:
        m = re.search(r"\{.*\}", t, re.DOTALL)
        if not m:
            raise SystemExit("Could not parse blueprint JSON from model output.")
        return json.loads(m.group(0))


def draft_blueprint(topic: str) -> dict:
    prompt = (
        "You are an assessment designer. Draft an assessment blueprint for the course topic below, "
        "matching this exact JSON schema (no other keys, no prose):\n"
        '{"id": "<short_snake_case>", "title": "<short title>", '
        '"competencies": ["<4 competencies>"], '
        '"rubric": {"<each competency>": {"1_developing": "...", "2_approaching": "...", '
        '"3_meets": "...", "4_exceeds": "..."}}, '
        '"canonical_solution": "<numbered outline of the ideal response process>"}\n\n'
        "Requirements: open-response performance (not multiple choice); exactly 4 competencies; "
        "one rubric entry per competency with 4 concise level descriptors; the canonical solution "
        "is a 5-8 step outline. Audience and level must fit the topic.\n\n"
        f"TOPIC: {topic}\n\nReturn ONLY the JSON object."
    )
    bp = parse_json_obj(call(prompt, max_tokens=2500))
    for k in ("id", "title", "competencies", "rubric", "canonical_solution"):
        if k not in bp:
            raise SystemExit(f"Drafted blueprint missing key: {k}")
    return bp


def generate_variants(bp: dict, n: int) -> list:
    prompt = (
        f"Generate exactly {n} parallel variants of the assessment described below. Each variant must "
        f"measure the same competencies and be solvable using the same canonical reasoning, but use a "
        f"different surface context (different setting, specific scenario, and audience where sensible). "
        f"Variants must be SEMANTICALLY EQUIVALENT on the competencies measured but SURFACE-DISTINCT, "
        f"and matched in difficulty and reading level.\n"
        f'Return the variants as a JSON array of objects with keys: id, scenario, deliverable.\n\n'
        f"Assessment blueprint:\nTitle: {bp['title']}\n"
        f"Competencies measured: {', '.join(bp['competencies'])}\n"
        f"Canonical solution outline: {bp['canonical_solution']}\n\n"
        "Return ONLY the JSON array. No prose, no markdown fences."
    )
    variants = extract_json_array(call(prompt))
    if not variants:
        raise SystemExit("Could not parse a variant array from model output.")
    return variants[:n]


def show(bp: dict, variants: list):
    line = "=" * 72
    print(f"\n{line}\nBLUEPRINT: {bp['title']}\nCompetencies: {'; '.join(bp['competencies'])}\n{line}")
    for v in variants:
        print(f"\n[{v.get('id', '?')}]")
        print(f"  Scenario:    {v.get('scenario', '').strip()}")
        print(f"  Deliverable: {v.get('deliverable', '').strip()}")
    texts = [variant_text(v) for v in variants if variant_text(v)]
    cos = pairwise_cosine_stats(texts)
    ov = ngram_overlap_stats(texts, n=4)
    read = readability_stats(texts)
    print(f"\n{line}\nQuick checks (lower cosine/overlap = more surface-distinct; "
          f"lower Flesch sigma = tighter difficulty parity)")
    print(f"  pairwise TF-IDF cosine  mean {cos['mean']:.3f}   (pilot frontier band ~0.05-0.10)")
    print(f"  4-gram Jaccard overlap  mean {ov['mean']:.3f}   (pilot frontier band ~0.01-0.09)")
    print(f"  Flesch reading-ease sigma    {read['flesch_std']:.1f}    (pilot parity threshold 10)")
    print(line)


def save_blueprint(bp: dict):
    path = EXPERIMENT_DIR / "blueprints.json"
    bps = json.load(open(path))
    if any(b["id"] == bp["id"] for b in bps):
        print(f"(not saved: id '{bp['id']}' already exists)")
        return
    bp = dict(bp)
    bp["demo"] = True
    bp["held_out"] = True
    bp["note"] = "Demo preset drafted by demo_variants.py; excluded from pilot and follow-up runs."
    bps.append(bp)
    json.dump(bps, open(path, "w"), indent=1)
    print(f"Saved as stored preset: {bp['id']} (demo/held_out)")


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    g = ap.add_mutually_exclusive_group()
    g.add_argument("--blueprint", help="id of a stored blueprint (see --list)")
    g.add_argument("--preset", choices=sorted(PRESET_TOPICS), help="named demo topic")
    g.add_argument("--topic", help="free-text topic for any discipline or grade level")
    g.add_argument("--list", action="store_true", help="list stored blueprints and named presets")
    ap.add_argument("--n", type=int, default=5, help="variants to generate (default 5)")
    ap.add_argument("--save", action="store_true", help="store a drafted blueprint as a demo preset")
    args = ap.parse_args()

    stored = json.load(open(EXPERIMENT_DIR / "blueprints.json"))
    if args.list or not (args.blueprint or args.preset or args.topic):
        print("Stored blueprints:")
        for b in stored:
            tag = " [demo]" if b.get("demo") else (" [held-out]" if b.get("held_out") else "")
            print(f"  {b['id']}{tag} — {b['title']}")
        print("\nNamed demo presets (drafted live, add --save to store):")
        for k, v in PRESET_TOPICS.items():
            print(f"  --preset {k}: {v}")
        print('\nOr any field: --topic "your course and task in one line"')
        return

    if args.blueprint:
        matches = [b for b in stored if b["id"] == args.blueprint]
        if not matches:
            sys.exit(f"No stored blueprint '{args.blueprint}'. Use --list.")
        bp = matches[0]
    else:
        topic = PRESET_TOPICS[args.preset] if args.preset else args.topic
        print(f"Drafting blueprint with {MODEL} for: {topic}")
        bp = draft_blueprint(topic)
        if args.save:
            save_blueprint(bp)

    print(f"Generating {args.n} variants with {MODEL} ...")
    show(bp, generate_variants(bp, args.n))


if __name__ == "__main__":
    main()
