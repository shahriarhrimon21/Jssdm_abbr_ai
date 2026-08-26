/**
 * Server-side AI provider abstraction. The browser never sees any of this —
 * it only ever calls POST /.netlify/functions/ai, which resolves to one of
 * these providers based on the `provider` field in the request body and the
 * matching *_API_KEY environment variable set in Netlify's dashboard (or a
 * local .env for `netlify dev`). Adding a new provider (OpenAI, Claude) is
 * a new file in this folder implementing this same interface, plus one line
 * registering it in ../ai.ts's PROVIDERS map — the frontend and the request
 * contract do not change.
 */
export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface ProviderRequest {
  systemPrompt: string;
  messages: ChatMessage[];
  maxOutputTokens?: number;
}

export interface ProviderSuccess {
  ok: true;
  text: string;
}
export interface ProviderFailure {
  ok: false;
  /** Safe to show the end user directly — never a raw stack trace or a key. */
  error: string;
  /** true when the failure is "no key configured" rather than a live API error. */
  notConfigured?: boolean;
}
export type ProviderResult = ProviderSuccess | ProviderFailure;

export interface AIProvider {
  id: string;
  label: string;
  isConfigured(): boolean;
  call(req: ProviderRequest): Promise<ProviderResult>;
}
