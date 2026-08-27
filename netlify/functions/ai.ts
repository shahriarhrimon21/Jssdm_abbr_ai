/**
 * POST /.netlify/functions/ai — Netlify's entry point for the AI proxy.
 *
 * This app also deploys to Vercel (see ../../api/ai.ts, the equivalent
 * entry point there) — that's why this file is now just a re-export
 * instead of the implementation itself. The real logic (request
 * validation, provider dispatch, error shaping — including which env var
 * each provider key comes from) lives in ../../api/_lib/handler.ts, kept
 * as a single platform-agnostic implementation so Netlify and Vercel can
 * never drift apart. It lives under api/_lib/ rather than a project-root
 * folder for a Vercel-specific reason explained in that file's header —
 * Netlify has no trouble reaching into it from here regardless.
 *
 * The import below uses ".js" (the file on disk is ".ts"), unlike most
 * relative imports in this codebase — kept consistent with
 * api/_lib/handler.ts's own internal imports, which need exactly this
 * form for a confirmed Vercel production bug (see that file's header for
 * the two wrong attempts before landing on ".js" specifically). Netlify's
 * esbuild-based bundler was never affected either way, but there's no
 * reason to use a different import convention for the same shared file.
 */
export { default } from "../../api/_lib/handler.js";
