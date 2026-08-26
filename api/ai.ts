/**
 * POST /api/ai — Vercel's entry point for the AI proxy.
 *
 * The frontend's one hardcoded fetch call (src/ai/client.ts) always posts
 * to "/.netlify/functions/ai" regardless of which host the app is running
 * on. On Netlify that path IS the function. On Vercel, vercel.json rewrites
 * that same path to /api/ai — this file — so the frontend needed no
 * change at all to support a second host. See ../netlify/functions/ai.ts
 * for the equivalent Netlify entry point and ./_lib/handler.ts for the
 * actual (shared, platform-agnostic) implementation both of them call —
 * that file's header explains why the shared code lives at api/_lib/
 * specifically rather than a project-root folder.
 *
 * Runs as a Vercel Edge Function: the handler already speaks the
 * Web-standard Request/Response API (same objects Netlify's newer function
 * format uses), so it runs here completely unmodified — no request/response
 * adapter needed, unlike Vercel's older Node.js serverless function format.
 *
 * Requires the SAME environment variables as Netlify, set separately in
 * this Vercel project's own Settings -> Environment Variables (Vercel and
 * Netlify each keep their own env vars — setting a key on one host does
 * NOT configure it on the other): GROQ_API_KEY, GEMINI_API_KEY,
 * OPENAI_API_KEY, ANTHROPIC_API_KEY (Claude is scaffolded only, not yet
 * implemented — see api/_lib/providers/claude.ts).
 */
export { default } from "./_lib/handler.ts";

export const config = { runtime: "edge" };
