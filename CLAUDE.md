# VARIA — working prototype

VARIA turns the benchmark in `varia_paper_v1.pdf` into a product an instructor can use: upload the
assignment they already give, get one surface-different but construct-equivalent version per student,
and release the set only if it passes the paper's four integrity properties. Oversight roles see the
same numbers aggregated. This repo is a **working functional prototype** of that product, deployed
as a static site on **Netlify**.

## Source of truth (read these before building anything)

| File | What it is |
|---|---|
| `varia_paper_v1.pdf` (text: `mockups/varia_paper.txt`) | The benchmark: four properties P1–P4, metrics, thresholds, strategies, pilot numbers. |
| `mockups/VARIA App.dc.html` | **The UI spec.** Ten screens, every label, table column, state and number. Build what is drawn. |
| `mockups/_ds/industry-*/styles.css` + `readme.md` | The "Industry" design system. Already copied verbatim to `src/ui/styles/tokens.css`. |
| `src/shared/types.ts` | **The code contract.** Every module codes against it. |
| `src/shared/thresholds.ts`, `src/shared/pilot.ts` | Labels, thresholds, strategy mapping, pilot data. |

The mockup is the contract for **content and look**, not for architecture. It happens to be drawn
as one canvas that swaps screens in place; that is an artifact of the design tool. The real app is
**eleven separate pages, each at its own URL, each its own file**, sharing the rail, header and
design system. When the mockup and the paper disagree on wording, the mockup wins for UI text and
the paper wins for how a number is computed.

## Architecture (decided — do not relitigate)

**Everything runs in the browser. There is no server, no database, no serverless function.**

- **Why:** the user pastes their own Anthropic key; it must never be bundled or sent to any
  server we run. Netlify Functions time out long before a 34-variant run with five judge samples
  each would finish. A static site with client-side Claude calls is the only Netlify-seamless shape.
- **Key handling:** the Settings page (`/settings`) has a paste box. The key is stored in
  `localStorage` (if "remember on this device" is ticked) or `sessionStorage` (otherwise) under
  `varia.settings`. It is only ever sent to `https://api.anthropic.com` by the official SDK with
  `dangerouslyAllowBrowser: true`. No key → **demo mode**. Key present → **live mode**. Never
  read a key from `import.meta.env`, never ship a default.
- **State:** one `Workspace` object (see types) persisted to `localStorage["varia.workspace.v1"]`
  via zustand `persist`. Export/import as JSON from Settings. "Reset to demo data" reseeds.
- **LLM calls:** `@anthropic-ai/sdk` in the browser. Metrics computed in TypeScript in the browser.
  File parsing (docx, pdf, csv, txt) in the browser.
- **Routing:** `react-router-dom` `BrowserRouter`; `netlify.toml` + `public/_redirects` send every
  path to `index.html` so deep links and refresh work on Netlify.

Stack: Vite 6, React 18, TypeScript strict, zustand 5, zod 3, `@anthropic-ai/sdk`, `lucide-react`,
`mammoth` (docx), `pdfjs-dist` (pdf), `papaparse` (csv), `p-limit`, `vitest`. Plain CSS on the
design-system tokens. No Tailwind, no MUI, no component library.

Path aliases: `@shared/*`, `@lib/*`, `@ui/*`.

```
src/
  main.tsx                    # A  mounts <App/> in BrowserRouter, imports styles
  shared/{types,thresholds,pilot}.ts   # lead — the contract
  lib/
    metrics/                  # B  pure functions + tests
      index.ts  cosine.ts  ngram.ts  flesch.ts  report.ts  *.test.ts
    llm/                      # C  Anthropic provider (live) + demo provider
      index.ts  client.ts  live.ts  demo.ts  prompts/{extract,strategies,judge,anchors}.ts  schemas.ts
    ingest/                   # D  browser file parsing -> SourceFile[] + roster
      index.ts  docx.ts  pdf.ts  csv.ts
    store/                    # D  zustand stores, seed data, run orchestrator
      workspace.ts  settings.ts  seed.ts  seedVariants.ts  orchestrator.ts  selectors.ts  ids.ts
  ui/
    styles/tokens.css         # verbatim DS (do not edit)
    styles/app.css            # A  va-* classes from the mockup + layout
    shell/{Layout,Rail,Header}.tsx     # A
    components/               # A  Blueprint, Pill, StatTile, DataTable, CheckBar, SegScale, FileDrop, Field, EmptyState, ProgressBlock
    router.tsx                # A  all eleven routes
    pages/
      Start.tsx Notes.tsx Import.tsx Blueprint.tsx Generate.tsx Report.tsx   # E
      Roster.tsx Grade.tsx Surface.tsx Console.tsx Settings.tsx              # F
```

