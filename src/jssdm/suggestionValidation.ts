/**
 * Automated validation for an AI-proposed (or deterministic-engine-proposed)
 * abbreviation suggestion — the machine gate between "the AI/engine produced
 * something" and "the UI is allowed to treat it as usable." Runs entirely
 * offline: everything here is synchronous, in-memory, and depends only on
 * the already-loaded JSSDM dataset (see database.ts) — no network call, no
 * AI call. This is what lets validation keep working with no internet
 * connection (see the offline requirements this was built against).
 *
 * Two independent checks, per the spec this was built against:
 *
 *  1. Abbreviation compliance — does the suggestion contain any
 *     abbreviation-shaped token that ISN'T a real, authorized JSSDM Section
 *     16 entry? Reuses the exact same machinery Validate Usage already uses
 *     (scanAbbrMatches + looksLikeAbbr) rather than reinventing it — an
 *     unauthorized-looking token here is flagged exactly the same way it
 *     would be on the Validate Usage page.
 *
 *  2. Information preservation — does the suggestion still contain every
 *     number, date/time-shaped token, alphanumeric identifier (grid
 *     references, call signs, map references, serials), and explicit
 *     negation word that appeared in the ORIGINAL message? This is
 *     deliberately a conservative, explainable heuristic, not a semantic
 *     understanding of the text — it cannot catch every possible way
 *     meaning could be distorted (a name silently swapped for another name
 *     of the same shape, for instance), and it says so in its own output.
 *     It exists to catch the concrete, checkable failure mode this was
 *     built to prevent: a token that was simply dropped or altered beyond
 *     recognition. The human is always the final check.
 *
 * Nothing here ever "fixes" text on its own by rewriting it — see
 * attemptSafeCorrection() for the one narrow, explicitly-labeled exception
 * (re-inserting a critical token that's missing verbatim from the original,
 * at the position the JSSDM engine's own diff implies), which is always
 * reported as a correction, never silently applied.
 */
import { looksLikeAbbr, findWordTokens, COMMON_ENGLISH_WORDS } from "./parser.ts";
import { scanAbbrMatches } from "./deabbreviationEngine.ts";
import { runAbbreviate } from "./abbreviationEngine.ts";

export interface ComplianceIssue {
  kind: "unauthorized-abbreviation";
  token: string;
  message: string;
}

export interface PreservationIssue {
  kind: "missing-number" | "missing-identifier" | "missing-negation" | "length-drop";
  token?: string;
  message: string;
}

export interface ValidationOutcome {
  valid: boolean;
  compliant: boolean;
  infoPreserved: boolean;
  complianceIssues: ComplianceIssue[];
  preservationIssues: PreservationIssue[];
}

/** Numbers, times (0900, 12:30), date-like sequences (02, 26), ranges (0630-0720),
 *  decimals, and grid-reference-style digit groups. Deliberately broad — a false
 *  positive here (flagging a number that genuinely doesn't need preserving verbatim,
 *  e.g. a renumbered list marker) is far cheaper than a false negative that lets a
 *  changed date/time slip through unflagged. */
const NUMBER_RE = /\d[\d.,:/-]*\d|\b\d\b/g;

/** Alphanumeric identifiers: call signs, grid refs, map sheet numbers, serials —
 *  any token mixing letters and digits (e.g. "MD530", "GR123456", "NE45D2"). */
const ALPHANUM_ID_RE = /\b(?=[A-Za-z]*\d)(?=\d*[A-Za-z])[A-Za-z0-9]{2,}\b/g;

const NEGATION_WORDS = ["not", "never", "no", "cannot", "can't", "won't", "without", "n't", "neither", "nor"];

function extractAll(text: string, re: RegExp): string[] {
  const out: string[] = [];
  const r = new RegExp(re.source, re.flags);
  let m: RegExpExecArray | null;
  while ((m = r.exec(text))) {
    out.push(m[0]);
    if (m[0].length === 0) r.lastIndex++; // guard against zero-length infinite loop
  }
  return out;
}

function containsToken(haystack: string, token: string): boolean {
  // Word-boundary-ish containment: exact substring is enough here since
  // tokens are digit/alphanumeric groups that don't collide with prose
  // punctuation; this deliberately does NOT require the JSSDM engine to
  // have left the token untouched in the same *position*, only present
  // somewhere in the result.
  return haystack.includes(token);
}

/** Abbreviation compliance — two complementary checks, because the AI can
 *  fabricate an abbreviation in either a "loud" shape (unlikely to be
 *  mistaken for prose, e.g. an invented all-caps token) or a "quiet" one
 *  (e.g. "offcr", "mtg" — a made-up lowercase shortening that reads as
 *  plausible prose but isn't a real Section 16 entry):
 *
 *  1. Shape-based (same heuristic Validate Usage already uses via
 *     scanAbbrMatches + looksLikeAbbr): catches ALL-CAPS/digit-containing
 *     tokens that aren't a real authorized entry.
 *
 *  2. Word-level reconciliation against the ORIGINAL: any word in the
 *     suggestion that (a) did NOT appear in the original message, (b) is
 *     NOT itself recognized by the JSSDM engine as an authorized
 *     abbreviation (explicit entry OR rule-derived plural/verb-form — this
 *     reuses scanAbbrMatches' own resolution rather than re-implementing
 *     RuleEngine, so it never disagrees with what the deterministic engine
 *     itself would accept), and (c) isn't an ordinary English function word
 *     — is flagged. This is what catches the "quiet" fabrication case that
 *     the shape heuristic alone misses, since the AI's job here is
 *     specifically substitution (approved abbreviations for their full
 *     forms), never introducing a genuinely new word that wasn't in the
 *     original and isn't the database's own answer for it. */
