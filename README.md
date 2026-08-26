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
server (a serverless function) and is never shipped to the browser. The
app deploys to **either Netlify or Vercel** — same repo, same code, no
choice to make up front; see "Deploying" below for both.

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
    client.ts                always POSTs to "/.netlify/functions/ai" —
                              on Vercel, vercel.json rewrites that same
                              path to /api/ai, so this file never needs to
                              know which host it's running on
    prompts.ts                system prompts, tone list
    state.ts                  reducer for the 3-state text model
    __tests__/
  components/             shared UI pieces
  pages/                  one component per sidebar view
  App.tsx, main.tsx, nav.ts, styles/app.css
api/
  ai.ts                    Vercel's entry point (Node.js Serverless
                            Function) — a small (req,res) adapter around
                            the shared handler below (Vercel's Node
                            runtime doesn't speak Web Request/Response
                            directly the way Netlify's function format
                            and Vercel's Edge runtime do; Edge itself
                            turned out not to reliably bundle a local
                            multi-file TS import, hence Node here instead)
  _lib/
    handler.ts               the ONLY place any AI API key is read — the
                              actual request validation + provider dispatch
                              logic, platform-agnostic (Web-standard
                              Request/Response only), shared by both hosts.
                              Lives under api/ (not a project-root folder)
                              so it sits next to the Vercel entry point
                              that uses it — the underscore prefix keeps
                              Vercel's router from treating it as a route
    providers/                 one file per AI provider (groq, gemini,
                                openai implemented — groq is free/default;
                                claude scaffolded for later)
netlify/functions/ai.ts   Netlify's entry point — re-exports api/_lib/handler.ts
vercel.json                build settings + the rewrite that points the
                            frontend's hardcoded fetch path at api/ai.ts
```

## Local development

```bash
npm install
npm run dev          # Vite dev server (JSSDM engine works with no key)
```

To exercise the AI Writing Assistant locally you need a serverless-function
dev server, since the AI call doesn't work against plain `vite dev` alone.
Either CLI works — both run the exact same `api/_lib/handler.ts`:

```bash
# Netlify CLI
npm install -g netlify-cli
cp .env.example .env         # then put your real key in .env
netlify dev                  # serves the app AND the function together

# — or — Vercel CLI
npm install -g vercel
cp .env.example .env.local   # Vercel's CLI reads .env.local, not .env
vercel dev                   # serves the app AND the function together
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

