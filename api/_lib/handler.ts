/**
 * The AI proxy's actual implementation — request validation, provider
 * dispatch, and error shaping. This file is platform-agnostic: it only
 * uses the Web-standard Request/Response objects and process.env, both of
 * which work unmodified on Netlify Functions and Vercel's Node.js
 * serverless functions (which is what api/ai.ts runs as — see that file's
 * header for why it's Node rather than Edge). It has no hosting-platform
 * import anywhere in it.
 *
 * Lives at api/_lib/ (not a project-root server/ folder) so it sits
 * next to the Vercel entry point that uses it; the leading underscore
 * keeps Vercel's filesystem router from treating it as a route of its own
 * (Vercel's own documented convention for shared/helper code under api/).
 * This location was originally chosen to work around an Edge Function
 * bundling limitation that turned out to need a different fix entirely
 * (see api/ai.ts) — kept here since there's no longer a reason to move it.
 *
 * netlify/functions/ai.ts (Netlify's entry point, called at
 * /.netlify/functions/ai) is a thin re-export of this file's default
 * export; api/ai.ts (Vercel's entry point, called at /api/ai) wraps it in
 * a small (req,res)->Request/Response adapter, since Node.js Functions
 * don't speak the Web Request/Response API directly. Either way, this
 * file is the ONLY implementation — see both entry files' comments for
 * the full picture of why two hosts exist and how each one calls in.
 *
 * IMPORTANT — the imports below use a ".js" extension even though the
 * files on disk are ".ts", unlike almost every other relative import in
 * this codebase (which use an explicit ".ts", because Node's native
 * TypeScript-stripping test runner requires one on relative ESM
 * specifiers). This file is the one exception, and it took two attempts
 * to land on the right fix — both confirmed directly from Vercel's own
 * Function Logs after each deploy:
 *
 *   1. Original: imports had a ".ts" extension. Vercel's Node.js Function
 *      builder transpiles each .ts file individually rather than bundling
 *      them into one file, and does not rewrite ".ts" to ".js" in the
 *      import specifiers it leaves in the compiled output — so the
 *      deployed api/ai.js still literally imported "./_lib/handler.ts", a
 *      file that never exists at runtime (only the compiled handler.js
 *      does): `Cannot find module '/var/task/api/_lib/handler.ts'`.
 *   2. Tried removing the extension entirely, assuming Node's resolver
 *      would infer ".js" the way a bundler or CommonJS require() would.
 *      Wrong — Node's native ESM resolver (this project has
 *      "type": "module") never infers extensions, for CommonJS-style
 *      *or* TypeScript-style specifiers: `Cannot find module
 *      '/var/task/api/_lib/handler'` (no extension at all in the error).
 *
 * The actual correct answer, and the standard convention for TypeScript
 * projects that run as real Node ESM: write ".js" in the SOURCE .ts
 * file's import, even though the file is named ".ts" on disk. TypeScript
 * (and any TS-aware tool, including tsx below) understands this mapping
 * and resolves ".js" back to the sibling ".ts" file; Vercel's compiler
 * just copies the specifier through unchanged, so post-compile it's
 * already exactly ".js" — matching the real compiled file 1:1, which is
 * why this is the one specifier form that's correct on every one of
 * Node's native strip-types loader (used for the rest of this codebase),
 * Vercel's Node.js Function runtime, and Netlify's esbuild bundler. Local
 * tests for these files run via `tsx` rather than Node's native
 * `--experimental-strip-types`, since only tsx (not Node's native loader)
 * understands the ".js"->".ts" mapping — see package.json's "test" script.
 *
 * Request body: { provider?: "gemini", systemPrompt: string,
 *                  messages: {role:"user"|"assistant", content:string}[],
 *                  maxOutputTokens?: number }
 * Response body (200): { ok: true, text: string }
 * Response body (4xx/5xx): { ok: false, error: string }  -- always a plain,
 *   user-safe message; never a stack trace, never the upstream raw body,
 *   never anything that could contain a key.
 */