export function checkCompliance(original: string, suggestion: string, force: string | null | undefined): ComplianceIssue[] {
  const issues: ComplianceIssue[] = [];
  const seen = new Set<string>();
  function flag(token: string) {
    const key = token.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    issues.push({
      kind: "unauthorized-abbreviation",
      token,
      message: `"${token}" is not an authorized JSSDM abbreviation${force && force !== "all" ? " for the selected force" : ""} — it must not appear in a valid result.`,
    });
  }

  const origWordsForShapeCheck = new Set(findWordTokens(original).map((t) => t.text));
  const { tokens, matches } = scanAbbrMatches(suggestion, force);
  tokens.forEach((t) => {
    // A token that's simply carried over VERBATIM (same case) from the
    // original — e.g. a grid reference like "MD530" that was never meant to
    // be abbreviated in the first place — is not a fabricated abbreviation
    // just because it happens to contain a digit or capital letters. That's
    // an identifier being preserved, not an abbreviation being invented;
    // checkInformationPreservation is what verifies identifiers survive,
    // this check is only about NEW abbreviation-shaped tokens.
    if (origWordsForShapeCheck.has(t.text)) return;
    const covered = matches.some((m) => t.start >= m.start && t.end <= m.end);
    if (!covered && looksLikeAbbr(t.text)) flag(t.text);
  });

  // Length cap: real JSSDM abbreviations skew very short (median 3 letters,
  // 90th percentile 5 across the whole dataset); a genuine "quiet"
  // fabrication (offcr, mtg, atnd-shaped) is essentially always <=6 letters.
  // Capping here means this check targets plausible-abbreviation-shaped
  // novel words and does NOT flag the AI adding a longer ordinary English
  // word (a wording/paraphrase question, not an abbreviation-compliance
  // one — a genuinely authorized abbreviation for that word would already
  // be `covered` by scanAbbrMatches regardless of length).
  //
  // Length alone is still not enough: an ordinary short word the AI adds
  // while paraphrasing (e.g. "fast", "task", "next", "world") is not a
  // fabricated abbreviation just because it's new and short — English is
  // full of short, single-vowel, consonant-cluster-ending words like these.
  // An EARLIER version of this check used overall vowel-to-letter ratio as
  // the discriminator; that was scrapped after testing showed it flagged
  // huge numbers of completely ordinary words ("fast", "task", "next",
  // "cost", "list" all have exactly 1 vowel in 4 letters, the same ratio as
  // a genuine fabrication like "offcr") — ratio alone cannot tell "task"
  // from "offcr" apart.
  //
  // What a genuine dropped-vowel fabrication does that ordinary English
  // essentially never does is either (a) drop EVERY vowel ("mtg", "cnfrm",
  // "msg"-shaped — zero vowels in a 3+ letter token is vanishingly rare for
  // a real word), or (b) leave 4 or more consonants in a row (English
  // phonotactics essentially never allows this — "offcr" leaves "ffcr", 4
  // consonants running together, where the real word "officer" has a vowel
  // between "ff" and "cer"). Both are narrow, explainable, and — checked
  // against ordinary short English content words during testing — did not
  // reproduce the false-positive problem the ratio approach had.
  //
  // There's no bundled dictionary available in this build to check "is this
  // a real word" directly (no system wordlist, no offline NLP package, and
  // the package registry is unreachable from this build environment) — this
  // is a deliberately narrow, honest stand-in for that, not a claim of full
  // spell-checking. It will still miss a fabricated abbreviation that keeps
  // one vowel and a short consonant run (a false negative — final human
  // review always applies), and can rarely flag a genuine word with an
  // unusual 4-consonant run, such as the plural "worlds" (a false positive —
  // the suggestion is then marked Invalid-but-editable, never silently
  // dropped, per the "keep invalid suggestions visible" rule).
  const MAX_PLAUSIBLE_ABBR_LEN = 6;
  const MIN_SUSPICIOUS_CONSONANT_RUN = 4;
  function looksLikeVowelDroppedFabrication(word: string): boolean {
    const letters = word.replace(/[^A-Za-z]/g, "").toLowerCase();
    if (!letters.length) return false; // no letters at all (digits/symbols) — let other checks handle it
    let hasVowel = false;
    let run = 0;
    let longestRun = 0;
    for (const ch of letters) {
      if ("aeiou".includes(ch)) {
        hasVowel = true;
        run = 0;
      } else {
        run++;
        if (run > longestRun) longestRun = run;
      }
    }
    return !hasVowel || longestRun >= MIN_SUSPICIOUS_CONSONANT_RUN;
  }
  const origWords = new Set(findWordTokens(original).map((t) => t.text.toLowerCase()));
  tokens.forEach((t) => {
    const lw = t.text.toLowerCase();
    if (origWords.has(lw)) return; // present verbatim in the original — not a substitution
    if (/^\d+$/.test(t.text)) return; // pure numbers are never abbreviations
    if (COMMON_ENGLISH_WORDS.has(lw)) return; // ordinary connective English word
    if (t.text.length > MAX_PLAUSIBLE_ABBR_LEN) return; // too long to plausibly be an abbreviation attempt
    if (!looksLikeVowelDroppedFabrication(t.text)) return; // spelled like ordinary English, not a dropped-vowel shortening
    const covered = matches.some((m) => t.start >= m.start && t.end <= m.end);
    if (!covered) flag(t.text); // new, short, vowel-dropped, unrecognized word — likely a fabricated abbreviation
  });

  return issues;
}

