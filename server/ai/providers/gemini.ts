/**
 * Google Gemini provider, server-side. This is the same request/response
 * shape verified working against the live Gemini API earlier (client-side
 * prototype): endpoint generateContent, auth via the x-goog-api-key header
 * (never a URL query param, so it never ends up in logs), model default
 * gemini-3.6-flash (gemini-2.5-flash was confirmed deprecated by Google's
 * own API error message during that testing). The only thing that changed
 * moving it here is WHERE it runs — the key now lives in this function's
 * process.env, set in Netlify's dashboard, and is never sent to the browser.
 */
import type { AIProvider, ProviderRequest, ProviderResult, ChatMessage } from "./types.ts";

const DEFAULT_MODEL = "gemini-3.6-flash";

function toGeminiContents(messages: ChatMessage[]) {
  return messages.map((m) => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: m.content }],
  }));
}

export const geminiProvider: AIProvider = {
  id: "gemini",
  label: "Google Gemini",
  isConfigured() {
    return !!process.env.GEMINI_API_KEY;
  },
  async call(req: ProviderRequest): Promise<ProviderResult> {
    const key = process.env.GEMINI_API_KEY;
    if (!key) return { ok: false, error: "Gemini is not configured on the server (GEMINI_API_KEY is not set).", notConfigured: true };
    const model = process.env.GEMINI_MODEL || DEFAULT_MODEL;
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;

    let resp: Response;
    try {
      resp = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": key },
        body: JSON.stringify({
          contents: toGeminiContents(req.messages),
          systemInstruction: { parts: [{ text: req.systemPrompt }] },
          generationConfig: { maxOutputTokens: req.maxOutputTokens || 1024 },
        }),
      });
    } catch {
      return { ok: false, error: "Network error reaching the Gemini API from the server. Please try again shortly." };
    }

    if (!resp.ok) {
      let errText = "";
      try {
        const errJson: any = await resp.json();
        errText = (errJson.error && errJson.error.message) || `Gemini API error ${resp.status}`;
      } catch {
        errText = `Gemini API error ${resp.status} ${resp.statusText}`;
      }
      // Never echo the raw upstream body (it could theoretically include
      // request-echo details); pass through the message text only.
      return { ok: false, error: errText };
    }

    const data: any = await resp.json();
    const cand = data.candidates && data.candidates[0];
    if (!cand) {
      const blockReason = data.promptFeedback && data.promptFeedback.blockReason;
      return {
        ok: false,
        error: blockReason ? `Gemini blocked this request (${blockReason}) — try rephrasing.` : "Gemini returned no result for this request.",
      };
    }
    let text = "";
    if (cand.content && cand.content.parts) {
      cand.content.parts.forEach((part: any) => {
        if (part.text) text += part.text;
      });
    }
    if (!text && cand.finishReason && cand.finishReason !== "STOP") {
      return { ok: false, error: `Gemini stopped without a full result (${cand.finishReason}) — try again or shorten the input.` };
    }
    return { ok: true, text: text.trim() };
  },
};
