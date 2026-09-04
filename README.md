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

## Layout

See `CLAUDE.md` for the architecture, the page-by-page spec, the domain rules from the paper, and
the multi-agent build plan.