## The eleven pages (routes)

Rail order and labels exactly as drawn, plus a **Setup** section at the bottom of the rail for the
key. Breadcrumb and page title come from the `PAGES` map in the mockup script.

| Route | Rail section · label | Crumb / title |
|---|---|---|
| `/` | Orientation · Getting started | Orientation / Getting started |
| `/notes` | Orientation · Design notes | Orientation / Design notes and assumptions |
| `/about` | Orientation · About | Orientation / About VARIA |
| `/import` | Instructor · 0 · Load your assessment | Instructor · step 0 of 5 / Load an assessment you already have |
| `/blueprint` | Instructor · 1 · Blueprint | Instructor · step 1 of 5 / Assessment blueprint |
| `/generate` | Instructor · 2 · Generate variants | Instructor · step 2 of 5 / Generate student versions |
| `/report` | Instructor · 3 · Integrity report | Instructor · step 3 of 5 / Integrity report — {blueprint name} |
| `/roster` | Instructor · 4 · Release & roster | Instructor · step 4 of 5 / Release and roster |
| `/grade/:variantId` | Instructor · 5 · Grade with rubric | Instructor · step 5 of 5 / Grade with the rubric |
| `/surface` | Oversight · Trade-off surface | Oversight / Strategy trade-off surface |
| `/console` | Oversight · Compliance console | Oversight / Institution compliance console |
| `/settings` | Setup · API key & models | Setup / Your Claude key and models |
| `/employer` | Oversight · Employer validation | Oversight / Employer validation |
| `/review`, `/review/:blueprintId` | (employer-facing, `ReviewLayout`, no rail) | Employer review / Validate an assessment |
| `/evidence/:variantId` | (employer-facing, `ReviewLayout`, printable) | Evidence record / Evidence of demonstrated skill |

Header right side: `DAT 4100 · Fall 2026` neutral tag, then an accent tag showing the generator
model label from settings, or `Demo mode · add a key` (linking to `/settings`) when no key is set.

What each page must actually do (beyond rendering the mockup):

- **Start** — static content from the mockup. Buttons route to `/import` and `/report`.
- **Notes** — static content from the mockup; the four-property table reads from `PROPERTY_LABELS`.
- **About** — renders `src/shared/about.ts` verbatim: a dark blueprint hero with the paper title,
  author, affiliation and a primary "Read the paper" button linking to `PAPER.url` (new tab), the
  plain-language abstract, the three key findings, the app summary, then a "Funded by the AI
  Assessment Grant" section with the `GRANT.summary` paragraph and the `GRANT.facts` as a
  two-column definition table, and the citation in a copyable surface box. No invented text.
- **Import** — drag/drop + file picker for `.docx .pdf .txt .md .csv`, "Paste text instead"
  textarea. Files are parsed in the browser into `SourceFile[]`; a CSV is treated as the roster.
  Then `provider.extractBlueprint()` returns a `BlueprintDraft` (demo: seeded draft after a short
  simulated delay). Show the Uploaded table, "What the system pulled out" (construct, criteria with
  confidence pills), the "One thing needs you" panel when any criterion lacks anchors (buttons call
  `provider.draftAnchors` / open an editor), surface dimension tags, the extraction summary rail.
  "Open as blueprint" saves the draft as the active blueprint and routes to `/blueprint`.
  "Skip review, generate now" saves and routes to `/generate`. "Import from Canvas" is disabled
  with a title tooltip "Not in this prototype".
- **Blueprint** — editable name, construct, rubric table (add/remove criterion, points, weight,
  anchors editor, anchors confidence), canonical solution editor with "Draft one for me"
  (`provider.draftCanonicalSolution`) and "Upload .docx". Readiness computed from data. Library
  lists all blueprints; clicking one makes it active. "Continue to generation" disabled until ready.
- **Generate** — threat radio → strategy (`THREAT_TO_STRATEGY`); manual shows a 4-way segmented
  control. Surface dimension chips toggle `enabled`; locked ones cannot. N defaults to roster size,
  editable 2–200. Generator/judge selects from `GENERATOR_MODELS` / `JUDGE_MODELS`. Estimate from
  `COST_MODEL`. "Generate N versions" calls `startRun()`; the page swaps to a progress block
  (phase, done/total, message, cancel) and routes to `/report` on completion. In demo mode the
  orchestrator replays the seeded run with simulated progress over ~6 seconds.
