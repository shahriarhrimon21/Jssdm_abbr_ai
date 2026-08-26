/**
 * The AI proxy's actual implementation — request validation, provider
 * dispatch, and error shaping. This file is platform-agnostic: it only
 * uses the Web-standard Request/Response objects and process.env, both of
 * which work unmodified on Netlify Functions, Vercel Edge Functions, and
 * Vercel's Node.js serverless functions. It has no hosting-platform import
 * anywhere in it.
 *
 * Both host entry points are thin re-exports of this file's default export:
 *   - netlify/functions/ai.ts  (Netlify calls this at /.netlify/functions/ai)
 *   - api/ai.ts                (Vercel calls this at /api/ai)
 * That keeps exactly one implementation instead of two copies that can
 * drift apart — see either entry file's comment for why two hosts exist.
 *
 * Request body: { provider?: "gemini", systemPrompt: string,
 *                  messages: {role:"user"|"assistant", content:string}[],
 *                  maxOutputTokens?: number }
 * Response body (200): { ok: true, text: string }
 * Response body (4xx/5xx): { ok: false, error: string }  -- always a plain,
 *   user-safe message; never a stack trace, never the upstream raw body,
 *   never anything that could contain a key.
 */
import type { AIProvider } from "./providers/types.ts";
import { geminiProvider } from "./providers/gemini.ts";
import { openaiProvider } from "./providers/openai.ts";
import { groqProvider } from "./providers/groq.ts";
import { claudeProvider } from "./providers/claude.ts";

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