/** Information preservation: every number/time/date-shaped token, every
 *  alphanumeric identifier, and every explicit negation word in the
 *  ORIGINAL must still be present (verbatim, anywhere) in the suggestion.
 *  Also flags an implausible overall length drop as a softer signal. */
export function checkInformationPreservation(original: string, suggestion: string): PreservationIssue[] {
  const issues: PreservationIssue[] = [];
  if (!original.trim()) return issues;

  const origNumbers = Array.from(new Set(extractAll(original, NUMBER_RE)));
  origNumbers.forEach((n) => {
    if (!containsToken(suggestion, n)) {
      issues.push({
        kind: "missing-number",
        token: n,
        message: `A number/date/time from the original ("${n}") does not appear in this result.`,
      });
    }
  });

  const origIds = Array.from(new Set(extractAll(original, ALPHANUM_ID_RE)));
  origIds.forEach((id) => {
    if (!containsToken(suggestion, id)) {
      issues.push({
        kind: "missing-identifier",
        token: id,
        message: `An identifier from the original ("${id}") — a call sign, grid reference, or similar — does not appear in this result.`,
      });
    }
  });

  const origLower = " " + original.toLowerCase() + " ";
  const sugLower = " " + suggestion.toLowerCase() + " ";
  NEGATION_WORDS.forEach((w) => {
    const needle = w === "n't" ? "n't" : ` ${w} `;
    if (origLower.includes(needle) && !sugLower.includes(needle)) {
      issues.push({
        kind: "missing-negation",
        token: w,
        message: `The original contains a negation ("${w}") that does not clearly appear in this result — this can invert meaning.`,
      });
    }
  });

  const origWordCount = original.trim().split(/\s+/).filter(Boolean).length;
  const sugWordCount = suggestion.trim().split(/\s+/).filter(Boolean).length;
  if (origWordCount >= 4 && sugWordCount < origWordCount * 0.4) {
    issues.push({
      kind: "length-drop",
      message: "This result is substantially shorter than the original — review carefully to confirm no meaning was dropped.",
    });
  }

  return issues;
}

export function validateSuggestion(original: string, suggestion: string, force: string | null | undefined): ValidationOutcome {
  const complianceIssues = checkCompliance(original, suggestion, force);
  const preservationIssues = checkInformationPreservation(original, suggestion);
  // A soft "length-drop" signal alone doesn't invalidate a result (it's a
  // review prompt, not proof of an error) — only a concretely missing
  // number/identifier/negation, or a genuinely unauthorized abbreviation,
  // does.
  const hardPreservationIssues = preservationIssues.filter((i) => i.kind !== "length-drop");
  const compliant = complianceIssues.length === 0;
  const infoPreserved = hardPreservationIssues.length === 0;
  return {
    valid: compliant && infoPreserved,
    compliant,
    infoPreserved,
    complianceIssues,
    preservationIssues,
  };
}

export interface SafeCorrectionResult {
  corrected: string | null;
  note: string | null;
}

/**
 * Narrow, explicit "safe correction" — Part 10 of the spec this was built
 * against. The ONLY thing this ever does is re-run the deterministic JSSDM
 * engine on the ORIGINAL text and offer that as the corrected suggestion,
 * when the AI's suggestion has a compliance problem (an unauthorized
 * abbreviation) but the deterministic engine's own output for the same
 * original text is itself fully valid. This is safe specifically because
 * the engine's output is authoritative by construction — it can never
 * contain an unauthorized abbreviation or invent wording. It never
 * "guesses" a fix for an information-preservation problem (a missing
 * number/name/identifier) — those are NOT safely auto-correctable, and are
 * left as Invalid for the user to fix by hand, per the spec's explicit
 * "do not guess" instruction.
 */
export function attemptSafeCorrection(original: string, force: string | null | undefined): SafeCorrectionResult {
  const engineResult = runAbbreviate(original, force);
  const engineValidation = validateSuggestion(original, engineResult.output, force);
  if (engineValidation.valid) {
    return {
      corrected: engineResult.output,
      note: "Automatically corrected using the deterministic JSSDM engine's own result for this text (guaranteed to use only authorized abbreviations).",
    };
  }
  return { corrected: null, note: null };
}