- **Report** — composite J tile, four `CheckBar`s, parallel-coordinates SVG of every variant with
  outliers solid, "Export CSV" (real Blob download), "Send to reviewer" (adds an audit event and
  marks the institution row awaiting sign-off). "Regenerate k and release" regenerates only the
  outlier variants, re-scores, releases. "Release all N anyway" opens a dialog for a reason, then
  releases with `overThreshold: true` and audits it.
- **Roster** — four stat tiles (Released / Submitted / Graded / Difficulty appeals), student ↔
  variant table (name, version, domain · stakeholder, reading ease, status pill/tag, score). Row
  click → `/grade/:variantId`. Filter segmented control (All / Submitted / Graded / Appeals),
  Export CSV. "Showing k of N" with a "Show all" toggle.
- **Grade** — variant tag, student name, surface summary; the task text; the submission (or
  "Nothing submitted yet"); rubric segmented 0–3 per criterion; "Save score · next submission"
  persists a `Grade` and advances to the next submitted-but-ungraded variant. "Open adapted
  solution" reveals `adaptedSolution` inline. Reading-ease note compares to set mean.
- **Surface** — Pareto scatter from `PILOT_CONDITIONS` (SVG, same geometry as the mockup),
  recommendation cards, "Read with care", full condition table. This workspace's completed runs are
  plotted on the same axes as hollow squares labelled with the run's blueprint name.
- **Console** — four stat tiles computed from `institutionSets` + local runs, the released-sets
  table with All / Flagged / Awaiting sign-off filter, thresholds table with inline edit (creates a
  new `ThresholdSet` version + audit event; never re-scores released runs), audit trail (newest
  first, includes local events).
- **Employer** (`/employer`) — the instructor's side of the employer-outcomes bridge. Three stat
  tiles from `employerStats`: blueprints validated by employers (goal 75%), partners adopting
  evidence records (goal 50%), employer satisfaction mean (1–5, n responses). Partner list with
  "Adopted evidence records" toggle and add-partner form. Blueprint table with validation status
  pill (Validated / Changes requested / Declined / Pending), latest reviewer and date, and per
  row: "Review in this browser" (→ `/review/:blueprintId`), "Copy review link" (self-contained
  `#pkg=` link via `lib/share`), "Download package". A "Bring in a result" box accepts a pasted
  result link or a JSON file and calls `applyReviewResult`; `/employer#result=…` auto-applies.
  Validation history list. Evidence records table (id, student, blueprint, issued) linking to
  `/evidence/:variantId`.
- **Review** (`/review`, `/review/:blueprintId`) — what an employer reviewer sees, no instructor
  chrome. Loads the package from the workspace (by id) or from `#pkg=` or a dropped JSON file.
  Sections: what this assessment measures (construct + comment box), the rubric (each criterion
  with anchors and a comment box), the scenario bank (each unlocked dimension as a ChipEditor so
  the reviewer can add/remove values; diffs become `scenarioEdits`), three sample versions with
  their adapted model answers collapsible, the integrity report summary if present, sign-off
  (reviewer name, role, organisation, status radio, attestation checkbox "This rubric reflects
  what we hire or promote for"), the five-question satisfaction survey (`SATISFACTION_QUESTIONS`,
  LikertRow) with a comment. Submit → if the package came from this workspace, `recordValidation`
  and route to `/employer`; else build a `ReviewResult`, show a "Copy result link" CopyField and
  "Download result" so the reviewer can send it back. Nothing is uploaded anywhere.
- **Evidence** (`/evidence/:variantId`) — the portable skill indicator. `evidenceView` renders:
  record id + issued date + hash (or "Not yet issued" with an "Issue record" button for graded
  submissions), student, course, institution, blueprint name and construct, the task the student
  received, rubric with the student's level and points per criterion and total, employer
  validation stamps (organisation, reviewer, date, attested), the integrity report's four checks
  with gates, an optional collapsed adapted model answer, and a verification footer explaining
  the hash. "Print / Save as PDF" (`window.print`) with the print CSS. "Revoke" for instructors.
- **Settings** — the key box: password-type input with show/hide, "Remember on this device"
  checkbox, "Verify key" (calls `provider.verifyKey()`, shows model + timestamp), "Forget key".
  Explains in one paragraph that the key stays in this browser and is only sent to Anthropic.
  Model selects for generator/judge, judge sample count. Workspace export/import/reset-to-demo.
  Shows current mode with the same pill vocabulary.

## Domain rules (from the paper, worded as the app words them)

