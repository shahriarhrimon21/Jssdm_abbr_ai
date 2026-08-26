/**
 * POST /.netlify/functions/ai — Netlify's entry point for the AI proxy.
 *
 * This app also deploys to Vercel (see ../../api/ai.ts, the equivalent
 * entry point there) — that's why this file is now just a re-export
 * instead of the implementation itself. The real logic (request
 * validation, provider dispatch, error shaping — including which env var
 * each provider key comes from) lives in ../../server/ai/handler.ts, kept
 * as a single platform-agnostic implementation so Netlify and Vercel can
 * never drift apart. See that file's header comment for the full picture.
 */
export { default } from "../../server/ai/handler.ts";
