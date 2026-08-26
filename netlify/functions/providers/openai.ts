/**
 * OpenAI provider stub — demonstrates the abstraction is real, not just
 * theoretical: adding a second provider is exactly this file (fill in
 * `call` following the Chat Completions or Responses API contract) plus
 * one line in ../ai.ts's PROVIDERS map. Not wired into the UI's provider
 * picker yet since it has no API key configured or tested against a live
 * account in this build — see the final status report.
 */
import type { AIProvider, ProviderRequest, ProviderResult } from "./types.ts";

export const openaiProvider: AIProvider = {
  id: "openai",
  label: "OpenAI",
  isConfigured() {
    return !!process.env.OPENAI_API_KEY;
  },
  async call(_req: ProviderRequest): Promise<ProviderResult> {
    if (!process.env.OPENAI_API_KEY) {
      return { ok: false, error: "OpenAI is not configured on the server (OPENAI_API_KEY is not set).", notConfigured: true };
    }
    return { ok: false, error: "OpenAI support is scaffolded but not yet implemented in this build." };
  },
};
