/**
 * Groq provider, server-side — a genuinely free option: console.groq.com
 * issues API keys with no credit card required, and its free tier (as of
 * this writing: 30 requests/min, 6,000 tokens/min, 14,400 requests/day)
 * is generous enough for personal use of this app. Groq's API is
 * OpenAI-compatible (same request/response shape as openai.ts, just a
 * different base URL, key, and model catalog — mostly open-weight models
 * it runs on its own fast inference hardware), which is why this file is
 * nearly identical to openai.ts.
 *
 * Get a key at https://console.groq.com/keys — no payment method needed.
 */
import type { AIProvider, ProviderRequest, ProviderResult, ChatMessage } from "./types.ts";

const DEFAULT_MODEL = "llama-3.3-70b-versatile";

function toGroqMessages(systemPrompt: string, messages: ChatMessage[]) {
  return [{ role: "system", content: systemPrompt }, ...messages.map((m) => ({ role: m.role, content: m.content }))];
}

export const groqProvider: AIProvider = {
  id: "groq",
  label: "Groq (free)",
  isConfigured() {
    return !!process.env.GROQ_API_KEY;
  },
  async call(req: ProviderRequest): Promise<ProviderResult> {
    const key = process.env.GROQ_API_KEY;
    if (!key) return { ok: false, error: "Groq is not configured on the server (GROQ_API_KEY is not set).", notConfigured: true };
    const model = process.env.GROQ_MODEL || DEFAULT_MODEL;

    let resp: Response;
    try {
      resp = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
        body: JSON.stringify({
          model,
          messages: toGroqMessages(req.systemPrompt, req.messages),
          max_tokens: req.maxOutputTokens || 1024,
        }),
      });
    } catch {
      return { ok: false, error: "Network error reaching the Groq API from the server. Please try again shortly." };
    }

    if (!resp.ok) {
      let errText = "";
      try {
        const errJson: any = await resp.json();
        errText = (errJson.error && errJson.error.message) || `Groq API error ${resp.status}`;
      } catch {
        errText = `Groq API error ${resp.status} ${resp.statusText}`;
      }
      return { ok: false, error: errText };
    }

    const data: any = await resp.json();
    const choice = data.choices && data.choices[0];
    if (!choice || !choice.message) {
      return { ok: false, error: "Groq returned no result for this request." };
    }
    const text = (choice.message.content || "").trim();
    if (!text && choice.finish_reason && choice.finish_reason !== "stop") {
      return { ok: false, error: `Groq stopped without a full result (${choice.finish_reason}) — try again or shorten the input.` };
    }
    return { ok: true, text };
  },
};
