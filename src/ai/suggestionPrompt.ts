/**
 * Prompt construction + response parsing for AI-generated JSSDM abbreviation
 * SUGGESTIONS (the Smart Abbreviate feature) — a deliberately separate
 * concern from src/ai/prompts.ts (the AI Writing Assistant's free-form
 * drafting prompts). This module's only job is: given one original message,
 * ask the AI for 2-3 ranked candidate rewrites that use ONLY approved JSSDM
 * abbreviations, then parse whatever comes back defensively.
 *
 * This never talks to the network itself — it only builds strings and
 * parses strings — so it's fully unit-testable offline. The actual network
 * call goes through the existing src/ai/client.ts callAI(), reusing the
 * existing Netlify Function endpoint unchanged.
 *
 * IMPORTANT: this module NEVER decides whether a suggestion is valid. That
 * is the job of src/jssdm/suggestionValidation.ts, which runs on every
 * suggestion this module extracts, regardless of how confidently the AI
 * claims to have followed the rules below. Prompt instructions reduce how
 * often the AI gets it wrong; they are not a substitute for machine
 * validation of the result (see this build's "never blindly trust AI
 * output" requirement).
 */
import { ENTRIES } from "../jssdm/database.ts";
import { findWordTokens } from "../jssdm/parser.ts";

export interface RelevantEntry {
  full: string;
  abbr: string;
}

/** Keep the prompt small and cheap: only send abbreviations that share at
 *  least one word with the original message, ranked by how much of the
 *  entry's full form the message actually covers, capped to a small count.
 *  The server-side Netlify Function already caps total message size
 *  (MAX_MESSAGE_CHARS); this cap keeps well under that on its own so a long
 *  original message doesn't crowd out room for the message itself. */
const MAX_RELEVANT_ENTRIES = 40;

export function selectRelevantEntries(original: string, limit: number = MAX_RELEVANT_ENTRIES): RelevantEntry[] {
  const origWords = new Set(findWordTokens(original).map((t) => t.text.toLowerCase()));
  if (origWords.size === 0) return [];

  const seen = new Set<string>();
  const scored: { entry: RelevantEntry; score: number }[] = [];
  for (const e of ENTRIES) {
    const fullWords = findWordTokens(e.full).map((t) => t.text.toLowerCase());
    if (fullWords.length === 0) continue;
    let overlap = 0;
    for (const w of fullWords) if (origWords.has(w)) overlap++;
    if (overlap === 0) continue;
    const key = `${e.abbr.toLowerCase()}|${e.full.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    scored.push({ entry: { full: e.full, abbr: e.abbr }, score: overlap / fullWords.length });
  }
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit).map((s) => s.entry);
}

export function buildSuggestionSystemPrompt(relevant: RelevantEntry[]): string {
  const list = relevant.length
    ? relevant.map((e) => `${e.full} -> ${e.abbr}`).join("\n")
    : "(none found — nothing in this message matched an approved abbreviation; if that's genuinely the case, your candidates should leave the wording unchanged)";

  return [
    "You are an abbreviation-substitution assistant for JSSDM, a Bangladesh Armed Forces service-writing abbreviation standard. You are given ONE original message and a list of APPROVED abbreviations that may apply to it.",
    "",
    "Approved abbreviations relevant to this message (full form -> abbreviation). This list is the ONLY source of abbreviations you are permitted to use:",
    list,
    "",
    "Rules — follow every one exactly, with no exceptions:",
    "1. Produce 2 or 3 candidate rewrites of the original message, each substituting full terms for their approved abbreviation from the list above wherever it applies.",
    "2. NEVER invent, guess, or use any abbreviation that is not in the list above — no common-language shortenings, no stylistic shortenings, nothing you make up yourself. If a term in the message has no approved abbreviation in the list, leave that term exactly as it was written in the original.",
    "3. Preserve every name, rank, designation, unit, date, time, number, quantity, measurement, location, coordinate or grid reference, call sign, map reference, alphanumeric identifier, action or order, condition, negation, and priority from the original exactly — never drop or alter any of them.",
    "4. Never add information, wording, or claims that were not in the original. Never include explanations, confidence scores, or commentary of any kind in the candidates themselves.",
    "5. Preserve the original's meaningful line breaks and spacing as closely as the rewrite allows.",
    "6. Order your candidates best-first — the version you would most recommend must be first in the array.",
    "",
    "Respond with ONLY strict JSON and nothing else — no markdown code fences, no leading or trailing prose — in exactly this shape:",
    '{"suggestions": ["first candidate text", "second candidate text"]}',
    "The \"suggestions\" array must contain 2 or 3 strings and nothing else.",
  ].join("\n");
}

export interface ParsedSuggestions {
  suggestions: string[];
  parseError: string | null;
}

/**
 * Defensive parser for whatever the AI actually sends back. Real models
 * routinely wrap JSON in markdown fences or add a stray sentence before/after
 * it even when told not to — this tolerates that without ever throwing, and
 * without ever inventing a suggestion the AI didn't actually provide.
 */
export function parseSuggestionResponse(raw: string | null | undefined): ParsedSuggestions {
  if (!raw || !raw.trim()) {
    return { suggestions: [], parseError: "The AI returned an empty response." };
  }

  let text = raw.trim();

  const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenceMatch) text = fenceMatch[1].trim();

  const braceStart = text.indexOf("{");
  const braceEnd = text.lastIndexOf("}");
  if (braceStart !== -1 && braceEnd !== -1 && braceEnd > braceStart) {
    text = text.slice(braceStart, braceEnd + 1);
  }

  let data: any;
  try {
    data = JSON.parse(text);
  } catch {
    return { suggestions: [], parseError: "The AI's response could not be read as valid JSON." };
  }

  if (!data || typeof data !== "object" || Array.isArray(data) || !Array.isArray(data.suggestions)) {
    return { suggestions: [], parseError: "The AI's response was not in the expected format." };
  }

  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of data.suggestions) {
    if (typeof item !== "string") continue;
    const trimmed = item.trim();
    if (!trimmed) continue;
    if (seen.has(trimmed)) continue;
    seen.add(trimmed);
    out.push(trimmed);
    if (out.length >= 3) break;
  }

  if (out.length === 0) {
    return { suggestions: [], parseError: "The AI's response did not contain any usable suggestions." };
  }
  return { suggestions: out, parseError: null };
}
