# VARIA

A working prototype of the VARIA assessment-variant workflow described in
`varia_paper_v1.pdf`: upload the assignment you already give, get one surface-different but
construct-equivalent version per student, and release the set only when it passes the paper's
four integrity checks.

## Run it

```
npm install
npm run dev          # http://localhost:5173
```

The app opens in **demo mode** with a seeded course, roster, blueprint and a finished run, so
every page works immediately.

## Use your own Claude key

Go to **Setup → API key & models** (`/settings`), paste your Anthropic API key, and press
**Verify key**. That switches the app to **live mode**: the Import step really extracts a
blueprint from your files, the Generate step really produces variants with Claude, and the
judge really scores them.

- The key is stored only in your browser (session storage by default; local storage if you tick
  "Remember on this device").
- It is sent only to `https://api.anthropic.com`, directly from your browser, by the official
  Anthropic SDK. There is no server in between.
- No key is bundled with the app and none is read from environment variables.

## Deploy on Netlify

There is no backend, no database and no environment variable. Connect the repository and
Netlify picks up `netlify.toml`:

- build command `npm run build`
- publish directory `dist`
- every route redirected to `index.html` so deep links and refresh work

All application state lives in the browser's local storage. Use **Settings → Export workspace**
to move it between machines.

## Employers, students, and the evidence records

Beyond the instructor flow, the app carries an employer bridge:

- **Employer validation** (`/employer`): partners contribute real problem briefs that feed the
  scenario bank, validate a blueprint's rubric once through a self-contained review link
  (`/review`), sign off with a work email, and answer a five-question satisfaction survey. The
  three Axim employer outcomes (validated blueprints, adoption, satisfaction) are computed here.
- **Evidence records** (`/evidence/:variantId`): each graded task becomes a work sample with a
  stable learner ID (not the name), skills, an optional submission by consent, a SHA-256 hash and
  an ES256 signature, exportable as an Open Badges 3.0 credential and checkable at `/verify/:id`.
- **Portfolio** (`/portfolio`) and **talent view** (`/talent`): students choose which employers see
  which samples; employers read the work, endorse it against their own bar, and log interviews,
  offers, hires and ramp time where they happen.

What is demo-grade: the signing key is generated in the browser and labelled as such; records live
in the browser until a student shares them; students and employer reviewers are not authenticated.
A durable, college-held record store and a college signing key are the next structural steps.

## Research: paper and experiments

The benchmark research behind the app lives in this repository:

- **`paper/paper_final.md`** and **`paper/paper_final_V3.pdf`** — the current revision of the
  VARIA benchmark paper (supersedes `varia_paper_v1.pdf`), with per-model results, exact
  permutation tests with Holm correction, bootstrap CIs, threshold gating, and ranking
  sensitivity analyses. Figures are in `paper/charts/`, citations in `paper/references.bib`.
- **`experiments/`** — the full pilot code (generation, judging, metrics, merge, gap analysis),
  the blueprints, the pre-registered follow-up harness (`run_followup.py`), and the raw result
  JSONs in `experiments/outputs/`. Requires `OPENROUTER_API_KEY` for live runs; see
  `experiments/README.md`.
- **`experiments/demo_variants.py`** — a live cross-discipline demo: pick a stored blueprint, a
  named preset (pre-algebra, student-teaching reflection, nursing SBAR handoff, business
  cash-flow memo), or any one-line `--topic`, and it drafts the blueprint and generates
  surface-distinct, construct-equivalent variants with Claude Sonnet 5.5, printing the paper's
  quick diversity and difficulty-parity checks.

## Layout

See `CLAUDE.md` for the architecture, the page-by-page spec, the domain rules from the paper, and
the multi-agent build plan.
