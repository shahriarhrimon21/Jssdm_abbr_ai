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
 */
export { default } from "../../api/_lib/handler.ts";
