/** Claude provider stub — same rationale as openai.ts. */
import type { AIProvider, ProviderRequest, ProviderResult } from "./types.ts";

export const claudeProvider: AIProvider = {
  id: "claude",
  label: "Anthropic Claude",
  isConfigured() {
    return !!process.env.ANTHROPIC_API_KEY;
  },
  async call(_req: ProviderRequest): Promise<ProviderResult> {
    if (!process.env.ANTHROPIC_API_KEY) {
      return { ok: false, error: "Claude is not configured on the server (ANTHROPIC_API_KEY is not set).", notConfigured: true };
    }
    return { ok: false, error: "Claude support is scaffolded but not yet implemented in this build." };
  },
};
