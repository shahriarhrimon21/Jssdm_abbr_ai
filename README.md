# JSSDM Reference Desk

A military abbreviation / de-abbreviation assistant grounded exclusively in
the uploaded **JSSDM 2022** manual (Joint Services Staff Duties Manual,
Section 16), plus an AI Writing Assistant for polishing or drafting prose.
The JSSDM engine is 100% deterministic and never uses outside knowledge —
anything not found in the manual is reported as unverified. The AI
assistant is a separate layer for grammar/tone only; it never decides what
counts as an authorized abbreviation.

This is a React + Vite + TypeScript rewrite of an earlier single-file
prototype, restructured so the AI provider's API key lives only on the
server (a Netlify Function) and is never shipped to the browser.

## Project layout

```
src/
  jssdm/                  deterministic engine (ported 1:1 from the working
                           prototype, including the Personnel->pers fix)
    types.ts               shared data shapes
    database.ts             dataset loading + indices + lookups
    parser.ts               tokenization, case rules, fuzzy matching
    ruleEngine.ts            plural / verb-derivative rules (0241b(3)/(4))
    forceResolution.ts       force filtering + reverse-ambiguity resolution
    abbreviationEngine.ts    full form -> abbreviation
    deabbreviationEngine.ts  abbreviation -> full form
    consistency.ts           mixed-usage checker
    validation.ts            writing-type usage validator
    audit.ts                 whole-document audit
    search.ts                search / reverse lookup
    coverage.ts              corpus-wide data-audit report
    debug.ts                 step-by-step resolution trace
    favorites.ts             localStorage favorites/recent
    data/dataset.json        the extracted JSSDM dataset (3,062 entries)
    __tests__/               regression suite (node:test)
  ai/                     AI Writing Assistant client-side logic
    client.ts                calls this app's own Netlify Function only
    prompts.ts                system prompts, tone list
    state.ts                  reducer for the 3-state text model
    __tests__/
  components/             shared UI pieces
  pages/                  one component per sidebar view
  App.tsx, main.tsx, nav.ts, styles/app.css
netlify/functions/
  ai.ts                   the ONLY place any AI API key is read
  providers/               one file per AI provider (gemini implemented;
                            openai/claude scaffolded for later)
```

## Local development

```bash
npm install
npm run dev          # Vite dev server (JSSDM engine works with no key)
```

To exercise the AI Writing Assistant locally you need the Netlify CLI,
since the AI call goes through a serverless function:

```bash
npm install -g netlify-cli
cp .env.example .env         # then put your real key in .env
netlify dev                  # serves the app AND the function together
```

`.env` is gitignored — it never gets committed.

## Testing

```bash
npm run test            # engine + AI-state regression suite (node:test)
npm run typecheck       # tsc --noEmit
npm run verify:render   # server-renders every page/component, catches
                         # JSX/import errors without a full build
```

See **Verification status** below for exactly what has and hasn't been run
in the environment this project was authored in, and why.

## Deploying — the easy way (no terminal, no git commands)

You don't need to install git or type any commands for this. Everything
below happens by clicking and dragging in your browser.