| | Paper | Instructor sees | Measured by | Gate |
|---|---|---|---|---|
| P1 | Surface diversity | Versions look different | mean pairwise cosine (↓) + 4-gram Jaccard (↓) | cosine ≤ 0.15 |
| P2 | Construct equivalence | Same skill measured | LLM judge, 5 samples, median, normalised [0,1] (↑) | ≥ 0.90 |
| P3 | Rubric stability | One rubric grades them all | **proxy**: σ Flesch of adapted canonical solutions | advisory only |
| P4 | Difficulty parity | Equally hard to read | σ of Flesch reading-ease across variants (↓) | ≤ 8.0 |

- **Release is gated on P1, P2, P4 passing individually.** P3 is advisory, always labelled
  "provisional proxy". J is never the gate.
- **Joint** `J = ¼(1 − cosine) + ¼ equivalence + ¼(1 − σ̃R) + ¼(1 − σ̃φ)`, σ̃ = min(σ/45, 1).
  `F = 1 − J`. Frontier band for context: 0.81–0.88.
- Numbers only appear as the small hover label next to a check unless the check fails. Failures
  name the offending variants.
- Pill vocabulary: `Pass` (green `#3d6b4d`), `Advisory` / `Needs you` / `Awaiting sign-off` /
  `High`→pass (amber `#8a6d2f` for watch), `Over threshold` / `Blocked` / `Appeal` (red `#8d4a3c`).
  Those three are the only status colours in the app.

### Strategies (threat profile → prompting strategy)

| Radio on Generate | Strategy | Why (paper §6) |
|---|---|---|
| passing off someone else's answer (high-stakes) | `structured-cot` | highest equivalence (0.96), tightest σFlesch (5.5) |
| group chat, copy-pasted at scale | `dimension-preserving` | lowest cosine (0.05), accepts difficulty drift |
| set it myself | any of the four | expert override |

Prompt structure (in `lib/llm/prompts/strategies.ts`):

- **zero-shot** — blueprint + the four properties as constraints, no examples.
- **few-shot** — zero-shot + two positive anchors + two negative anchors (paraphrastic copy,
  construct drift). Anchors generated once per blueprint via `generateFewShotAnchors` and cached
  on `blueprint.fewShotAnchors`.
- **structured-cot** — structured output with fields in order: `constructMap`, `surfacePlan`,
  `draft`, `selfCheck` (P1–P4 booleans + notes), `final`, `adaptedSolution`. Store the scaffold.
- **dimension-preserving** — the orchestrator assigns each variant a distinct tuple over enabled
  dimensions; the prompt fixes that tuple and states explicit parity constraints (reading level,
  step count, number of required findings).

Every strategy returns `{ text, adaptedSolution, surfaceAssignment }`. `adaptedSolution` is the
canonical solution rewritten into the variant's scenario. It is required: it feeds P3 and Grade.

### Metrics (`lib/metrics`, pure, unit-tested)

- **cosine (P1):** TF-IDF over word unigrams+bigrams, mean pairwise cosine over all pairs. The
  paper's §4.5 says the local metric was TF-IDF n-gram cosine; no embedding model.
- **ngram (P1):** mean pairwise Jaccard on word 4-gram sets.
- **flesch (P4):** `206.835 − 1.015·(words/sentences) − 84.6·(syllables/words)`, heuristic English
  syllable counter. Population σ across the set.
- **outliers:** if P4 fails, variants whose Flesch is more than 1.0·σ below the mean (harder), at
  least the three hardest; if P2 fails, variants with equivalence < threshold.
- **lexicalComplexity:** type-token ratio. **stepCount:** numbered/bulleted lines in the solution.
- **P3 proxy:** σ Flesch across `adaptedSolution`s.
- **judge (P2):** per sample, structured `{ dimensionScores: 1–5 per construct dimension,
  rationale }`; median per dimension across samples, mean across dimensions, normalise `(x−1)/4`.

### Claude API conventions (`lib/llm`)

- `new Anthropic({ apiKey, dangerouslyAllowBrowser: true })`. Key from the settings store only.
- Defaults: generator `claude-opus-5`, judge `claude-sonnet-5`. IDs are exact strings, no dates.
  The mockup chips say "Claude Opus 4.7" / "Claude Sonnet 4.6" because those were the pilot's
  models; the UI shows whatever the run record says.
- Structured output: `client.messages.parse({ ..., output_config: { format: zodOutputFormat(S) } })`
  then guard `parsed_output === null` → throw a typed error.
- `thinking: { type: "adaptive" }` on generation and extraction calls; omit on judge calls and use
  `output_config: { effort: "low" }` there. **Never set `temperature`, `top_p`, `budget_tokens`**
  on 5-family models (400). Self-consistency = five independent judge calls.
- `max_tokens` 16000 for non-streaming calls. Use `client.messages.stream(...).finalMessage()` for
  variant generation. Never assistant-prefill.