**Step 6 — Add your (free) AI API key.**
This is the step that keeps your key private (never in the browser, never
on GitHub). The app's default provider is **Groq**, which costs nothing —
no credit card, ever, just a free account:
- Go to [console.groq.com/keys](https://console.groq.com/keys), sign up
  (no payment info requested), and click **Create API Key**.
- In your new Netlify site: **Site configuration → Environment variables →
  Add a variable**.
  - Key: `GROQ_API_KEY`
  - Value: the key you just copied

Click **Save**, then go to the **Deploys** tab → **Trigger deploy → Deploy
site** once, so the AI feature picks up the new key. (The JSSDM
abbreviation/lookup features work immediately without this step — only the
AI Writing Assistant needs the key.)

**Step 7 — You're live.**
Netlify gives you a web address like `your-site-name.netlify.app`. That's
the real, working site — share that link with anyone.

**Step 8 (optional) — Also add Gemini and/or OpenAI.**
You don't need to do this — Groq alone is enough to use the AI Writing
Assistant for free. These are here only if you specifically want them:
- **Gemini** (also free, but currently unreliable): Google is mid-rollout
  of a new API key format (keys starting `AQ.` instead of `AIza...`), and
  it's actively rejecting valid keys for many accounts right now — a
  known, open issue on Google's own developer forums, not something wrong
  with your setup. Get a key at
  [aistudio.google.com/app/apikey](https://aistudio.google.com/app/apikey),
  add it as `GEMINI_API_KEY` the same way as Step 6.
- **OpenAI** (paid — requires a billing method on your OpenAI account,
  unlike Groq/Gemini): get a key at
  [platform.openai.com/api-keys](https://platform.openai.com/api-keys),
  add it as `OPENAI_API_KEY` the same way as Step 6.

All three can be configured at once — the **AI provider** dropdown inside
the AI Writing Assistant page just decides which one handles that
particular request, no redeploy needed to switch.

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

Groq (free, default), Gemini, and OpenAI are all already implemented as
providers (see Step 8 above) — Groq specifically as a genuinely free,
no-card working option, and OpenAI as a paid fallback, both added after
Google's Gemini key rollout issues made Gemini alone unreliable; together
they're proof the provider abstraction works as intended. If you want to
add a fourth (e.g. Claude, already scaffolded in
`api/_lib/providers/claude.ts`), it's finishing that file's `call()`
method following the same interface as `gemini.ts`/`openai.ts`/`groq.ts`,
its own `*_API_KEY` environment variable set on whichever host(s) you
deploy to, and one line in the AI Writing Assistant's provider dropdown
(`src/pages/AIWritingAssistant.tsx`) — the request contract from the
browser does not change, and it takes effect on both Netlify and Vercel
automatically since both hosts call the same `api/_lib/handler.ts`.

## Deploying to Vercel instead

Everything in Steps 1-4 above (GitHub account, empty repo, upload the
project) is identical for Vercel — only Steps 5-6 change:

**Step 5 — Connect Vercel.**
Go to [vercel.com](https://vercel.com) and sign up/log in with **Continue
with GitHub**. Then: **Add New... → Project**, pick the repo you created,
and click **Import**. Vercel auto-detects this as a Vite project and reads
`vercel.json` for the build settings and the routing rule that makes the
AI feature work — just click **Deploy**.

**Step 6 — Add your (free) AI API key.**
Same idea as Netlify, but Vercel keeps its own separate environment
variables — a key added on Netlify does NOT carry over to Vercel, and
vice versa. If you're deploying to Vercel only, do this instead of
Netlify's Step 6; if you're running both, you'll add the key twice (once
per host):
- Get a free Groq key at
  [console.groq.com/keys](https://console.groq.com/keys) (no payment info
  requested).
- In your Vercel project: **Settings → Environment Variables → Add New**.
  - Key: `GROQ_API_KEY`
  - Value: the key you just copied
  - Environment: leave all three (Production/Preview/Development) checked.

Click **Save**, then go to the **Deployments** tab → open the latest
deployment's **⋯** menu → **Redeploy**, so the AI feature picks up the new
key. Gemini (`GEMINI_API_KEY`) and OpenAI (`OPENAI_API_KEY`) work the same
way, added the same way, exactly as described in Netlify's Step 8 above.

Vercel gives you a web address like `your-project-name.vercel.app` — that
works identically to a Netlify URL, including the AI Writing Assistant.
Future updates work the same way too: push updated files to the same
GitHub repo (drag-and-drop or `git push`) and Vercel redeploys
automatically, just like Netlify does.

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
- The AI proxy (`api/_lib/handler.ts`), for the Groq, Gemini, and OpenAI
  providers — invoked directly with real `Request` objects (Netlify's entry
  point, and Vercel's shared handler underneath its req/res adapter):
  correctly rejects non-POST, malformed JSON, and missing fields; correctly
  reports "not configured" with no key set; fails gracefully (no stack
  trace, no key ever in the response) when a key is set but the upstream
  call itself fails; and (regression coverage for a bug that shipped once)
  a real WhatsApp-mode system prompt never trips the size guard. Separately,
  Vercel's `api/ai.ts` req/res adapter is tested against a mock response
  object to confirm it correctly translates Vercel's (req, res) call shape
  into the Request the shared handler expects and relays its Response back
  correctly (status, headers, body) — including three request-body shapes
  (already-parsed object, raw JSON string, Buffer) since Vercel's body
  auto-parsing isn't guaranteed to hand back the same shape every time, and
  a test proving the adapter's own try/catch always returns valid JSON
  rather than ever letting an unexpected throw escape as Vercel's generic
  non-JSON error page (the exact failure this app hit once already). 19
  regression tests total across `netlify/functions/__tests__/ai.test.ts`
  and `api/__tests__/ai.test.ts`.
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
- The AI Writing Assistant's actual call to Groq, Gemini, or OpenAI,
  end-to-end in a real browser — Groq's and OpenAI's request/response
  contracts follow the same long-stable, OpenAI-compatible Chat
  Completions shape; the Gemini request/response contract matches what was
  verified working in the earlier single-file client-side prototype
  (correct auth header, correct response parsing). Server-side error
  handling was exercised directly for all three (above), but a full
  browser round-trip through `netlify dev` was not run for any of them.
  **Known live issue as of this writing:** Google is mid-rollout of a new
  Gemini API key format (`AQ.` prefix), and it is currently rejecting
  valid keys for many accounts with "API key not valid" — a known, open
  issue on Google's own developer forums, unrelated to this app's request
  code. Groq was added specifically as a genuinely free, working default
  while that's unresolved — see the README's Step 6/8 above.
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