**Step 1 — Get a GitHub account.**
Go to [github.com](https://github.com) and sign up (free) if you don't
already have an account. If you already have one, just log in.

**Step 2 — Create an empty repository.**
Click the **+** in the top-right corner → **New repository**. Give it a
name like `jssdm-reference-desk`. Leave everything else as-is (don't check
"Add a README") and click **Create repository**.

**Step 3 — Unzip the project on your computer.**
Find the `.zip` file I sent you and unzip/extract it (right-click → Extract
All on Windows, or double-click on Mac). You'll get a folder called
`jssdm-app` with everything inside it.

**Step 4 — Upload it to GitHub by dragging.**
On the empty repository page GitHub just created, click the link that says
**uploading an existing file**. Open the `jssdm-app` folder on your
computer, select everything *inside* it (Ctrl+A on Windows / Cmd+A on Mac),
and drag it all onto the GitHub page. Wait for the upload to finish, then
scroll down and click **Commit changes**. (If you see a hidden `.git`
folder in your file browser, don't worry about dragging it — it's fine
either way, GitHub ignores it.)

**Step 5 — Connect Netlify.**
Go to [app.netlify.com](https://app.netlify.com) and sign up/log in — you
can just click "Sign up with GitHub" to skip making a separate password.
Then: **Add new site → Import an existing project → Deploy with GitHub**
→ authorize Netlify when asked → pick the `jssdm-reference-desk` repo you
just created.
Netlify reads the project's `netlify.toml` file automatically, so the
build settings are already filled in correctly — just click **Deploy**.

**Step 6 — Add your Gemini API key.**
This is the step that keeps your key private (never in the browser, never
on GitHub). In your new Netlify site: **Site configuration → Environment
variables → Add a variable**.
- Key: `GEMINI_API_KEY`
- Value: your key from
  [aistudio.google.com/app/apikey](https://aistudio.google.com/app/apikey)

Click **Save**, then go to the **Deploys** tab → **Trigger deploy → Deploy
site** once, so the AI feature picks up the new key. (The JSSDM
abbreviation/lookup features work immediately without this step — only the
AI Writing Assistant needs the key.)

**Step 7 — You're live.**
Netlify gives you a web address like `your-site-name.netlify.app`. That's
the real, working site — share that link with anyone.

**Making changes later:** whenever you have an updated version of the
project (e.g. a new zip from me), go back to your GitHub repository, click
**Add file → Upload files**, and drag the changed files in the same way.
GitHub will ask you to confirm you're replacing the old ones — commit the
change, and Netlify automatically rebuilds and redeploys within a minute
or two. No terminal, ever.

<details>
<summary><strong>Advanced alternative: using git from a terminal</strong> (click to expand — skip this if Steps 1-7 above worked for you)</summary>

If you're comfortable with a terminal, this project is already
`git init`-ed with one commit, so you can skip the drag-and-drop upload
and instead do Steps 3-4 as:

```bash
cd jssdm-app
git remote add origin https://github.com/YOUR_USERNAME/jssdm-reference-desk.git
git branch -M main
git push -u origin main
```

And future updates become:
```bash
git add -A
git commit -m "describe what changed"
git push
```

Everything else (Steps 5-7) is identical either way.
</details>

If you ever want to add a second AI provider (OpenAI, Claude), it's a new
file in `netlify/functions/providers/` implementing the same interface as
`gemini.ts`, one line registering it in `netlify/functions/ai.ts`, and its
own `*_API_KEY` environment variable in Netlify — the frontend and the
request contract to `/.netlify/functions/ai` do not change.

## Verification status (read this before trusting "it works")

This project was authored in a sandboxed environment whose network egress
allowlist blocks `registry.npmjs.org`, so **`npm install` could not be run
here**, and therefore neither could `vite build`, `netlify dev`, or a real
browser render of the app. Claiming those had been tested would not be
honest, so here is exactly what was and wasn't verified, and how:

**Actually run and passing, in this environment:**
- The entire JSSDM engine (`src/jssdm/*.ts`) — executed directly with
  Node 22's native TypeScript support (no build step). 22 regression tests
  via `node --test`, including the critical case (`Personnel` → `pers`,
  not `PA`), the genuine tie case (`Record`: `RO`/`rec`, correctly left
  ambiguous), the prior-round cases (Troop/Troops, Mark/Marks,
  Organize/Organized, Document/Documents, Support/Supported), search
  ordering, consistency checking, validate/audit, and the coverage report's
  corpus-wide collision scan (14 found, 13 handled, 1 flagged — see below).
- The AI Writing Assistant's state reducer (`src/ai/state.ts`) — 4
  regression tests confirming the three text states (Original/AI
  Final/JSSDM Final) never overwrite each other.
- The Netlify Function (`netlify/functions/ai.ts`) — invoked directly with
  real `Request` objects: correctly rejects non-POST, malformed JSON, and
  missing fields; correctly reports "not configured" with no key set; and
  fails gracefully (no stack trace, no key ever in the response) when the
  key is set but the network call itself fails.
- Every React component (all 19: `App` and every page/shared component) —
  server-rendered via `react-dom/server` (`scripts/verify-render.tsx`,
  run with `tsx`, using this environment's pre-installed global `react`/
  `react-dom`/`tsx` packages as a stand-in for a real `npm install`). This
  catches real JSX, import-path, and runtime errors; it does not exercise
  click handlers, the `fetch` call to the AI function, or a real browser.

**NOT verified, and why:**
- `npm run build` (Vite production build) — could not run; `npm install`
  is blocked in this sandbox. Netlify's own build servers have full
  registry access and are expected to succeed, but this has not been
  observed directly. **Recommended first step after pushing to GitHub:
  watch the first Netlify deploy log closely.**
- `npm run typecheck` (`tsc --noEmit`) — could not run against the full
  project (no `@types/react` available without `npm install`); the code
  was written carefully against React 18's API surface, and every
  component's JSX was confirmed to *render* correctly (above), but this is
  not the same guarantee as a clean type-check.
- The AI Writing Assistant's actual call to Gemini, end-to-end in a real
  browser — the request/response contract matches what was verified
  working in the earlier single-file client-side prototype (correct model
  ID `gemini-3.6-flash`, correct auth header, correct response parsing),
  and the server-side error handling was exercised directly (above), but
  a full browser round-trip through `netlify dev` was not run here.
- Mobile/responsive layout in an actual browser — the CSS is carried over
  unchanged from the previously-shipped, visually-reviewed prototype
  (including its `@media (max-width:820px)` rules), but was not
  screenshotted in this environment.

## Known, disclosed data edge cases (not hidden, not "fixed")

- **"Sepoy"** has two same-force (Army) entries from two different manual
  source lists with slightly different capitalization (`sep` vs `Sep`).
  This is the one remaining entry in the coverage report's "unresolved
  collisions" list (Reference → JSSDM Coverage Report). Low impact, not
  fixed in this round.
- A rule-derived plural/verb-form match (e.g. "recorded", derived from the
  tied `Record` collision) discloses the ambiguity in its source note but
  still displays one candidate's abbreviation rather than presenting both
  the way a direct lookup of "Record" itself does. This is inherited
  unchanged from the original engine's behavior and is disclosed here
  rather than silently left as-is.
