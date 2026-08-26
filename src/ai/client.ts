/**
 * The ONLY thing the browser does to reach an AI provider: call this
 * app's own Netlify Function. No provider URL, no API key, and no
 * provider-specific request shape ever appears in this file or anywhere
 * else under src/ — that all lives server-side in netlify/functions/.
 */
export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface AIRequestOptions {
  provider?: string;
  systemPrompt: string;
  messages: ChatMessage[];
  maxOutputTokens?: number;
  /** Optional cancellation for in-flight requests — used by callers that need
   *  to abandon a stale request (e.g. a newer regeneration superseding an
   *  older one, or an explicit Stop/Cancel action) without waiting for the
   *  network to finish. Omit for existing call sites' unchanged behaviour. */
  signal?: AbortSignal;
}

export interface AIResult {
  ok: boolean;
  text?: string;
  error?: string;
  /** True when this result reflects a cancelled request (via `signal`)
   *  rather than a real failure — callers can use this to skip showing an
   *  error state for a deliberate cancellation. */
  aborted?: boolean;
}

export async function callAI(opts: AIRequestOptions): Promise<AIResult> {
  let resp: Response;
  try {
    resp = await fetch("/.netlify/functions/ai", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        provider: opts.provider || "groq",
        systemPrompt: opts.systemPrompt,
        messages: opts.messages,
        maxOutputTokens: opts.maxOutputTokens,
      }),
      signal: opts.signal,
    });
  } catch (e: any) {
    if (opts.signal?.aborted || e?.name === "AbortError") {
      return { ok: false, error: "Cancelled.", aborted: true };
    }
    return { ok: false, error: "Could not reach the server. Check your connection and try again." };
  }
  let data: any = null;
  try {
    data = await resp.json();
  } catch {
    return { ok: false, error: `Server returned an unexpected response (status ${resp.status}).` };
  }
  if (!resp.ok || !data.ok) {
    return { ok: false, error: data.error || `Request failed (status ${resp.status}).` };
  }
  return { ok: true, text: data.text };
}
