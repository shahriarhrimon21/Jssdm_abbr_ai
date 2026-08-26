/**
 * OpenAI provider, server-side — added as the working fallback while
 * Google's Gemini API key rollout (the new "AQ." prefix key format) is
 * failing with "API key not valid" for many accounts, a currently-open
 * issue on Google's own developer forums as of this writing, unrelated to
 * this app's code. This file is the concrete proof the provider
 * abstraction in ./types.ts works as designed: adding a second provider
 * was exactly this file, plus one line already present in ../ai.ts's
 * PROVIDERS map — no frontend rewrite needed, just a provider id.
 *
 * Uses the Chat Completions API (POST /v1/chat/completions), the same
 * stable request shape OpenAI has supported for years. Default model is
 * configurable via OPENAI_MODEL so a future model-name change doesn't
 * require a code edit — the same lesson learned from the Gemini model
 * deprecation encountered earlier in this project.
 */
import type { AIProvider, ProviderRequest, ProviderResult, ChatMessage } from "./types.ts";

const DEFAULT_MODEL = "gpt-5.6-terra";

function toOpenAIMessages(systemPrompt: string, messages: ChatMessage[]) {
  return [{ role: "system", content: systemPrompt }, ...messages.map((m) => ({ role: m.role, content: m.content }))];
}

export const openaiProvider: AIProvider = {
  id: "openai",
  label: "OpenAI",
  isConfigured() {
    return !!process.env.OPENAI_API_KEY;
  },
  async call(req: ProviderRequest): Promise<ProviderResult> {
    const key = process.env.OPENAI_API_KEY;
    if (!key) return { ok: false, error: "OpenAI is not configured on the server (OPENAI_API_KEY is not set).", notConfigured: true };
    const model = process.env.OPENAI_MODEL || DEFAULT_MODEL;

    let resp: Response;
    try {
      resp = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
        body: JSON.stringify({
          model,
          messages: toOpenAIMessages(req.systemPrompt, req.messages),
          max_tokens: req.maxOutputTokens || 1024,
        }),
      });
    } catch {
      return { ok: false, error: "Network error reaching the OpenAI API from the server. Please try again shortly." };
    }

    if (!resp.ok) {
      let errText = "";
      try {
        const errJson: any = await resp.json();
        errText = (errJson.error && errJson.error.message) || `OpenAI API error ${resp.status}`;
      } catch {
        errText = `OpenAI API error ${resp.status} ${resp.statusText}`;
      }
      return { ok: false, error: errText };
    }

    const data: any = await resp.json();
    const choice = data.choices && data.choices[0];
    if (!choice || !choice.message) {
      return { ok: false, error: "OpenAI returned no result for this request." };
    }
    const text = (choice.message.content || "").trim();
    if (!text && choice.finish_reason && choice.finish_reason !== "stop") {
      return { ok: false, error: `OpenAI stopped without a full result (${choice.finish_reason}) — try again or shorten the input.` };
    }
    return { ok: true, text };
  },
};
