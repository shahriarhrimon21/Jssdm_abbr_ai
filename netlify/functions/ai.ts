/**
 * POST /.netlify/functions/ai
 *
 * The one and only place any AI provider API key is read. Runs entirely on
 * Netlify's server, never in the browser bundle, never in localStorage,
 * never committed to git (keys are set in Netlify's Site settings ->
 * Environment variables, or a local, gitignored .env for `netlify dev`).
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
const MAX_SYSTEM_PROMPT_CHARS = 6000;

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export default async (request: Request): Promise<Response> => {
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
    return json(503, { ok: false, error: `${provider.label} is not configured on this server yet. Ask the site owner to set the API key in Netlify's environment variables.` });
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