import type { AIProvider } from "./providers/types.js";
import { geminiProvider } from "./providers/gemini.js";
import { openaiProvider } from "./providers/openai.js";
import { groqProvider } from "./providers/groq.js";
import { claudeProvider } from "./providers/claude.js";

const PROVIDERS: Record<string, AIProvider> = {
  gemini: geminiProvider,
  openai: openaiProvider,
  groq: groqProvider,
  claude: claudeProvider,
};
const DEFAULT_PROVIDER = "groq";

const MAX_MESSAGES = 40;
const MAX_MESSAGE_CHARS = 12000;
// The rendered WhatsApp-mode system prompt (guardrail + tone + all of
// WHATSAPP_STYLE's rendered guidance, see prompts.ts/whatsappStyle.ts) is
// the longest system prompt this app ever sends, and it grows whenever that
// guidance is strengthened — a prior 6000 limit left so little headroom
// (~300 chars) that adding one firmer rule to whatsappStyle.ts tipped real
// requests over it and produced "Missing or oversized systemPrompt." for
// completely normal usage. This is a DoS/abuse guard, not a place to
// micro-tune, so it's set with generous headroom above what any current
// prompt actually renders to (see the "system prompt length" test in
// ai.test.ts, which renders the real WhatsApp prompt and asserts it comfortably
// clears this limit — that test is the guard against this regressing again).
const MAX_SYSTEM_PROMPT_CHARS = 16000;

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const handleAIRequest = async (request: Request): Promise<Response> => {
  if (request.method !== "POST") {
    return json(405, { ok: false, error: "Method not allowed." });
  }

  let body: any;
  try {
    body = await request.json();
  } catch {
    return json(400, { ok: false, error: "Request body must be valid JSON." });
  }

  const providerId = typeof body.provider === "string" ? body.provider : DEFAULT_PROVIDER;
  const provider = PROVIDERS[providerId];
  if (!provider) {
    return json(400, { ok: false, error: `Unknown AI provider "${providerId}".` });
  }

  const systemPrompt = typeof body.systemPrompt === "string" ? body.systemPrompt : "";
  const messages = Array.isArray(body.messages) ? body.messages : null;

  if (!systemPrompt || systemPrompt.length > MAX_SYSTEM_PROMPT_CHARS) {
    return json(400, { ok: false, error: "Missing or oversized systemPrompt." });
  }
  if (!messages || !messages.length) {
    return json(400, { ok: false, error: "messages must be a non-empty array." });
  }
  if (messages.length > MAX_MESSAGES) {
    return json(400, { ok: false, error: `Too many messages in this conversation (max ${MAX_MESSAGES}). Start a new session.` });
  }
  for (const m of messages) {
    if (!m || (m.role !== "user" && m.role !== "assistant") || typeof m.content !== "string") {
      return json(400, { ok: false, error: "Each message needs role \"user\"|\"assistant\" and string content." });
    }
    if (m.content.length > MAX_MESSAGE_CHARS) {
      return json(400, { ok: false, error: `A message exceeds the ${MAX_MESSAGE_CHARS}-character limit.` });
    }
  }

  if (!provider.isConfigured()) {
    return json(503, { ok: false, error: `${provider.label} is not configured on this server yet. Ask the site owner to set the API key in the environment variables.` });
  }

  try {
    const result = await provider.call({
      systemPrompt,
      messages: messages as { role: "user" | "assistant"; content: string }[],
      maxOutputTokens: typeof body.maxOutputTokens === "number" ? body.maxOutputTokens : undefined,
    });
    if (!result.ok) return json(502, { ok: false, error: result.error });
    return json(200, { ok: true, text: result.text });
  } catch {
    // Deliberately generic: never forward a raw exception (it could contain
    // request internals) to the client.
    return json(500, { ok: false, error: "Unexpected server error handling the AI request. Please try again." });
  }
};

export default handleAIRequest;
