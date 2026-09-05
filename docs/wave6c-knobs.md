# Wave 6C knob inventory: paper levers vs. app settings

Analysis only, no code changes. Paper line references are to `mockups/varia_paper.txt`. Where the paper and the author's plain-English walkthrough in `src/shared/research.ts` disagree, both are quoted.

Three findings shape everything below.

- **The paper states no threshold values.** §3.1 (line 187) says thresholds are "application-specific and pre-registered". The app's 0.15 / 0.90 / 8.0 are the app's own choices. Their only empirical anchor is Table 3 (lines 423–440).
- **The app's J is not the pilot's J.** The paper formula (line 189) has a P3 term. The walkthrough (`research.ts:91, 94`) says the pilot's J actually used 4-gram overlap in the P3 slot, so surface diversity was double-weighted. The app uses the paper formula with the P3 readability proxy (`src/lib/metrics/report.ts:190-204`). The 0.81–0.88 frontier band shown next to J (`thresholds.ts:15`) was computed the pilot's way, so the comparison is loose. The σ ceiling of 45 (`thresholds.ts:109`) is an app choice the paper never states.
- **The app's judge is the paper's formal design, not the pilot as run.** Paper §3.4 (lines 252–253): five-point Likert per construct dimension, five self-consistency samples, median. Walkthrough (`research.ts:133, 215`): one holistic call, 0/0.4/0.7/1.0 anchors, first six variants only. The app follows the paper (`src/lib/llm/prompts/judge.ts:12-17`, `report.ts:50-65`). Keep it that way.

Surface vocabulary used in the table:

- **Institution** = the Compliance console thresholds table, versioned, audited.
- **Per-run** = the Generate page run card.
- **Advanced** = a collapsed "Advanced" panel on Generate (or Settings where noted).
- **Not a knob** = keep fixed, with the reason in the notes.

"Invalidates released?" follows the paper's pre-registration rule: a changed institution knob creates a new version, released sets keep the version they were cleared under, and nothing is retroactively re-cleared or un-cleared. "Future runs" means the knob only affects runs started after the change.

## Summary table