- Concurrency: `p-limit(3)` for generation, `p-limit(4)` for judge samples. Persist the run after
  every variant so a refresh mid-run keeps partial work (status `partial`, resumable).
- Errors: `Anthropic.AuthenticationError` → surface "key rejected" and route to Settings;
  `RateLimitError` / `APIConnectionError` → retry with backoff (3 tries); any other `APIError` →
  mark that variant `error`, continue, finish the run as `partial`.
- Check `stop_reason === "refusal"` before reading content; treat as a variant error.
- The `/claude-api` skill is loaded in this workspace; consult it before writing any SDK call.

### Design system rules (Industry)

- `tokens.css` is verbatim; never edit it. Every colour, font, spacing, radius, shadow is a
  `var(--*)`. Sanctioned literal colours: the three status colours, and the rail palette
  (`#b7c6d6`, `#7f95ac`, `#6d8299`, `#8fa8bf`, `#d5e0ea`, white on `--color-accent-900`) exactly
  as the mockup uses them.
- Cards, figures, tiles and primary buttons are **blueprint objects**: `<Blueprint>` renders
  `.blueprint` + the four `<i class="corner …">`. Never hand-write the corners.
- Barlow Condensed headings, Barlow body. Lucide icons at stroke 1.5. One steel accent; body-size
  accent text uses `--color-accent-700`.
- Left rail: `--color-accent-900`, `.va-nav` / `.va-railhd` classes from the mockup, `aria-current`.
- Keep the mockup's helper classes with the same names: `va-pill va-pass va-fail va-watch va-row
  va-sel va-ax va-split va-help`. `.va-split` collapses to one column under 1140px.
- `:focus-visible` 2px accent ring; hover/pressed from the accent ramp; nothing rounded.

## Commands

```
npm install
npm run dev        # vite on :5173
npm run build      # tsc --noEmit + vite build -> dist/
npm run preview    # serve dist on :4173
npm test           # vitest
```

Netlify: connect the repo, build command `npm run build`, publish `dist`. `netlify.toml` already
says so. No environment variables are needed or wanted.

## Multi-agent build plan

Parallel agents, directory ownership, one contract. The lead owns `src/shared/*`, root configs,
`CLAUDE.md`. Agents do not edit files outside their directory; if the contract needs a change,
say so in the final report and the lead applies it.

| Agent | Owns | Delivers |
|---|---|---|
| **A · Shell + components** | `src/main.tsx`, `src/ui/styles/app.css`, `src/ui/shell/*`, `src/ui/components/*`, `src/ui/router.tsx` | Navigable app with all eleven routes, rail + header pixel-faithful to the mockup, reusable components, placeholder page stubs that E/F replace |
| **B · Metrics** | `src/lib/metrics/*` | Pure functions + `computeReport(run, thresholds)` + tests |
| **C · LLM provider** | `src/lib/llm/*` | `createProvider(settings)` → live (SDK) or demo; four strategies, judge, extraction, anchors |
| **D · Store + ingest + seed** | `src/lib/store/*`, `src/lib/ingest/*` | zustand stores, orchestrator (`startRun`, `regenerateAndRelease`, `releaseAnyway`, …), browser file parsing, demo fixtures reproducing the mockup's numbers exactly |
| **E · Instructor pages 0–3** | `src/ui/pages/{Start,Notes,Import,Blueprint,Generate,Report}.tsx` | Wired pages |
| **F · Pages 4–5 + Oversight + Settings + About** | `src/ui/pages/{Roster,Grade,Surface,Console,Settings,About}.tsx` | Wired pages |
| **G · QA** | tests only | Build passes, every route renders, demo flow end-to-end, label audit vs mockup |

Order: A, B, C, D in parallel → E, F in parallel → G.

### Employer-outcomes bridge (Axim required rows)

| Required outcome | Metric in the app | Where |
|---|---|---|
| Assessments validated by employer partners (goal 75%) | validated blueprints / blueprints | `employerStats` → Employer page + Console |
| Employers adopt portable skill indicators (goal 50%) | partners with `adoptedEvidenceRecords` / partners | Employer page |
| Employers satisfied with assessment outcomes | mean of the five-question survey, n | Employer page + Console |

Rules: validation happens at the blueprint, once, and every variant inherits it. Evidence records
carry `validationIds` at issue time and a SHA-256 over their canonical content. No student data is
ever inside a review package (samples are stripped of student ids).

## Non-goals

Canvas/LMS integration, authentication, multi-tenant institutions, a student portal, a sentence
embedding model, the full P3 rubric re-application protocol (the UI must keep saying "proxy"), the
behavioural copy-resistance study, any server component.
