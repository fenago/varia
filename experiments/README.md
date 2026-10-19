# Code Package for VARIA: Benchmarking Frontier LLMs on Construct-Equivalent Assessment Variant Generation

This directory contains the exact pipeline that produced the results reported in the paper (Tables 2–4 and all figures). All frontier and Llama generation and all judging run through the OpenRouter API; the GPT-2 reference runs locally via Hugging Face `transformers`.

## Files

- `blueprints.json` — the three assessment blueprints (competencies, 4-criterion × 4-level analytic rubrics, canonical solution outlines).
- `run_experiment.py` — core frontier runs: 3 model families × {zero-shot, few-shot, structured CoT} × 3 blueprints (27 condition cells). Writes `outputs/results.json`.
- `run_extras.py` — extension runs: {DPCG, no-construct-map CoT, no-negative-anchors few-shot} × 3 model families × 3 blueprints, plus the Llama 3.2 3B Instruct and local GPT-2 small references (33 cells). Writes `outputs/results_extras.json`.
- `retry_failures.py`, `retry2.py` — re-run the four cells that initially failed JSON extraction (two Gemini DPCG cells, two Llama reference cells), with lenient array extraction.
- `merge_and_summarize.py` — merges the two result files (into `outputs/results_merged.json`, preserving the raw per-run files) and computes the per-condition metrics and joint scores in `outputs/summary.json`, which back every number in Tables 2–4. The joint-score definition used in the paper is the `joint_score()` function in this file.
- `regenerate_charts.py` — regenerates the paper figures from `outputs/summary.json`.
- `gap_analysis.py` — post-hoc robustness analyses on the pilot cells, no API needed: exact paired sign-flip permutation tests on the nine matched (model, blueprint) cells, cell-level bootstrap CIs, the frontier-reference tier-gap permutation test, threshold gating (Table 6), ranking sensitivity, and the embedding-based semantic-diversity check. Backs Tables 5–6 and the "Robustness and inferential checks" results. Writes `outputs/gap_analysis.json`.
- `run_followup.py` — the pre-registered follow-up harness (requires `OPENROUTER_API_KEY`): per-variant construct-equivalence scoring by a three-family judge panel (Anthropic/OpenAI/Google, median-aggregated), the machine side of the full P3 rubric-stability protocol (fixed adapter model produces variant-conditioned canonical solutions; judges apply the 4-criterion rubric blind), a TRUE negative-anchor few-shot arm (`few_shot_neg`), full-set embedding diversity, and multi-trial execution (default 3 independent draws). Resumable per cell.

`blueprints.json` includes a fourth, held-out blueprint (`B4_historical_argument`, marked `held_out`) from a deliberately distant discipline — a generalisation probe for the follow-up. The pilot scripts (`run_experiment.py`, `run_extras.py`) were run against the original three blueprints only.

## How to run

```
export OPENROUTER_API_KEY=...   # required for generation and judging
pip install -r requirements.txt
python run_experiment.py
python run_extras.py
python retry_failures.py        # only if any cells failed
python merge_and_summarize.py
python regenerate_charts.py
```

Notes: API decoding uses temperature 0.7 with provider-default top-p and is not seeded, so a re-run is a fresh draw from each generator's output distribution. The judge (`anthropic/claude-sonnet-4.6`) makes one set-level scoring call per condition cell over the first six variants of the set.