| # | Knob | Paper basis | App today | Recommended default | Range | Surface | Invalidates released? |
|---|---|---|---|---|---|---|---|
| 1 | τdiv (P1 mean cosine ≤) | §3.1 line 187: pre-registered, no value; Table 3 frontier 0.048–0.095 | 0.15, `src/shared/thresholds.ts:8`; editable on Console | 0.15 | 0.05–0.30 | Institution | Versioned; never re-clears (already so) |
| 2 | τeq (P2 equivalence ≥) | as above; Table 3 frontier 0.816–0.968 | 0.90, `thresholds.ts:9`; editable on Console | 0.90 | 0.70–0.98 | Institution | Versioned |
| 3 | τstab / P3 status | §3.4 lines 253–257: proxy only, full protocol deferred; §7 lines 567–571 | advisory, `thresholds.ts:10`, `report.ts:171`; not editable | advisory, not editable | n/a | Not a knob | n/a |
| 4 | τdiff (P4 σ Flesch ≤) | as 1; Table 3 ZS/CoT 5.5–6.7, DP/FS 10.4–11.3 | 8.0 (v2, `thresholds.ts:11`); v1 was 10.0 (`seed.ts:695`); editable on Console | 8.0, see note | 4–15 | Institution | Versioned |
| 5 | Joint weights w1..w4 | line 190: equal, "headline configuration"; line 264: equal weights alongside component tables | 0.25 each, `thresholds.ts:106` | 0.25 each | fixed | Not a knob | n/a |
| 6 | σ normalisation ceilings | not in paper (Table 1 silent) | 45 / 45, `thresholds.ts:109`; used `report.ts:196-197` | 45 | fixed | Not a knob | n/a |
| 7 | Diversity metric | §3.4 line 249: all-mpnet-base-v2 embedding; §4.5 line 355: TF-IDF n-gram cosine as run; walkthrough: stop words removed | TF-IDF unigram+bigram, no stop-word removal, `src/lib/metrics/cosine.ts:8-13` | TF-IDF uni+bigram, stop words removed | fixed (embedding: future) | Not a knob | Metric change = new threshold version |
| 8 | n-gram size for overlap | line 240, Table 1 line 322: 4-gram | 4, `src/lib/metrics/ngram.ts:33` | 4 | fixed | Not a knob | n/a |
| 9 | Judge model | §4.2 line 306: Sonnet 4.6 held fixed across conditions | Sonnet 5 default, `src/shared/models.ts:167`; select on Generate and Settings | Sonnet 5 | judge catalog | Per-run | Future runs |
| 10 | Judge samples | Table 1 line 320: 5 | 5 default `settings.ts:26`; store clamps 1–9 `settings.ts:123`; Settings UI clamps 3–7 `Settings.tsx:247-254`; shown read-only on Generate `Generate.tsx:250` | 5 | 3–9, odd preferred | Per-run (move to Generate) | Future runs |
| 11 | Judge aggregation | line 253, 307: median | median per dimension, mean across dimensions, `report.ts:50-65` | median | median only | Not a knob | n/a |
| 12 | Judge scale | line 252: five-point Likert per construct-map dimension | 1–5, normalised (x−1)/4, `judge.ts:12-17`, `report.ts:64` | Likert 1–5 | fixed | Not a knob | A scale change would redefine τeq |
| 13 | Variants the judge sees | formal §3.3 line 243: each variant scored; walkthrough: first six, holistic | one variant per call, `judge.ts:7-8` | one | fixed | Not a knob | n/a |
| 14 | Judge family independence | §4.2 lines 308–310 and §7 lines 572–574 flag intra-family coupling | every catalog model is Claude; no check | warn when judge id equals generator id; footer states vendor overlap | n/a | Advanced (warning) | n/a |
| 15 | Prompting strategy | §3.3; §6 lines 533–548 protocol | threat radio → `THREAT_TO_STRATEGY` `thresholds.ts:76-79`; manual picker `Generate.tsx:150-160` | high-stakes → structured-cot | four strategies | Per-run | Future runs |
| 16 | N per run | §4.1 line 283: N = 10 per cell; {10, 35, 100} pre-registered | roster size or 10, clamp 2–200, `Generate.tsx:62, 238-241` | roster size | 2–200 | Per-run | n/a |
| 17 | Temperature / top-p | Table 1 line 317: 0.9 / 0.95; judge 0.7 (line 320); walkthrough says 0.7 | never sent, `src/lib/llm/shape.ts:51-55`; 5-family models reject them (`models.ts` supportsSampling) | omit | n/a | Not a knob | n/a |
| 18 | Effort (thinking depth) | not in paper | high for generate, low for judge, `shape.ts:47-49` | as is | low–max | Advanced (optional) | Future runs |
| 19 | Max tokens | Table 1 line 317: 1024; walkthrough: 6000 | 16000 generation, 4000 judge, `src/lib/llm/live.ts:45, 47` | as is | fixed | Not a knob | n/a |
| 20 | Seed / trials | Table 1 lines 330–331: seed 42, 1 trial | no seed (API has none); no repeat-run facility | record "trials 1" on the run | n/a | Not a knob | n/a |
| 21 | Concurrency | not in paper (§4.5 "embarrassingly parallel") | 3 generation / 4 judge, `src/lib/store/orchestrator.ts:44-45`; judge limit also in `live.ts` | 3 / 4 | 1–8 each | Advanced | n/a |
| 22 | Few-shot anchor counts | §3.3 lines 218–220: 2 positive, 2 negative | 2 + 2 hard-coded; `live.ts:329-331` slices to 2 and throws below 2; `anchors.ts:59-61` | 2 + 2 | 1–3 each | Advanced | Future runs |
| 23 | Negative anchors on/off | θ−FS ablation, line 221; Table 3: equivalence −0.022, J +0.001 | always on, `src/lib/llm/prompts/strategies.ts:66-93` | on | on / off | Advanced | Future runs |
| 24 | Construct-map step on/off | θ−SC ablation, lines 225–226; Table 3: equivalence −0.010, J +0.001 | always on, `strategies.ts:95-115` | on | on / off | Advanced | Future runs |
| 25 | Surface dimensions varied | §3.3 lines 227–229: domain, jargon register, reading level, stakeholder role | per-blueprint toggles on Generate, `Generate.tsx:84-91, 163-197`; assignment tuples `orchestrator.ts:52-71` | all unlocked dims on | per blueprint | Per-run | Future runs |
| 26 | Readability band (dimension-preserving) | line 229: "constraining ϕ to a tight band" | prompt quotes the set-level τdiff only, `strategies.ts:121` | ±5 Flesch points around the original task | ±3 to ±15 | Advanced | Future runs |
| 27 | Step-count lock | P4 forbids varying (§3.1 lines 196–198) | locked dimension, `seed.ts:193-194`; prompt quotes the count, `strategies.ts:122` | locked | fixed | Not a knob | n/a |
| 28 | Outlier σ multiplier | not in paper (app rule, CLAUDE.md line 236) | 1.0σ below mean, `report.ts:87` | 1.0 | 0.5–2.0 | Advanced | Future runs |
| 29 | Minimum outliers named | not in paper (app rule) | at least the three hardest, `report.ts:90` | 3 | 1–5 | Advanced | Future runs |
| 30 | Regenerate vs loosen jargon; regeneration rounds | not in paper; note text `report.ts:130` | regenerate only; `regenerateAndRelease` auto-releases over threshold with a canned reason, `src/lib/store/workspace.ts:469` | offer both; 1 round; never auto-release | 0–3 rounds | Per-run | n/a |
| 31 | Release gate | §3.4 lines 264–266: all four satisfied individually, J is context | P1, P2, P4 gate individually; P3 advisory; `report.ts:266` | as is | fixed | Not a knob | n/a |
| 32 | Over-threshold release | not in paper (app policy from the mockup) | allowed with a typed reason, `Report.tsx:283-295, 305-315`; audited | allowed, reason required | allowed / blocked | Institution | n/a |
| 33 | Generator model | §6 lines 546–548: "which frontier model and prompt" | Opus 5 default, `models.ts:94`; select on Generate and Settings | Opus 5 | generator catalog | Per-run | Future runs |
| 34 | Validate the model + prompt pair | walkthrough `research.ts:180`: Table 4 cells 0.704 (Opus 4.7, DP) to 0.900 (Gemini, CoT); not in the text extract or `pilot.ts` | nothing | warning text; per-model table when sourced | n/a | Advanced (information) | n/a |

