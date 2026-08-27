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
 * returns back into res.status()/setHeader()/send() calls. It deliberately
 * does NOT forward the original request's headers into the reconstructed
 * Request — the shared handler never reads request.headers (only
 * request.method and request.json()), and forwarding headers verbatim was
 * a needless source of risk (a forbidden/malformed header name throwing
 * inside the adapter itself, outside the shared handler's own try/catch,
 * would produce Vercel's generic non-JSON error page instead of a proper
 * { ok: false, error } response — exactly the "unexpected response" the
 * browser showed once already). The whole adapter is also wrapped in its
 * own try/catch for the same reason: whatever goes wrong here must still
 * come back as valid JSON, with the real error visible in Vercel's own
 * Function Logs (via console.error) for whoever needs to debug it next.
 *
 * req/res are typed loosely (not `import type { VercelRequest,
 * VercelResponse } from "@vercel/node"`) so this file has no new
 * dependency to install — Vercel provides the actual objects at runtime
 * regardless of local types, and the shapes used below (method, body /
 * status, setHeader, send) are Vercel's documented stable contract for
 * this runtime.
 *
 * CONFIRMED ROOT CAUSE of the "unexpected response (status 500)" this
 * produced right after the Edge->Node switch above: Vercel's own Function
 * Logs showed `Error [ERR_MODULE_NOT_FOUND]: Cannot find module
 * '/var/task/api/_lib/handler.ts' imported from /var/task/api/ai.js`.
 * Vercel's Node builder transpiles each .ts file individually rather than
 * bundling them into one file, and does not rewrite a ".ts" extension in
 * the import specifiers it leaves in the compiled output — so the import
 * below crashed at module load, before this file's own try/catch (or
 * even its function body) ever ran, which is exactly why hardening the
 * function body alone didn't fix it. A follow-up attempt removed the
 * extension entirely, assuming Node would infer ".js" the way a bundler
 * does — also wrong, confirmed by the SAME error with no extension at all
 * this time (`Cannot find module '/var/task/api/_lib/handler'`): Node's
 * native ESM resolver never infers extensions. The import below uses
 * ".js" — the actual correct, standard TypeScript-for-Node-ESM
 * convention — see ./_lib/handler.ts's header for the full explanation
 * of why that's correct and how it resolves locally too.
 *
 * Requires the SAME environment variables as Netlify, set separately in
 * this Vercel project's own Settings -> Environment Variables (Vercel and
 * Netlify each keep their own env vars — setting a key on one host does
 * NOT configure it on the other): GROQ_API_KEY, GEMINI_API_KEY,
 * OPENAI_API_KEY, ANTHROPIC_API_KEY (Claude is scaffolded only, not yet
 * implemented — see api/_lib/providers/claude.ts).
 */
import handleAIRequest from "./_lib/handler.js";

/**
 * Vercel's Node runtime auto-parses a JSON request body into req.body for
 * a Content-Type: application/json request (what client.ts always sends),
 * but doesn't guarantee it always arrives as a plain object — depending on
 * how the platform decides to parse a given request it could already be a
 * JSON-shaped object, a raw string, or a Buffer (e.g. if body parsing were
 * ever disabled or the content type weren't recognized). Handle all three
 * so the shared handler's request.json() call gets valid JSON text either
 * way, instead of silently mis-stringifying the wrong representation.
 */
function bodyToString(req: any): string | undefined {
  const b = req.body;
  if (b === undefined || b === null) return undefined;
  if (typeof b === "string") return b;
  if (typeof Buffer !== "undefined" && Buffer.isBuffer(b)) return b.toString("utf-8");
  return JSON.stringify(b);
}

export default async function handler(req: any, res: any): Promise<void> {
  try {
    const method = req.method || "GET";
    const hasBody = method !== "GET" && method !== "HEAD";

    // A syntactically valid absolute URL is all Request() needs — this
    // Request is never actually sent over the network, only read locally
    // by the shared handler, so the host/path here are placeholders.
    const request = new Request("https://internal.invalid/api/ai", {
      method,
      body: hasBody ? (bodyToString(req) ?? "{}") : undefined,
    });

    const response = await handleAIRequest(request);

    res.status(response.status);
    res.setHeader("Content-Type", response.headers.get("Content-Type") || "application/json");
    res.send(await response.text());
  } catch (err) {
    console.error("api/ai.ts adapter error:", err);
    res.status(500);
    res.setHeader("Content-Type", "application/json");
    res.send(JSON.stringify({ ok: false, error: "Unexpected server error handling the AI request. Please try again." }));
  }
}
