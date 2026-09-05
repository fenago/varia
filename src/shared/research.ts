/**
 * Research grounding: the paper, section by section, in plain English.
 * Written by Dr. Ernesto Lee. Rendered verbatim by the Research page.
 */

export interface ResearchSection {
  id: string;
  level: 2 | 3;
  title: string;
  /** Each paragraph is an array of lines; multi-line paragraphs render as a compact list. */
  paras: string[][];
}

export const RESEARCH_INTRO = {
  kicker: "Research grounding",
  title: "VARIA in plain English: a walkthrough of the paper",
  lede: "Here is the whole paper, section by section, in plain English. Written by the author.",
};

export const RESEARCH_SECTIONS: ResearchSection[] = [
  {
    "id": "abstract-the-one-paragraph-pitch",
    "level": 2,
    "title": "Abstract — the one-paragraph pitch",
    "paras": [
      [
        "If schools are going to let AI write a different version of the test for every student, those versions have to be different on the outside but identical on the inside. Nobody had checked whether today's best models can actually do that. VARIA is my instrument for checking. I tested three frontier models (Claude Opus 4.7, GPT-5.5, Gemini 3.1 Pro) with four prompting styles on three real assessment tasks, plus two weak models as a floor. Headline: the frontier models all land in a tight band (roughly 0.81 to 0.88 on a 0-to-1 integrity score), the weak models collapse to about 0.50, and within the frontier band the prompting style you choose is a trade-off dial, not a \"best\" setting."
      ]
    ]
  },
  {
    "id": "1-introduction-why-this-matters-and-what",
    "level": 2,
    "title": "1. Introduction — why this matters and what's missing",
    "paras": [
      [
        "Generative AI has broken the old assumption that what a student writes during an exam reflects what they know. The traditional fix is more surveillance: proctoring, lockdown browsers, cameras. The \"authentic assessment\" crowd proposes a different fix: redesign the test so copying is pointless, by giving every student a unique version of the same underlying task. That framework (AIAA) explicitly hands variant generation to LLMs."
      ],
      [
        "My critique: the whole no-surveillance promise rests on an assumption nobody has tested. If LLMs can't produce variants that are truly different yet truly equivalent, \"variation at scale\" is a fig leaf. I then walk through why the existing literatures don't answer the question: psychometric item generation works on multiple-choice with answer keys and dodges the rubric problem; LLM benchmarks test models as problem-solvers, not problem-authors; LLM-as-judge work has scoring tools but no equivalence protocols; paraphrase research maximizes variety without protecting an underlying skill."
      ],
      [
        "I close with my three contributions: a falsifiable formalization of the claim as four measurable properties, the released benchmark itself, and the pilot results showing a 25-to-31-point gap between frontier and non-frontier models."
      ]
    ]
  },
  {
    "id": "2-related-work-the-three-neighborhoods-t",
    "level": 2,
    "title": "2. Related Work — the three neighborhoods this paper sits between",
    "paras": [
      [
        "2.1, automatic item generation: classical psychometrics builds item \"families\" from templates where the stable content (radicals) and the swappable details (incidentals) are separated by construction. That works for closed-form questions. Parallel-forms equating and IRT can verify two test forms are equivalent after the fact. Rubric-reliability research exists but assumes a fixed task. Nobody has asked whether one rubric stays valid across LLM-generated surface variations, which is exactly my P3."
      ],
      [
        "2.2, LLMs in education: lots of work on LLMs taking exams, tutoring, and pedagogical knowledge. Less on LLMs writing assessments. Existing evaluation surveys treat the model as the student, not the teacher. My inverse question is the gap."
      ],
      [
        "2.3, diversity and controlled generation: NLP has long known that pushing for surface variety tends to erode meaning (the hallucination and faithfulness literature). Few-shot and chain-of-thought prompting are the standard levers. VARIA inherits that tension but raises the bar: the thing to preserve isn't a single reference sentence, it's an abstract competency defined by a rubric and model answer, while also spreading on surface, holding difficulty, and staying gradable."
      ]
    ]
  },
  {
    "id": "3-the-varia-benchmark-the-design",
    "level": 2,
    "title": "3. The VARIA Benchmark — the design",
    "paras": [
      [
        "Section 3 is where the paper stops arguing and starts building. It has four parts."
      ]
    ]
  },
  {
    "id": "3-1-problem-formulation-what-exactly-am-",
    "level": 3,
    "title": "3.1 Problem Formulation — \"What exactly am I claiming, and how would I know if it's false?\"",
    "paras": [
      [
        "I start by defining an assessment \"blueprint\" as three things bundled together: the skill I'm trying to measure (the construct), the rubric I grade with, and an expert's model answer. A \"variant generator\" is anything (here, an LLM with a particular prompt) that takes that blueprint and spits out N different versions of the task."
      ],
      [
        "The whole AIAA idea rests on one bet: that an LLM can produce a set of variants that pass four tests at once."
      ],
      [
        "P1, surface diversity: no two variants look too much alike (measured by word-overlap similarity).",
        "P2, construct equivalence: every variant still tests the same skill (judged by an LLM acting as a grader).",
        "P3, rubric stability: the same rubric gives consistent scores across variants.",
        "P4, difficulty parity: reading level and length don't drift between variants."
      ],
      [
        "I then combine these into a single \"joint integrity score,\" J, which averages four pieces with equal weights: how different the variants are by word similarity, how construct-equivalent the judge says they are, how different they are by 4-word-phrase overlap, and how stable the reading level is. The \"failure\" number in my tables is just 1 minus J, so lower is better."
      ],
      [
        "Two honest caveats I flag here: the pilot doesn't actually set pass/fail thresholds (it reports the continuous score instead), and P3 (rubric stability) isn't in the score at all yet, so surface diversity effectively gets double weight. P3 is pushed to the pre-registered follow-up."
      ],
      [
        "The key intellectual point of this subsection is that these four properties fight each other. The easiest way to make two versions look different is to change the vocabulary and register, but that is exactly what shifts the difficulty (P4) and can quietly change what's being tested (P2). So the benchmark's job isn't to find a perfect score, it's to map the trade-off curve and see which prompting approach gets closest to \"good on everything.\""
      ]
    ]
  },
  {
    "id": "3-2-assessment-blueprints-what-tasks-am-",
    "level": 3,
    "title": "3.2 Assessment Blueprints — \"What tasks am I testing this on?\"",
    "paras": [
      [
        "Three open-ended performance tasks from AI and analytics courses, chosen deliberately because they can't be solved with a one-word answer, which is what makes rubric consistency hard. B1 is auditing a real deployed AI system for technical quality and ethical risk. B2 is investigating bias introduced by a data pipeline, picking the right statistical method and finding the root cause. B3 is handling a production model failure and explaining it to non-technical stakeholders. Each comes with a competency list, a four-criterion, four-level rubric, and an expert model answer, all shipped in the code release."
      ]
    ]
  },
  {
    "id": "3-3-prompting-strategies-what-are-the-fo",
    "level": 3,
    "title": "3.3 Prompting Strategies — \"What are the four ways I ask the model to do it?\"",
    "paras": [
      [
        "Zero-shot: hand it the blueprint, tell it \"make these different on the surface but equivalent underneath,\" give no examples.",
        "Few-shot: same, plus two human-written example variants showing what good looks like. (Caveat I flag: the plan called for a version with \"bad\" examples too, but in the actual pilot both few-shot arms ran with good examples only, so that comparison is really just a check on prompt wording, not a true negative-example test.)",
        "Structured chain-of-thought: tell the model to first think through what must stay fixed (the skill), what's free to change (the surface), and what difficulty anchors to hold, then generate. An ablation removes the \"what must stay fixed\" step to see if that's the ingredient doing the work.",
        "Dimension-preserving constrained generation: the most controlled approach. Give the model explicit dials for domain, jargon level, reading level, and stakeholder role, assign each variant a different setting, and constrain difficulty to a narrow band."
      ],
      [
        "The subsection ends with the pipeline: generate the variants, compute word-similarity across every pair, send the first six variants to an LLM judge for one construct-equivalence score, and pull reading-ease and length stats from each. Cells run in parallel and API generation is the main cost."
      ]
    ]
  },
  {
    "id": "3-4-metrics-how-exactly-is-each-property",
    "level": 3,
    "title": "3.4 Metrics — \"How exactly is each property measured, and why those choices?\"",
    "paras": [
      [
        "Diversity: TF-IDF cosine similarity (with stop words removed) plus 4-gram overlap, two lenses on word-level paraphrase. Equivalence: one LLM-judge call per condition, scoring 0 to 1 with anchors at 1.0 (identical construct), 0.7 (minor drift), 0.4 (mixed), 0.0 (different skill). Rubric stability: not measured in the pilot. Difficulty: standard deviation of Flesch reading-ease, backed by word-count spread."
      ],
      [
        "I then defend three choices. TF-IDF over raw overlap because it discounts the rubric boilerplate (\"stakeholder,\" \"false positive rate\") that every legitimate variant will share, while still catching recycled scenarios, though I concede a deep paraphrase of the same scenario could slip past a purely lexical metric. One LLM judge instead of human raters as a cost trade-off, with validity threats deferred to Section 7. And equal weights reported alongside the component tables, because the real-world use case needs all four properties satisfied individually, not just a good average."
      ],
      [
        "The one-sentence version: Section 3 turns a hopeful assumption (\"AI can make fair personalized test versions\") into four measurable properties, three concrete tasks, four ways of prompting, and a scoring formula, while being upfront that one of the four properties isn't measured yet."
      ]
    ]
  },
  {
    "id": "4-experiments-the-exact-setup",
    "level": 2,
    "title": "4. Experiments — the exact setup",
    "paras": [
      [
        "4.1 Conditions: six prompting conditions (the four strategies plus two ablations) crossed with three blueprints and three frontier models, plus Llama 3.2 3B Instruct via OpenRouter as a \"small but instruction-tuned\" floor and GPT-2 small run locally as a \"deep\" floor. Ten variants per cell, 60 cells, 600 variants. Run once, at fixed temperature; the three blueprints serve as my replication axis. Larger N (35, 100) is pre-registered but not run."
      ],
      [
        "4.2 Baselines: GPT-2 is there to prove the metrics catch pure paraphrase without meaning. Llama 3B is there to separate \"can follow the format\" from \"can actually do the job.\" The frontier models were accessed through OpenRouter; the judge is Claude Sonnet 4.6, held constant. I flag openly that the judge shares a family with one of the generators."
      ],
      [
        "4.3 Hyperparameters: temperature 0.7 for API models and judge, nucleus sampling for GPT-2, max 6000 tokens, equal weights on J, no fixed seed (provider-side sampling), one trial, Apple M4 Max for local work."
      ],
      [
        "4.4 Statistical protocol: because it's a single unseeded trial with three blueprints, I deliberately report no p-values. Differences are descriptive gaps between point estimates. The proper mixed-effects model is deferred to the follow-up."
      ],
      [
        "4.5 Runtime: 54 API conditions in about 50 minutes, GPT-2 in about two minutes locally, metric computation under a minute. Generation, not judging, dominates cost."
      ]
    ]
  },
  {
    "id": "5-results-what-came-out",
    "level": 2,
    "title": "5. Results — what came out",
    "paras": [
      [
        "Three claims the data support."
      ],
      [
        "First, the tier gap. Frontier strategies and ablations all sit in J from 0.806 to 0.877. Structured CoT (0.876) and its no-construct-map ablation (0.877) tie at the top, zero-shot right behind (0.867). Dimension-preserving (0.819), few-shot (0.806), and the few-shot ablation (0.807) form the lower frontier cluster. Then the cliff: Llama 3B at 0.552, GPT-2 at 0.497."
      ],
      [
        "Second, the trade-off. Table 3 shows why. Dimension-preserving and the few-shot ablation get the lowest cosine (most surface-diverse, around 0.05) but the widest reading-level spread (Flesch σ around 10 to 11). They buy diversity by varying exactly what P4 forbids. Zero-shot and structured CoT get the highest construct equivalence (0.968 and 0.960) and the tightest reading-level spread (5.5 to 6.7), at the cost of a bit less diversity. Few-shot is the extreme case: very diverse, but the judge marks equivalence down to 0.838. The two weak models fail in different, diagnosable ways. Llama repeats itself (cosine 0.513, ten times the frontier level), so it follows the format but fails diversity. GPT-2 has near-zero construct equivalence (0.040) and a reading-level spread of 44.9, which is grade school to grad school inside one variant set. Its zero 4-gram overlap isn't diversity, it's incoherence."
      ],
      [
        "Third, the model-by-prompt interaction. Table 4 breaks J down by model and shows the tidy strategy averages hide a lot: individual cells range from 0.704 (Claude Opus under dimension-preserving, driven by a reading-level spread of 20.8) to 0.900 (Gemini under structured CoT). My practical warning: an institution should validate its specific model-plus-prompt pair rather than trust strategy-level rankings."
      ],
      [
        "The ablations underwhelmed. Removing the construct map from CoT barely moved J (0.876 to 0.877), with a small equivalence drop offset by tighter readability. The few-shot \"negative anchor\" ablation, which as run was really just two positive-anchor prompts with different wording, shifted equivalence by two points with no J change, which I read as the judge's resolution limit rather than a real effect."
      ],
      [
        "Two caveats I surface here rather than burying: the judge's four-anchor scale has a ceiling near 0.97, so differences among the best frontier strategies are within noise, though the gap to the references is far outside it; and GPT-2's zero overlap is a format failure, not a diversity win."
      ]
    ]
  },
  {
    "id": "6-discussion-what-it-means",
    "level": 2,
    "title": "6. Discussion — what it means",
    "paras": [
      [
        "The core reading: prompting strategy is an operating-point selector, not a search for a winner. Exemplar-based and constrained methods spread the surface but drag difficulty; zero-shot and CoT lock in fidelity and parity but spread less. This matches what the literature already says about in-context examples increasing lexical variation and chain-of-thought preserving faithfulness."
      ],
      [
        "On the ablations: the most defensible reading isn't that the construct map is useless, but that when a frontier model is already construct-faithful by default, the scaffold's marginal contribution is below the instrument's resolution. The broader implication is that if an institution sets the diversity threshold aggressively, prompting alone won't save it; the readability and equivalence floors will eventually break together."
      ],
      [
        "On the weak models: the collapse proves the benchmark isn't saturated. Llama's failure fits prior findings that instruction tuning improves format compliance more than multi-constraint optimization. GPT-2 is the degenerate case the metrics were built to catch."
      ],
      [
        "The practical protocol: for high-stakes credentialing where construct fidelity matters most, use zero-shot or structured CoT. For large-enrollment formative assessment where the threat is lexical copy-paste, use few-shot or dimension-preserving to buy extra surface separation, and accept an equivalence cost that downstream rubric validation must absorb. Each step down in cosine costs roughly an equal step in equivalence. And the dominant decision is which frontier model and prompt, not whether to use a frontier model."
      ]
    ]
  },
  {
    "id": "7-limitations-six-honest-boundaries",
    "level": 2,
    "title": "7. Limitations — six honest boundaries",
    "paras": [
      [
        "One trial, N = 10, no inferential stats, and the negative-anchor ablation wasn't run as designed. Rubric stability (P3) not measured, and surface diversity gets double weight in J as a result. Both diversity metrics are lexical, so a deep paraphrase of the same scenario could slip through. The judge shares a family with one generator, scores only the first six variants holistically, and has a ceiling effect. Behavioral copy-resistance in a real classroom is untested. The whole pilot cost about ten dollars and 50 minutes, and judge cost scales with cells, capping feasible N on fixed budgets."
      ]
    ]
  },
  {
    "id": "8-conclusion",
    "level": 2,
    "title": "8. Conclusion",
    "paras": [
      [
        "Frontier models can write parallel test versions that look different and measure the same skill, but only barely and only with the right prompting. Small open models can't do it at all. That matters because institutions rushing to deploy AI-generated assessments need a way to tell real variation from paraphrase, and that's what VARIA measures. Three next steps: scale to N = 35 and 100 with multiple seeds and a mixed-effects model, implement the full rubric-stability protocol with a blinded human panel, and run a randomized classroom study to see whether VARIA-passing variants actually deter answer-sharing."
      ]
    ]
  },
  {
    "id": "overall-summary",
    "level": 2,
    "title": "Overall summary",
    "paras": [
      [
        "The paper takes a widely repeated promise in education technology (\"AI will generate a unique but fair version of the test for every student, so we won't need surveillance\") and treats it as a scientific hypothesis rather than a slogan. I break the promise into four measurable properties, build a benchmark around them, and run a modest but carefully scoped pilot. The two findings that matter most are that frontier models clear the bar by a wide margin over weaker models, so the capability is real, and that within the frontier tier there's no free lunch: every prompting choice trades diversity against fidelity and difficulty control, and the specific model-prompt pairing can swing the result as much as the strategy itself. I am deliberately candid about what I haven't done yet, especially the missing rubric-stability measurement and the single unseeded trial, and I pre-register exactly the follow-ups that would close those gaps. Read as a whole, this is less a victory lap than a measurement instrument with a first calibration reading, and an argument that anyone deploying AI-generated assessments should be taking that reading before they trust the output."
      ]
    ]
  },
  {
    "id": "a-use-case-i-care-about-the-bridge-betwe",
    "level": 2,
    "title": "A use case I care about: the bridge between colleges and businesses",
    "paras": [
      [
        "Here is the application that excites me most, and it's one I can run today at a community college."
      ],
      [
        "A local business brings us a problem that is prevalent in their field. Not a hypothetical, not a textbook case, but the thing that is actually costing them time or money right now: a customer-churn pattern they can't explain, a vendor-scoring model that keeps flagging the wrong accounts, an AI chatbot that gives inconsistent answers about their return policy. That problem, written up with the business, becomes a VARIA blueprint: the competency it exercises, the rubric we'd grade it on, and a canonical solution outline."
      ],
      [
        "I then run that blueprint through the exact process in this paper. A frontier model, prompted with the strategy that fits the setting (structured chain-of-thought or zero-shot when I care most about every student being measured on the same skill, few-shot or dimension-preserving when I have a large group and want more separation between versions), generates a set of variants. Each variant is the same type of problem, with the same underlying skills, but a different scenario, a different stakeholder, a different set of surface details. The benchmark tells me whether that set actually holds together: whether the versions are different enough that students can't just share answers, and equivalent enough that the same rubric fairly measures all of them."
      ],
      [
        "That variant set then goes to an instructor, or to whoever is leading an independent study, a capstone, or an internship program. Every student gets the business's problem, but nobody gets the exact same problem. One student is triaging the churn pattern for the retail segment, another for the subscription segment, another under a different data constraint. They are all being assessed on the same competencies with the same rubric, so the grades mean the same thing across the cohort, and the integrity of the assessment comes from the variation itself rather than from watching anyone."
      ],
      [
        "Everyone in that arrangement gets something real. The institution gets an authentic assessment that is defensible on both integrity and fairness, backed by measurement rather than assumption. The instructor gets a ready-made set of parallel tasks instead of having to author a dozen versions by hand or fall back on one shared prompt that everyone can copy. The business gets to watch a room full of students attack a problem that is relevant to them, in multiple directions at once, and gets a first look at the talent it might hire. And the students walk away with something they can put on a résumé: not \"completed a class project,\" but \"solved an applied analytics problem for a real company in my community.\""
      ],
      [
        "That is the bridge I want VARIA to help build. The measurement work in this paper is what makes the bridge trustworthy: before a college hands a business's problem to thirty students in thirty different forms, it should be able to show that all thirty forms measure the same thing. VARIA is how we show it."
      ]
    ]
  }
];