## Notes per knob

**1, 2, 4. Thresholds τdiv, τeq, τdiff.** The Console already versions them (`workspace.ts:593-607`), records an audit event, never re-scores released runs (`Console.tsx:270`), and every report stores the version it was scored under (`types.ts:212`). Two additions. First, the three numbers are injected into every generation prompt (`src/lib/llm/prompts/shared.ts:4-11`), so a threshold edit silently changes prompts as well as gates; the audit event should say so. Second, τdiff 8.0 sits below the pilot mean for dimension-preserving (11.29) and few-shot (10.73). The copy-at-scale radio recommends dimension-preserving and says "difficulty drift accepted" (`thresholds.ts:96`), but the 8.0 gate will fail most such runs and push the instructor into the over-threshold path. Either keep 8.0 and make the radio text honest about that, or let the Console hold a second threshold set per threat profile. Recommendation: honest text now, per-profile set later. Ranges: τdiv 0.05–0.30 (below 0.05 is under the pilot's best; above 0.30 approaches the Llama near-duplicate regime at 0.51), τeq 0.70–0.98 (0.97 is the Likert ceiling the paper flags at lines 465–468), τdiff 4–15.

**3. P3 status.** Keep advisory and uneditable. The paper defers the real protocol (variant-conditioned canonical solutions, blind rubric application, human panel). Promoting P3 to a gate is a threshold version bump when it happens, and the proxy σ Flesch of adapted solutions should never gate.

**5, 6. Weights and ceilings.** J is never the gate, so weights only move a display number. Exposing them breaks the one comparison that number supports (the frontier band). Leave both fixed. Label the frontier band on the Report as approximate and note in the J tooltip that the pilot's J used 4-gram overlap where the app uses the P3 proxy.

**7, 8. Diversity metric.** The paper names embedding cosine as primary (line 249, rationale lines 260–263) but the pilot ran TF-IDF n-gram cosine (line 355), which the app matches. The author says stop words were removed; the app does not remove them, which inflates cosine between variants that share only function words and rubric boilerplate. Add stop-word removal and stamp the metric definition into the threshold version so a future embedding option cannot be compared against old reports. There is no embedding model in the browser today, so embedding stays future. n-gram size stays 4; the overlap metric is secondary and not gated.

**9 to 14. Judge design.** Keep the formal design: per-variant, per-dimension Likert, median per dimension, mean across dimensions. Move the sample count onto the Generate run card next to the judge select (it is displayed there but edited only on Settings), unify the clamp to 3–9 (store and UI disagree today), and prefer odd counts so the median is a single sample. Judge temperature 0.7 cannot be sent to 5-family models; self-consistency relies on the model's default sampling, which is still stochastic. All catalog models are Claude, so the paper's cross-family judge panel is impossible inside this architecture. The useful check is judge id different from generator id, plus a sentence in the Report verification footer stating the vendor overlap the paper flags in §7.

**15, 16, 33. Strategy, N, generator.** Already per-run. The pre-registered N regimes are a benchmark matter, not a product knob; the product's N is the roster. Add the paper's caveat to the manual strategy picker: each step lower on cosine costs roughly an equal step on construct equivalence within the frontier band (lines 544–545).

**17 to 21. Decoding and runtime.** Temperature, top-p, max tokens and seed are not knobs. The 5-family models reject sampling parameters (only Opus 4.6, Sonnet 4.6 and Haiku 4.5 accept them, `models.ts:151, 187, 205`), structured output needs the 16000-token headroom (a cut-off is a hard error, `live.ts:124-125`), and the API has no seed. Effort is the only decoding lever the app has and can sit in Advanced. Concurrency belongs in Advanced with a note that rate limits, not the paper, bound it.

**22 to 24. Strategy-specific.** The two ablations are the paper's own experiments and cost nothing to expose as toggles on the Advanced panel. Defaults on, since the paper's headline strategies include them, and the paper reads both ablations as at the instrument's resolution limit rather than as evidence the components are useless (lines 511–517). Anchor counts are hard-coded at two each and the live provider throws below two, so a range needs `FewShotAnchorsSchema` and the guard loosened together.

**25 to 27. Dimension-preserving.** Which dimensions vary is already per-run and per-blueprint. The paper's four surface dimensions map onto the demo blueprint's domain, jargon, stakeholder and locked reading level (`seed.ts:186-196`). A readability band in Flesch points around the original task is more actionable in a prompt than the set-level σ the prompt quotes today, because a single variant cannot reason about a set statistic. Step-count lock stays fixed; the prompt already quotes the canonical count.

**28 to 30. Outliers and regeneration.** The 1.0σ rule and the minimum of three are app conventions from the mockup, not the paper, and are safe Advanced knobs. The real problem is `regenerateAndRelease`: after one regeneration round it releases even when the set still fails, with a canned reason and no user input (`workspace.ts:469`). That contradicts the "needs a reason" policy on the same page. Change it to regenerate, re-score and stop; the instructor then releases clean or types a reason. "Loosen the jargon register" in the P4 note has no button; wire it to disabling the jargon dimension and regenerating the named versions.

**31, 32. Release policy.** All-four gating matches the paper's statement that the application requires each property individually. Over-threshold release with a recorded reason is an institution policy, so an allow/block switch belongs on the Console beside the thresholds, versioned like them.

**34. Model-pair validation.** The walkthrough cites a Table 4 with per-model cells from 0.704 to 0.900 that is absent from the text extract and from `pilot.ts`. Until the numbers are sourced from the PDF, show the warning sentence on the Generate page and list which model pairs the recorded fixtures have exercised.

**Measured by the paper but not surfaced by the app.**

- 4-gram overlap per set: computed and stored (`report.ts:212`, `types.ts:214`) but the Report never shows it; only the pilot's values appear on the Surface page. Show it as the secondary number under P1.
- Lexical complexity (type-token ratio) and solution step count: stored per variant (`types.ts:154-161`) but shown nowhere, not even in the CSV (`Report.tsx:60`). Add both to the CSV and the per-variant view.
- Step-count mismatch against the canonical solution: cheap, already computed, and the closest thing to a real P3 signal the app can offer. Flag it as advisory.
- Judge rationales: stored per sample, never displayed. Show on the variant detail.
- F = 1 − J: stored; no need to surface.
- Per-model J table: see 34.

## Recommended 6C build list

1. Fix `regenerateAndRelease` so it never auto-releases a still-failing set; the instructor releases clean or types a reason.
2. Add stop-word removal to TF-IDF cosine and stamp a metric-definition version alongside the threshold version.
3. Move judge samples onto the Generate run card, clamp 3–9 everywhere, and warn when judge id equals generator id.
4. Add a collapsed Advanced panel on Generate with negative-anchors, construct-map, readability band, concurrency, and the outlier rule (σ multiplier, minimum named).
5. Show 4-gram overlap under P1 on the Report and add lexical complexity, step count and judge rationale to the CSV and variant detail.
6. Flag step-count mismatch against the canonical solution as an advisory P3 signal.
7. Make the copy-at-scale radio text honest that τdiff 8.0 will usually fail dimension-preserving sets, and add an over-threshold allow/block switch to the Console.
8. Wire "loosen the jargon register" to disable the jargon dimension and regenerate the named versions.
9. Label the frontier band on the Report as an approximate comparison and note the P3-versus-4-gram difference in the J tooltip.
10. Add the paper's model-pair warning to Generate and, once sourced from the PDF, the per-model J table to `pilot.ts` and the Surface page.
