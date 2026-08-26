/**
 * POST /api/ai — Vercel's entry point for the AI proxy.
 *
 * The frontend's one hardcoded fetch call (src/ai/client.ts) always posts
 * to "/.netlify/functions/ai" regardless of which host the app is running
 * on. On Netlify that path IS the function. On Vercel, vercel.json rewrites
 * that same path to /api/ai — this file — so the frontend needed no
 * change at all to support a second host. See ../netlify/functions/ai.ts
 * for the equivalent Netlify entry point and ./_lib/handler.ts for the
 * actual (shared, platform-agnostic) implementation both of them call.
 *
 * RUNTIME NOTE — this deliberately runs as a Node.js Serverless Function,
 * NOT a Vercel Edge Function. It started as an Edge Function (the natural
 * fit, since ./_lib/handler.ts already speaks the Web-standard Request/
 * Response API Edge Functions use natively) but that failed to deploy
 * twice with "The Edge Function 'api/ai' is referencing unsupported
 * modules" — first pointing at a project-root import, then, after moving
 * the shared code to api/_lib/ specifically to stay inside Edge's
 * bundling scope, at the exact same local ./_lib/handler.ts import.
 * Since the failure persisted at the same relative depth, the actual
 * cause is Vercel's Edge bundler not reliably resolving any local
 * multi-file TypeScript import — not a directory-boundary issue. Vercel's
 * Node.js runtime uses a different, far more battle-tested bundler
 * (`@vercel/node`) that handles exactly this "api file imports a sibling
 * lib file" shape correctly — it's one of the most common patterns on the
 * platform. The cost of dropping Edge is a few milliseconds of extra
 * latency from a nearest-region cold start instead of running at the
 * network edge; irrelevant here since every request already waits
 * seconds for an LLM response, so Edge's speed advantage was never worth
 * anything for this endpoint.
 *
 * Node.js Functions use Node's http-style (req, res) signature, not the
 * Web Request/Response ./_lib/handler.ts is written against, so this file
 * is a small adapter: build a real Request from the incoming req, hand it
 * to the shared handler unmodified, then translate the Response it
 * returns back into res.status()/setHeader()/send() calls. req/res are
 * typed loosely (not import type { VercelRequest, VercelResponse } from
 * "@vercel/node") so this file has no new dependency to install — Vercel
 * provides the actual objects at runtime regardless of local types, and
 * the shapes used below (method, headers, url, body / status, setHeader,
 * send) are Vercel's documented stable contract for this runtime.
 *
 * Requires the SAME environment variables as Netlify, set separately in
 * this Vercel project's own Settings -> Environment Variables (Vercel and
 * Netlify each keep their own env vars — setting a key on one host does
 * NOT configure it on the other): GROQ_API_KEY, GEMINI_API_KEY,
 * OPENAI_API_KEY, ANTHROPIC_API_KEY (Claude is scaffolded only, not yet
 * implemented — see api/_lib/providers/claude.ts).
 */
import handleAIRequest from "./_lib/handler.ts";

export default async function handler(req: any, res: any): Promise<void> {
  const headers = new Headers();
  for (const [key, value] of Object.entries<unknown>(req.headers || {})) {
    if (value === undefined) continue;
    headers.set(key, Array.isArray(value) ? value.join(", ") : String(value));
  }

  const host = req.headers?.host || "localhost";
  const method = req.method || "GET";
  const hasBody = method !== "GET" && method !== "HEAD";

  const request = new Request(`https://${host}${req.url || "/api/ai"}`, {
    method,
    headers,
    // Vercel's Node runtime auto-parses a JSON request body into req.body
    // for a Content-Type: application/json request (what client.ts always
    // sends) — re-stringify it so the shared handler's own request.json()
    // call works exactly as it does on Netlify, which hands it a real
    // fetch Request whose body was never pre-parsed.
    body: hasBody ? JSON.stringify(req.body ?? {}) : undefined,
  });

  const response = await handleAIRequest(request);

  res.status(response.status);
  response.headers.forEach((value: string, key: string) => res.setHeader(key, value));
  res.send(await response.text());
}
