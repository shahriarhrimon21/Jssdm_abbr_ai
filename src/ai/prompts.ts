/**
 * Prompt construction for the AI Writing Assistant. The AI module is
 * explicitly a SEPARATE layer from the JSSDM engine — it never invents or
 * asserts JSSDM abbreviations itself; it only helps write clearer prose,
 * which the user (or the "Send to Abbreviation" handoff) then runs through
 * the deterministic JSSDM engine for anything abbreviation-related. Every
 * system prompt below says this explicitly so the model doesn't try to be
 * an abbreviation authority.
 */

export const TONES = [
  "Formal / Official",
  "Plain / Clear",
  "Concise / Brief",
  "Operational / Signal-style",
  "Persuasive",
  "Diplomatic",
  "Firm / Direct",
  "Warm / Collegial",
  "Instructional",
  "Technical / Precise",
  "Narrative / Report",
  "Urgent",
  "Neutral",
  "Custom",
] as const;
export type Tone = (typeof TONES)[number];

export type AssistantMode = "check" | "generate";

const BASE_GUARDRAIL =
  "You are a writing assistant embedded in the JSSDM Reference Desk, a tool for drafting Bangladesh Armed Forces service writing. " +
  "You help with grammar, clarity, structure and tone ONLY. You are NOT the source of truth for JSSDM abbreviations: never assert that a " +
  "specific abbreviation is authorized by the manual, and never invent one. If the user's text already contains abbreviations, leave them " +
  "as written unless asked to change wording around them — abbreviation correctness is checked separately by this app's own JSSDM engine, " +
  "not by you. Keep your reply to the requested text itself (plus, only if you're following up in chat, a short explanation) — do not pad " +
  "with disclaimers about being an AI.";

export function toneInstruction(tone: string, customTone?: string): string {
  if (tone === "Custom" && customTone && customTone.trim()) {
    return `Write in the following tone/style, as described by the user: "${customTone.trim()}".`;
  }
  return `Write in a ${tone.toLowerCase()} tone appropriate for military service writing.`;
}

export function buildSystemPrompt(mode: AssistantMode, tone: string, customTone?: string): string {
  const toneLine = toneInstruction(tone, customTone);
  if (mode === "check") {
    return (
      BASE_GUARDRAIL +
      "\n\nMode: Check & Polish. The user will give you a draft. Improve grammar, clarity, and structure while preserving their meaning and " +
      "any abbreviations/terms exactly as written. " +
      toneLine +
      " Return only the improved text unless the user asks a follow-up question about it."
    );
  }
  return (
    BASE_GUARDRAIL +
    "\n\nMode: Generate. The user will describe what they want written (a memo, a paragraph, a message, etc.). Produce a complete draft that " +
    "fulfills the request. " +
    toneLine +
    " Return only the drafted text unless the user asks a follow-up question about it."
  );
}
